# 📦 INVENTARIOS MG - Módulo de Gestión de Inventarios

## 📋 Índice

1. [Descripción](#descripción)
2. [Características](#características)
3. [Estructura del Proyecto](#estructura-del-proyecto)
4. [Instalación](#instalación)
5. [Credenciales de Acceso](#credenciales-de-acceso)
6. [Uso del Sistema](#uso-del-sistema)
7. [Scanner de Códigos de Barras](#scanner-de-códigos-de-barras)
8. [Base de Datos](#base-de-datos)
9. [Arquitectura](#arquitectura)
10. [Limitaciones](#limitaciones)
11. [Mejoras Futuras](#mejoras-futuras)

---

## 📖 Descripción

**Inventarios MG** es un módulo completamente independiente dentro del sistema Inversiones MG que permite gestionar inventarios de productos, realizar ventas rápidas con scanner de códigos de barras, registrar compras, administrar proveedores y generar reportes.

Este módulo **NO interfiere** con el panel existente de créditos y obligaciones. Ambos sistemas coexisten en el mismo dominio pero con sesiones y datos completamente separados.

---

## ✨ Características

### 🎯 Funcionalidades Principales

#### 1. **Dashboard Inteligente**
- KPIs en tiempo real (total productos, valor inventario, stock bajo)
- Gráfico de productos más vendidos
- Accesos rápidos a funciones principales
- Resumen de ventas y utilidades del mes

#### 2. **Gestión de Productos**
- ✅ Crear, editar y eliminar productos
- ✅ SKU generado automáticamente
- ✅ Asociar múltiples códigos de barras por producto
- ✅ Control de stock actual y mínimo
- ✅ Cálculo automático de precios sugeridos según margen
- ✅ Registro de costos y gastos asociados
- ✅ Asignación de proveedor principal
- ✅ Ubicación física en bodega/estante

#### 3. **Ventas Rápidas** 💰
- 🎯 Escaneo de códigos de barras con cámara nativa
- 🛒 Carrito de compras intuitivo
- ✏️ Edición de cantidades y precios en tiempo real
- 💵 Múltiples métodos de pago
- 📊 Cálculo automático de utilidades
- ⚡ Descuento automático de stock
- 📝 Registro completo de transacciones

#### 4. **Gestión de Compras** 🛒
- Registro de compras con múltiples items
- Asignación de proveedor
- Prorrateo automático de gastos adicionales
- Actualización automática de stock
- Historial completo de compras

#### 5. **Proveedores** 🏭
- CRUD completo de proveedores
- Información de contacto y ubicación
- Historial de compras por proveedor

#### 6. **Scanner de Códigos de Barras** 📷
- ✅ **BarcodeDetector API nativo** (Chrome/Edge/Android)
- ✅ Soporta EAN-13, EAN-8, UPC-A, CODE-128
- ✅ Anti-duplicados (timeout de 2 segundos)
- ✅ Vibración al detectar código
- ✅ Linterna para ambientes oscuros (si disponible)
- ✅ Vista full-screen con guías visuales
- ✅ Fallback manual si no hay soporte nativo
- ✅ Tres modos: venta, registro, asociación

#### 7. **Reportes** 📈
- Reporte de utilidades estimadas vs reales
- Productos con stock bajo
- Rotación de inventario
- Ventas del mes
- Exportación futura a CSV

#### 8. **Auditoría** 📋
- Registro automático de todas las acciones
- Timestamp y detalles de operaciones
- Trazabilidad completa

---

## 📁 Estructura del Proyecto

```
Inversiones MG/
│
├── admin.html                    # Panel de créditos (existente)
├── index.html                    # Vista cliente (existente)
├── inventarios.html             # ⭐ NUEVO: Panel de inventarios
│
├── estilos/
│   ├── base.css                 # Estilos base compartidos
│   ├── admin-corporate.css      # Estilos del panel admin
│   └── inventory.css            # ⭐ NUEVO: Estilos de inventarios
│
├── scripts/
│   ├── config.js                # Configuración compartida
│   ├── supabaseClient.js        # Cliente Supabase (créditos)
│   ├── supabaseInventory.js     # ⭐ NUEVO: Operaciones BD inventarios
│   ├── admin.js                 # ✏️ MODIFICADO: Login con ruteo
│   ├── inventory.js             # ⭐ NUEVO: Lógica panel inventarios
│   └── ...                      # Otros archivos existentes
│
└── sql/
    └── inv_migracion.sql        # ⭐ NUEVO: Script SQL de migración
```

---

## 🚀 Instalación

### Paso 1: Ejecutar Script SQL

1. Abre tu proyecto en **Supabase Dashboard**
2. Ve a **SQL Editor**
3. Copia y ejecuta el contenido de `sql/inv_migracion.sql`
4. Verifica que se crearon las siguientes tablas:
   - `inv_productos`
   - `inv_codigos_barras`
   - `inv_proveedores`
   - `inv_compras`
   - `inv_compra_items`
   - `inv_ventas`
   - `inv_venta_items`
   - `inv_movimientos_stock`
   - `inv_auditoria`

### Paso 2: Verificar Variables Supabase

Asegúrate de que en `scripts/supabaseClient.js` tienes configuradas tus credenciales reales:

```javascript
const SUPABASE_URL = "https://tu-proyecto.supabase.co";
const SUPABASE_ANON_KEY = "tu_anon_key_real";
```

### Paso 3: Desplegar Archivos

Sube todos los archivos nuevos y modificados a tu servidor:

```bash
- inventarios.html
- estilos/inventory.css
- scripts/inventory.js
- scripts/supabaseInventory.js
- scripts/admin.js (modificado)
```

### Paso 4: Probar el Sistema

1. Abre `admin.html` en tu navegador
2. Ingresa credenciales de inventarios: `inventarios / inv2026`
3. Deberías ser redirigido a `inventarios.html`

---

## 🔐 Credenciales de Acceso

### Panel de Créditos (existente)
```
Usuario: miguelgarcia
Contraseña: miguel2003
URL: admin.html
```

### Panel de Inventarios (nuevo)
```
Usuario: inventarios
Contraseña: inv2026
URL: admin.html (redirige a inventarios.html)
       o directamente: inventarios.html
```

### ⚠️ Limitaciones de Seguridad

El sistema actual usa **autenticación hardcodeada** sin encriptación. Esto es **inseguro para producción**:

- Las credenciales están en el código fuente
- No hay roles ni permisos reales
- Cualquiera con acceso al código puede ver las contraseñas
- No hay verificación en el backend

**Recomendación**: Ver sección [Mejoras Futuras](#mejoras-futuras)

---

## 💻 Uso del Sistema

### 1. Dashboard

Al iniciar sesión verás:
- Resumen de KPIs principales
- Acciones rápidas (nueva venta, nuevo producto, etc.)
- Productos más vendidos del mes

### 2. Crear un Producto

**Opción A: Manual**
1. Click en "Productos" en el sidebar
2. Click en "➕ Nuevo Producto"
3. Completa el formulario:
   - **Nombre**: Nombre del producto *
   - **Categoría**: Tipo de producto
   - **Stock Inicial**: Cantidad disponible *
   - **Costo Unitario**: Precio de compra *
   - **Margen (%)**: Porcentaje de ganancia *
   - **Precio Sugerido**: Se calcula automáticamente
   - **Código de Barras**: Opcional, puede escanearse
4. Click en "Guardar Producto"

**Opción B: Con Scanner**
1. Click en el botón de scanner (📷)
2. Escanea el código de barras del producto
3. Si no existe, se abre el formulario con el código pre-cargado
4. Completa el formulario y guarda

### 3. Realizar una Venta Rápida

1. Click en "Ventas" o en el botón "💰 Nueva Venta"
2. **Agregar productos al carrito:**
   - **Opción 1**: Click en "📷 Escanear Producto" y escanea
   - **Opción 2**: Busca manualmente en el campo de búsqueda
3. Ajusta las cantidades si es necesario
4. Edita el precio real de venta si difiere del sugerido
5. Selecciona el método de pago
6. Click en "Confirmar Venta"

**Resultado**: 
- Se descuenta el stock automáticamente
- Se registra la venta con utilidad real
- Se crea un movimiento de stock

### 4. Registrar una Compra

1. Click en "Compras" → "🛒 Nueva Compra"
2. Selecciona el proveedor y fecha
3. Agrega productos desde el menú desplegable
4. Para cada producto, ingresa:
   - Cantidad recibida
   - Costo unitario real pagado
5. Ingresa gastos adicionales (envío, impuestos, etc.)
6. Revisa los totales
7. Click en "Guardar Compra"

**Resultado**:
- Se aumenta el stock automáticamente
- Se distribuyen los gastos entre los items
- Se actualiza el costo base del producto

### 5. Gestionar Proveedores

1. Click en "Proveedores"
2. Click en "➕ Nuevo Proveedor"
3. Completa información de contacto
4. Guarda

Los proveedores aparecen como tarjetas con toda su información.

---

## 📷 Scanner de Códigos de Barras

### Compatibilidad

El scanner usa **BarcodeDetector API nativo** del navegador:

**✅ Soporte Completo:**
- Chrome 83+ (Android/Desktop)
- Edge 83+ (Android/Desktop)
- Samsung Internet 13+

**❌ Sin Soporte Nativo:**
- Safari iOS/macOS
- Firefox (todas las plataformas)

En navegadores sin soporte, se muestra un **fallback manual** para ingresar el código.

### Formatos Soportados

- **EAN-13**: Códigos de barras estándar (13 dígitos)
- **EAN-8**: Versión corta de EAN (8 dígitos)
- **UPC-A**: Estándar norteamericano
- **CODE-128**: Códigos alfanuméricos

### Modos del Scanner

#### 1. **Modo Venta** (predeterminado)
- Escaneas un producto y se agrega al carrito automáticamente
- Si no existe, pregunta si deseas registrarlo

#### 2. **Modo Registro**
- Escaneas para crear un nuevo producto con ese código
- Si ya existe, muestra el producto asociado

#### 3. **Modo Asociación**
- Asociar un código de barras adicional a un producto existente
- Útil cuando un producto tiene múltiples códigos

### Características del Scanner

✅ **Anti-duplicados**: Ignora el mismo código si se detecta en menos de 2 segundos  
✅ **Vibración**: Vibra al detectar un código exitosamente  
✅ **Linterna**: Activa la luz de la cámara si está disponible  
✅ **Guías visuales**: Muestra un marco con animación de escaneo  
✅ **Full-screen**: Ocupa toda la pantalla para mejor UX  
✅ **Cierre automático**: Se cierra 1 segundo después de detectar  

### Solución de Problemas del Scanner

**"No se pudo acceder a la cámara"**
- Verifica que diste permisos de cámara al sitio
- En móvil, usa HTTPS (no HTTP)
- Algunos navegadores bloquean cámara en páginas no seguras

**"Tu dispositivo no soporta escaneo nativo"**
- Tu navegador no tiene BarcodeDetector API
- Usa el botón "⌨️ Ingresar manualmente"
- Considera usar Chrome o Edge

**El scanner no detecta el código**
- Asegúrate de tener buena iluminación
- El código debe estar bien enfocado
- Algunos códigos muy pequeños pueden no detectarse
- Usa el zoom si está disponible

---

## 🗄️ Base de Datos

### Tablas Principales

#### `inv_productos`
Almacena información de productos.

**Campos clave:**
- `sku`: Código único generado automáticamente
- `stock_actual`: Stock disponible
- `stock_minimo`: Alerta de stock bajo
- `costo_unitario_base`: Costo de compra
- `precio_s ugerido`: Precio calculado con margen
- `activo`: Soft delete

#### `inv_codigos_barras`
Códigos de barras asociados (1 producto puede tener N códigos).

#### `inv_ventas` e `inv_venta_items`
Registro de ventas con detalle de items, precios reales y utilidades.

#### `inv_compras` e `inv_compra_items`
Registro de compras con prorrateo de gastos.

#### `inv_movimientos_stock`
Historial de todos los movimientos (entradas/salidas/ajustes).

### Reglas de Negocio

**Precio Sugerido:**
```javascript
precio_sugerido = (costo_unitario + gastos_prorrateados) * (1 + margen_pct/100)
```

**Utilidad Real:**
```javascript
utilidad = (precio_real_vendido - costo_unitario) * cantidad
```

**Stock:**
- **Compra**: `stock_nuevo = stock_anterior + cantidad`
- **Venta**: `stock_nuevo = stock_anterior - cantidad`
- **Ajuste**: Puede ser positivo o negativo

### RLS (Row Level Security)

Las políticas RLS están configuradas para **permitir todo** con `anon` key, manteniendo consistencia con el módulo de créditos.

⚠️ **ADVERTENCIA**: En producción real, esto es inseguro. Ver [Mejoras Futuras](#mejoras-futuras).

---

## 🏗️ Arquitectura

### Separación de Módulos

```
CRÉDITOS (admin.html)          INVENTARIOS (inventarios.html)
├─ SESSION_KEY: inversionesmg_admin_session
│                              ├─ SESSION_KEY: inversionesmg_inventory_session
├─ Tablas: clientes, obligaciones, cuotas, pagos
│                              ├─ Tablas: inv_productos, inv_ventas, etc.
├─ Scripts: admin.js, supabaseClient.js
│                              ├─ Scripts: inventory.js, supabaseInventory.js
└─ CSS: admin-corporate.css    └─ CSS: inventory.css
```

### Aislamiento

✅ **Sesiones separadas**: Usa `localStorage` con keys diferentes  
✅ **Tablas con prefijo**: Todas las tablas de inventarios tienen `inv_`  
✅ **JavaScript modular**: Archivos independientes sin colisiones  
✅ **CSS sin conflictos**: Clases específicas por módulo  

### Flujo de Login con Ruteo

```
Usuario ingresa en admin.html
         │
         ├─ miguelgarcia/miguel2003 → Carga admin.html (créditos)
         │
         └─ inventarios/inv2026 → Redirige a inventarios.html
```

Si el usuario va directo a `inventarios.html`, verifica su sesión. Si no tiene sesión de inventarios, muestra el login.

---

## ⚠️ Limitaciones

### Seguridad

1. **Login hardcodeado**: Credenciales en código fuente
2. **Sin roles reales**: No hay sistema de permisos en BD
3. **RLS abierto**: Cualquiera con `anon` key puede acceder
4. **Sin JWT**: No hay tokens de autenticación reales
5. **Sesión en localStorage**: Puede ser manipulada desde consola

### Funcionalidad

1. **Sin multi-usuario**: No hay registro de quién hace cada acción (solo se registra "inventarios")
2. **Sin sync en tiempo real**: Necesitas recargar para ver cambios de otros usuarios
3. **Sin caché avanzado**: Puede ser lento con muchos productos
4. **Scanner limitado**: Solo funciona en Chrome/Edge
5. **Sin modo offline**: Requiere conexión constante

### UX

1. **Sin notificaciones push**: No hay alertas proactivas de stock bajo
2. **Sin búsqueda avanzada**: Búsqueda simple por texto
3. **Reportes básicos**: Faltan gráficas y análisis avanzados
4. **Sin exportación**: Reportes no se pueden exportar a PDF/CSV aún

---

## 🚀 Mejoras Futuras

### 🔐 Seguridad (ALTA PRIORIDAD)

1. **Migrar a Supabase Auth**
   ```sql
   -- Crear roles en Supabase
   CREATE TYPE user_role AS ENUM ('admin_creditos', 'admin_inventarios', 'vendedor');
   
   -- Tabla de usuarios
   CREATE TABLE usuarios (
     id UUID PRIMARY KEY REFERENCES auth.users(id),
     nombre TEXT,
     role user_role,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- RLS por roles
   CREATE POLICY "Solo admin_inventarios accede a inv_*"
   ON inv_productos
   FOR ALL
   USING (auth.jwt() ->> 'role' = 'admin_inventarios');
   ```

2. **Hashear contraseñas** con bcrypt
3. **JWT tokens** para autenticación
4. **2FA** (autenticación de dos factores)
5. **Expiración de sesión** más agresiva
6. **Rate limiting** en login

### 📊 Funcionalidad

1. **Multi-usuario concurrente** con Supabase Realtime
2. **Exportación de reportes** a CSV, PDF, Excel
3. **Gráficas avanzadas** con Chart.js o similar
4. **Búsqueda avanzada** con filtros combinados
5. **Editor masivo** de productos (importar CSV)
6. **Sistema de categorías** jerárquico
7. **Alertas automáticas** por email/SMS cuando stock bajo
8. **Historial de precios** para análisis de tendencias
9. **Descuentos y promociones** en ventas
10. **Devoluciones y ajustes** de ventas

### 🎨 UX/UI

1. **Notificaciones toast** más avanzadas con cola
2. **Loading skeletons** en todas las vistas
3. **Drag & drop** para reordenar productos
4. **Vista de galería** con imágenes de productos
5. **Modo oscuro** (dark mode)
6. **PWA** (Progressive Web App) con instalación offline
7. **Impresión de tickets** de venta
8. **Códigos QR** para productos sin código de barras

### 📷 Scanner

1. **Soporte para Safari/iOS** con librerías externas (ZXing, QuaggaJS)
2. **Scanner continuo** sin cerrar después de cada código
3. **Zoom digital** mejorado
4. **Historial** de últimos códigos escaneados
5. **Multi-scanner** para escanear múltiples productos a la vez

### 🗄️ Base de Datos

1. **Triggers** para cálculos automáticos
2. **Vistas materializadas** para reportes rápidos
3. **Backup automático** programado
4. **Índices adicionales** para optimización
5. **Stored procedures** para operaciones complejas

### 🔗 Integraciones

1. **WhatsApp Business API** para notificaciones
2. **APIs de proveedores** para actualización automática de precios
3. **Sincronización con contabilidad** (ej: Siigo, Alegra)
4. **Pasarelas de pago** (Mercado Pago, PayU)
5. **Impresoras térmicas** para tickets

---

## 📞 Soporte

Para dudas o problemas:

1. Revisa la consola del navegador (F12) para errores
2. Verifica que el script SQL se ejecutó correctamente
3. Confirma que las credenciales de Supabase son correctas
4. Asegúrate de usar HTTPS para el scanner

---

## 📄 Licencia

Este módulo es parte del sistema **Inversiones MG** y sigue las mismas políticas.

---

## 🎉 Créditos

Desarrollado para **Inversiones MG** - Sistema de Gestión Integral  
Versión: 1.0.0  
Fecha: Febrero 2026

---

## 📝 Notas Finales

Este módulo fue diseñado para **NO romper el sistema existente**. Todas las tablas tienen prefijo `inv_`, las sesiones están separadas, y el código está modularizado.

Si encuentras algún bug o tienes sugerencias, documéntalas para futuras versiones.

**¡Buena suerte con tu gestión de inventarios! 🚀📦**
