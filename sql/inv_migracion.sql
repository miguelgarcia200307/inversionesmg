-- =====================================================
-- INVERSIONES MG - MÓDULO INVENTARIOS
-- Script de Migración: Tablas + Índices + RLS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. CREAR TABLAS
-- =====================================================

-- Tabla: inv_productos
-- Almacena información de productos del inventario
CREATE TABLE IF NOT EXISTS inv_productos (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  categoria VARCHAR(100),
  marca VARCHAR(100),
  modelo VARCHAR(100),
  descripcion TEXT,
  sku VARCHAR(50) UNIQUE NOT NULL,
  
  -- Stock
  stock_actual NUMERIC(10,2) DEFAULT 0 NOT NULL,
  stock_minimo NUMERIC(10,2) DEFAULT 0,
  ubicacion VARCHAR(100),
  
  -- Costos y precios
  costo_unitario_base NUMERIC(12,2) NOT NULL,
  gastos_asociados_base NUMERIC(12,2) DEFAULT 0,
  margen_sugerido_pct NUMERIC(5,2),  -- Porcentaje de margen (ej: 25.50)
  margen_sugerido_valor NUMERIC(12,2), -- Valor fijo de margen
  precio_sugerido NUMERIC(12,2) NOT NULL,
  
  -- Proveedor principal
  proveedor_principal_id BIGINT REFERENCES inv_proveedores(id),
  
  -- Estado
  activo BOOLEAN DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_codigos_barras
-- Almacena códigos de barras asociados a productos (relación 1:N)
CREATE TABLE IF NOT EXISTS inv_codigos_barras (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES inv_productos(id) ON DELETE CASCADE,
  codigo VARCHAR(100) UNIQUE NOT NULL,
  tipo VARCHAR(20), -- 'ean13', 'ean8', 'upc', 'code128', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_proveedores
-- Almacena información de proveedores
CREATE TABLE IF NOT EXISTS inv_proveedores (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  contacto VARCHAR(100),
  telefono VARCHAR(20),
  email VARCHAR(100),
  ciudad VARCHAR(100),
  direccion TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_compras
-- Almacena encabezado de compras/entradas de inventario
CREATE TABLE IF NOT EXISTS inv_compras (
  id BIGSERIAL PRIMARY KEY,
  proveedor_id BIGINT REFERENCES inv_proveedores(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  referencia VARCHAR(100), -- Número de factura o referencia
  metodo_pago VARCHAR(50), -- 'efectivo', 'transferencia', 'credito', etc.
  subtotal NUMERIC(12,2) NOT NULL,
  gastos_total NUMERIC(12,2) DEFAULT 0, -- Envío, comisiones, impuestos
  total NUMERIC(12,2) NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_compra_items
-- Almacena detalle de items de cada compra
CREATE TABLE IF NOT EXISTS inv_compra_items (
  id BIGSERIAL PRIMARY KEY,
  compra_id BIGINT NOT NULL REFERENCES inv_compras(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES inv_productos(id),
  cantidad NUMERIC(10,2) NOT NULL,
  costo_unitario_real NUMERIC(12,2) NOT NULL, -- Costo real pagado por unidad
  gastos_prorrateados NUMERIC(12,2) DEFAULT 0, -- Gastos distribuidos a este item
  costo_total_item NUMERIC(12,2) NOT NULL, -- (costo_unitario_real * cantidad) + gastos_prorrateados
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_ventas
-- Almacena encabezado de ventas
CREATE TABLE IF NOT EXISTS inv_ventas (
  id BIGSERIAL PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metodo_pago VARCHAR(50), -- 'efectivo', 'transferencia', 'nequi', 'datafono', etc.
  subtotal NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  utilidad_total_real NUMERIC(12,2) NOT NULL, -- Utilidad real de la venta
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_venta_items
-- Almacena detalle de items de cada venta
CREATE TABLE IF NOT EXISTS inv_venta_items (
  id BIGSERIAL PRIMARY KEY,
  venta_id BIGINT NOT NULL REFERENCES inv_ventas(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES inv_productos(id),
  cantidad NUMERIC(10,2) NOT NULL,
  precio_unitario_sugerido_en_el_momento NUMERIC(12,2) NOT NULL, -- Precio sugerido al momento de la venta
  precio_unitario_real_vendido NUMERIC(12,2) NOT NULL, -- Precio real al que se vendió
  costo_unitario_en_el_momento NUMERIC(12,2) NOT NULL, -- Costo del producto al momento de la venta
  utilidad_item_real NUMERIC(12,2) NOT NULL, -- (precio_real_vendido - costo) * cantidad
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_movimientos_stock
-- Almacena todos los movimientos de inventario (entradas/salidas/ajustes)
CREATE TABLE IF NOT EXISTS inv_movimientos_stock (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES inv_productos(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL, -- 'entrada', 'salida', 'ajuste', 'venta', 'compra'
  cantidad NUMERIC(10,2) NOT NULL, -- Positivo para entradas, negativo para salidas
  stock_anterior NUMERIC(10,2) NOT NULL,
  stock_nuevo NUMERIC(10,2) NOT NULL,
  referencia VARCHAR(100), -- ID de compra, venta, o descripción del ajuste
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: inv_auditoria (opcional, si no reutilizas la existente)
-- Almacena logs de auditoría específicos de inventarios
CREATE TABLE IF NOT EXISTS inv_auditoria (
  id BIGSERIAL PRIMARY KEY,
  tipo_usuario VARCHAR(50) DEFAULT 'inventarios',
  accion VARCHAR(100) NOT NULL, -- 'crear_producto', 'registrar_venta', etc.
  entidad VARCHAR(50), -- 'producto', 'venta', 'compra', etc.
  entidad_id BIGINT,
  detalles JSONB, -- Información adicional sin datos sensibles
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. CREAR ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================

-- Índices en inv_productos
CREATE INDEX IF NOT EXISTS idx_inv_productos_sku ON inv_productos(sku);
CREATE INDEX IF NOT EXISTS idx_inv_productos_categoria ON inv_productos(categoria);
CREATE INDEX IF NOT EXISTS idx_inv_productos_activo ON inv_productos(activo);
CREATE INDEX IF NOT EXISTS idx_inv_productos_proveedor ON inv_productos(proveedor_principal_id);

-- Índices en inv_codigos_barras
CREATE INDEX IF NOT EXISTS idx_inv_codigos_producto ON inv_codigos_barras(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_codigos_codigo ON inv_codigos_barras(codigo);

-- Índices en inv_compras
CREATE INDEX IF NOT EXISTS idx_inv_compras_proveedor ON inv_compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_inv_compras_fecha ON inv_compras(fecha DESC);

-- Índices en inv_compra_items
CREATE INDEX IF NOT EXISTS idx_inv_compra_items_compra ON inv_compra_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_inv_compra_items_producto ON inv_compra_items(producto_id);

-- Índices en inv_ventas
CREATE INDEX IF NOT EXISTS idx_inv_ventas_fecha ON inv_ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_inv_ventas_created ON inv_ventas(created_at DESC);

-- Índices en inv_venta_items
CREATE INDEX IF NOT EXISTS idx_inv_venta_items_venta ON inv_venta_items(venta_id);
CREATE INDEX IF NOT EXISTS idx_inv_venta_items_producto ON inv_venta_items(producto_id);

-- Índices en inv_movimientos_stock
CREATE INDEX IF NOT EXISTS idx_inv_movimientos_producto ON inv_movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_movimientos_tipo ON inv_movimientos_stock(tipo);
CREATE INDEX IF NOT EXISTS idx_inv_movimientos_created ON inv_movimientos_stock(created_at DESC);

-- Índices en inv_auditoria
CREATE INDEX IF NOT EXISTS idx_inv_auditoria_accion ON inv_auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_inv_auditoria_created ON inv_auditoria(created_at DESC);

-- =====================================================
-- 3. FUNCIONES DE BASE DE DATOS
-- =====================================================

-- Función: Generar SKU automático
CREATE OR REPLACE FUNCTION generar_sku()
RETURNS TEXT AS $$
DECLARE
  nuevo_sku TEXT;
  contador INT;
BEGIN
  -- Obtener el último número de SKU
  SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 5) AS INTEGER)), 0) + 1
  INTO contador
  FROM inv_productos
  WHERE sku ~ '^SKU-[0-9]+$';
  
  -- Generar SKU con formato SKU-00001
  nuevo_sku := 'SKU-' || LPAD(contador::TEXT, 5, '0');
  
  RETURN nuevo_sku;
END;
$$ LANGUAGE plpgsql;

-- Función: Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Actualizar updated_at en inv_productos
DROP TRIGGER IF EXISTS trigger_inv_productos_updated_at ON inv_productos;
CREATE TRIGGER trigger_inv_productos_updated_at
BEFORE UPDATE ON inv_productos
FOR EACH ROW
EXECUTE FUNCTION actualizar_updated_at();

-- Trigger: Actualizar updated_at en inv_proveedores
DROP TRIGGER IF EXISTS trigger_inv_proveedores_updated_at ON inv_proveedores;
CREATE TRIGGER trigger_inv_proveedores_updated_at
BEFORE UPDATE ON inv_proveedores
FOR EACH ROW
EXECUTE FUNCTION actualizar_updated_at();

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- IMPORTANTE: El proyecto actual usa SUPABASE_ANON_KEY desde el front
-- sin autenticación real. Estas políticas permiten acceso completo
-- para mantener consistencia con el sistema existente.
-- 
-- RECOMENDACIÓN FUTURA: Migrar a Supabase Auth con roles (admin_creditos, admin_inventarios)

-- Habilitar RLS en todas las tablas
ALTER TABLE inv_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_codigos_barras ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_compra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_auditoria ENABLE ROW LEVEL SECURITY;

-- Políticas: Permitir todas las operaciones (consistente con sistema actual)
-- inv_productos
CREATE POLICY "Permitir todo en inv_productos" ON inv_productos FOR ALL USING (true) WITH CHECK (true);

-- inv_codigos_barras
CREATE POLICY "Permitir todo en inv_codigos_barras" ON inv_codigos_barras FOR ALL USING (true) WITH CHECK (true);

-- inv_proveedores
CREATE POLICY "Permitir todo en inv_proveedores" ON inv_proveedores FOR ALL USING (true) WITH CHECK (true);

-- inv_compras
CREATE POLICY "Permitir todo en inv_compras" ON inv_compras FOR ALL USING (true) WITH CHECK (true);

-- inv_compra_items
CREATE POLICY "Permitir todo en inv_compra_items" ON inv_compra_items FOR ALL USING (true) WITH CHECK (true);

-- inv_ventas
CREATE POLICY "Permitir todo en inv_ventas" ON inv_ventas FOR ALL USING (true) WITH CHECK (true);

-- inv_venta_items
CREATE POLICY "Permitir todo en inv_venta_items" ON inv_venta_items FOR ALL USING (true) WITH CHECK (true);

-- inv_movimientos_stock
CREATE POLICY "Permitir todo en inv_movimientos_stock" ON inv_movimientos_stock FOR ALL USING (true) WITH CHECK (true);

-- inv_auditoria
CREATE POLICY "Permitir todo en inv_auditoria" ON inv_auditoria FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 5. DATOS DE EJEMPLO (OPCIONAL - COMENTADOS)
-- =====================================================

-- Descomentar si deseas poblar con datos de prueba:

/*
-- Proveedores de ejemplo
INSERT INTO inv_proveedores (nombre, contacto, telefono, email, ciudad) VALUES
('Distribuidora Nacional', 'Juan Pérez', '3001234567', 'ventas@distribuidora.com', 'Bogotá'),
('Importadora Global', 'María González', '3109876543', 'info@importadora.com', 'Medellín');

-- Productos de ejemplo
INSERT INTO inv_productos (nombre, categoria, marca, sku, stock_actual, stock_minimo, costo_unitario_base, margen_sugerido_pct, precio_sugerido, proveedor_principal_id)
VALUES
('Producto Ejemplo 1', 'Electrónica', 'Samsung', 'SKU-00001', 10, 5, 100000, 30, 130000, 1),
('Producto Ejemplo 2', 'Hogar', 'LG', 'SKU-00002', 15, 5, 50000, 40, 70000, 2);

-- Códigos de barras de ejemplo
INSERT INTO inv_codigos_barras (producto_id, codigo, tipo) VALUES
(1, '7501234567890', 'ean13'),
(2, '7509876543210', 'ean13');
*/

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================

-- NOTAS IMPORTANTES:
-- 1. Ejecutar este script en Supabase SQL Editor
-- 2. Verificar que todas las tablas se crearon correctamente
-- 3. Las políticas RLS están abiertas por consistencia con el sistema actual
-- 4. Para producción real, se recomienda implementar Supabase Auth con roles
-- 5. El campo 'stock_actual' se actualiza automáticamente con triggers o desde el código

COMMENT ON TABLE inv_productos IS 'Productos del inventario';
COMMENT ON TABLE inv_codigos_barras IS 'Códigos de barras asociados a productos (1:N)';
COMMENT ON TABLE inv_proveedores IS 'Proveedores de productos';
COMMENT ON TABLE inv_compras IS 'Encabezado de compras/entradas';
COMMENT ON TABLE inv_compra_items IS 'Detalle de items de compras';
COMMENT ON TABLE inv_ventas IS 'Encabezado de ventas';
COMMENT ON TABLE inv_venta_items IS 'Detalle de items de ventas';
COMMENT ON TABLE inv_movimientos_stock IS 'Historial de movimientos de inventario';
COMMENT ON TABLE inv_auditoria IS 'Auditoría de acciones en inventarios';
