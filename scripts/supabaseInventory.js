// =====================================================
// INVERSIONES MG - MÓDULO INVENTARIOS
// Operaciones CRUD para inventarios con Supabase
// =====================================================

// NOTA: Este archivo extiende supabaseClient.js sin modificarlo
// Usa el mismo cliente supabaseClient ya inicializado

// ========== FUNCIONES DE PRODUCTOS ==========

/**
 * Obtener todos los productos con sus códigos de barras y proveedor
 * @param {Object} options - Filtros opcionales
 * @returns {Promise<Array>} Array de productos
 */
async function obtenerTodosProductos(options = {}) {
  try {
    let query = supabaseClient
      .from("inv_productos")
      .select(`
        *,
        inv_codigos_barras(*)
      `)
      .order("created_at", { ascending: false });

    // Filtros opcionales
    if (options.activo !== undefined) {
      query = query.eq("activo", options.activo);
    }
    if (options.categoria) {
      query = query.eq("categoria", options.categoria);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Obtener proveedores por separado
    if (data && data.length > 0) {
      const proveedorIds = [...new Set(data.map(p => p.proveedor_principal_id).filter(Boolean))];
      if (proveedorIds.length > 0) {
        const { data: proveedores } = await supabaseClient
          .from("inv_proveedores")
          .select("id,nombre")
          .in("id", proveedorIds);
        
        // Mapear proveedores a productos
        const proveedorMap = {};
        proveedores?.forEach(p => proveedorMap[p.id] = p);
        data.forEach(producto => {
          producto.proveedor = producto.proveedor_principal_id ? proveedorMap[producto.proveedor_principal_id] : null;
        });
      }
    }
    
    // Filtrar stock bajo si se solicita (en JavaScript porque no podemos comparar columnas en query)
    if (options.stockBajo && data) {
      return data.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo));
    }
    
    return data || [];
  } catch (error) {
    Logger.error("Error al obtener productos:", error);
    return [];
  }
}

/**
 * Buscar producto por SKU
 * @param {string} sku - SKU del producto
 * @returns {Promise<Object|null>}
 */
async function buscarProductoPorSKU(sku) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_productos")
      .select(`
        *,
        inv_codigos_barras(*)
      `)
      .eq("sku", sku)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    
    // Obtener proveedor si existe
    if (data && data.proveedor_principal_id) {
      const { data: proveedor } = await supabaseClient
        .from("inv_proveedores")
        .select("id,nombre")
        .eq("id", data.proveedor_principal_id)
        .single();
      data.proveedor = proveedor;
    }
    
    return data;
  } catch (error) {
    Logger.error("Error al buscar producto por SKU:", error);
    return null;
  }
}

/**
 * Obtener producto por ID
 * @param {number} id - ID del producto
 * @returns {Promise<Object|null>}
 */
async function obtenerProductoPorId(id) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_productos")
      .select(`
        *,
        inv_codigos_barras(*)
      `)
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    
    // Obtener proveedor si existe
    if (data && data.proveedor_principal_id) {
      const { data: proveedor } = await supabaseClient
        .from("inv_proveedores")
        .select("id,nombre")
        .eq("id", data.proveedor_principal_id)
        .single();
      data.proveedor = proveedor;
    }
    
    return data;
  } catch (error) {
    Logger.error("Error al obtener producto por ID:", error);
    return null;
  }
}

/**
 * Buscar producto por código de barras
 * @param {string} codigo - Código de barras
 * @returns {Promise<Object|null>}
 */
async function buscarProductoPorCodigoBarras(codigo) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_codigos_barras")
      .select(`
        *,
        inv_productos!producto_id(*)
      `)
      .eq("codigo", codigo)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    
    // Si encontramos el código, obtener el producto completo con sus códigos
    if (data?.inv_productos) {
      const productoCompleto = await obtenerProductoPorId(data.inv_productos.id);
      
      // Obtener proveedor si existe
      if (productoCompleto && productoCompleto.proveedor_principal_id) {
        const { data: proveedor } = await supabaseClient
          .from("inv_proveedores")
          .select("id,nombre")
          .eq("id", productoCompleto.proveedor_principal_id)
          .single();
        productoCompleto.proveedor = proveedor;
      }
      
      return productoCompleto;
    }
    
    return null;
  } catch (error) {
    Logger.error("Error al buscar producto por código:", error);
    return null;
  }
}

/**
 * Crear nuevo producto
 * @param {Object} productoData - Datos del producto
 * @returns {Promise<Object>}
 */
async function crearProducto(productoData) {
  try {
    // Generar SKU si no viene
    if (!productoData.sku) {
      const { data: skuData } = await supabaseClient.rpc("generar_sku");
      productoData.sku = skuData || `SKU-${Date.now()}`;
    }

    // Calcular precio sugerido
    if (productoData.margen_sugerido_pct) {
      const costoTotal = parseFloat(productoData.costo_unitario_base) + 
                        (parseFloat(productoData.gastos_asociados_base) || 0);
      productoData.precio_sugerido = costoTotal * (1 + parseFloat(productoData.margen_sugerido_pct) / 100);
    } else if (productoData.margen_sugerido_valor) {
      const costoTotal = parseFloat(productoData.costo_unitario_base) + 
                        (parseFloat(productoData.gastos_asociados_base) || 0);
      productoData.precio_sugerido = costoTotal + parseFloat(productoData.margen_sugerido_valor);
    }

    const { data, error } = await supabaseClient
      .from("inv_productos")
      .insert([productoData])
      .select(`
        *,
        inv_codigos_barras(*)
      `)
      .single();

    if (error) throw error;

    // Obtener proveedor si existe
    if (data.proveedor_principal_id) {
      const { data: proveedor } = await supabaseClient
        .from("inv_proveedores")
        .select("id,nombre")
        .eq("id", data.proveedor_principal_id)
        .single();
      data.proveedor = proveedor;
    }

    // Registrar auditoría
    await registrarAuditoria("crear_producto", "producto", data.id, {
      nombre: data.nombre,
      sku: data.sku,
    });

    return { success: true, data };
  } catch (error) {
    Logger.error("Error al crear producto:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualizar producto existente
 * @param {number} id - ID del producto
 * @param {Object} productoData - Datos a actualizar
 * @returns {Promise<Object>}
 */
async function actualizarProducto(id, productoData) {
  try {
    // Recalcular precio sugerido si cambian costos o márgenes
    if (productoData.costo_unitario_base || productoData.gastos_asociados_base || 
        productoData.margen_sugerido_pct || productoData.margen_sugerido_valor) {
      
      // Obtener producto actual para valores faltantes
      const productoActual = await buscarProductoPorSKU(
        (await supabaseClient.from("inv_productos").select("sku").eq("id", id).single()).data.sku
      );
      
      const costoBase = parseFloat(productoData.costo_unitario_base ?? productoActual.costo_unitario_base);
      const gastosBase = parseFloat(productoData.gastos_asociados_base ?? productoActual.gastos_asociados_base);
      const margenPct = parseFloat(productoData.margen_sugerido_pct ?? productoActual.margen_sugerido_pct);
      const margenValor = parseFloat(productoData.margen_sugerido_valor ?? productoActual.margen_sugerido_valor);
      
      const costoTotal = costoBase + gastosBase;
      
      if (margenPct) {
        productoData.precio_sugerido = costoTotal * (1 + margenPct / 100);
      } else if (margenValor) {
        productoData.precio_sugerido = costoTotal + margenValor;
      }
    }

    const { data, error } = await supabaseClient
      .from("inv_productos")
      .update(productoData)
      .eq("id", id)
      .select(`
        *,
        inv_codigos_barras(*)
      `)
      .single();

    if (error) throw error;

    // Obtener proveedor si existe
    if (data.proveedor_principal_id) {
      const { data: proveedor } = await supabaseClient
        .from("inv_proveedores")
        .select("id,nombre")
        .eq("id", data.proveedor_principal_id)
        .single();
      data.proveedor = proveedor;
    }

    await registrarAuditoria("actualizar_producto", "producto", id, {
      nombre: data.nombre,
    });

    return { success: true, data };
  } catch (error) {
    Logger.error("Error al actualizar producto:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Eliminar producto (soft delete)
 * @param {number} id - ID del producto
 * @returns {Promise<Object>}
 */
async function eliminarProducto(id) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_productos")
      .update({ activo: false })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await registrarAuditoria("eliminar_producto", "producto", id, {
      nombre: data.nombre,
    });

    return { success: true, data };
  } catch (error) {
    Logger.error("Error al eliminar producto:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE CÓDIGOS DE BARRAS ==========

/**
 * Asociar código de barras a producto
 * @param {number} productoId - ID del producto
 * @param {string} codigo - Código de barras
 * @param {string} tipo - Tipo de código (ean13, upc, etc.)
 * @returns {Promise<Object>}
 */
async function asociarCodigoBarras(productoId, codigo, tipo = null) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_codigos_barras")
      .insert([{ producto_id: productoId, codigo, tipo }])
      .select()
      .single();

    if (error) throw error;

    await registrarAuditoria("asociar_codigo", "codigo_barras", data.id, {
      producto_id: productoId,
      codigo,
    });

    return { success: true, data };
  } catch (error) {
    Logger.error("Error al asociar código de barras:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Asociar código de barras e incrementar el stock automáticamente
 * @param {number} productoId - ID del producto
 * @param {string} codigo - Código de barras
 * @param {string} tipo - Tipo de código (opcional)
 * @returns {Promise<Object>}
 */
async function asociarCodigoBarrasEIncrementarStock(productoId, codigo, tipo = null) {
  try {
    // 1. Verificar que el producto existe
    const { data: producto, error: productoError } = await supabaseClient
      .from("inv_productos")
      .select("id, nombre, stock_actual")
      .eq("id", productoId)
      .single();

    if (productoError) throw productoError;
    if (!producto) throw new Error("Producto no encontrado");

    // 2. Verificar que el código no existe ya
    const { data: codigoExistente } = await supabaseClient
      .from("inv_codigos_barras")
      .select("id, producto_id")
      .eq("codigo", codigo)
      .single();

    if (codigoExistente) {
      if (codigoExistente.producto_id === productoId) {
        return { success: false, error: "Este código ya está asociado a este producto" };
      } else {
        return { success: false, error: "Este código ya está asociado a otro producto" };
      }
    }

    // 3. Asociar el código de barras
    const { data: codigoData, error: codigoError } = await supabaseClient
      .from("inv_codigos_barras")
      .insert([{ producto_id: productoId, codigo, tipo }])
      .select()
      .single();

    if (codigoError) throw codigoError;

    // 4. Incrementar el stock en 1
    const stockAnterior = parseFloat(producto.stock_actual) || 0;
    const nuevoStock = stockAnterior + 1;

    const { error: updateError } = await supabaseClient
      .from("inv_productos")
      .update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() })
      .eq("id", productoId);

    if (updateError) throw updateError;

    // 5. Registrar movimiento de stock
    await supabaseClient
      .from("inv_movimientos_stock")
      .insert([{
        producto_id: productoId,
        tipo: "entrada",
        cantidad: 1,
        stock_anterior: stockAnterior,
        stock_nuevo: nuevoStock,
        referencia: `Código asociado: ${codigo}`,
        nota: "Stock incrementado automáticamente al asociar código de barras"
      }]);

    // 6. Registrar auditoría
    await registrarAuditoria("asociar_codigo_incremento", "codigo_barras", codigoData.id, {
      producto_id: productoId,
      codigo,
      stock_anterior: stockAnterior,
      stock_nuevo: nuevoStock
    });

    return { success: true, data: codigoData, nuevoStock };
  } catch (error) {
    Logger.error("Error al asociar código e incrementar stock:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Eliminar código de barras
 * @param {number} id - ID del código de barras
 * @returns {Promise<Object>}
 */
async function eliminarCodigoBarras(id) {
  try {
    const { error } = await supabaseClient
      .from("inv_codigos_barras")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await registrarAuditoria("eliminar_codigo", "codigo_barras", id);

    return { success: true };
  } catch (error) {
    Logger.error("Error al eliminar código de barras:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE PROVEEDORES ==========

/**
 * Obtener todos los proveedores activos
 * @returns {Promise<Array>}
 */
async function obtenerTodosProveedores() {
  try {
    const { data, error } = await supabaseClient
      .from("inv_proveedores")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    Logger.error("Error al obtener proveedores:", error);
    return [];
  }
}

/**
 * Crear nuevo proveedor
 * @param {Object} proveedorData - Datos del proveedor
 * @returns {Promise<Object>}
 */
async function crearProveedor(proveedorData) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_proveedores")
      .insert([proveedorData])
      .select()
      .single();

    if (error) throw error;

    await registrarAuditoria("crear_proveedor", "proveedor", data.id, {
      nombre: data.nombre,
    });

    return { success: true, data };
  } catch (error) {
    Logger.error("Error al crear proveedor:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Actualizar proveedor
 * @param {number} id - ID del proveedor
 * @param {Object} proveedorData - Datos a actualizar
 * @returns {Promise<Object>}
 */
async function actualizarProveedor(id, proveedorData) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_proveedores")
      .update(proveedorData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await registrarAuditoria("actualizar_proveedor", "proveedor", id);

    return { success: true, data };
  } catch (error) {
    Logger.error("Error al actualizar proveedor:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE COMPRAS ==========

/**
 * Registrar nueva compra con sus items
 * @param {Object} compraData - Datos de la compra
 * @param {Array} items - Array de items de la compra
 * @returns {Promise<Object>}
 */
async function registrarCompra(compraData, items) {
  try {
    // 1. Crear encabezado de compra
    const { data: compra, error: errorCompra } = await supabaseClient
      .from("inv_compras")
      .insert([compraData])
      .select()
      .single();

    if (errorCompra) throw errorCompra;

    // 2. Insertar items de la compra
    const itemsConCompraId = items.map(item => ({
      ...item,
      compra_id: compra.id,
    }));

    const { data: itemsCreados, error: errorItems } = await supabaseClient
      .from("inv_compra_items")
      .insert(itemsConCompraId)
      .select();

    if (errorItems) throw errorItems;

    // 3. Actualizar stock de cada producto y registrar movimientos
    for (const item of itemsCreados) {
      // Obtener stock actual
      const { data: producto } = await supabaseClient
        .from("inv_productos")
        .select("stock_actual, costo_unitario_base")
        .eq("id", item.producto_id)
        .single();

      const stockAnterior = parseFloat(producto.stock_actual);
      const stockNuevo = stockAnterior + parseFloat(item.cantidad);

      // Actualizar stock y costo base (promedio ponderado simple)
      const costoUnitarioNuevo = item.costo_unitario_real;
      
      await supabaseClient
        .from("inv_productos")
        .update({ 
          stock_actual: stockNuevo,
          costo_unitario_base: costoUnitarioNuevo,
        })
        .eq("id", item.producto_id);

      // Registrar movimiento
      await supabaseClient
        .from("inv_movimientos_stock")
        .insert([{
          producto_id: item.producto_id,
          tipo: "compra",
          cantidad: parseFloat(item.cantidad),
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          referencia: `compra_${compra.id}`,
          nota: `Compra #${compra.id} - ${compraData.referencia || ""}`,
        }]);
    }

    await registrarAuditoria("registrar_compra", "compra", compra.id, {
      referencia: compraData.referencia,
      total: compraData.total,
      items: items.length,
    });

    return { success: true, data: { compra, items: itemsCreados } };
  } catch (error) {
    Logger.error("Error al registrar compra:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener todas las compras con detalles
 * @returns {Promise<Array>}
 */
async function obtenerTodasCompras() {
  try {
    const { data, error } = await supabaseClient
      .from("inv_compras")
      .select(`
        *,
        proveedor:proveedor_id(id, nombre),
        inv_compra_items(
          *,
          producto:producto_id(id, nombre, sku)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    Logger.error("Error al obtener compras:", error);
    return [];
  }
}

// ========== FUNCIONES DE VENTAS ==========

/**
 * Registrar nueva venta con sus items
 * @param {Object} ventaData - Datos de la venta
 * @param {Array} items - Array de items de la venta
 * @returns {Promise<Object>}
 */
async function registrarVenta(ventaData, items) {
  try {
    // 1. Validar stock disponible para todos los items
    for (const item of items) {
      const { data: producto } = await supabaseClient
        .from("inv_productos")
        .select("stock_actual, nombre")
        .eq("id", item.producto_id)
        .single();

      if (parseFloat(producto.stock_actual) < parseFloat(item.cantidad)) {
        throw new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock_actual}`);
      }
    }

    // 2. Crear encabezado de venta
    const { data: venta, error: errorVenta } = await supabaseClient
      .from("inv_ventas")
      .insert([ventaData])
      .select()
      .single();

    if (errorVenta) throw errorVenta;

    // 3. Insertar items de la venta
    const itemsConVentaId = items.map(item => ({
      ...item,
      venta_id: venta.id,
    }));

    const { data: itemsCreados, error: errorItems } = await supabaseClient
      .from("inv_venta_items")
      .insert(itemsConVentaId)
      .select();

    if (errorItems) throw errorItems;

    // 4. Actualizar stock de cada producto y registrar movimientos
    for (const item of itemsCreados) {
      // Obtener stock actual
      const { data: producto } = await supabaseClient
        .from("inv_productos")
        .select("stock_actual")
        .eq("id", item.producto_id)
        .single();

      const stockAnterior = parseFloat(producto.stock_actual);
      const stockNuevo = stockAnterior - parseFloat(item.cantidad);

      // Actualizar stock
      await supabaseClient
        .from("inv_productos")
        .update({ stock_actual: stockNuevo })
        .eq("id", item.producto_id);

      // Registrar movimiento
      await supabaseClient
        .from("inv_movimientos_stock")
        .insert([{
          producto_id: item.producto_id,
          tipo: "venta",
          cantidad: -parseFloat(item.cantidad),
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          referencia: `venta_${venta.id}`,
          nota: `Venta #${venta.id}`,
        }]);
    }

    await registrarAuditoria("registrar_venta", "venta", venta.id, {
      total: ventaData.total,
      utilidad: ventaData.utilidad_total_real,
      items: items.length,
    });

    return { success: true, data: { venta, items: itemsCreados } };
  } catch (error) {
    Logger.error("Error al registrar venta:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Eliminar venta y revertir stock
 * @param {number} ventaId - ID de la venta
 * @returns {Promise<Object>}
 */
async function eliminarVenta(ventaId) {
  try {
    // 1. Obtener venta y sus items
    const { data: venta, error: errorVenta } = await supabaseClient
      .from("inv_ventas")
      .select(`
        *,
        inv_venta_items(*)
      `)
      .eq("id", ventaId)
      .single();

    if (errorVenta) throw errorVenta;
    if (!venta) throw new Error("Venta no encontrada");

    // 2. Revertir stock para cada item
    for (const item of venta.inv_venta_items) {
      // Obtener stock actual del producto
      const { data: producto } = await supabaseClient
        .from("inv_productos")
        .select("stock_actual, nombre")
        .eq("id", item.producto_id)
        .single();

      const stockAnterior = parseFloat(producto.stock_actual);
      const stockNuevo = stockAnterior + parseFloat(item.cantidad);

      // Actualizar stock (devolver las unidades)
      await supabaseClient
        .from("inv_productos")
        .update({ stock_actual: stockNuevo })
        .eq("id", item.producto_id);

      // Registrar movimiento de reversa
      await supabaseClient
        .from("inv_movimientos_stock")
        .insert([{
          producto_id: item.producto_id,
          tipo: "ajuste",
          cantidad: parseFloat(item.cantidad),
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          referencia: `reversa_venta_${ventaId}`,
          nota: `Stock revertido por eliminación de venta #${ventaId}`,
        }]);
    }

    // 3. Eliminar items de venta
    const { error: errorDeleteItems } = await supabaseClient
      .from("inv_venta_items")
      .delete()
      .eq("venta_id", ventaId);

    if (errorDeleteItems) throw errorDeleteItems;

    // 4. Eliminar venta principal
    const { error: errorDeleteVenta } = await supabaseClient
      .from("inv_ventas")
      .delete()
      .eq("id", ventaId);

    if (errorDeleteVenta) throw errorDeleteVenta;

    // 5. Registrar auditoría
    await registrarAuditoria("eliminar_venta", "venta", ventaId, {
      total_revertido: venta.total,
      items_count: venta.inv_venta_items.length,
      fecha_venta_original: venta.fecha
    });

    return { success: true, data: venta };
  } catch (error) {
    Logger.error("Error al eliminar venta:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener todas las ventas con detalles
 * @param {Object} options - Filtros opcionales
 * @returns {Promise<Array>}
 */
async function obtenerTodasVentas(options = {}) {
  try {
    let query = supabaseClient
      .from("inv_ventas")
      .select(`
        *,
        inv_venta_items(
          *,
          producto:producto_id(id, nombre, sku)
        )
      `)
      .order("created_at", { ascending: false });

    // Filtros por fecha
    if (options.fechaInicio) {
      query = query.gte("fecha", options.fechaInicio);
    }
    if (options.fechaFin) {
      query = query.lte("fecha", options.fechaFin);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    Logger.error("Error al obtener ventas:", error);
    return [];
  }
}

// ========== FUNCIONES DE MOVIMIENTOS ==========

/**
 * Obtener movimientos de stock de un producto
 * @param {number} productoId - ID del producto
 * @param {number} limit - Límite de registros
 * @returns {Promise<Array>}
 */
async function obtenerMovimientosProducto(productoId, limit = 50) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_movimientos_stock")
      .select("*")
      .eq("producto_id", productoId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    Logger.error("Error al obtener movimientos:", error);
    return [];
  }
}

/**
 * Registrar ajuste manual de stock
 * @param {number} productoId - ID del producto
 * @param {number} cantidadAjuste - Cantidad a ajustar (positivo o negativo)
 * @param {string} nota - Motivo del ajuste
 * @returns {Promise<Object>}
 */
async function ajustarStock(productoId, cantidadAjuste, nota) {
  try {
    // Obtener stock actual
    const { data: producto } = await supabaseClient
      .from("inv_productos")
      .select("stock_actual, nombre")
      .eq("id", productoId)
      .single();

    const stockAnterior = parseFloat(producto.stock_actual);
    const stockNuevo = stockAnterior + parseFloat(cantidadAjuste);

    if (stockNuevo < 0) {
      throw new Error(`El ajuste resultaría en stock negativo para ${producto.nombre}`);
    }

    // Actualizar stock
    await supabaseClient
      .from("inv_productos")
      .update({ stock_actual: stockNuevo })
      .eq("id", productoId);

    // Registrar movimiento
    const { data: movimiento, error } = await supabaseClient
      .from("inv_movimientos_stock")
      .insert([{
        producto_id: productoId,
        tipo: "ajuste",
        cantidad: parseFloat(cantidadAjuste),
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        referencia: "ajuste_manual",
        nota,
      }])
      .select()
      .single();

    if (error) throw error;

    await registrarAuditoria("ajustar_stock", "producto", productoId, {
      cantidad: cantidadAjuste,
      stock_nuevo: stockNuevo,
    });

    return { success: true, data: movimiento };
  } catch (error) {
    Logger.error("Error al ajustar stock:", error);
    return { success: false, error: error.message };
  }
}

// ========== FUNCIONES DE REPORTES Y KPIs ==========

/**
 * Obtener KPIs del dashboard
 * @returns {Promise<Object>}
 */
async function obtenerKPIsDashboard() {
  try {
    // Total productos activos
    const { count: totalProductos } = await supabaseClient
      .from("inv_productos")
      .select("*", { count: "exact", head: true })
      .eq("activo", true);

    // Obtener todos los productos para calcular valores
    const { data: productos } = await supabaseClient
      .from("inv_productos")
      .select("stock_actual, stock_minimo, costo_unitario_base, precio_sugerido")
      .eq("activo", true);

    const valorInventarioCosto = productos?.reduce((sum, p) => 
      sum + (parseFloat(p.stock_actual) * parseFloat(p.costo_unitario_base)), 0) || 0;

    const valorInventarioSugerido = productos?.reduce((sum, p) => 
      sum + (parseFloat(p.stock_actual) * parseFloat(p.precio_sugerido || 0)), 0) || 0;

    // Productos con stock bajo (filtrar en JavaScript)
    const productosBajoStock = productos?.filter(p => 
      parseFloat(p.stock_actual) < parseFloat(p.stock_minimo)
    ).length || 0;

    // Ventas del mes actual
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const { data: ventasMes } = await supabaseClient
      .from("inv_ventas")
      .select("total, utilidad_total_real")
      .gte("fecha", inicioMes.toISOString());

    const ventasMesTotal = ventasMes?.reduce((sum, v) => sum + parseFloat(v.total), 0) || 0;
    const utilidadMesTotal = ventasMes?.reduce((sum, v) => sum + parseFloat(v.utilidad_total_real), 0) || 0;

    return {
      totalProductos: totalProductos || 0,
      valorInventarioCosto,
      valorInventarioSugerido,
      productosBajoStock,
      ventasMesTotal,
      utilidadMesTotal,
      cantidadVentasMes: ventasMes?.length || 0,
    };
  } catch (error) {
    Logger.error("Error al obtener KPIs:", error);
    return null;
  }
}

/**
 * Obtener productos más vendidos
 * @param {number} limit - Cantidad de productos a retornar
 * @returns {Promise<Array>}
 */
async function obtenerProductosMasVendidos(limit = 10) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_venta_items")
      .select(`
        producto_id,
        producto:producto_id(nombre, sku),
        cantidad
      `);

    if (error) throw error;

    // Agrupar y sumar por producto
    const ventasPorProducto = {};
    data.forEach(item => {
      const pid = item.producto_id;
      if (!ventasPorProducto[pid]) {
        ventasPorProducto[pid] = {
          producto_id: pid,
          nombre: item.producto?.nombre,
          sku: item.producto?.sku,
          cantidad_total: 0,
        };
      }
      ventasPorProducto[pid].cantidad_total += parseFloat(item.cantidad);
    });

    // Convertir a array y ordenar
    const ranking = Object.values(ventasPorProducto)
      .sort((a, b) => b.cantidad_total - a.cantidad_total)
      .slice(0, limit);

    return ranking;
  } catch (error) {
    Logger.error("Error al obtener productos más vendidos:", error);
    return [];
  }
}

// ========== FUNCIONES DE AUDITORÍA ==========

/**
 * Registrar acción en auditoría
 * @param {string} accion - Acción realizada
 * @param {string} entidad - Tipo de entidad
 * @param {number} entidadId - ID de la entidad
 * @param {Object} detalles - Detalles adicionales
 * @returns {Promise<void>}
 */
async function registrarAuditoria(accion, entidad, entidadId, detalles = {}) {
  try {
    await supabaseClient
      .from("inv_auditoria")
      .insert([{
        tipo_usuario: "inventarios",
        accion,
        entidad,
        entidad_id: entidadId,
        detalles,
      }]);
  } catch (error) {
    // No fallar la operación principal si falla la auditoría
    Logger.warn("Error al registrar auditoría:", error);
  }
}

/**
 * Obtener registros de auditoría
 * @param {number} limit - Límite de registros
 * @returns {Promise<Array>}
 */
async function obtenerAuditoria(limit = 100) {
  try {
    const { data, error } = await supabaseClient
      .from("inv_auditoria")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    Logger.error("Error al obtener auditoría:", error);
    return [];
  }
}

// Exportar para uso global
if (typeof window !== "undefined") {
  window.InventoryDB = {
    // Productos
    obtenerTodosProductos,
    buscarProductoPorSKU,
    obtenerProductoPorId,
    buscarProductoPorCodigoBarras,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    
    // Códigos de barras
    asociarCodigoBarras,
    asociarCodigoBarrasEIncrementarStock,
    eliminarCodigoBarras,
    
    // Proveedores
    obtenerTodosProveedores,
    crearProveedor,
    actualizarProveedor,
    
    // Compras
    registrarCompra,
    obtenerTodasCompras,
    
    // Ventas
    registrarVenta,
    obtenerTodasVentas,
    eliminarVenta,
    eliminarVenta,
    
    // Movimientos
    obtenerMovimientosProducto,
    ajustarStock,
    
    // Reportes
    obtenerKPIsDashboard,
    obtenerProductosMasVendidos,
    
    // Auditoría
    obtenerAuditoria,
  };
}
