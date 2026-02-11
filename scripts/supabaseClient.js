// Cliente de Supabase para Inversiones MG
// IMPORTANTE: Reemplaza estas variables con tus credenciales reales de Supabase

const SUPABASE_URL = "https://pbsthkwfesosrdtlrcdx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QJE6HG0fnPL2KxvagaaZ4w_nSjUPyrF";

// Inicializar cliente de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== FUNCIONES DE CLIENTES ==========

async function buscarClientePorDocumento(documento) {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .select("*")
      .eq("documento", documento)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  } catch (error) {
    console.error("Error al buscar cliente:", error);
    return null;
  }
}

async function obtenerTodosClientes() {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    return [];
  }
}

async function crearCliente(clienteData) {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .insert([clienteData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al crear cliente:", error);
    return { success: false, error: error.message };
  }
}

async function actualizarCliente(id, clienteData) {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .update(clienteData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al actualizar cliente:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE OBLIGACIONES ==========

/**
 * Obtiene TODAS las obligaciones con todas las relaciones necesarias.
 * FIX: Reemplaza el patrón de iterar clientes para evitar duplicación.
 * Una sola consulta optimizada que trae todo lo necesario.
 */
async function obtenerTodasObligaciones() {
  try {
    const { data, error } = await supabaseClient
      .from("obligaciones")
      .select(`
        *,
        clientes(*),
        productos_detalle(*),
        cuotas(*)
      `)
      .order("created_at", { ascending: false })
      .order('numero', { foreignTable: 'cuotas', ascending: true });

    if (error) throw error;
    
    // Garantizar orden de cuotas en cada obligación
    if (data) {
      data.forEach(obligacion => {
        if (obligacion.cuotas) {
          obligacion.cuotas.sort((a, b) => a.numero - b.numero);
        }
      });
    }
    
    return data || [];
  } catch (error) {
    console.error("Error al obtener todas las obligaciones:", error);
    return [];
  }
}

/**
 * Obtiene obligaciones de un cliente específico.
 * NOTA: Incluye clientes(*) para evitar "N/A" en renders.
 */
async function obtenerObligacionesCliente(clienteId) {
  try {
    const { data, error } = await supabaseClient
      .from("obligaciones")
      .select(`
        *,
        clientes(*),
        productos_detalle(*),
        cuotas(*)
      `)
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .order('numero', { foreignTable: 'cuotas', ascending: true });

    if (error) throw error;
    
    // Garantizar orden de cuotas en cada obligación (respaldo)
    if (data) {
      data.forEach(obligacion => {
        if (obligacion.cuotas) {
          obligacion.cuotas.sort((a, b) => a.numero - b.numero);
        }
      });
    }
    
    return data || [];
  } catch (error) {
    console.error("Error al obtener obligaciones:", error);
    return [];
  }
}

async function obtenerObligacionPorId(obligacionId) {
  try {
    const { data, error } = await supabaseClient
      .from("obligaciones")
      .select(`
        *,
        clientes(*),
        productos_detalle(*),
        cuotas(*),
        documentos(*)
      `)
      .eq("id", obligacionId)
      .order('numero', { foreignTable: 'cuotas', ascending: true })
      .single();

    if (error) throw error;
    
    // Garantizar orden de cuotas (respaldo si foreignTable no funciona)
    if (data && data.cuotas) {
      data.cuotas.sort((a, b) => a.numero - b.numero);
    }
    
    return data;
  } catch (error) {
    console.error("Error al obtener obligación:", error);
    return null;
  }
}

async function crearObligacion(obligacionData) {
  try {
    const { data, error } = await supabaseClient
      .from("obligaciones")
      .insert([obligacionData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al crear obligación:", error);
    return { success: false, error: error.message };
  }
}

async function actualizarObligacion(id, obligacionData) {
  try {
    const { data, error } = await supabaseClient
      .from("obligaciones")
      .update(obligacionData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al actualizar obligación:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE CUOTAS ==========

async function obtenerCuotasObligacion(obligacionId) {
  try {
    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        *,
        pagos(*)
      `)
      .eq("obligacion_id", obligacionId)
      .order("numero", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener cuotas:", error);
    return [];
  }
}

async function crearCuotas(cuotasArray) {
  try {
    const { data, error } = await supabaseClient
      .from("cuotas")
      .insert(cuotasArray)
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al crear cuotas:", error);
    return { success: false, error: error.message };
  }
}

async function actualizarCuota(id, cuotaData) {
  try {
    const { data, error } = await supabaseClient
      .from("cuotas")
      .update(cuotaData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al actualizar cuota:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE PAGOS ==========

async function registrarPago(pagoData) {
  try {
    const { data, error } = await supabaseClient
      .from("pagos")
      .insert([pagoData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al registrar pago:", error);
    return { success: false, error: error.message };
  }
}

async function obtenerResumenFinancieroCliente(clienteId) {
  try {
    // Obtener obligaciones con sus cuotas
    const { data: obligaciones, error: oblError } = await supabaseClient
      .from("obligaciones")
      .select(`
        *,
        cuotas (*)
      `)
      .eq("cliente_id", clienteId);

    if (oblError) throw oblError;

    let total_prestado = 0;
    let total_pendiente = 0;
    let total_pagado = 0;
    let en_mora = false;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    for (const obl of obligaciones || []) {
      total_prestado += parseFloat(obl.monto_total) || 0;

      for (const cuota of obl.cuotas || []) {
        const saldo = cuota.saldo_pendiente ?? cuota.valor_cuota;
        total_pendiente += parseFloat(saldo) || 0;

        const valorCuota = parseFloat(cuota.valor_cuota) || 0;
        total_pagado += (valorCuota - parseFloat(saldo));

        // Verificar mora
        if (cuota.estado !== 'pagada') {
          const venc = new Date(cuota.fecha_vencimiento);
          venc.setHours(0, 0, 0, 0);
          if (venc < hoy) {
            en_mora = true;
          }
        }
      }
    }

    return {
      total_prestado,
      total_pagado,
      total_pendiente,
      en_mora,
      cantidad_obligaciones: obligaciones?.length || 0
    };

  } catch (error) {
    console.error("Error al obtener resumen financiero:", error);
    return {
      total_prestado: 0,
      total_pagado: 0,
      total_pendiente: 0,
      en_mora: false,
      cantidad_obligaciones: 0
    };
  }
}

async function obtenerPagosCuota(cuotaId) {
  try {
    const { data, error } = await supabaseClient
      .from("pagos")
      .select("*")
      .eq("cuota_id", cuotaId)
      .order("fecha_pago", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener pagos:", error);
    return [];
  }
}

// ========== FUNCIONES DE PRODUCTOS ==========

async function crearProductoDetalle(productoData) {
  try {
    const { data, error } = await supabaseClient
      .from("productos_detalle")
      .insert([productoData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al crear producto detalle:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE DESCUENTOS ==========

async function aplicarDescuento(descuentoData) {
  try {
    const { data, error } = await supabaseClient
      .from("descuentos")
      .insert([descuentoData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al aplicar descuento:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE DOCUMENTOS ==========

async function subirDocumento(file, bucket, path) {
  try {
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabaseClient.storage
      .from(bucket)
      .getPublicUrl(path);

    return { success: true, url: urlData.publicUrl };
  } catch (error) {
    console.error("Error al subir documento:", error);
    return { success: false, error: error.message };
  }
}

async function registrarDocumento(documentoData) {
  try {
    const { data, error } = await supabaseClient
      .from("documentos")
      .insert([documentoData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al registrar documento:", error);
    return { success: false, error: error.message };
  }
}

async function obtenerDocumentosObligacion(obligacionId) {
  try {
    const { data, error } = await supabaseClient
      .from("documentos")
      .select("*")
      .eq("obligacion_id", obligacionId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener documentos:", error);
    return [];
  }
}

// ========== FUNCIONES DE AUDITORÍA ==========

async function registrarAuditoria(auditoriaData) {
  try {
    const { data, error } = await supabaseClient
      .from("auditoria")
      .insert([auditoriaData]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error al registrar auditoría:", error);
    return { success: false };
  }
}

async function obtenerAuditoria(filters = {}) {
  try {
    let query = supabaseClient
      .from("auditoria")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filters.entidad) {
      query = query.eq("entidad", filters.entidad);
    }
    if (filters.entidad_id) {
      query = query.eq("entidad_id", filters.entidad_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener auditoría:", error);
    return [];
  }
}

// ========== FUNCIONES DE DASHBOARD ==========

async function obtenerKPIs() {
  try {
    // Obtener todas las obligaciones vigentes
    const { data: obligaciones, error: errorObligaciones } = await supabaseClient
      .from("obligaciones")
      .select("*, cuotas(*)")
      .in("estado", ["vigente_al_dia", "vigente_en_mora"])
      .order('numero', { foreignTable: 'cuotas', ascending: true });

    if (errorObligaciones) throw errorObligaciones;

    // Garantizar orden de cuotas (respaldo)
    if (obligaciones) {
      obligaciones.forEach(obl => {
        if (obl.cuotas) {
          obl.cuotas.sort((a, b) => a.numero - b.numero);
        }
      });
    }

    let totalInvertido = 0;
    let totalPorRecaudar = 0;
    let totalRecaudado = 0;
    let carteraVencida = 0;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    obligaciones?.forEach((obl) => {
      totalInvertido += obl.capital;

      obl.cuotas?.forEach((cuota) => {
        const fechaVenc = new Date(cuota.fecha_vencimiento);
        fechaVenc.setHours(0, 0, 0, 0);

        if (cuota.estado === "pagada") {
          totalRecaudado += cuota.valor_cuota;
        } else if (cuota.estado === "vencida" || fechaVenc < hoy) {
          carteraVencida += cuota.saldo_pendiente || cuota.valor_cuota;
          totalPorRecaudar += cuota.saldo_pendiente || cuota.valor_cuota;
        } else {
          totalPorRecaudar += cuota.saldo_pendiente || cuota.valor_cuota;
        }
      });
    });

    return {
      totalInvertido,
      totalPorRecaudar,
      totalRecaudado,
      carteraVencida,
    };
  } catch (error) {
    console.error("Error al obtener KPIs:", error);
    return {
      totalInvertido: 0,
      totalPorRecaudar: 0,
      totalRecaudado: 0,
      carteraVencida: 0,
    };
  }
}

async function obtenerCuotasPorVencer(dias = 7) {
  try {
    const hoy = new Date();
    const futuro = new Date();
    futuro.setDate(futuro.getDate() + dias);

    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        *,
        obligaciones(*, clientes(*))
      `)
      .in("estado", ["pendiente"])
      .gte("fecha_vencimiento", hoy.toISOString())
      .lte("fecha_vencimiento", futuro.toISOString())
      .order("fecha_vencimiento", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener cuotas por vencer:", error);
    return [];
  }
}

async function obtenerCuotasVencidas() {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        *,
        obligaciones(*, clientes(*))
      `)
      .in("estado", ["vencida", "pendiente"])
      .lt("fecha_vencimiento", hoy.toISOString())
      .order("fecha_vencimiento", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener cuotas vencidas:", error);
    return [];
  }
}

// ========== FUNCIONES EXTENDIDAS PARA MÓDULO DE PAGOS ==========

/**
 * Busca clientes por documento, nombre o teléfono
 */
async function buscarClientes(termino) {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .select("*")
      .or(`documento.ilike.%${termino}%,nombre.ilike.%${termino}%,telefono.ilike.%${termino}%`)
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al buscar clientes:", error);
    return [];
  }
}

/**
 * Obtiene pagos de una obligación con filtros opcionales
 */
async function obtenerPagosObligacionConFiltros(obligacionId, filtros = {}) {
  try {
    let query = supabaseClient
      .from("pagos")
      .select(`
        *,
        cuotas!inner(
          numero,
          valor_cuota,
          fecha_vencimiento,
          obligacion_id
        )
      `)
      .eq("cuotas.obligacion_id", obligacionId)
      .eq("estado", "activo");

    // Filtrar por fechas
    if (filtros.fecha_desde) {
      query = query.gte("fecha_pago", filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      query = query.lte("fecha_pago", filtros.fecha_hasta);
    }

    // Filtrar por método
    if (filtros.metodo) {
      query = query.eq("metodo", filtros.metodo);
    }

    // Filtrar por texto (referencia o nota)
    if (filtros.texto) {
      query = query.or(`referencia.ilike.%${filtros.texto}%,nota.ilike.%${filtros.texto}%`);
    }

    const { data, error } = await query.order("fecha_pago", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener pagos con filtros:", error);
    return [];
  }
}

/**
 * Sube un comprobante de pago a Supabase Storage
 */
async function subirComprobantePago(file, metadata) {
  try {
    const { clienteDocumento, obligacionId, cuotaNumero, monto } = metadata;
    
    // Generar nombre único del archivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = file.name.split('.').pop();
    const nombreArchivo = `${timestamp}_${monto}.${extension}`;
    
    // Ruta en storage
    const ruta = `pagos/${clienteDocumento}/${obligacionId}/cuota-${cuotaNumero}/${nombreArchivo}`;

    // Subir archivo
    const { data, error } = await supabaseClient.storage
      .from("comprobantes-pagos")
      .upload(ruta, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    // Generar URL firmada para preview inmediato (válida por 1 hora)
    const signedUrl = await obtenerUrlComprobante(ruta);
    
    if (!signedUrl) {
      throw new Error('No se pudo generar URL firmada del comprobante');
    }

    return {
      success: true,
      path: ruta,
      signedUrl: signedUrl,
      tipo: file.type.includes('pdf') ? 'pdf' : 'imagen',
      bucket: 'comprobantes-pagos'
    };
  } catch (error) {
    console.error("Error al subir comprobante:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene la URL firmada de un comprobante (válida por 1 hora)
 */
async function obtenerUrlComprobante(path) {
  try {
    const { data, error } = await supabaseClient.storage
      .from("comprobantes-pagos")
      .createSignedUrl(path, 3600); // 1 hora

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error("Error al obtener URL del comprobante:", error);
    return null;
  }
}

/**
 * Anula un pago (marca como anulado sin eliminarlo)
 */
async function anularPago(pagoId, motivo, adminUser) {
  try {
    // Obtener pago
    const { data: pago, error: errorPago } = await supabaseClient
      .from("pagos")
      .select("*, cuotas(*)")
      .eq("id", pagoId)
      .single();

    if (errorPago || !pago) {
      return { success: false, error: "Pago no encontrado" };
    }

    if (pago.estado === "anulado") {
      return { success: false, error: "El pago ya está anulado" };
    }

    // Marcar como anulado
    const { error: errorUpdate } = await supabaseClient
      .from("pagos")
      .update({ estado: "anulado" })
      .eq("id", pagoId);

    if (errorUpdate) throw errorUpdate;

    // Recalcular saldo de cuota
    const cuota = pago.cuotas;
    const nuevoSaldo = (cuota.saldo_pendiente || 0) + parseFloat(pago.monto);
    let nuevoEstado = "pendiente";

    if (nuevoSaldo >= cuota.valor_cuota) {
      nuevoEstado = "pendiente";
    } else if (nuevoSaldo > 0) {
      nuevoEstado = "parcial";
    }

    // Actualizar cuota
    const { error: errorCuota } = await supabaseClient
      .from("cuotas")
      .update({
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado,
        fecha_pago: null
      })
      .eq("id", cuota.id);

    if (errorCuota) throw errorCuota;

    // Registrar auditoría
    await registrarAuditoria({
      admin_user: adminUser,
      accion: "anular_pago",
      entidad: "pago",
      entidad_id: pagoId,
      detalle_json: {
        pago_id: pagoId,
        cuota_id: cuota.id,
        monto: pago.monto,
        motivo: motivo,
        nuevo_saldo: nuevoSaldo,
        nuevo_estado: nuevoEstado
      }
    });

    return { success: true, message: "Pago anulado correctamente" };
  } catch (error) {
    console.error("Error al anular pago:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene el resumen completo de pagos de un cliente
 */
async function obtenerResumenPagosCliente(clienteId) {
  try {
    const { data, error } = await supabaseClient
      .from("pagos")
      .select(`
        *,
        cuotas!inner(
          numero,
          valor_cuota,
          obligacion_id,
          obligaciones!inner(
            cliente_id,
            tipo,
            capital
          )
        )
      `)
      .eq("cuotas.obligaciones.cliente_id", clienteId)
      .eq("estado", "activo")
      .order("fecha_pago", { ascending: false });

    if (error) throw error;

    const pagos = data || [];
    const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
    const cantidadPagos = pagos.length;

    // Agrupar por método
    const porMetodo = pagos.reduce((acc, p) => {
      const metodo = p.metodo || "efectivo";
      acc[metodo] = (acc[metodo] || 0) + parseFloat(p.monto);
      return acc;
    }, {});

    return {
      success: true,
      pagos,
      totalPagado,
      cantidadPagos,
      porMetodo
    };
  } catch (error) {
    console.error("Error al obtener resumen de pagos:", error);
    return {
      success: false,
      pagos: [],
      totalPagado: 0,
      cantidadPagos: 0,
      porMetodo: {}
    };
  }
}

// ========== FUNCIONES PARA UX MEJORADA DE PAGOS ==========

/**
 * Obtiene clientes recientes como fallback (últimos 10 creados o actualizados)
 */
async function obtenerClientesRecientesFallback() {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .select("id, nombre, documento, telefono, tipo_documento, estado, ciudad")
      .eq("estado", "activo")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener clientes recientes:", error);
    return [];
  }
}

/**
 * Obtiene clientes con cuotas próximas a vencer (próximos 7 días)
 */
async function obtenerClientesConCuotasProximas(dias = 7) {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const fechaLimite = new Date(hoy);
    fechaLimite.setDate(fechaLimite.getDate() + dias);

    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        id,
        numero,
        fecha_vencimiento,
        saldo_pendiente,
        valor_cuota,
        estado,
        obligacion_id,
        obligaciones!inner(
          id,
          tipo,
          cliente_id,
          clientes!inner(
            id,
            nombre,
            documento,
            telefono,
            tipo_documento
          )
        )
      `)
      .gte("fecha_vencimiento", hoy.toISOString())
      .lte("fecha_vencimiento", fechaLimite.toISOString())
      .neq("estado", "pagada")
      .gt("saldo_pendiente", 0)
      .order("fecha_vencimiento", { ascending: true })
      .limit(15);

    if (error) throw error;

    // Agrupar por cliente para evitar duplicados
    const clientesMap = new Map();
    
    data?.forEach(cuota => {
      const cliente = cuota.obligaciones.clientes;
      const clienteId = cliente.id;
      
      if (!clientesMap.has(clienteId)) {
        clientesMap.set(clienteId, {
          id: clienteId,
          nombre: cliente.nombre,
          documento: cliente.documento,
          telefono: cliente.telefono,
          tipo_documento: cliente.tipo_documento,
          cuotas_proximas: [],
          total_proximas: 0
        });
      }
      
      const clienteData = clientesMap.get(clienteId);
      clienteData.cuotas_proximas.push({
        cuota_numero: cuota.numero,
        fecha_vencimiento: cuota.fecha_vencimiento,
        saldo: cuota.saldo_pendiente ?? cuota.valor_cuota,
        obligacion_id: cuota.obligacion_id
      });
      clienteData.total_proximas += parseFloat(cuota.saldo_pendiente ?? cuota.valor_cuota);
    });

    return Array.from(clientesMap.values()).slice(0, 10);
  } catch (error) {
    console.error("Error al obtener cuotas próximas:", error);
    return [];
  }
}

/**
 * Obtiene clientes con cuotas vencidas (en mora)
 */
async function obtenerClientesEnMora() {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        id,
        numero,
        fecha_vencimiento,
        saldo_pendiente,
        valor_cuota,
        estado,
        obligacion_id,
        obligaciones!inner(
          id,
          tipo,
          cliente_id,
          clientes!inner(
            id,
            nombre,
            documento,
            telefono,
            tipo_documento
          )
        )
      `)
      .lt("fecha_vencimiento", hoy.toISOString())
      .neq("estado", "pagada")
      .gt("saldo_pendiente", 0)
      .order("fecha_vencimiento", { ascending: true })
      .limit(20);

    if (error) throw error;

    // Agrupar por cliente
    const clientesMap = new Map();
    
    data?.forEach(cuota => {
      const cliente = cuota.obligaciones.clientes;
      const clienteId = cliente.id;
      
      if (!clientesMap.has(clienteId)) {
        clientesMap.set(clienteId, {
          id: clienteId,
          nombre: cliente.nombre,
          documento: cliente.documento,
          telefono: cliente.telefono,
          tipo_documento: cliente.tipo_documento,
          cuotas_vencidas: 0,
          monto_mora: 0,
          cuota_mas_antigua: cuota.fecha_vencimiento
        });
      }
      
      const clienteData = clientesMap.get(clienteId);
      clienteData.cuotas_vencidas++;
      clienteData.monto_mora += parseFloat(cuota.saldo_pendiente ?? cuota.valor_cuota);
    });

    return Array.from(clientesMap.values()).slice(0, 10);
  } catch (error) {
    console.error("Error al obtener clientes en mora:", error);
    return [];
  }
}

// ========================================
// FUNCIONES PARA MÓDULO DE REFINANCIACIÓN
// ========================================

/**
 * Obtiene obligaciones refinanciables (vigentes al día o en mora)
 * @param {Object} filtros - Filtros opcionales {tipo, estado, cliente_id}
 */
async function obtenerObligacionesRefinanciables(filtros = {}) {
  try {
    let query = supabaseClient
      .from("obligaciones")
      .select(`
        *,
        clientes(*),
        cuotas(*)
      `)
      .in("estado", ["vigente_al_dia", "vigente_en_mora"])
      .order("created_at", { ascending: false });
    
    if (filtros.tipo) {
      query = query.eq("tipo", filtros.tipo);
    }
    
    if (filtros.cliente_id) {
      query = query.eq("cliente_id", filtros.cliente_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    // Ordenar cuotas y calcular saldo pendiente
    const obligaciones = (data || []).map(obl => {
      if (obl.cuotas) {
        obl.cuotas.sort((a, b) => a.numero - b.numero);
      }
      
      // Calcular saldo pendiente real
      const saldoPendiente = (obl.cuotas || [])
        .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
        .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0);
      
      obl.saldo_pendiente_calculado = saldoPendiente;
      
      return obl;
    });
    
    return obligaciones;
  } catch (error) {
    console.error("Error al obtener obligaciones refinanciables:", error);
    return [];
  }
}

/**
 * Obtiene el árbol de refinanciaciones de una obligación
 * (obligación padre + todas las hijas refinanciadas)
 */
async function obtenerArbolRefinanciacion(obligacionId) {
  try {
    // Obtener obligación actual
    const { data: obligacion, error } = await supabaseClient
      .from("obligaciones")
      .select(`
        *,
        clientes(*),
        cuotas(*)
      `)
      .eq("id", obligacionId)
      .single();
    
    if (error) throw error;
    
    const arbol = {
      actual: obligacion,
      padre: null,
      hijas: []
    };
    
    // Si tiene padre, obtenerlo
    if (obligacion.obligacion_padre_id) {
      const { data: padre } = await supabaseClient
        .from("obligaciones")
        .select(`*, clientes(*), cuotas(*)`)
        .eq("id", obligacion.obligacion_padre_id)
        .single();
      
      arbol.padre = padre;
    }
    
    // Obtener todas las hijas (refinanciaciones de esta)
    const { data: hijas } = await supabaseClient
      .from("obligaciones")
      .select(`*, clientes(*), cuotas(*)`)
      .eq("obligacion_padre_id", obligacionId);
    
    arbol.hijas = hijas || [];
    
    return arbol;
  } catch (error) {
    console.error("Error al obtener árbol de refinanciación:", error);
    return null;
  }
}

/**
 * Actualiza cuotas en bloque (optimizado para refinanciación)
 */
async function actualizarCuotasEnBloque(cuotasIds, nuevosDatos) {
  try {
    const { data, error } = await supabaseClient
      .from("cuotas")
      .update(nuevosDatos)
      .in("id", cuotasIds)
      .select();
    
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al actualizar cuotas en bloque:", error);
    return { success: false, error: error.message };
  }
}

// ========================================
// FUNCIONES PARA MÓDULO DE DESCUENTOS
// ========================================

/**
 * Obtiene todos los descuentos con filtros opcionales
 */
async function obtenerDescuentos(filtros = {}) {
  try {
    let query = supabaseClient
      .from("descuentos")
      .select(`
        *,
        obligaciones(id, tipo, estado, cliente_id, clientes(nombre, documento)),
        cuotas(numero, valor_cuota, fecha_vencimiento)
      `)
      .eq("estado", "activo")
      .order("created_at", { ascending: false });
    
    if (filtros.obligacion_id) {
      query = query.eq("obligacion_id", filtros.obligacion_id);
    }
    
    if (filtros.cliente_id) {
      query = query.eq("obligaciones.cliente_id", filtros.cliente_id);
    }
    
    if (filtros.aplica_a) {
      query = query.eq("aplica_a", filtros.aplica_a);
    }
    
    if (filtros.fecha_desde) {
      query = query.gte("created_at", filtros.fecha_desde);
    }
    
    if (filtros.fecha_hasta) {
      query = query.lte("created_at", filtros.fecha_hasta);
    }
    
    const { data, error } = await query.limit(100);
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error("Error al obtener descuentos:", error);
    return [];
  }
}

/**
 * Obtiene descuentos activos de una obligación específica
 */
async function obtenerDescuentosPorObligacion(obligacionId) {
  try {
    const { data, error } = await supabaseClient
      .from("descuentos")
      .select("*")
      .eq("obligacion_id", obligacionId)
      .eq("estado", "activo")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener descuentos por obligación:", error);
    return [];
  }
}

/**
 * Obtiene descuentos activos de una cuota específica
 */
async function obtenerDescuentosPorCuota(cuotaId) {
  try {
    const { data, error } = await supabaseClient
      .from("descuentos")
      .select("*")
      .eq("cuota_id", cuotaId)
      .eq("estado", "activo")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error al obtener descuentos por cuota:", error);
    return [];
  }
}

/**
 * Obtiene descuentos aplicables (para cálculo de penalidad)
 * @param {Object} params - {obligacion_id, cuota_id, aplica_a}
 */
async function obtenerDescuentosAplicables(params) {
  try {
    let query = supabaseClient
      .from("descuentos")
      .select("*")
      .eq("estado", "activo");
    
    if (params.aplica_a) {
      query = query.eq("aplica_a", params.aplica_a);
    }
    
    if (params.cuota_id) {
      query = query.or(`cuota_id.eq.${params.cuota_id},cuota_id.is.null`);
    }
    
    if (params.obligacion_id) {
      query = query.eq("obligacion_id", params.obligacion_id);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error("Error al obtener descuentos aplicables:", error);
    return [];
  }
}

/**
 * Aplica un descuento y actualiza las cuotas afectadas
 * Esta es la función principal que maneja toda la lógica de aplicación
 */
async function aplicarDescuentoConEfectos(descuentoData) {
  try {
    const { obligacion_id, cuota_id, tipo, valor, aplica_a, motivo, admin_user } = descuentoData;
    
    // 1. Insertar registro de descuento
    const { data: descuento, error: errorDescuento } = await supabaseClient
      .from("descuentos")
      .insert([{
        obligacion_id,
        cuota_id,
        tipo,
        valor,
        aplica_a,
        motivo,
        admin_user,
        estado: "activo"
      }])
      .select()
      .single();
    
    if (errorDescuento) throw errorDescuento;
    
    // 2. Aplicar efectos según el tipo de descuento
    let cuotasAfectadas = [];
    
    if (aplica_a === "cuota" && cuota_id) {
      // Descuento a cuota específica
      const resultado = await aplicarDescuentoCuota(cuota_id, tipo, valor);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      cuotasAfectadas = [resultado.cuota];
      
    } else if (aplica_a === "total") {
      // Descuento distribuido en todas las cuotas pendientes
      const resultado = await aplicarDescuentoTotal(obligacion_id, tipo, valor);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      cuotasAfectadas = resultado.cuotas;
      
    } else if (aplica_a === "penalidad") {
      // Descuento a penalidad (no afecta cuotas directamente)// Se aplica en la lógica de cálculo de penalidad
      cuotasAfectadas = [];
    }
    
    // 3. Registrar auditoría
    await registrarAuditoria({
      admin_user,
      accion: "aplicar_descuento",
      entidad: "descuento",
      entidad_id: descuento.id,
      detalle_json: {
        descuento_id: descuento.id,
        obligacion_id,
        cuota_id,
        tipo,
        valor,
        aplica_a,
        motivo,
        cuotas_afectadas: cuotasAfectadas.map(c => ({
          cuota_id: c.id,
          numero: c.numero,
          saldo_anterior: c.saldo_anterior,
          saldo_nuevo: c.saldo_pendiente
        }))
      }
    });
    
    return { success: true, descuento, cuotasAfectadas };
    
  } catch (error) {
    console.error("Error al aplicar descuento con efectos:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Aplica descuento a una cuota específica (helper interno)
 */
async function aplicarDescuentoCuota(cuotaId, tipo, valor) {
  try {
    // Obtener cuota
    const { data: cuota, error } = await supabaseClient
      .from("cuotas")
      .select("*")
      .eq("id", cuotaId)
      .single();
    
    if (error) throw error;
    
    if (cuota.estado === "pagada") {
      return { success: false, error: "No se puede aplicar descuento a una cuota ya pagada" };
    }
    
    // Calcular descuento
    const saldoActual = cuota.saldo_pendiente ?? cuota.valor_cuota;
    let montoDescuento = 0;
    
    if (tipo === "fijo") {
      montoDescuento = parseFloat(valor);
    } else if (tipo === "porcentaje") {
      montoDescuento = saldoActual * (parseFloat(valor) / 100);
    }
    
    // Aplicar descuento (no permitir saldo negativo)
    const nuevoSaldo = Math.max(0, saldoActual - montoDescuento);
    
    // Determinar nuevo estado
    let nuevoEstado = cuota.estado;
    if (nuevoSaldo === 0) {
      nuevoEstado = "pagada";
    } else if (nuevoSaldo < cuota.valor_cuota) {
      nuevoEstado = "parcial";
    } else {
      nuevoEstado = "pendiente";
    }
    
    // Actualizar cuota
    const { data: cuotaActualizada, error: errorUpdate } = await supabaseClient
      .from("cuotas")
      .update({
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado,
        ...(nuevoSaldo === 0 && { fecha_pago: new Date().toISOString() })
      })
      .eq("id", cuotaId)
      .select()
      .single();
    
    if (errorUpdate) throw errorUpdate;
    
    // Guardar saldo anterior para auditoría
    cuotaActualizada.saldo_anterior = saldoActual;
    
    return { success: true, cuota: cuotaActualizada };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Aplica descuento total distribuido en cuotas pendientes (helper interno)
 */
async function aplicarDescuentoTotal(obligacionId, tipo, valor) {
  try {
    // Obtener todas las cuotas no pagadas
    const { data: cuotas, error } = await supabaseClient
      .from("cuotas")
      .select("*")
      .eq("obligacion_id", obligacionId)
      .not("estado", "in", '("pagada","refinanciada")')
      .order("numero", { ascending: true });
    
    if (error) throw error;
    
    if (!cuotas || cuotas.length === 0) {
      return { success: false, error: "No hay cuotas pendientes para aplicar descuento" };
    }
    
    // Calcular saldo total pendiente
    const saldoTotal = cuotas.reduce((sum, c) => 
      sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0
    );
    
    // Calcular monto de descuento
    let montoDescuentoTotal = 0;
    if (tipo === "fijo") {
      montoDescuentoTotal = parseFloat(valor);
    } else if (tipo === "porcentaje") {
      montoDescuentoTotal = saldoTotal * (parseFloat(valor) / 100);
    }
    
    // Distribuir descuento en cuotas (empezando por las más antiguas)
    let descuentoRestante = montoDescuentoTotal;
    const cuotasActualizadas = [];
    
    for (const cuota of cuotas) {
      if (descuentoRestante <= 0) break;
      
      const saldoActual = cuota.saldo_pendiente ?? cuota.valor_cuota;
      const descuentoEnCuota = Math.min(descuentoRestante, saldoActual);
      const nuevoSaldo = saldoActual - descuentoEnCuota;
      
      // Determinar nuevo estado
      let nuevoEstado = "pendiente";
      if (nuevoSaldo === 0) {
        nuevoEstado = "pagada";
      } else if (nuevoSaldo < cuota.valor_cuota) {
        nuevoEstado = "parcial";
      }
      
      // Actualizar cuota
      const { data: cuotaActualizada } = await supabaseClient
        .from("cuotas")
        .update({
          saldo_pendiente: nuevoSaldo,
          estado: nuevoEstado,
          ...(nuevoSaldo === 0 && { fecha_pago: new Date().toISOString() })
        })
        .eq("id", cuota.id)
        .select()
        .single();
      
      if (cuotaActualizada) {
        cuotaActualizada.saldo_anterior = saldoActual;
        cuotasActualizadas.push(cuotaActualizada);
      }
      
      descuentoRestante -= descuentoEnCuota;
    }
    
    return { success: true, cuotas: cuotasActualizadas };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Anula un descuento y revierte sus efectos
 */
async function anularDescuento(descuentoId, motivo, adminUser) {
  try {
    // Obtener descuento
    const { data: descuento, error } = await supabaseClient
      .from("descuentos")
      .select("*")
      .eq("id", descuentoId)
      .single();
    
    if (error) throw error;
    
    if (descuento.estado === "anulado") {
      return { success: false, error: "El descuento ya está anulado" };
    }
    
    // Marcar como anulado
    const { error: errorUpdate } = await supabaseClient
      .from("descuentos")
      .update({
        estado: "anulado",
        anulado_at: new Date().toISOString(),
        anulado_por: adminUser
      })
      .eq("id", descuentoId);
    
    if (errorUpdate) throw errorUpdate;
    
    // Registrar auditoría
    await registrarAuditoria({
      admin_user: adminUser,
      accion: "anular_descuento",
      entidad: "descuento",
      entidad_id: descuentoId,
      detalle_json: {
        descuento_id: descuentoId,
        motivo,
        descuento_original: descuento
      }
    });
    
    return { 
      success: true, 
      message: "Descuento anulado. NOTA: Los efectos en cuotas NO se revierten automáticamente. Revisa manualmente si es necesario." 
    };
    
  } catch (error) {
    console.error("Error al anular descuento:", error);
    return { success: false, error: error.message };
  }
}

// ========================================
// FUNCIONES PARA MÓDULO DE DOCUMENTOS
// ========================================

/**
 * Obtiene todos los documentos con filtros opcionales
 */
async function obtenerDocumentosFiltrados(filtros = {}) {
  try {
    let query = supabaseClient
      .from("documentos")
      .select(`
        *,
        obligaciones(id, tipo, cliente_id, clientes(nombre, documento))
      `)
      .order("created_at", { ascending: false });
    
    if (filtros.obligacion_id) {
      query = query.eq("obligacion_id", filtros.obligacion_id);
    }
    
    if (filtros.cliente_id) {
      query = query.eq("obligaciones.cliente_id", filtros.cliente_id);
    }
    
    if (filtros.tipo) {
      query = query.eq("tipo", filtros.tipo);
    }
    
    const { data, error } = await query.limit(100);
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error("Error al obtener documentos filtrados:", error);
    return [];
  }
}

/**
 * Sube un documento a Supabase Storage (bucket privado)
 * @param {File} file - Archivo a subir
 * @param {Object} metadata - {cliente_documento, obligacion_id, tipo}
 */
async function subirDocumentoStorage(file, metadata) {
  try {
    const { cliente_documento, obligacion_id, tipo } = metadata;
    
    // Validar tamaño (10MB máximo)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { success: false, error: "El archivo excede el tamaño máximo de 10MB" };
    }
    
    // Validar tipo MIME
    const mimePermitidos = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ];
    
    if (!mimePermitidos.includes(file.type)) {
      return { 
        success: false, 
        error: "Tipo de archivo no permitido. Solo PDF, JPG, PNG o WEBP" 
      };
    }
    
    // Generar nombre único
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = file.name.split('.').pop();
    const nombreSanitizado = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 50);
    const nombreArchivo = `${timestamp}_${nombreSanitizado}`;
    
    // Construir path
    const version = metadata.version || 1;
    const path = `obligaciones/${cliente_documento}/${obligacion_id}/${tipo}/v${version}_${nombreArchivo}`;
    
    // Subir a Storage
    const { data, error } = await supabaseClient.storage
      .from("documentos-obligaciones")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    
    if (error) {
      // Si el bucket no existe
      if (error.message.includes("not found") || error.message.includes("Bucket not found")) {
        return { 
          success: false, 
          error: "El bucket 'documentos-obligaciones' no existe. Créalo en Supabase Storage → New Bucket." 
        };
      }
      
      // Si es un error de RLS (Row Level Security)
      if (error.message.includes("row-level security") || error.message.includes("violates row-level security policy")) {
        return { 
          success: false, 
          error: "Error de permisos: Las políticas RLS del bucket no están configuradas. Ejecuta el script FIX-STORAGE-DOCUMENTOS.sql en el SQL Editor de Supabase." 
        };
      }
      
      throw error;
    }
    
    return {
      success: true,
      path: path,
      bucket: "documentos-obligaciones",
      nombreOriginal: file.name,
      tipoMime: file.type,
      tamano: file.size
    };
    
  } catch (error) {
    console.error("Error al subir documento:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Registra un documento en la base de datos (después de subirlo)
 */
async function registrarDocumentoCompleto(documentoData) {
  try {
    const { data, error } = await supabaseClient
      .from("documentos")
      .insert([documentoData])
      .select(`
        *,
        obligaciones(id, tipo, cliente_id, clientes(nombre, documento))
      `)
      .single();
    
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error al registrar documento:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene URL firmada para documento privado (válida por 1 hora)
 */
async function obtenerUrlFirmadaDocumento(path, expiresIn = 3600) {
  try {
    const { data, error } = await supabaseClient.storage
      .from("documentos-obligaciones")
      .createSignedUrl(path, expiresIn);
    
    if (error) throw error;
    return { success: true, url: data.signedUrl };
  } catch (error) {
    console.error("Error al obtener URL firmada:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Elimina un documento (archivo + registro)
 */
async function eliminarDocumento(documentoId) {
  try {
    // Obtener documento
    const { data: documento, error: errorGet } = await supabaseClient
      .from("documentos")
      .select("*")
      .eq("id", documentoId)
      .single();
    
    if (errorGet) throw errorGet;
    
    // Eliminar archivo de Storage (si tiene path)
    if (documento.archivo_path && documento.bucket) {
      const { error: errorStorage } = await supabaseClient.storage
        .from(documento.bucket)
        .remove([documento.archivo_path]);
      
      if (errorStorage) {
        console.warn("No se pudo eliminar archivo de Storage:", errorStorage);
      }
    }
    
    // Eliminar registro de BD
    const { error: errorDelete } = await supabaseClient
      .from("documentos")
      .delete()
      .eq("id", documentoId);
    
    if (errorDelete) throw errorDelete;
    
    return { success: true, message: "Documento eliminado correctamente" };
    
  } catch (error) {
    console.error("Error al eliminar documento:", error);
    return { success: false, error: error.message };
  }
}

// ========================================
// FUNCIONES DE ELIMINACIÓN COMPLETA CON AUDITORÍA
// ========================================

/**
 * Obtiene snapshot completo de una obligación para eliminación
 * Incluye conteos de cuotas, pagos, documentos
 */
async function obtenerSnapshotObligacionParaEliminacion(obligacionId) {
  try {
    // Obtener obligación completa con relaciones
    const { data: obligacion, error } = await supabaseClient
      .from("obligaciones")
      .select(`
        *,
        clientes(*),
        cuotas(*),
        documentos(*),
        productos_detalle(*)
      `)
      .eq("id", obligacionId)
      .single();

    if (error) throw error;
    if (!obligacion) throw new Error("Obligación no encontrada");

    // Contar pagos (via cuotas)
    let pagos_total = 0;
    if (obligacion.cuotas && obligacion.cuotas.length > 0) {
      const cuotaIds = obligacion.cuotas.map(c => c.id);
      const { count } = await supabaseClient
        .from("pagos")
        .select("id", { count: "exact", head: true })
        .in("cuota_id", cuotaIds);
      pagos_total = count || 0;
    }

    // Conteos
    const counts = {
      cuotas_total: obligacion.cuotas?.length || 0,
      cuotas_pagadas: obligacion.cuotas?.filter(c => c.estado === 'pagada').length || 0,
      pagos_total: pagos_total,
      documentos_total: obligacion.documentos?.length || 0,
      productos_detalle_total: obligacion.productos_detalle?.length || 0
    };

    return {
      success: true,
      obligacion,
      cliente: obligacion.clientes,
      counts
    };
  } catch (error) {
    console.error("Error al obtener snapshot de obligación:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene snapshot completo de un cliente para eliminación
 * Incluye conteos de obligaciones, cuotas, pagos, documentos
 */
async function obtenerSnapshotClienteParaEliminacion(clienteId) {
  try {
    // Obtener cliente
    const { data: cliente, error } = await supabaseClient
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single();

    if (error) throw error;
    if (!cliente) throw new Error("Cliente no encontrado");

    // Obtener obligaciones del cliente
    const { data: obligaciones } = await supabaseClient
      .from("obligaciones")
      .select("id")
      .eq("cliente_id", clienteId);

    const obligacionIds = obligaciones?.map(o => o.id) || [];

    let cuotas_total = 0;
    let documentos_total = 0;
    let pagos_total = 0;

    if (obligacionIds.length > 0) {
      // Contar cuotas
      const { count: cuotasCount } = await supabaseClient
        .from("cuotas")
        .select("id", { count: "exact", head: true })
        .in("obligacion_id", obligacionIds);
      cuotas_total = cuotasCount || 0;

      // Contar documentos
      const { count: docsCount } = await supabaseClient
        .from("documentos")
        .select("id", { count: "exact", head: true })
        .in("obligacion_id", obligacionIds);
      documentos_total = docsCount || 0;

      // Contar pagos (primero obtener IDs de cuotas)
      const { data: cuotas } = await supabaseClient
        .from("cuotas")
        .select("id")
        .in("obligacion_id", obligacionIds);

      if (cuotas && cuotas.length > 0) {
        const cuotaIds = cuotas.map(c => c.id);
        const { count: pagosCount } = await supabaseClient
          .from("pagos")
          .select("id", { count: "exact", head: true })
          .in("cuota_id", cuotaIds);
        pagos_total = pagosCount || 0;
      }
    }

    const counts = {
      obligaciones_total: obligacionIds.length,
      cuotas_total,
      pagos_total,
      documentos_total
    };

    // Lista resumida de IDs de obligaciones (máximo 20)
    const obligacionesResumen = obligacionIds.slice(0, 20);
    const masObligaciones = obligacionIds.length > 20;

    return {
      success: true,
      cliente,
      counts,
      obligacionIds: obligacionesResumen,
      masObligaciones,
      totalObligaciones: obligacionIds.length
    };
  } catch (error) {
    console.error("Error al obtener snapshot de cliente:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Elimina una obligación con auditoría obligatoria
 * Registra snapshot antes de borrar y maneja errores
 */
async function eliminarObligacionConAuditoria(obligacionId, adminUser) {
  try {
    // 1. Obtener snapshot
    const snapshotResult = await obtenerSnapshotObligacionParaEliminacion(obligacionId);
    if (!snapshotResult.success) {
      return { success: false, error: snapshotResult.error };
    }

    const { obligacion, cliente, counts } = snapshotResult;

    // 2. Registrar auditoría ANTES de borrar
    const auditoriaData = {
      admin_user: adminUser,
      accion: "eliminar",
      entidad: "obligacion",
      entidad_id: obligacionId,
      detalle_json: {
        obligacion: {
          id: obligacion.id,
          tipo: obligacion.tipo,
          capital: obligacion.capital,
          num_cuotas: obligacion.num_cuotas,
          fecha_inicio: obligacion.fecha_inicio,
          estado: obligacion.estado
        },
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          documento: cliente.documento
        },
        conteos: counts,
        fecha_eliminacion: new Date().toISOString(),
        motivo: "eliminación manual desde admin"
      }
    };

    const auditoriaResult = await registrarAuditoria(auditoriaData);
    if (!auditoriaResult.success) {
      console.error("Error al registrar auditoría, abortando eliminación");
      return { 
        success: false, 
        error: "No se pudo registrar auditoría. Eliminación cancelada por seguridad." 
      };
    }

    // 3. Eliminar obligación (cascade borrará cuotas, pagos, documentos)
    const { error: deleteError } = await supabaseClient
      .from("obligaciones")
      .delete()
      .eq("id", obligacionId);

    if (deleteError) {
      // Registrar error de eliminación
      await registrarAuditoria({
        admin_user: adminUser,
        accion: "error_eliminar",
        entidad: "obligacion",
        entidad_id: obligacionId,
        detalle_json: {
          error: deleteError.message,
          snapshot_basico: {
            obligacion_id: obligacionId,
            cliente_nombre: cliente.nombre
          }
        }
      });
      
      throw deleteError;
    }

    return { 
      success: true, 
      message: "Obligación eliminada correctamente",
      eliminados: counts
    };

  } catch (error) {
    console.error("Error al eliminar obligación:", error);
    return { 
      success: false, 
      error: error.message || "Error desconocido al eliminar obligación" 
    };
  }
}

/**
 * Elimina un cliente con auditoría obligatoria
 * Advertencia: Borra TODO en cascada (obligaciones, cuotas, pagos, documentos)
 */
async function eliminarClienteConAuditoria(clienteId, adminUser) {
  try {
    // 1. Obtener snapshot
    const snapshotResult = await obtenerSnapshotClienteParaEliminacion(clienteId);
    if (!snapshotResult.success) {
      return { success: false, error: snapshotResult.error };
    }

    const { cliente, counts, obligacionIds, masObligaciones, totalObligaciones } = snapshotResult;

    // 2. Registrar auditoría ANTES de borrar
    const auditoriaData = {
      admin_user: adminUser,
      accion: "eliminar",
      entidad: "cliente",
      entidad_id: clienteId,
      detalle_json: {
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          documento: cliente.documento,
          tipo_documento: cliente.tipo_documento,
          telefono: cliente.telefono,
          ciudad: cliente.ciudad,
          estado: cliente.estado
        },
        conteos: counts,
        obligaciones_ids: masObligaciones 
          ? [...obligacionIds, `... y ${totalObligaciones - obligacionIds.length} más`]
          : obligacionIds,
        total_obligaciones: totalObligaciones,
        fecha_eliminacion: new Date().toISOString(),
        motivo: "eliminación manual desde admin",
        advertencia: "Eliminación en cascada de obligaciones, cuotas, pagos y documentos"
      }
    };

    const auditoriaResult = await registrarAuditoria(auditoriaData);
    if (!auditoriaResult.success) {
      console.error("Error al registrar auditoría, abortando eliminación");
      return { 
        success: false, 
        error: "No se pudo registrar auditoría. Eliminación cancelada por seguridad." 
      };
    }

    // 3. Eliminar cliente (cascade borrará TODO lo asociado)
    const { error: deleteError } = await supabaseClient
      .from("clientes")
      .delete()
      .eq("id", clienteId);

    if (deleteError) {
      // Registrar error de eliminación
      await registrarAuditoria({
        admin_user: adminUser,
        accion: "error_eliminar",
        entidad: "cliente",
        entidad_id: clienteId,
        detalle_json: {
          error: deleteError.message,
          snapshot_basico: {
            cliente_id: clienteId,
            cliente_nombre: cliente.nombre,
            total_obligaciones: totalObligaciones
          }
        }
      });
      
      throw deleteError;
    }

    return { 
      success: true, 
      message: "Cliente eliminado correctamente",
      eliminados: counts
    };

  } catch (error) {
    console.error("Error al eliminar cliente:", error);
    return { 
      success: false, 
      error: error.message || "Error desconocido al eliminar cliente" 
    };
  }
}
