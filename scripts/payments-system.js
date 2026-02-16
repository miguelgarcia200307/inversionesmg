// ===============================================
// INVERSIONES MG - SISTEMA DE PAGOS COMPLETO
// Manejo integral de pagos, historial y estados
// ===============================================

/**
 * Registra un nuevo pago y actualiza automáticamente el estado de la cuota
 * @param {Object} pagoData - Datos del pago
 * @param {number} pagoData.cuota_id - ID de la cuota
 * @param {number} pagoData.monto - Monto del pago
 * @param {string} pagoData.metodo - Método de pago
 * @param {string} pagoData.nota - Nota opcional
 * @param {string} pagoData.admin_user - Usuario que registra
 * @returns {Promise<Object>} Resultado de la operación
 */
async function procesarPago(pagoData) {
  try {
    // 1. Obtener cuota actual
    const { data: cuota, error: errorCuota } = await supabaseClient
      .from('cuotas')
      .select('*, obligaciones(cliente_id, clientes(*))')
      .eq('id', pagoData.cuota_id)
      .single();

    if (errorCuota || !cuota) {
      throw new Error('Cuota no encontrada');
    }

    // 2. Validar monto
    const saldoPendiente = cuota.saldo_pendiente || cuota.valor_cuota;
    if (pagoData.monto <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero' };
    }
    if (pagoData.monto > saldoPendiente) {
      return { success: false, error: 'El monto excede el saldo pendiente' };
    }

    // 3. Registrar el pago con campos extendidos
    const { data: pago, error: errorPago } = await supabaseClient
      .from('pagos')
      .insert([{
        cuota_id: pagoData.cuota_id,
        monto: pagoData.monto,
        metodo: pagoData.metodo || 'efectivo',
        nota: pagoData.nota || null,
        soporte_url: pagoData.soporte_url || null,
        soporte_path: pagoData.soporte_path || null,
        tipo_soporte: pagoData.tipo_soporte || null,
        referencia: pagoData.referencia || null,
        entidad_financiera: pagoData.entidad_financiera || null,
        created_by: pagoData.admin_user || pagoData.created_by || 'system',
        estado: 'activo',
        fecha_pago: new Date().toISOString()
      }])
      .select()
      .single();

    if (errorPago) throw errorPago;

    // 4. Calcular nuevo saldo
    const nuevoSaldo = saldoPendiente - pagoData.monto;
    let nuevoEstado = 'pendiente';
    
    if (nuevoSaldo <= 0) {
      nuevoEstado = 'pagada';
    } else if (nuevoSaldo < cuota.valor_cuota) {
      nuevoEstado = 'parcial';
    }

    // 5. Actualizar cuota
    const { error: errorUpdate } = await supabaseClient
      .from('cuotas')
      .update({
        saldo_pendiente: Math.max(0, nuevoSaldo),
        estado: nuevoEstado,
        fecha_pago: nuevoEstado === 'pagada' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', pagoData.cuota_id);

    if (errorUpdate) throw errorUpdate;

    // 6. Registrar en auditoría
    await registrarAuditoria({
      admin_user: pagoData.admin_user || pagoData.created_by || 'system',
      accion: 'registrar_pago',
      entidad: 'pago',
      entidad_id: pago.id,
      detalle_json: {
        cuota_id: pagoData.cuota_id,
        obligacion_id: cuota.obligacion_id,
        cliente_id: cuota.obligaciones.cliente_id,
        monto: pagoData.monto,
        metodo: pagoData.metodo,
        referencia: pagoData.referencia,
        entidad_financiera: pagoData.entidad_financiera,
        nuevo_saldo: nuevoSaldo,
        nuevo_estado: nuevoEstado,
        tiene_comprobante: !!(pagoData.soporte_url || pagoData.soporte_path)
      }
    });

    // 7. Verificar si todas las cuotas están pagadas para actualizar obligación
    await verificarEstadoObligacion(cuota.obligacion_id);

    return {
      success: true,
      data: {
        pago,
        nuevo_saldo: nuevoSaldo,
        nuevo_estado: nuevoEstado
      },
      message: nuevoEstado === 'pagada' 
        ? 'Cuota pagada completamente' 
        : `Pago registrado. Saldo pendiente: ${formatCurrency(nuevoSaldo)}`
    };

  } catch (error) {
    console.error('Error al procesar pago:', error);
    return {
      success: false,
      error: error.message || 'Error al procesar el pago'
    };
  }
}

/**
 * Verifica y actualiza el estado de una obligación basado en sus cuotas
 */
async function verificarEstadoObligacion(obligacionId) {
  try {
    const { data: cuotas } = await supabaseClient
      .from('cuotas')
      .select('*')
      .eq('obligacion_id', obligacionId);

    if (!cuotas) return;

    const todasPagadas = cuotas.every(c => c.estado === 'pagada');
    const algunaVencida = cuotas.some(c => {
      if (c.estado === 'pagada') return false;
      const venc = new Date(c.fecha_vencimiento);
      return venc < new Date();
    });

    let nuevoEstado = 'vigente_al_dia';
    if (todasPagadas) {
      nuevoEstado = 'cancelada';
    } else if (algunaVencida) {
      nuevoEstado = 'vigente_en_mora';
    }

    await supabaseClient
      .from('obligaciones')
      .update({ estado: nuevoEstado })
      .eq('id', obligacionId);

  } catch (error) {
    console.error('Error al verificar estado obligación:', error);
  }
}

/**
 * Obtiene el historial completo de pagos de una cuota
 */
async function obtenerHistorialPagosCuota(cuotaId) {
  try {
    const { data, error } = await supabaseClient
      .from('pagos')
      .select('*')
      .eq('cuota_id', cuotaId)
      .order('fecha_pago', { ascending: false });

    if (error) throw error;

    const totalPagado = data?.reduce((sum, p) => sum + parseFloat(p.monto), 0) || 0;

    return {
      success: true,
      pagos: data || [],
      total_pagado: totalPagado
    };
  } catch (error) {
    console.error('Error al obtener historial:', error);
    return { success: false, pagos: [], total_pagado: 0 };
  }
}

/**
 * Obtiene todos los pagos de una obligación
 */
async function obtenerPagosObligacion(obligacionId) {
  try {
    const { data, error } = await supabaseClient
      .from('pagos')
      .select(`
        *,
        cuotas!inner(
          numero,
          valor_cuota,
          fecha_vencimiento,
          obligacion_id
        )
      `)
      .eq('cuotas.obligacion_id', obligacionId)
      .order('fecha_pago', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      pagos: data || []
    };
  } catch (error) {
    console.error('Error al obtener pagos obligación:', error);
    return { success: false, pagos: [] };
  }
}

/**
 * Obtiene todos los pagos de las obligaciones de un cliente
 */
async function obtenerPagosCliente(clienteId) {
  try {
    // Obtener obligaciones del cliente
    const { data: obligaciones } = await supabaseClient
      .from('obligaciones')
      .select('id')
      .eq('cliente_id', clienteId);

    if (!obligaciones || obligaciones.length === 0) {
      return { success: true, pagos: [] };
    }

    const obligacionIds = obligaciones.map(o => o.id);

    // Obtener pagos de todas las obligaciones del cliente
    const { data, error } = await supabaseClient
      .from('pagos')
      .select(`
        *,
        cuotas!inner(
          numero,
          valor_cuota,
          obligacion_id
        )
      `)
      .in('cuotas.obligacion_id', obligacionIds)
      .order('fecha_pago', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      pagos: data || []
    };
  } catch (error) {
    console.error('Error al obtener pagos cliente:', error);
    return { success: false, pagos: [] };
  }
}

/**
 * Obtiene el timeline completo de un cliente (pagos, moras, eventos)
 */
async function obtenerTimelineCliente(clienteId) {
  try {
    // Obtener pagos del cliente
    const { data: obligaciones } = await supabaseClient
      .from('obligaciones')
      .select('id')
      .eq('cliente_id', clienteId);

    if (!obligaciones || obligaciones.length === 0) {
      return { success: true, eventos: [] };
    }

    const obligacionIds = obligaciones.map(o => o.id);

    // Obtener pagos de todas las obligaciones del cliente
    const { data: pagos } = await supabaseClient
      .from('pagos')
      .select(`
        *,
        cuotas!inner(
          numero,
          valor_cuota,
          obligacion_id
        )
      `)
      .in('cuotas.obligacion_id', obligacionIds)
      .order('fecha_pago', { ascending: false })
      .limit(50);

    // Obtener auditoría
    const { data: auditoria } = await supabaseClient
      .from('auditoria')
      .select('*')
      .or(`entidad.eq.cliente,entidad.eq.obligacion,entidad.eq.pago`)
      .order('created_at', { ascending: false })
      .limit(50);

    const eventos = [];

    // Procesar pagos
    pagos?.forEach(pago => {
      eventos.push({
        tipo: 'pago',
        fecha: pago.fecha_pago,
        titulo: `Pago registrado - Cuota #${pago.cuotas.numero}`,
        descripcion: `${formatCurrency(pago.monto)} por ${pago.metodo}`,
        monto: pago.monto,
        icono: '💰',
        color: 'success',
        data: pago
      });
    });

    // Procesar auditoría
    auditoria?.forEach(audit => {
      let icono = '📝';
      let color = 'info';
      let titulo = audit.accion;

      switch(audit.accion) {
        case 'crear_obligacion':
          icono = '📋';
          color = 'primary';
          titulo = 'Nueva obligación creada';
          break;
        case 'registrar_pago':
          return; // Ya están en pagos
        case 'aplicar_descuento':
          icono = '🎁';
          color = 'warning';
          titulo = 'Descuento aplicado';
          break;
        case 'refinanciar':
          icono = '🔄';
          color = 'info';
          titulo = 'Obligación refinanciada';
          break;
      }

      eventos.push({
        tipo: 'auditoria',
        fecha: audit.created_at,
        titulo,
        descripcion: audit.admin_user,
        icono,
        color,
        data: audit
      });
    });

    // Ordenar por fecha descendente
    eventos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return {
      success: true,
      eventos: eventos.slice(0, 30) // Últimos 30 eventos
    };

  } catch (error) {
    console.error('Error al obtener timeline:', error);
    return { success: false, eventos: [] };
  }
}

/**
 * Registra un pago con archivo de soporte opcional
 * NOTA: Esta función usa subirComprobantePago() de supabaseClient.js
 */
async function registrarPagoConSoporte(cuotaId, monto, metodo, nota, adminUser, soporteFile = null) {
  try {
    let soporteData = { url: null, path: null, tipo: null };

    // Subir soporte si existe
    if (soporteFile) {
      // Obtener información de la cuota para generar metadata
      const { data: cuota } = await supabaseClient
        .from('cuotas')
        .select('numero, obligacion_id, obligaciones(cliente_id, clientes(documento))')
        .eq('id', cuotaId)
        .single();

      if (cuota) {
        const uploadResult = await subirComprobantePago(soporteFile, {
          clienteDocumento: cuota.obligaciones.clientes.documento,
          obligacionId: cuota.obligacion_id,
          cuotaNumero: cuota.numero,
          monto: monto.toFixed(0)
        });

        if (uploadResult.success) {
          soporteData = {
            url: null, // No guardamos URL pública, solo path para bucket privado
            path: uploadResult.path,
            tipo: uploadResult.tipo
          };
        } else {
          return {
            success: false,
            error: 'Error al subir comprobante: ' + uploadResult.error
          };
        }
      }
    }

    // Procesar el pago con los datos del soporte
    const resultado = await procesarPago({
      cuota_id: cuotaId,
      monto: parseFloat(monto),
      metodo,
      nota,
      soporte_url: soporteData.url,
      soporte_path: soporteData.path,
      tipo_soporte: soporteData.tipo,
      admin_user: adminUser,
      created_by: adminUser
    });

    return resultado;

  } catch (error) {
    console.error('Error en registro con soporte:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Exporta el historial de pagos a formato estructurado
 */
function exportarHistorialPagos(pagos) {
  if (!pagos || pagos.length === 0) return null;

  const csv = [
    ['Fecha', 'Cuota', 'Monto', 'Método', 'Nota'].join(','),
    ...pagos.map(p => [
      formatDateTime(p.fecha_pago),
      `Cuota #${p.cuotas?.numero || 'N/A'}`,
      p.monto,
      p.metodo,
      p.nota || ''
    ].join(','))
  ].join('\n');

  return csv;
}
