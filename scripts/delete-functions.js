// ========================================
// FUNCIONES DE ELIMINACIÓN CON AUDITORÍA
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
