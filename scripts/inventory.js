// =====================================================
// INVERSIONES MG - PANEL DE INVENTARIOS
// Lógica principal del módulo de inventarios
// =====================================================

// ========== CONFIGURACIÓN LOCAL ==========
const INVENTORY_CONFIG = {
  SESSION_KEY: "inversionesmg_inventory_session",
  SESSION_DURATION: 8 * 60 * 60 * 1000, // 8 horas
  SCAN_DUPLICATE_TIMEOUT: 2000, // 2 segundos anti-duplicado
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_TIME: 5 * 60 * 1000, // 5 minutos
};

// ========== CONFIGURACIÓN DE SCANNER (DEBUG Y OPTIMIZACIÓN) ==========
// Configuración de debugs - Temporalmente desactivado para producción
const SCANNER_DEBUG = localStorage.getItem('scanner_debug') === 'true' || false;
const SCANNER_NO_DETECT_TIMEOUT = 15000; // 15 segundos sin detectar → mostrar tips (menos intrusivo)

// ========== CONFIGURACIÓN DE VALIDACIÓN DE CÓDIGOS ==========
const CODE_VALIDATION = {
  MIN_LENGTH: 3,                    // Mínimo 3 caracteres
  MAX_LENGTH: 50,                   // Máximo 50 caracteres
  CONSISTENCY_CHECKS: 3,            // Número de lecturas para confirmar
  CONSISTENCY_TIMEOUT: 1500,        // Tiempo limite para validaciones (ms)
  VALIDATION_DELAY: 300,            // Delay entre validaciones (ms)
  ALLOWED_PATTERNS: [
    /^\d+$/,                        // Solo números
    /^[A-Z0-9]+$/i,                // Alfanumérico
    /^[A-Z0-9\-\_\.]+$/i           // Con guiones, guiones bajos y puntos
  ]
};

/**
 * ESTRATEGIA DE DETECCIÓN MULTI-INTENTO (FIX PROBLEMA ROI)
 * ========================================================
 * 
 * PROBLEMA RESUELTO:
 * - El ROI fijo (70%×35%) cortaba códigos grandes, códigos cerca de cámara,
 *   o quiet zones (márgenes blancos), causando fallo de detección.
 * 
 * SOLUCIÓN IMPLEMENTADA:
 * - Estrategia multi-intento: prueba 4 tamaños de ROI por frame:
 *   1. 'full' → Frame completo (con downscale si >1280px)
 *   2. 'centerLarge' → 90% ancho × 60% alto
 *   3. 'centerMedium' → 80% ancho × 45% alto
 *   4. 'centerSmall' → 70% ancho × 35% alto (último recurso)
 * 
 * - Preprocesamiento aplicado a AMBOS motores (nativo y ZXing):
 *   • Escala de grises
 *   • Aumento de contraste (30%)
 *   • Binarización adaptativa optimizada
 *   → CRUCIAL para códigos en pantallas
 * 
 * - UX mejorada:
 *   • Tips automáticos tras 8 segundos sin detectar
 *   • Feedback visual verde al detectar (bordes + esquinas)
 *   • Throttling 8 FPS (balance rendimiento/precisión)
 * 
 * MODO DEBUG:
 * - Activar: localStorage.setItem('scanner_debug', 'true')
 * - Desactivar: localStorage.removeItem('scanner_debug')
 * - Muestra en consola: modo usado, dimensiones, intentos por frame
 * 
 * PRUEBAS REQUERIDAS:
 * ✓ Android Chrome: EAN13 en caja, EAN13 en pantalla
 * ✓ iPhone Safari: EAN13 en caja (usando ZXing fallback)
 * ✓ PC Chrome/Edge: EAN13 impreso, EAN13 en caja
 */

// ========== ESTADO GLOBAL ==========
let currentUser = null;
let currentView = "dashboard";
let productosData = [];
let proveedoresData = [];
let ventasData = [];
let scannerActive = false;
let scannerStream = null;
let lastScannedCode = null;
let lastScanTime = 0;
let barcodeDetector = null;
let scannerMode = "registro"; // 'venta', 'registro', 'asociar' - Por defecto registro para inventarios
let currentProductoForAssociation = null;

// ========== VARIABLES PARA VALIDACIÓN DE CÓDIGOS ==========
let codeValidationBuffer = [];        // Buffer de lecturas para validación
let validationInProgress = false;     // Si está validando un código
let lastValidatedCode = null;         // Último código validado exitosamente
let validationStartTime = 0;          // Timestamp de inicio de validación

let carritoVenta = []; // Carrito de ventas
let loginAttempts = 0;
let loginLockoutUntil = null;

// ========== VARIABLES DEL MOTOR DE ESCANEO ==========
let scannerEngine = null; // 'native' o 'zxing'
let zxingCodeReader = null;
let zxingAnimationFrame = null;
let nativeAnimationFrame = null;
let availableCameras = [];
let selectedCameraId = null;
let scannerStartTime = 0; // Timestamp cuando inició el scanner
let scannerTipsShown = false; // Si ya se mostraron tips
let scannerAttemptCount = 0; // Contador de intentos de detección

// ========== ELEMENTOS DEL DOM ==========
const loginScreen = document.getElementById("loginScreen");
const inventoryPanel = document.getElementById("inventoryPanel");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnMenu = document.getElementById("btnMenu");
const inventorySidebar = document.getElementById("inventorySidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const topbarTitle = document.getElementById("topbarTitle");
const inventoryUserName = document.getElementById("inventoryUserName");
const currentDate = document.getElementById("currentDate");
const modalOverlay = document.getElementById("modalOverlay");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
const modalClose = document.getElementById("modalClose");

// Scanner elements
const scannerOverlay = document.getElementById("scannerOverlay");
const scannerVideo = document.getElementById("scannerVideo");
const scannerCanvas = document.getElementById("scannerCanvas");
const scannerClose = document.getElementById("scannerClose");
const scannerInfo = document.getElementById("scannerInfo");
const scannerToggleFlash = document.getElementById("scannerToggleFlash");
const scannerManualInput = document.getElementById("scannerManualInput");
const scannerFallback = document.getElementById("scannerFallback");
const manualBarcodeInput = document.getElementById("manualBarcodeInput");
const btnManualBarcodeSubmit = document.getElementById("btnManualBarcodeSubmit");
const cameraSelect = document.getElementById("cameraSelect");
const btnQuickScan = document.getElementById("btnQuickScan");

// ========== PASSWORD TOGGLE ==========
const togglePassword = document.getElementById("togglePassword");
if (togglePassword) {
  togglePassword.addEventListener("click", () => {
    const type = loginPassword.type === "password" ? "text" : "password";
    loginPassword.type = type;
    togglePassword.textContent = type === "password" ? "👁️" : "🙈";
    togglePassword.setAttribute("aria-label", type === "password" ? "Mostrar contraseña" : "Ocultar contraseña");
  });
}

// ========== UTILIDADES ==========
function showToast(message, type = "info") {
  const toast = document.getElementById("toastInventory");
  if (!toast) {
    console.warn("Toast element not found, showing alert instead:", message);
    alert(message);
    return;
  }
  toast.className = "toast";
  toast.classList.add(type);
  toast.classList.add("active");
  toast.textContent = message;
  
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
}

function showModal(title, content, footer = "") {
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalFooter = document.getElementById("modalFooter");
  const modalOverlay = document.getElementById("modalOverlay");
  
  if (!modalTitle || !modalBody || !modalFooter || !modalOverlay) {
    console.error("Modal elements not found in DOM");
    alert(`${title}\n\n${content.replace(/<[^>]*>/g, '')}`);
    return;
  }
  
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modalFooter.innerHTML = footer;
  modalOverlay.classList.add("active");
}

function hideModal() {
  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) {
    modalOverlay.classList.remove("active");
  }
}

function showLoading(container, message = "Cargando...") {
  container.innerHTML = `
    <div style="text-align: center; padding: 3rem;">
      <div class="skeleton skeleton-card" style="margin: 0 auto; max-width: 400px;"></div>
      <p style="margin-top: 1rem; color: var(--gray-600);">${message}</p>
    </div>
  `;
}

// ========== SESIÓN ==========
function checkSession() {
  // Verificar si hay sesión de inventario
  const session = localStorage.getItem(INVENTORY_CONFIG.SESSION_KEY);
  if (session) {
    try {
      const sessionData = JSON.parse(session);
      const now = Date.now();
      
      if (now < sessionData.expiry) {
        currentUser = sessionData.user;
        Logger.success(`Sesión activa: ${sessionData.user.nombre}`);
        showInventoryPanel();
        return true;
      } else {
        Logger.info("Sesión expirada, redirigiendo al login");
        localStorage.removeItem(INVENTORY_CONFIG.SESSION_KEY);
      }
    } catch (error) {
      Logger.error("Error al verificar sesión:", error);
      localStorage.removeItem(INVENTORY_CONFIG.SESSION_KEY);
    }
  }
  return false;
}

function saveSession(user) {
  const sessionData = {
    user,
    expiry: Date.now() + INVENTORY_CONFIG.SESSION_DURATION,
  };
  localStorage.setItem(INVENTORY_CONFIG.SESSION_KEY, JSON.stringify(sessionData));
}

function clearSession() {
  localStorage.removeItem(INVENTORY_CONFIG.SESSION_KEY);
  currentUser = null;
}

// ========== LOGIN ==========
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Verificar lockout
  if (loginLockoutUntil && Date.now() < loginLockoutUntil) {
    const remainingTime = Math.ceil((loginLockoutUntil - Date.now()) / 1000);
    loginError.textContent = `Demasiados intentos. Espera ${remainingTime} segundos.`;
    loginError.classList.add("active");
    return;
  }
  
  const user = loginUser.value.trim();
  const password = loginPassword.value;
  
  loginError.classList.remove("active");
  btnLogin.disabled = true;
  btnLogin.textContent = "Verificando...";
  
  // Autenticación - Credenciales de inventarios
  // Usuario: inventarios / Contraseña: inv2026
  setTimeout(() => {
    if (user === "inventarios" && password === "inv2026") {
      currentUser = { 
        username: user, 
        nombre: "Administrador Inventarios",
        role: "inventarios" 
      };
      saveSession(currentUser);
      loginAttempts = 0;
      loginLockoutUntil = null;
      showInventoryPanel();
    } else {
      loginAttempts++;
      
      if (loginAttempts >= INVENTORY_CONFIG.MAX_LOGIN_ATTEMPTS) {
        loginLockoutUntil = Date.now() + INVENTORY_CONFIG.LOGIN_LOCKOUT_TIME;
        loginError.textContent = `Demasiados intentos. Espera 5 minutos.`;
      } else {
        loginError.textContent = `Usuario o contraseña incorrectos (${loginAttempts}/${INVENTORY_CONFIG.MAX_LOGIN_ATTEMPTS})`;
      }
      
      loginError.classList.add("active");
      btnLogin.disabled = false;
      btnLogin.textContent = "Iniciar sesión";
    }
  }, 800);
});

function showInventoryPanel() {
  loginScreen.style.display = "none";
  inventoryPanel.style.display = "flex";
  inventoryUserName.textContent = currentUser.nombre;
  
  // Fecha actual
  currentDate.textContent = formatDate(new Date());
  
  // Configurar navegación
  setupNavigation();
  
  // Cargar vista inicial
  navigateToView("dashboard");
  Logger.info("Dashboard de inventarios cargado");
}

// ========== LOGOUT ==========
btnLogout.addEventListener("click", () => {
  if (confirm("¿Seguro que deseas cerrar sesión?")) {
    clearSession();
    location.reload();
  }
});

// ========== NAVEGACIÓN ==========
function setupNavigation() {
  const sidebarNavItems = document.querySelectorAll(".admin-sidebar .nav-item");
  const mobileNavItems = document.querySelectorAll(".mobile-nav .mobile-nav-item");
  
  // Navegación del sidebar
  sidebarNavItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) {
        navigateToView(view);
        // Cerrar sidebar en móvil
        if (window.innerWidth < 1024) {
          inventorySidebar.classList.remove("active");
          sidebarOverlay.classList.remove("active");
        }
      }
    });
  });
  
  // Navegación móvil
  mobileNavItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) {
        navigateToView(view);
      }
    });
  });
  
  // Botón de menú móvil (header)
  btnMenu.addEventListener("click", () => {
    inventorySidebar.classList.toggle("active");
    sidebarOverlay.classList.toggle("active");
  });
  
  // Overlay para cerrar sidebar
  sidebarOverlay.addEventListener("click", () => {
    inventorySidebar.classList.remove("active");
    sidebarOverlay.classList.remove("active");
  });
  
  // Botón de scan rápido
  if (btnQuickScan) {
    btnQuickScan.addEventListener("click", () => {
      scannerMode = "venta";
      openScanner();
    });
  }
  
  // Modal close
  modalClose.addEventListener("click", hideModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      hideModal();
    }
  });
}

function navigateToView(viewName) {
  currentView = viewName;
  
  // Actualizar navegación activa
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(item => {
    item.classList.remove("active");
    if (item.dataset.view === viewName) {
      item.classList.add("active");
    }
  });
  
  // Ocultar todas las vistas
  document.querySelectorAll(".view-content").forEach(view => {
    view.style.display = "none";
  });
  
  // Mostrar vista seleccionada
  const viewElement = document.getElementById(`view${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
  if (viewElement) {
    viewElement.style.display = "block";
  }
  
  // Actualizar título
  const titles = {
    dashboard: "Dashboard",
    productos: "Productos",
    ventas: "Ventas",
    compras: "Compras",
    proveedores: "Proveedores",
    reportes: "Reportes",
    auditoria: "Auditoría",
  };
  topbarTitle.textContent = titles[viewName] || viewName;
  
  // Cargar contenido de la vista
  loadView(viewName);
}

// ========== CARGA DE VISTAS ==========
async function loadView(viewName) {
  const viewElement = document.getElementById(`view${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
  
  switch (viewName) {
    case "dashboard":
      await loadDashboard(viewElement);
      break;
    case "productos":
      await loadProductos(viewElement);
      break;
    case "ventas":
      await loadVentas(viewElement);
      break;
    case "compras":
      await loadCompras(viewElement);
      break;
    case "proveedores":
      await loadProveedores(viewElement);
      break;
    case "reportes":
      await loadReportes(viewElement);
      break;
    case "auditoria":
      await loadAuditoria(viewElement);
      break;
  }
}

// ========== VISTA: DASHBOARD ==========
async function loadDashboard(container) {
  showLoading(container, "Cargando dashboard...");
  
  try {
    const kpis = await InventoryDB.obtenerKPIsDashboard();
    const productosMasVendidos = await InventoryDB.obtenerProductosMasVendidos(5);
    const productos = await InventoryDB.obtenerTodosProductos({ activo: true });
    const ventas = await InventoryDB.obtenerTodasVentas();
    const isMobile = window.innerWidth <= 768;
    
    // Calcular métricas adicionales
    const productosStockBajo = productos.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo));
    const productosStockCero = productos.filter(p => parseFloat(p.stock_actual) === 0);
    
    // Ventas de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ventasHoy = ventas.filter(v => {
      const fechaVenta = new Date(v.fecha);
      return fechaVenta >= hoy;
    });
    const ventasHoyTotal = ventasHoy.reduce((sum, v) => sum + parseFloat(v.precio_venta || 0), 0);
    
    // Fecha actual
    const fechaActual = new Date().toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (isMobile) {
      // ========== VISTA MÓVIL ==========
      container.innerHTML = `
        <div class="inv-dash-mobile">
          <!-- Header con bienvenida -->
          <div class="inv-dash-header-mobile">
            <div class="inv-dash-welcome-mobile">
              <h1 class="inv-dash-title-mobile">👋 ¡Hola!</h1>
              <p class="inv-dash-subtitle-mobile">${fechaActual}</p>
            </div>
            <button class="inv-dash-notif-btn" onclick="showToast('Sin notificaciones nuevas', 'info')">
              🔔
              ${(productosStockBajo.length + productosStockCero.length) > 0 ? `<span class="inv-notif-badge">${productosStockBajo.length + productosStockCero.length}</span>` : ''}
            </button>
          </div>
          
          <!-- Resumen del día -->
          <div class="inv-dash-summary-mobile">
            <div class="inv-dash-summary-card primary">
              <div class="inv-dash-summary-icon">💰</div>
              <div class="inv-dash-summary-content">
                <span class="inv-dash-summary-label">Ventas de Hoy</span>
                <span class="inv-dash-summary-value">${formatCurrency(ventasHoyTotal)}</span>
                <span class="inv-dash-summary-meta">${ventasHoy.length} transacciones</span>
              </div>
            </div>
          </div>
          
          <!-- KPIs Grid móvil -->
          <div class="inv-dash-kpis-mobile">
            <h2 class="inv-dash-section-title">📊 Métricas Clave</h2>
            <div class="inv-dash-kpis-grid-mobile">
              <div class="inv-dash-kpi-compact" onclick="loadView('productos')">
                <div class="inv-dash-kpi-compact-header">
                  <span class="inv-dash-kpi-compact-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">📦</span>
                  <span class="inv-dash-kpi-compact-trend success">Activo</span>
                </div>
                <div class="inv-dash-kpi-compact-value">${kpis.totalProductos}</div>
                <div class="inv-dash-kpi-compact-label">Total Productos</div>
              </div>
              
              <div class="inv-dash-kpi-compact" onclick="generarReporteStockBajo()">
                <div class="inv-dash-kpi-compact-header">
                  <span class="inv-dash-kpi-compact-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">⚠️</span>
                  <span class="inv-dash-kpi-compact-trend ${kpis.productosBajoStock > 0 ? 'warning' : 'success'}">${kpis.productosBajoStock > 0 ? 'Alerta' : 'OK'}</span>
                </div>
                <div class="inv-dash-kpi-compact-value">${kpis.productosBajoStock}</div>
                <div class="inv-dash-kpi-compact-label">Stock Bajo</div>
              </div>
              
              <div class="inv-dash-kpi-compact">
                <div class="inv-dash-kpi-compact-header">
                  <span class="inv-dash-kpi-compact-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">💵</span>
                  <span class="inv-dash-kpi-compact-trend success">↑ ${kpis.ventasMesTotal > 0 ? Math.round((kpis.utilidadMesTotal / kpis.ventasMesTotal) * 100) : 0}%</span>
                </div>
                <div class="inv-dash-kpi-compact-value">${formatCurrency(kpis.utilidadMesTotal)}</div>
                <div class="inv-dash-kpi-compact-label">Utilidad Mes</div>
              </div>
              
              <div class="inv-dash-kpi-compact" onclick="loadView('ventas')">
                <div class="inv-dash-kpi-compact-header">
                  <span class="inv-dash-kpi-compact-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">📈</span>
                  <span class="inv-dash-kpi-compact-trend info">${kpis.cantidadVentasMes} ventas</span>
                </div>
                <div class="inv-dash-kpi-compact-value">${formatCurrency(kpis.ventasMesTotal)}</div>
                <div class="inv-dash-kpi-compact-label">Ventas Mes</div>
              </div>
            </div>
          </div>
          
          <!-- Acciones rápidas móvil -->
          <div class="inv-dash-actions-mobile">
            <h2 class="inv-dash-section-title">⚡ Acciones Rápidas</h2>
            <div class="inv-dash-actions-grid-mobile">
              <button class="inv-dash-action-btn primary" onclick="openQuickSale()">
                <span class="inv-dash-action-icon">💳</span>
                <span class="inv-dash-action-text">Nueva Venta</span>
              </button>
              <button class="inv-dash-action-btn secondary" onclick="openNewProduct()">
                <span class="inv-dash-action-icon">➕</span>
                <span class="inv-dash-action-text">Agregar Producto</span>
              </button>
              <button class="inv-dash-action-btn tertiary" onclick="openScanner()">
                <span class="inv-dash-action-icon">📷</span>
                <span class="inv-dash-action-text">Escanear</span>
              </button>
              <button class="inv-dash-action-btn quaternary" onclick="loadView('reportes')">
                <span class="inv-dash-action-icon">📊</span>
                <span class="inv-dash-action-text">Ver Reportes</span>
              </button>
            </div>
          </div>
          
          <!-- Top productos móvil -->
          ${productosMasVendidos.length > 0 ? `
            <div class="inv-dash-top-mobile">
              <div class="inv-dash-top-header">
                <h2 class="inv-dash-section-title">🏆 Más Vendidos</h2>
                <button class="inv-dash-view-all" onclick="loadView('reportes')">Ver todos →</button>
              </div>
              <div class="inv-dash-top-list">
                ${productosMasVendidos.map((p, i) => `
                  <div class="inv-dash-top-item">
                    <div class="inv-dash-top-rank">${i + 1}</div>
                    <div class="inv-dash-top-info">
                      <div class="inv-dash-top-name">${p.nombre || 'Sin nombre'}</div>
                      <div class="inv-dash-top-meta">SKU: ${p.sku}</div>
                    </div>
                    <div class="inv-dash-top-sales">
                      <div class="inv-dash-top-number">${p.cantidad_total}</div>
                      <div class="inv-dash-top-label">unidades</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <!-- Alertas móvil -->
          ${(productosStockBajo.length > 0 || productosStockCero.length > 0) ? `
            <div class="inv-dash-alerts-mobile">
              <h2 class="inv-dash-section-title">⚠️ Alertas de Inventario</h2>
              ${productosStockCero.length > 0 ? `
                <div class="inv-dash-alert danger" onclick="generarReporteStockBajo()">
                  <span class="inv-dash-alert-icon">❌</span>
                  <div class="inv-dash-alert-content">
                    <div class="inv-dash-alert-title">${productosStockCero.length} producto${productosStockCero.length > 1 ? 's' : ''} sin stock</div>
                    <div class="inv-dash-alert-description">Requiere reposición urgente</div>
                  </div>
                  <span class="inv-dash-alert-arrow">→</span>
                </div>
              ` : ''}
              ${productosStockBajo.length > 0 ? `
                <div class="inv-dash-alert warning" onclick="generarReporteStockBajo()">
                  <span class="inv-dash-alert-icon">⚠️</span>
                  <div class="inv-dash-alert-content">
                    <div class="inv-dash-alert-title">${productosStockBajo.length} producto${productosStockBajo.length > 1 ? 's' : ''} con stock bajo</div>
                    <div class="inv-dash-alert-description">Planificar próxima compra</div>
                  </div>
                  <span class="inv-dash-alert-arrow">→</span>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    } else {
      // ========== VISTA DESKTOP ==========
      container.innerHTML = `
        <div class="inv-dash-desktop">
          <!-- Header -->
          <div class="inv-dash-header-desktop">
            <div class="inv-dash-welcome-desktop">
              <h1 class="inv-dash-title-desktop">📊 Dashboard de Inventarios</h1>
              <p class="inv-dash-subtitle-desktop">${fechaActual} • Visión completa de tu negocio</p>
            </div>
            <div class="inv-dash-header-actions">
              <button class="inv-btn inv-btn-secondary" onclick="location.reload()">
                🔄 Actualizar
              </button>
              <button class="inv-btn inv-btn-primary" onclick="loadView('reportes')">
                📊 Ver Reportes
              </button>
            </div>
          </div>
          
          <!-- KPIs Grid Desktop -->
          <div class="inv-dash-kpis-desktop">
            <div class="inv-dash-kpi-card-desktop" style="--kpi-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);" onclick="loadView('productos')">
              <div class="inv-dash-kpi-header-desktop">
                <span class="inv-dash-kpi-icon-desktop">📦</span>
                <span class="inv-dash-kpi-badge-desktop success">Activo</span>
              </div>
              <div class="inv-dash-kpi-content-desktop">
                <div class="inv-dash-kpi-value-desktop">${kpis.totalProductos}</div>
                <div class="inv-dash-kpi-label-desktop">Total Productos</div>
                <div class="inv-dash-kpi-meta-desktop">
                  <span>En catálogo</span>
                  <span class="inv-dash-kpi-arrow">→</span>
                </div>
              </div>
            </div>
            
            <div class="inv-dash-kpi-card-desktop" style="--kpi-gradient: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <div class="inv-dash-kpi-header-desktop">
                <span class="inv-dash-kpi-icon-desktop">💰</span>
                <span class="inv-dash-kpi-badge-desktop success">Hoy</span>
              </div>
              <div class="inv-dash-kpi-content-desktop">
                <div class="inv-dash-kpi-value-desktop">${formatCurrency(ventasHoyTotal)}</div>
                <div class="inv-dash-kpi-label-desktop">Ventas de Hoy</div>
                <div class="inv-dash-kpi-meta-desktop">
                  <span>${ventasHoy.length} transacciones</span>
                </div>
              </div>
            </div>
            
            <div class="inv-dash-kpi-card-desktop" style="--kpi-gradient: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);" onclick="loadView('ventas')">
              <div class="inv-dash-kpi-header-desktop">
                <span class="inv-dash-kpi-icon-desktop">📈</span>
                <span class="inv-dash-kpi-badge-desktop info">Mes Actual</span>
              </div>
              <div class="inv-dash-kpi-content-desktop">
                <div class="inv-dash-kpi-value-desktop">${formatCurrency(kpis.ventasMesTotal)}</div>
                <div class="inv-dash-kpi-label-desktop">Ventas del Mes</div>
                <div class="inv-dash-kpi-meta-desktop">
                  <span>${kpis.cantidadVentasMes} ventas registradas</span>
                  <span class="inv-dash-kpi-arrow">→</span>
                </div>
              </div>
            </div>
            
            <div class="inv-dash-kpi-card-desktop" style="--kpi-gradient: linear-gradient(135deg, ${kpis.productosBajoStock > 0 ? '#f59e0b 0%, #d97706 100%' : '#10b981 0%, #059669 100%'});" onclick="generarReporteStockBajo()">
              <div class="inv-dash-kpi-header-desktop">
                <span class="inv-dash-kpi-icon-desktop">${kpis.productosBajoStock > 0 ? '⚠️' : '✅'}</span>
                <span class="inv-dash-kpi-badge-desktop ${kpis.productosBajoStock > 0 ? 'warning' : 'success'}">${kpis.productosBajoStock > 0 ? 'Alerta' : 'Normal'}</span>
              </div>
              <div class="inv-dash-kpi-content-desktop">
                <div class="inv-dash-kpi-value-desktop">${kpis.productosBajoStock}</div>
                <div class="inv-dash-kpi-label-desktop">Stock Bajo</div>
                <div class="inv-dash-kpi-meta-desktop">
                  <span>${kpis.productosBajoStock > 0 ? 'Requiere atención' : 'Todo en orden'}</span>
                  <span class="inv-dash-kpi-arrow">→</span>
                </div>
              </div>
            </div>
            
            <div class="inv-dash-kpi-card-desktop" style="--kpi-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
              <div class="inv-dash-kpi-header-desktop">
                <span class="inv-dash-kpi-icon-desktop">💵</span>
                <span class="inv-dash-kpi-badge-desktop success">↑ ${kpis.ventasMesTotal > 0 ? Math.round((kpis.utilidadMesTotal / kpis.ventasMesTotal) * 100) : 0}%</span>
              </div>
              <div class="inv-dash-kpi-content-desktop">
                <div class="inv-dash-kpi-value-desktop">${formatCurrency(kpis.utilidadMesTotal)}</div>
                <div class="inv-dash-kpi-label-desktop">Utilidad del Mes</div>
                <div class="inv-dash-kpi-meta-desktop">
                  <span>Margen de ganancia</span>
                </div>
              </div>
            </div>
            
            <div class="inv-dash-kpi-card-desktop" style="--kpi-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
              <div class="inv-dash-kpi-header-desktop">
                <span class="inv-dash-kpi-icon-desktop">💎</span>
                <span class="inv-dash-kpi-badge-desktop info">Valoración</span>
              </div>
              <div class="inv-dash-kpi-content-desktop">
                <div class="inv-dash-kpi-value-desktop">${formatCurrency(kpis.valorInventarioSugerido)}</div>
                <div class="inv-dash-kpi-label-desktop">Valor Inventario</div>
                <div class="inv-dash-kpi-meta-desktop">
                  <span>A precio sugerido</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Contenido principal -->
          <div class="inv-dash-main-desktop">
            <!-- Columna izquierda -->
            <div class="inv-dash-column-left">
              <!-- Acciones rápidas -->
              <div class="inv-dash-section-desktop">
                <h2 class="inv-dash-section-title-desktop">⚡ Acciones Rápidas</h2>
                <div class="inv-dash-actions-desktop">
                  <button class="inv-dash-action-card-desktop primary" onclick="openQuickSale()">
                    <span class="inv-dash-action-icon-desktop">💳</span>
                    <div class="inv-dash-action-info">
                      <span class="inv-dash-action-title-desktop">Nueva Venta</span>
                      <span class="inv-dash-action-desc-desktop">Registrar venta rápida</span>
                    </div>
                  </button>
                  
                  <button class="inv-dash-action-card-desktop secondary" onclick="openNewProduct()">
                    <span class="inv-dash-action-icon-desktop">➕</span>
                    <div class="inv-dash-action-info">
                      <span class="inv-dash-action-title-desktop">Nuevo Producto</span>
                      <span class="inv-dash-action-desc-desktop">Agregar al inventario</span>
                    </div>
                  </button>
                  
                  <button class="inv-dash-action-card-desktop tertiary" onclick="openScanner()">
                    <span class="inv-dash-action-icon-desktop">📷</span>
                    <div class="inv-dash-action-info">
                      <span class="inv-dash-action-title-desktop">Escanear Código</span>
                      <span class="inv-dash-action-desc-desktop">Buscar por código de barras</span>
                    </div>
                  </button>
                  
                  <button class="inv-dash-action-card-desktop quaternary" onclick="openNewCompra()">
                    <span class="inv-dash-action-icon-desktop">🛒</span>
                    <div class="inv-dash-action-info">
                      <span class="inv-dash-action-title-desktop">Nueva Compra</span>
                      <span class="inv-dash-action-desc-desktop">Registrar entrada</span>
                    </div>
                  </button>
                </div>
              </div>
              
              <!-- Top vendidos -->
              ${productosMasVendidos.length > 0 ? `
                <div class="inv-dash-section-desktop">
                  <div class="inv-dash-section-header-desktop">
                    <h2 class="inv-dash-section-title-desktop">🏆 Productos Más Vendidos</h2>
                    <button class="inv-dash-view-all-desktop" onclick="generarReporteRotacion()">Ver todos →</button>
                  </div>
                  <div class="inv-dash-top-list-desktop">
                    ${productosMasVendidos.map((p, i) => `
                      <div class="inv-dash-top-item-desktop">
                        <div class="inv-dash-top-rank-desktop" style="background: ${i === 0 ? 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)' : i === 1 ? 'linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%)' : i === 2 ? 'linear-gradient(135deg, #cd7f32 0%, #d4a574 100%)' : 'var(--inv-bg-secondary)'};">
                          ${i + 1}
                        </div>
                        <div class="inv-dash-top-info-desktop">
                          <div class="inv-dash-top-name-desktop">${p.nombre || 'Sin nombre'}</div>
                          <div class="inv-dash-top-meta-desktop">SKU: ${p.sku}</div>
                        </div>
                        <div class="inv-dash-top-sales-desktop">
                          <div class="inv-dash-top-number-desktop">${p.cantidad_total}</div>
                          <div class="inv-dash-top-label-desktop">unidades</div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            
            <!-- Columna derecha -->
            <div class="inv-dash-column-right">
              <!-- Resumen financiero -->
              <div class="inv-dash-section-desktop inv-dash-financial">
                <h2 class="inv-dash-section-title-desktop">💰 Resumen Financiero</h2>
                <div class="inv-dash-financial-items">
                  <div class="inv-dash-financial-item">
                    <span class="inv-dash-financial-label">Inversión Total</span>
                    <span class="inv-dash-financial-value">${formatCurrency(kpis.valorInventarioCosto)}</span>
                  </div>
                  <div class="inv-dash-financial-divider"></div>
                  <div class="inv-dash-financial-item">
                    <span class="inv-dash-financial-label">Valor Sugerido</span>
                    <span class="inv-dash-financial-value success">${formatCurrency(kpis.valorInventarioSugerido)}</span>
                  </div>
                  <div class="inv-dash-financial-divider"></div>
                  <div class="inv-dash-financial-item">
                    <span class="inv-dash-financial-label">Margen Potencial</span>
                    <span class="inv-dash-financial-value primary">${kpis.valorInventarioCosto > 0 ? Math.round(((kpis.valorInventarioSugerido - kpis.valorInventarioCosto) / kpis.valorInventarioCosto) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
              
              <!-- Alertas -->
              ${(productosStockBajo.length > 0 || productosStockCero.length > 0) ? `
                <div class="inv-dash-section-desktop">
                  <h2 class="inv-dash-section-title-desktop">⚠️ Alertas de Inventario</h2>
                  <div class="inv-dash-alerts-desktop">
                    ${productosStockCero.length > 0 ? `
                      <div class="inv-dash-alert-desktop danger" onclick="generarReporteStockBajo()">
                        <span class="inv-dash-alert-icon-desktop">❌</span>
                        <div class="inv-dash-alert-content-desktop">
                          <div class="inv-dash-alert-title-desktop">${productosStockCero.length} producto${productosStockCero.length > 1 ? 's' : ''} sin stock</div>
                          <div class="inv-dash-alert-description-desktop">Requiere reposición urgente</div>
                        </div>
                        <span class="inv-dash-alert-arrow-desktop">→</span>
                      </div>
                    ` : ''}
                    ${productosStockBajo.length > 0 ? `
                      <div class="inv-dash-alert-desktop warning" onclick="generarReporteStockBajo()">
                        <span class="inv-dash-alert-icon-desktop">⚠️</span>
                        <div class="inv-dash-alert-content-desktop">
                          <div class="inv-dash-alert-title-desktop">${productosStockBajo.length} producto${productosStockBajo.length > 1 ? 's' : ''} con stock bajo</div>
                          <div class="inv-dash-alert-description-desktop">Planificar próxima compra</div>
                        </div>
                        <span class="inv-dash-alert-arrow-desktop">→</span>
                      </div>
                    ` : ''}
                  </div>
                </div>
              ` : `
                <div class="inv-dash-section-desktop inv-dash-success-state">
                  <div class="inv-dash-success-icon">✅</div>
                  <h3 class="inv-dash-success-title">¡Todo en orden!</h3>
                  <p class="inv-dash-success-text">No hay alertas críticas en el inventario</p>
                </div>
              `}
              
              <!-- Enlaces rápidos -->
              <div class="inv-dash-section-desktop">
                <h2 class="inv-dash-section-title-desktop">🔗 Enlaces Rápidos</h2>
                <div class="inv-dash-quick-links">
                  <button class="inv-dash-quick-link" onclick="loadView('proveedores')">
                    <span>🏭</span>
                    <span>Proveedores</span>
                  </button>
                  <button class="inv-dash-quick-link" onclick="loadView('reportes')">
                    <span>📊</span>
                    <span>Reportes</span>
                  </button>
                  <button class="inv-dash-quick-link" onclick="loadView('auditoria')">
                    <span>📋</span>
                    <span>Auditoría</span>
                  </button>
                  <button class="inv-dash-quick-link" onclick="loadView('descuentos')">
                    <span>🎯</span>
                    <span>Descuentos</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    Logger.error("Error al cargar dashboard:", error);
    container.innerHTML = `
      <div class="error-state">
        <p>❌ Error al cargar el dashboard</p>
        <button onclick="loadView('dashboard')" class="inv-btn inv-btn-primary">Reintentar</button>
      </div>
    `;
  }
}

// ========== VISTA: PRODUCTOS ==========
async function loadProductos(container) {
  showLoading(container, "Cargando productos...");
  
  try {
    productosData = await InventoryDB.obtenerTodosProductos({ activo: true });
    
    // Calcular estadísticas
    const totalProductos = productosData.length;
    const productosStockBajo = productosData.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo)).length;
    const productosSinStock = productosData.filter(p => parseFloat(p.stock_actual) === 0).length;
    const valorInventario = productosData.reduce((sum, p) => sum + (parseFloat(p.stock_actual) * parseFloat(p.costo_unitario_base)), 0);
    const categorias = [...new Set(productosData.map(p => p.categoria).filter(Boolean))];
    
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // Vista Mobile Mejorada con Estadísticas
      container.innerHTML = `
        <div class="inv-mobile-page inv-productos-mobile">
          <!-- Header con Estadísticas -->
          <div class="inv-productos-mobile-header">
            <div class="inv-productos-welcome">
              <h2>📦 Inventario</h2>
              <p>${totalProductos} ${totalProductos === 1 ? 'producto registrado' : 'productos registrados'}</p>
            </div>
            
            <!-- Mini Stats -->
            <div class="inv-productos-stats-mini">
              <div class="inv-stat-mini ${productosStockBajo > 0 ? 'inv-stat-mini-warning' : ''}">
                <span class="inv-stat-mini-icon">⚠️</span>
                <div class="inv-stat-mini-content">
                  <div class="inv-stat-mini-value">${productosStockBajo}</div>
                  <div class="inv-stat-mini-label">Stock Bajo</div>
                </div>
              </div>
              
              <div class="inv-stat-mini ${productosSinStock > 0 ? 'inv-stat-mini-danger' : ''}">
                <span class="inv-stat-mini-icon">📭</span>
                <div class="inv-stat-mini-content">
                  <div class="inv-stat-mini-value">${productosSinStock}</div>
                  <div class ="inv-stat-mini-label">Sin Stock</div>
                </div>
              </div>
              
              <div class="inv-stat-mini">
                <span class="inv-stat-mini-icon">💰</span>
                <div class="inv-stat-mini-content">
                  <div class="inv-stat-mini-value">${formatCurrency(valorInventario)}</div>
                  <div class="inv-stat-mini-label">Valor Total</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Header Sticky con Búsqueda -->
          <div class="inv-sticky-search">
            <div class="inv-search-box-enhanced">
              <span class="inv-search-icon">🔍</span>
              <input type="search" id="searchProductosMobile" placeholder="Buscar productos..." class="inv-search-input">
              <button class="inv-search-clear" onclick="clearProductoSearch()" style="display: none;">✕</button>
            </div>
          </div>
          
          <!-- Filtros Modernos -->
          <div class="inv-filter-chips-modern">
            <div class="inv-filter-chip-modern active" data-filter="all" onclick="filterProductosByType('all', this)">
              <span class="inv-filter-chip-icon">📦</span>
              <span>Todos</span>
              <span class="inv-filter-chip-count">${totalProductos}</span>
            </div>
            <div class="inv-filter-chip-modern" data-filter="low-stock" onclick="filterProductosByType('low-stock', this)">
              <span class="inv-filter-chip-icon">⚠️</span>
              <span>Stock Bajo</span>
              ${productosStockBajo > 0 ? `<span class="inv-filter-chip-count inv-alert-badge">${productosStockBajo}</span>` : ''}
            </div>
            <div class="inv-filter-chip-modern" data-filter="sin-stock" onclick="filterProductosByType('sin-stock', this)">
              <span class="inv-filter-chip-icon">📭</span>
              <span>Sin Stock</span>
              ${productosSinStock > 0 ? `<span class="inv-filter-chip-count inv-alert-badge">${productosSinStock}</span>` : ''}
            </div>
            <div class="inv-filter-chip-modern" data-filter="categoria" onclick="showCategoriaFilter()">
              <span class="inv-filter-chip-icon">🏷️</span>
              <span>Categorías</span>
            </div>
          </div>
          
          <!-- Lista de Productos -->
          <div class="inv-productos-card-list" id="productosListMobile">
            ${renderProductosCards(productosData)}
          </div>
          
          <!-- FAB Mejorado -->
          <button class="inv-fab-enhanced" onclick="openNewProduct()" title="Agregar Producto">
            <span class="inv-fab-icon">➕</span>
          </button>
        </div>
      `;
      
      // Search functionality
      const searchInput = document.getElementById("searchProductosMobile");
      const clearButton = container.querySelector(".inv-search-clear");
      
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        clearButton.style.display = query ? 'flex' : 'none';
        
        const filtered = productosData.filter(p => 
          p.nombre?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query) ||
          p.categoria?.toLowerCase().includes(query) ||
          p.marca?.toLowerCase().includes(query)
        );
        document.getElementById("productosListMobile").innerHTML = renderProductosCards(filtered);
      });
      
    } else {
      // Vista Desktop Mejorada con KPIs
      container.innerHTML = `
        <div class="inv-desktop-page inv-productos-desktop">
          <!-- Header con Estadísticas -->
          <div class="inv-productos-desktop-header">
            <div class="inv-productos-header-top">
              <div>
                <h1 class="inv-page-title">📦 Gestión de Productos</h1>
                <p class="inv-page-subtitle">${totalProductos} ${totalProductos === 1 ? 'producto' : 'productos'} • ${categorias.length} ${categorias.length === 1 ? 'categoría' : 'categorías'}</p>
              </div>
              
              <div class="inv-productos-header-actions">
                <button class="inv-btn inv-btn-secondary" onclick="exportProductos()" title="Exportar a Excel">
                  📤 Exportar
                </button>
                <button class="inv-btn inv-btn-secondary" onclick="importProductos()" title="Importar desde Excel">
                  📥 Importar
                </button>
                <button class="inv-btn inv-btn-primary" onclick="openNewProduct()">
                  ➕ Nuevo Producto
                </button>
              </div>
            </div>
            
            <!-- KPI Cards -->
            <div class="inv-productos-kpi-row">
              <div class="inv-productos-kpi-card">
                <div class="inv-productos-kpi-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                  📦
                </div>
                <div class="inv-productos-kpi-content">
                  <div class="inv-productos-kpi-label">Total Productos</div>
                  <div class="inv-productos-kpi-value">${totalProductos}</div>
                </div>
              </div>
              
              <div class="inv-productos-kpi-card ${productosStockBajo > 0 ? 'inv-kpi-warning' : ''}">
                <div class="inv-productos-kpi-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                  ⚠️
                </div>
                <div class="inv-productos-kpi-content">
                  <div class="inv-productos-kpi-label">Stock Bajo</div>
                  <div class="inv-productos-kpi-value">${productosStockBajo}</div>
                </div>
              </div>
              
              <div class="inv-productos-kpi-card ${productosSinStock > 0 ? 'inv-kpi-danger' : ''}">
                <div class="inv-productos-kpi-icon" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                  📭
                </div>
                <div class="inv-productos-kpi-content">
                  <div class="inv-productos-kpi-label">Sin Stock</div>
                  <div class="inv-productos-kpi-value">${productosSinStock}</div>
                </div>
              </div>
              
              <div class="inv-productos-kpi-card">
                <div class="inv-productos-kpi-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                  💰
                </div>
                <div class="inv-productos-kpi-content">
                  <div class="inv-productos-kpi-label">Valor Inventario</div>
                  <div class="inv-productos-kpi-value">${formatCurrency(valorInventario)}</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Toolbar con Filtros -->
          <div class="inv-productos-toolbar">
            <div class="inv-search-box-enhanced">
              <span class="inv-search-icon">🔍</span>
              <input type="search" id="searchProductos" placeholder="Buscar por nombre, SKU, marca o categoría..." class="inv-search-input">
              <button class="inv-search-clear" onclick="clearProductoSearch()" style="display: none;">✕</button>
            </div>
            
            <div class="inv-toolbar-filters">
              <select class="inv-select-filter" id="filterCategoria" onchange="applyProductoFilters()">
                <option value="">🏷️ Todas las categorías</option>
                ${categorias.sort().map(cat => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
              
              <select class="inv-select-filter" id="filterStock" onchange="applyProductoFilters()">
                <option value="">📊 Estado de stock</option>
                <option value="sin-stock">Sin Stock</option>
                <option value="stock-bajo">Stock Bajo</option>
                <option value="stock-ok">Stock Normal</option>
              </select>
              
              <button class="inv-btn inv-btn-icon-only" onclick="resetProductoFilters()" title="Limpiar filtros">
                🔄
              </button>
            </div>
          </div>
          
          <!-- Tabla Mejorada -->
          <div class="inv-table-container-enhanced">
            <table class="inv-table-modern">
              <thead>
                <tr>
                  <th style="width: 50px;">
                    <input type="checkbox" onchange="toggleSelectAllProductos(this)" title="Seleccionar todos">
                  </th>
                  <th style="width: 120px;">SKU</th>
                  <th style="min-width: 250px;">Producto</th>
                  <th style="width: 150px;">Categoría</th>
                  <th style="width: 100px; text-align: center;">Stock</th>
                  <th style="width: 100px; text-align: center;">Stock Mín.</th>
                  <th style="width: 120px; text-align: right;">Costo</th>
                  <th style="width: 120px; text-align: right;">Precio</th>
                  <th style="width: 150px; text-align: center;">Acciones</th>
                </tr>
              </thead>
              <tbody id="productosTableBody">
                ${renderProductosTable(productosData)}
              </tbody>
            </table>
          </div>
        </div>
      `;
      
      // Search functionality
      const searchInput = document.getElementById("searchProductos");
      const clearButton = container.querySelector(".inv-search-clear");
      
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        clearButton.style.display = query ? 'flex' : 'none';
        applyProductoFilters();
      });
    }
    
  } catch (error) {
    Logger.error("Error al cargar productos:", error);
    showToast("Error al cargar productos", "error");
  }
}

// Renderizar productos como cards (Mobile)
function renderProductosCards(productos) {
  if (productos.length === 0) {
    return `
      <div class="inv-empty-state-modern">
        <div class="inv-empty-state-icon">📦</div>
        <div class="inv-empty-state-title">No hay productos</div>
        <div class="inv-empty-state-description">Comienza agregando tu primer producto al inventario</div>
        <button class="inv-btn inv-btn-primary" onclick="openNewProduct()">
          ➕ Agregar Producto
        </button>
      </div>
    `;
  }
  
  return productos.map(p => {
    const stockBajo = parseFloat(p.stock_actual) < parseFloat(p.stock_minimo);
    const sinStock = parseFloat(p.stock_actual) === 0;
    const stockWarning = parseFloat(p.stock_actual) <= parseFloat(p.stock_minimo) * 1.5 && !sinStock && !stockBajo;
    
    let stockStatus = 'success';
    let stockIcon = '✅';
    let stockLabel = 'Stock OK';
    
    if (sinStock) {
      stockStatus = 'danger';
      stockIcon = '📭';
      stockLabel = 'Sin Stock';
    } else if (stockBajo) {
      stockStatus = 'danger';
      stockIcon = '⚠️';
      stockLabel = 'Stock Bajo';
    } else if (stockWarning) {
      stockStatus = 'warning';
      stockIcon = '⚡';
      stockLabel = 'Bajo Pronto';
    }
    
    const margen = parseFloat(p.precio_sugerido) > 0 
      ? ((parseFloat(p.precio_sugerido) - parseFloat(p.costo_unitario_base)) / parseFloat(p.precio_sugerido) * 100).toFixed(1)
      : 0;
    
    return `
      <div class="inv-producto-card-modern" onclick="openProductDetail(${p.id})">
        <!-- Imagen/Icono del Producto -->
        <div class="inv-producto-card-image">
          <div class="inv-producto-placeholder">
            <span class="inv-producto-placeholder-icon">📦</span>
          </div>
          <div class="inv-producto-stock-badge inv-stock-badge-${stockStatus}">
            <span class="inv-stock-badge-icon">${stockIcon}</span>
            <span class="inv-stock-badge-value">${p.stock_actual}</span>
          </div>
        </div>
        
        <!-- Contenido del Producto -->
        <div class="inv-producto-card-content">
          <!-- Header -->
          <div class="inv-producto-card-header">
            <div>
              <h3 class="inv-producto-card-title">${p.nombre}</h3>
              <div class="inv-producto-card-meta">
                <span class="inv-producto-sku">${p.sku || '-'}</span>
                ${p.marca ? `<span class="inv-producto-meta-dot">•</span><span>${p.marca}</span>` : ''}
              </div>
            </div>
            ${p.categoria ? `
              <span class="inv-producto-categoria-badge">${p.categoria}</span>
            ` : ''}
          </div>
          
          <!-- Info Grid -->
          <div class="inv-producto-info-grid-modern">
            <div class="inv-producto-info-item-modern">
              <span class="inv-producto-info-icon">📊</span>
              <div>
                <div class="inv-producto-info-label">Stock Actual</div>
                <div class="inv-producto-info-value inv-text-${stockStatus}">${p.stock_actual} unidades</div>
              </div>
            </div>
            
            <div class="inv-producto-info-item-modern">
              <span class="inv-producto-info-icon">⚡</span>
              <div>
                <div class="inv-producto-info-label">Stock Mínimo</div>
                <div class="inv-producto-info-value">${p.stock_minimo} unidades</div>
              </div>
            </div>
            
            <div class="inv-producto-info-item-modern">
              <span class="inv-producto-info-icon">💵</span>
              <div>
                <div class="inv-producto-info-label">Costo Base</div>
                <div class="inv-producto-info-value">${formatCurrency(p.costo_unitario_base)}</div>
              </div>
            </div>
            
            <div class="inv-producto-info-item-modern">
              <span class="inv-producto-info-icon">💰</span>
              <div>
                <div class="inv-producto-info-label">Precio Venta</div>
                <div class="inv-producto-info-value inv-text-success">${formatCurrency(p.precio_sugerido)}</div>
              </div>
            </div>
          </div>
          
          <!-- Margen -->
          <div class="inv-producto-margen">
            <div class="inv-producto-margen-label">Margen de ganancia</div>
            <div class="inv-producto-margen-bar">
              <div class="inv-producto-margen-fill" style="width: ${Math.min(parseFloat(margen), 100)}%"></div>
            </div>
            <div class="inv-producto-margen-value">${margen}%</div>
          </div>
          
          <!-- Footer con Acciones -->
          <div class="inv-producto-card-footer">
            <button class="inv-btn-action-modern inv-btn-action-primary" onclick="event.stopPropagation(); editProducto(${p.id})" title="Editar">
              <span class="inv-btn-action-icon">✏️</span>
              <span class="inv-btn-action-label">Editar</span>
            </button>
            
            <button class="inv-btn-action-modern" onclick="event.stopPropagation(); openAssociateBarcode(${p.id})" title="Código de Barras">
              <span class="inv-btn-action-icon">🏷️</span>
              <span class="inv-btn-action-label">Código</span>
            </button>
            
            <button class="inv-btn-action-modern" onclick="event.stopPropagation(); adjustStock(${p.id})" title="Ajustar Stock">
              <span class="inv-btn-action-icon">📊</span>
              <span class="inv-btn-action-label">Stock</span>
            </button>
            
            <button class="inv-btn-action-modern" onclick="event.stopPropagation(); openProductActions(${p.id})" title="Más opciones">
              <span class="inv-btn-action-icon">⋯</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Abrir detalle de producto (Mobile)
function openProductDetail(id) {
  const producto = productosData.find(p => p.id === id);
  if (!producto) return;
  
  const stockBajo = parseFloat(producto.stock_actual) < parseFloat(producto.stock_minimo);
  
  showModal(`📦 ${producto.nombre}`, `
    <div style="display: flex; flex-direction: column; gap: var(--inv-space-4);">
      <!-- SKU y Estado -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="inv-product-card-sku">${producto.sku}</span>
        <span class="inv-badge ${stockBajo ? 'inv-badge-danger' : 'inv-badge-success'}">
          ${stockBajo ? '⚠️ Stock Bajo' : '✅ Stock OK'}
        </span>
      </div>
      
      <!-- Información Principal -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--inv-space-4);">
        <div class="inv-product-info-item">
          <div class="inv-product-info-label">Marca</div>
          <div class="inv-product-info-value">${producto.marca || '-'}</div>
        </div>
        
        <div class="inv-product-info-item">
          <div class="inv-product-info-label">Modelo</div>
          <div class="inv-product-info-value">${producto.modelo || '-'}</div>
        </div>
        
        <div class="inv-product-info-item">
          <div class="inv-product-info-label">Categoría</div>
          <div class="inv-product-info-value">${producto.categoria || '-'}</div>
        </div>
        
        <div class="inv-product-info-item">
          <div class="inv-product-info-label">Ubicación</div>
          <div class="inv-product-info-value">${producto.ubicacion || '-'}</div>
        </div>
      </div>
      
      <!-- Stock -->
      <div style="background: var(--inv-bg-secondary); padding: var(--inv-space-4); border-radius: var(--inv-radius-lg);">
        <div style="display: flex; justify-content: space-between; margin-bottom: var(--inv-space-2);">
          <span style="font-weight: 600;">Stock Actual</span>
          <span style="font-size: 1.5rem; font-weight: 700; color: ${stockBajo ? 'var(--inv-danger)' : 'var(--inv-success)'};">
            ${producto.stock_actual}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="font-size: 0.875rem; color: var(--inv-text-secondary);">Stock Mínimo</span>
          <span style="font-weight: 600;">${producto.stock_minimo}</span>
        </div>
      </div>
      
      <!-- Precios -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--inv-space-3);">
        <div style="background: var(--inv-bg-secondary); padding: var(--inv-space-3); border-radius: var(--inv-radius-lg); text-align: center;">
          <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--inv-text-tertiary); margin-bottom: var(--inv-space-1);">Costo Base</div>
          <div style="font-size: 1.25rem; font-weight: 700;">${formatCurrency(producto.costo_unitario_base)}</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #10b981 0%, #34d399 100%); padding: var(--inv-space-3); border-radius: var(--inv-radius-lg); text-align: center; color: white;">
          <div style="font-size: 0.75rem; text-transform: uppercase; opacity: 0.9; margin-bottom: var(--inv-space-1);">Precio Sugerido</div>
          <div style="font-size: 1.25rem; font-weight: 700;">${formatCurrency(producto.precio_sugerido)}</div>
        </div>
      </div>
      
      ${producto.descripcion ? `
        <div>
          <div class="inv-product-info-label" style="margin-bottom: var(--inv-space-2);">Descripción</div>
          <p style="color: var(--inv-text-secondary); line-height: 1.6;">${producto.descripcion}</p>
        </div>
      ` : ''}
      
      <!-- Códigos de Barras -->
      ${producto.inv_codigos_barras && producto.inv_codigos_barras.length > 0 ? `
        <div>
          <div class="inv-product-info-label" style="margin-bottom: var(--inv-space-2);">Códigos de Barras</div>
          <div style="display: flex; flex-wrap: wrap; gap: var(--inv-space-2);">
            ${producto.inv_codigos_barras.map(cb => `
              <span class="inv-badge-info">${cb.codigo}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
    <button type="button" class="inv-btn inv-btn-primary" onclick="hideModal(); editProducto(${id})">
      ✏️ Editar
    </button>
  `);
}

// Abrir opciones de producto (Bottom Sheet Mobile)
function openProductActions(id) {
  const producto = productosData.find(p => p.id === id);
  if (!producto) return;
  
  showModal(`Acciones: ${producto.nombre}`, `
    <div class="inv-action-list">
      <div class="inv-action-list-item" onclick="hideModal(); viewProducto(${id})">
        <div class="inv-action-list-icon">👁️</div>
        <div class="inv-action-list-content">
          <div class="inv-action-list-title">Ver Detalles</div>
          <div class="inv-action-list-subtitle">Ver información completa</div>
        </div>
      </div>
      
      <div class="inv-action-list-item" onclick="hideModal(); editProducto(${id})">
        <div class="inv-action-list-icon">✏️</div>
        <div class="inv-action-list-content">
          <div class="inv-action-list-title">Editar Producto</div>
          <div class="inv-action-list-subtitle">Modificar información y precios</div>
        </div>
      </div>
      
      <div class="inv-action-list-item" onclick="hideModal(); openAssociateBarcode(${id})">
        <div class="inv-action-list-icon">🏷️</div>
        <div class="inv-action-list-content">
          <div class="inv-action-list-title">Código de Barras</div>
          <div class="inv-action-list-subtitle">Asociar o gestionar códigos</div>
        </div>
      </div>
      
      <div class="inv-action-list-item" onclick="hideModal(); adjustStock(${id})">
        <div class="inv-action-list-icon">📊</div>
        <div class="inv-action-list-content">
          <div class="inv-action-list-title">Ajustar Stock</div>
          <div class="inv-action-list-subtitle">Aumentar o reducir inventario</div>
        </div>
      </div>
      
      <div class="inv-action-list-item inv-action-list-item-danger" onclick="hideModal(); confirmarEliminarProducto(${id})">
        <div class="inv-action-list-icon">🗑️</div>
        <div class="inv-action-list-content">
          <div class="inv-action-list-title">Eliminar Producto</div>
          <div class="inv-action-list-subtitle">Remover producto del inventario</div>
        </div>
      </div>
    </div>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
  `);
}

function renderProductosTable(productos) {
  if (productos.length === 0) {
    return '<tr><td colspan="9" class="inv-empty-table-message">📦 No hay productos que mostrar</td></tr>';
  }
  
  return productos.map(p => {
    const stockBajo = parseFloat(p.stock_actual) < parseFloat(p.stock_minimo);
    const sinStock = parseFloat(p.stock_actual) === 0;
    
    let stockBadgeClass = 'inv-badge-success';
    let stockIcon = '';
    
    if (sinStock) {
      stockBadgeClass = 'inv-badge-danger';
      stockIcon = '📭';
    } else if (stockBajo) {
      stockBadgeClass = 'inv-badge-danger';
      stockIcon = '⚠️';
    }
    
    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="producto-checkbox" data-id="${p.id}">
        </td>
        <td>
          <code class="inv-table-code">${p.sku || '-'}</code>
        </td>
        <td>
          <div class="inv-table-producto-info">
            <strong class="inv-table-producto-nombre">${p.nombre}</strong>
            ${p.marca ? `<small class="inv-table-producto-marca">${p.marca}${p.modelo ? ' ' + p.modelo : ''}</small>` : ''}
          </div>
        </td>
        <td>
          <span class="inv-badge-info">${p.categoria || 'Sin categoría'}</span>
        </td>
        <td style="text-align: center;">
          <span class="inv-badge ${stockBadgeClass}">
            ${p.stock_actual} ${stockIcon}
          </span>
        </td>
        <td style="text-align: center;">
          <span class="inv-table-stock-min">${p.stock_minimo}</span>
        </td>
        <td style="text-align: right;">
          <strong class="inv-table-costo">${formatCurrency(p.costo_unitario_base)}</strong>
        </td>
        <td style="text-align: right;">
          <strong class="inv-table-precio">${formatCurrency(p.precio_sugerido)}</strong>
        </td>
        <td style="text-align: center;">
          <div class="inv-table-actions">
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="viewProducto(${p.id})" title="Ver detalles">
              👁️
            </button>
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="editProducto(${p.id})" title="Editar">
              ✏️
            </button>
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="openAssociateBarcode(${p.id})" title="Código de barras">
              🏷️
            </button>
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="adjustStock(${p.id})" title="Ajustar stock">
              📊
            </button>
            <button class="inv-btn inv-btn-icon inv-btn-danger" onclick="confirmarEliminarProducto(${p.id})" title="Eliminar producto">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Helper Functions para Productos
function clearProductoSearch() {
  const searchInput = document.getElementById("searchProductosMobile") || document.getElementById("searchProductos");
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    document.querySelectorAll('.inv-search-clear').forEach(btn => btn.style.display = 'none');
  }
}

function filterProductosByType(type, element) {
  // Update active state
  document.querySelectorAll('.inv-filter-chip-modern').forEach(chip => {
    chip.classList.remove('active');
  });
  if (element) element.classList.add('active');
  
  let filtered = productosData;
  
  if (type === 'low-stock') {
    filtered = productosData.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo));
  } else if (type === 'sin-stock') {
    filtered = productosData.filter(p => parseFloat(p.stock_actual) === 0);
  }
  
  const listContainer = document.getElementById("productosListMobile");
  if (listContainer) {
    listContainer.innerHTML = renderProductosCards(filtered);
  }
}

function showCategoriaFilter() {
  const categorias = [...new Set(productosData.map(p => p.categoria).filter(Boolean))].sort();
  
  const options = categorias.map(cat => `
    <div class="inv-action-list-item" onclick="filterByCategoriaValue('${cat}'); hideModal();">
      <div class="inv-action-list-icon">🏷️</div>
      <div class="inv-action-list-content">
        <div class="inv-action-list-title">${cat}</div>
        <div class="inv-action-list-subtitle">${productosData.filter(p => p.categoria === cat).length} productos</div>
      </div>
    </div>
  `).join('');
  
  showModal('Filtrar por Categoría', `
    <div class="inv-action-list">
      <div class="inv-action-list-item" onclick="filterByCategoriaValue(''); hideModal();">
        <div class="inv-action-list-icon">📦</div>
        <div class="inv-action-list-content">
          <div class="inv-action-list-title">Todas las categorías</div>
          <div class="inv-action-list-subtitle">${productosData.length} productos</div>
        </div>
      </div>
      ${options}
    </div>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
  `);
}

function filterByCategoriaValue(categoria) {
  let filtered = categoria ? productosData.filter(p => p.categoria === categoria) : productosData;
  
  const listContainer = document.getElementById("productosListMobile");
  if (listContainer) {
    listContainer.innerHTML = renderProductosCards(filtered);
  }
  
  // Update chip label
  const catChip = document.querySelector('[data-filter="categoria"]');
  if (catChip && categoria) {
    catChip.querySelector('span:last-child').textContent = categoria;
  }
}

function applyProductoFilters() {
  const searchQuery = (document.getElementById("searchProductos")?.value || '').toLowerCase().trim();
  const categoriaFilter = document.getElementById("filterCategoria")?.value || '';
  const stockFilter = document.getElementById("filterStock")?.value || '';
  
  let filtered = productosData;
  
  // Apply search
  if (searchQuery) {
    filtered = filtered.filter(p => 
      p.nombre?.toLowerCase().includes(searchQuery) ||
      p.sku?.toLowerCase().includes(searchQuery) ||
      p.marca?.toLowerCase().includes(searchQuery) ||
      p.categoria?.toLowerCase().includes(searchQuery)
    );
  }
  
  // Apply categoria filter
  if (categoriaFilter) {
    filtered = filtered.filter(p => p.categoria === categoriaFilter);
  }
  
  // Apply stock filter
  if (stockFilter === 'sin-stock') {
    filtered = filtered.filter(p => parseFloat(p.stock_actual) === 0);
  } else if (stockFilter === 'stock-bajo') {
    filtered = filtered.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo) && parseFloat(p.stock_actual) > 0);
  } else if (stockFilter === 'stock-ok') {
    filtered = filtered.filter(p => parseFloat(p.stock_actual) >= parseFloat(p.stock_minimo));
  }
  
  const tableBody = document.getElementById("productosTableBody");
  if (tableBody) {
    tableBody.innerHTML = renderProductosTable(filtered);
  }
}

function resetProductoFilters() {
  // Clear search
  const searchInput = document.getElementById("searchProductos");
  if (searchInput) searchInput.value = '';
  
  // Clear selects
  const categoriaSelect = document.getElementById("filterCategoria");
  if (categoriaSelect) categoriaSelect.value = '';
  
  const stockSelect = document.getElementById("filterStock");
  if (stockSelect) stockSelect.value = '';
  
  // Clear button visibility
  document.querySelectorAll('.inv-search-clear').forEach(btn => btn.style.display = 'none');
  
  // Reset table
  const tableBody = document.getElementById("productosTableBody");
  if (tableBody) {
    tableBody.innerHTML = renderProductosTable(productosData);
  }
}

function toggleSelectAllProductos(checkbox) {
  const checkboxes = document.querySelectorAll('.producto-checkbox');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

// ========== VISTA: VENTAS ==========
async function loadVentas(container) {
  showLoading(container, "Cargando ventas...");
  
  try {
    ventasData = await InventoryDB.obtenerTodasVentas();
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // Vista Mobile: Cards
      container.innerHTML = `
        <div class="inv-products-sticky-header">
          <div class="inv-search-bar">
            <span class="inv-search-icon">🔍</span>
            <input 
              type="search" 
              class="inv-search-input" 
              placeholder="Buscar ventas..."
              oninput="filterVentas(this.value)"
            >
          </div>
        </div>
        
        <div class="inv-sales-mobile-list">
          ${ventasData.length > 0 ? renderVentasCards(ventasData) : `
            <div class="inv-empty-state-mobile">
              <div class="inv-empty-state-icon">💰</div>
              <div class="inv-empty-state-title">No hay ventas registradas</div>
              <div class="inv-empty-state-text">Comienza a registrar tus ventas</div>
            </div>
          `}
        </div>
        
        <button class="inv-fab inv-fab-extended" onclick="openQuickSale()">
          <span>💰</span>
          <span class="inv-fab-text">Nueva Venta</span>
        </button>
      `;
      
      // Función de filtro para búsqueda
      window.filterVentas = function(searchTerm) {
        const term = searchTerm.toLowerCase();
        const filtered = ventasData.filter(v => 
          `#${v.id}`.includes(term) ||
          formatDate(v.fecha).toLowerCase().includes(term) ||
          (v.metodo_pago && v.metodo_pago.toLowerCase().includes(term))
        );
        
        const listContainer = container.querySelector('.inv-sales-mobile-list');
        listContainer.innerHTML = filtered.length > 0 ? renderVentasCards(filtered) : `
          <div class="inv-empty-state-mobile">
            <div class="inv-empty-state-icon">🔍</div>
            <div class="inv-empty-state-title">No se encontraron resultados</div>
            <div class="inv-empty-state-text">Intenta con otros términos</div>
          </div>
        `;
      };
      
    } else {
      // Vista Desktop: Tabla
      container.innerHTML = `
        <div class="view-header">
          <div class="view-actions">
            <button class="btn-primary" onclick="openQuickSale()">
              💰 Nueva Venta
            </button>
          </div>
        </div>
        
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Items</th>
                <th>Total</th>
                <th>Utilidad</th>
                <th>Método Pago</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${ventas.map(v => `
                <tr>
                  <td><code>#${v.id}</code></td>
                  <td>${formatDate(v.fecha)}</td>
                  <td>${v.inv_venta_items?.length || 0} items</td>
                  <td><strong>${formatCurrency(v.total)}</strong></td>
                  <td class="text-success">${formatCurrency(v.utilidad_total_real)}</td>
                  <td>${v.metodo_pago || '-'}</td>
                  <td class="table-actions">
                    <button class="btn-icon" onclick="viewVenta(${v.id})" title="Ver detalle">👁️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    
  } catch (error) {
    Logger.error("Error al cargar ventas:", error);
    showToast("Error al cargar ventas", "error");
  }
}

// Renderizar cards de ventas para móvil
function renderVentasCards(ventas) {
  return ventas.map(v => {
    const itemsCount = v.inv_venta_items?.length || 0;
    const fecha = new Date(v.fecha);
    const fechaStr = fecha.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return `
      <div class="inv-sale-card" onclick="openSaleDetail(${v.id})">
        <div class="inv-sale-card-header">
          <div class="inv-sale-id-section">
            <div class="inv-sale-id">Venta #${v.id}</div>
            <div class="inv-sale-date">📅 ${fechaStr}</div>
          </div>
          <div class="inv-sale-status-badge completed">Completada</div>
        </div>
        
        <div class="inv-sale-card-body">
          <div class="inv-sale-stats">
            <div class="inv-sale-stat">
              <div class="inv-sale-stat-label">Total</div>
              <div class="inv-sale-stat-value total">${formatCurrency(v.total)}</div>
            </div>
            
            <div class="inv-sale-stat">
              <div class="inv-sale-stat-label">Utilidad</div>
              <div class="inv-sale-stat-value profit">${formatCurrency(v.utilidad_total_real)}</div>
            </div>
            
            <div class="inv-sale-stat">
              <div class="inv-sale-stat-label">Items</div>
              <div class="inv-sale-stat-value">${itemsCount} ${itemsCount === 1 ? 'producto' : 'productos'}</div>
            </div>
            
            <div class="inv-sale-stat">
              <div class="inv-sale-stat-label">Descuento</div>
              <div class="inv-sale-stat-value">${formatCurrency(v.descuento || 0)}</div>
            </div>
          </div>
          
          ${v.metodo_pago ? `
            <div class="inv-sale-payment-method">
              💳 ${v.metodo_pago}
            </div>
          ` : ''}
        </div>
        
        <div class="inv-sale-card-footer">
          <button class="inv-sale-action-btn primary" onclick="event.stopPropagation(); openSaleDetail(${v.id})">
            👁️ Ver Detalle
          </button>
          <button class="inv-sale-action-btn danger" onclick="event.stopPropagation(); confirmarEliminarVenta(${v.id})">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Abrir modal con detalles completos de la venta
async function openSaleDetail(id) {
  try {
    const ventas = await InventoryDB.obtenerTodasVentas();
    const venta = ventas.find(v => v.id === id);
    
    if (!venta) {
      showToast("Venta no encontrada", "error");
      return;
    }
    
    const items = venta.inv_venta_items || [];
    const fecha = new Date(venta.fecha);
    const fechaStr = fecha.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    showModal(
      `Detalle de Venta #${id}`,
      `
        <div style="padding: 1rem;">
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.25rem;">FECHA</div>
              <div style="font-weight: 600;">${fechaStr}</div>
            </div>
            
            <div>
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.25rem;">MÉTODO DE PAGO</div>
              <div style="font-weight: 600;">${venta.metodo_pago || 'No especificado'}</div>
            </div>
            
            <div>
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.25rem;">SUBTOTAL</div>
              <div style="font-weight: 600;">${formatCurrency(venta.subtotal)}</div>
            </div>
            
            <div>
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.25rem;">DESCUENTO</div>
              <div style="font-weight: 600; color: var(--inv-warning);">${formatCurrency(venta.descuento || 0)}</div>
            </div>
            
            <div>
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.25rem;">TOTAL</div>
              <div style="font-weight: 700; font-size: 1.25rem; color: var(--inv-primary);">${formatCurrency(venta.total)}</div>
            </div>
            
            <div>
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.25rem;">UTILIDAD</div>
              <div style="font-weight: 700; font-size: 1.25rem; color: var(--inv-success);">${formatCurrency(venta.utilidad_total_real)}</div>
            </div>
          </div>
          
          ${venta.notas ? `
            <div style="margin-bottom: 1.5rem;">
              <div style="font-size: 0.75rem; color: var(--inv-text-secondary); margin-bottom: 0.5rem;">NOTAS</div>
              <div style="padding: 0.75rem; background: var(--inv-bg-secondary); border-radius: 8px; font-size: 0.875rem;">
                ${venta.notas}
              </div>
            </div>
          ` : ''}
          
          <div style="margin-top: 1.5rem;">
            <div style="font-size: 0.875rem; font-weight: 700; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--inv-border);">
              PRODUCTOS (${items.length})
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${items.map(item => {
                const producto = item.producto || {};
                const precioSugerido = item.precio_unitario_sugerido_en_el_momento || 0;
                const precioReal = item.precio_unitario_real_vendido || 0;
                const diferencia = precioReal - precioSugerido;
                
                return `
                  <div style="padding: 0.875rem; background: var(--inv-bg-secondary); border-radius: 8px; border-left: 3px solid var(--inv-primary);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                      <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 0.25rem;">${producto.nombre || 'Producto desconocido'}</div>
                        <div style="font-size: 0.75rem; color: var(--inv-text-secondary);">SKU: ${producto.sku || 'N/A'}</div>
                      </div>
                      <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 1rem; color: var(--inv-primary);">${formatCurrency(precioReal * item.cantidad)}</div>
                        <div style="font-size: 0.75rem; color: var(--inv-text-secondary);">x${item.cantidad}</div>
                      </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.75rem;">
                      <div>
                        <span style="color: var(--inv-text-secondary);">Precio sugerido:</span>
                        <div style="font-weight: 600;">${formatCurrency(precioSugerido)}</div>
                      </div>
                      <div>
                        <span style="color: var(--inv-text-secondary);">Precio vendido:</span>
                        <div style="font-weight: 600;">${formatCurrency(precioReal)}</div>
                      </div>
                      <div>
                        <span style="color: var(--inv-text-secondary);">Utilidad:</span>
                        <div style="font-weight: 600; color: var(--inv-success);">${formatCurrency(item.utilidad_item_real)}</div>
                      </div>
                    </div>
                    
                    ${diferencia !== 0 ? `
                      <div style="margin-top: 0.5rem; padding: 0.5rem; background: ${diferencia > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border-radius: 6px; font-size: 0.75rem; font-weight: 600; color: ${diferencia > 0 ? 'var(--inv-success)' : 'var(--inv-error)'};">
                        ${diferencia > 0 ? '↗' : '↘'} ${diferencia > 0 ? '+' : ''}${formatCurrency(diferencia)} vs precio sugerido
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `,
      [
        { text: "Cerrar", className: "btn-secondary-sm", onClick: hideModal }
      ]
    );
    
  } catch (error) {
    Logger.error("Error al cargar detalle de venta:", error);
    showToast("Error al cargar detalle", "error");
  }
}

// ========== VISTA: COMPRAS ==========
async function loadCompras(container) {
  showLoading(container, "Cargando compras...");
  
  try {
    const compras = await InventoryDB.obtenerTodasCompras();
    const isMobile = window.innerWidth <= 768;
    
    // Calcular estadísticas
    const totalCompras = compras.length;
    const totalInvertido = compras.reduce((sum, c) => sum + parseFloat(c.total || 0), 0);
    const comprasEsteMes = compras.filter(c => {
      const fechaCompra = new Date(c.fecha);
      const ahora = new Date();
      return fechaCompra.getMonth() === ahora.getMonth() && fechaCompra.getFullYear() === ahora.getFullYear();
    }).length;
    const proveedoresUnicos = [...new Set(compras.filter(c => c.proveedor_id).map(c => c.proveedor_id))].length;
    
    if (isMobile) {
      // ========== VISTA MÓVIL: Cards tipo App Nativa ==========
      container.innerHTML = `
        <!-- Header Sticky con Estadísticas -->
        <div class="inv-purchases-header-mobile">
          <div class="inv-purchases-stats-mobile">
            <div class="inv-stat-mini">
              <span class="inv-stat-mini-icon">🛒</span>
              <div>
                <div class="inv-stat-mini-value">${totalCompras}</div>
                <div class="inv-stat-mini-label">Compras</div>
              </div>
            </div>
            <div class="inv-stat-mini">
              <span class="inv-stat-mini-icon">💰</span>
              <div>
                <div class="inv-stat-mini-value">${formatCurrencyShort(totalInvertido)}</div>
                <div class="inv-stat-mini-label">Invertido</div>
              </div>
            </div>
            <div class="inv-stat-mini">
              <span class="inv-stat-mini-icon">📅</span>
              <div>
                <div class="inv-stat-mini-value">${comprasEsteMes}</div>
                <div class="inv-stat-mini-label">Este mes</div>
              </div>
            </div>
          </div>
          
          <!-- Buscador y filtros -->
          <div class="inv-search-bar-mobile">
            <span class="inv-search-icon-mobile">🔍</span>
            <input 
              type="search" 
              id="searchComprasMobile" 
              placeholder="Buscar compra..." 
              class="inv-search-input-mobile"
            >
          </div>
          
          <div class="inv-filters-mobile">
            <select id="filterProveedorMobile" class="inv-filter-select-mobile">
              <option value="">Todos los proveedores</option>
              ${[...new Set(compras.filter(c => c.proveedor?.nombre).map(c => c.proveedor.nombre))]
                .map(nombre => `<option value="${nombre}">${nombre}</option>`).join('')}
            </select>
            <select id="filterMesMobile" class="inv-filter-select-mobile">
              <option value="">Todos los periodos</option>
              <option value="este-mes">Este mes</option>
              <option value="ultimo-mes">Último mes</option>
              <option value="ultimos-3-meses">Últimos 3 meses</option>
            </select>
          </div>
        </div>
        
        <!-- Lista de Compras -->
        <div class="inv-purchases-list-mobile" id="purchasesList">
          ${renderComprasCardsMobile(compras)}
        </div>
        
        <!-- Estado vacío -->
        <div class="inv-empty-state-mobile" id="emptyStatePurchases" style="display: none;">
          <div class="inv-empty-icon">🛒</div>
          <h3 class="inv-empty-title">No se encontraron compras</h3>
          <p class="inv-empty-text">Intenta ajustar los filtros de búsqueda</p>
        </div>
        
        <!-- FAB -->
        <button class="inv-fab inv-fab-extended inv-fab-purchases" onclick="openNewCompra()">
          <span>🛒</span>
          <span class="inv-fab-text">Nueva Compra</span>
        </button>
      `;
      
      // Funcionalidad de búsqueda y filtros
      setupComprasFiltering(compras);
      
    } else {
      // ========== VISTA DESKTOP: Grid Profesional ==========
      container.innerHTML = `
        <div class="inv-purchases-desktop">
          <!-- Header con Estadísticas -->
          <div class="inv-purchases-header-desktop">
            <div class="inv-section-title-group">
              <h2 class="inv-section-title">🛒 Gestión de Compras</h2>
              <p class="inv-section-subtitle">Administra tus compras de inventario y proveedores</p>
            </div>
            
            <div class="inv-purchases-stats-desktop">
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">🛒</div>
                <div>
                  <div class="inv-stat-card-mini-value">${totalCompras}</div>
                  <div class="inv-stat-card-mini-label">Total Compras</div>
                </div>
              </div>
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">💰</div>
                <div>
                  <div class="inv-stat-card-mini-value">${formatCurrencyShort(totalInvertido)}</div>
                  <div class="inv-stat-card-mini-label">Invertido</div>
                </div>
              </div>
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">📅</div>
                <div>
                  <div class="inv-stat-card-mini-value">${comprasEsteMes}</div>
                  <div class="inv-stat-card-mini-label">Este Mes</div>
                </div>
              </div>
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">🏭</div>
                <div>
                  <div class="inv-stat-card-mini-value">${proveedoresUnicos}</div>
                  <div class="inv-stat-card-mini-label">Proveedores</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Toolbar -->
          <div class="inv-purchases-toolbar">
            <div class="inv-toolbar-left">
              <div class="inv-search-container-desktop">
                <span class="inv-search-icon">🔍</span>
                <input 
                  type="search" 
                  id="searchComprasDesktop" 
                  placeholder="Buscar por referencia, proveedor..." 
                  class="inv-search-input-desktop"
                >
              </div>
              <select id="filterProveedorDesktop" class="inv-filter-select-desktop">
                <option value="">Todos los proveedores</option>
                ${[...new Set(compras.filter(c => c.proveedor?.nombre).map(c => c.proveedor.nombre))]
                  .map(nombre => `<option value="${nombre}">${nombre}</option>`).join('')}
              </select>
              <select id="filterMesDesktop" class="inv-filter-select-desktop">
                <option value="">Todos los periodos</option>
                <option value="este-mes">Este mes</option>
                <option value="ultimo-mes">Último mes</option>
                <option value="ultimos-3-meses">Últimos 3 meses</option>
              </select>
            </div>
            <button class="inv-btn inv-btn-success" onclick="openNewCompra()">
              🛒 Nueva Compra
            </button>
          </div>
          
          <!-- Grid de Compras -->
          <div class="inv-purchases-grid" id="purchasesGrid">
            ${renderComprasCardsDesktop(compras)}
          </div>
          
          <!-- Estado vacío -->
          <div class="inv-empty-state-desktop" id="emptyStatePurchasesDesktop" style="display: none;">
            <div class="inv-empty-icon">🛒</div>
            <h3 class="inv-empty-title">No se encontraron compras</h3>
            <p class="inv-empty-text">Intenta ajustar los filtros de búsqueda o crear una nueva compra</p>
            <button class="inv-btn inv-btn-primary" onclick="openNewCompra()">🛒 Nueva Compra</button>
          </div>
        </div>
      `;
      
      // Funcionalidad de búsqueda y filtros
      setupComprasFiltering(compras);
    }
    
  } catch (error) {
    Logger.error("Error al cargar compras:", error);
    showToast("Error al cargar compras", "error");
  }
}

// ========== VISTA: PROVEEDORES ==========
async function loadProveedores(container) {
  showLoading(container, "Cargando proveedores...");
  
  try {
    proveedoresData = await InventoryDB.obtenerTodosProveedores();
    const isMobile = window.innerWidth <= 768;
    
    // Calcular estadísticas
    const totalProveedores = proveedoresData.length;
    const ciudadesUnicas = [...new Set(proveedoresData.map(p => p.ciudad).filter(Boolean))].length;
    const conEmail = proveedoresData.filter(p => p.email).length;
    const conTelefono = proveedoresData.filter(p => p.telefono).length;
    
    if (isMobile) {
      // ========== VISTA MÓVIL: Cards tipo App Nativa ==========
      container.innerHTML = `
        <!-- Header Sticky con Estadísticas -->
        <div class="inv-providers-header-mobile">
          <div class="inv-providers-stats-mobile">
            <div class="inv-stat-mini">
              <span class="inv-stat-mini-icon">👥</span>
              <div>
                <div class="inv-stat-mini-value">${totalProveedores}</div>
                <div class="inv-stat-mini-label">Proveedores</div>
              </div>
            </div>
            <div class="inv-stat-mini">
              <span class="inv-stat-mini-icon">🏙️</span>
              <div>
                <div class="inv-stat-mini-value">${ciudadesUnicas}</div>
                <div class="inv-stat-mini-label">Ciudades</div>
              </div>
            </div>
          </div>
          
          <!-- Buscador -->
          <div class="inv-search-bar-mobile">
            <span class="inv-search-icon-mobile">🔍</span>
            <input 
              type="search" 
              id="searchProveedoresMobile" 
              placeholder="Buscar proveedor..." 
              class="inv-search-input-mobile"
            >
          </div>
        </div>
        
        <!-- Lista de Proveedores -->
        <div class="inv-providers-list-mobile" id="providersList">
          ${renderProveedoresCardsMobile(proveedoresData)}
        </div>
        
        <!-- FAB -->
        <button class="inv-fab inv-fab-extended" onclick="openNewProveedor()">
          <span>➕</span>
          <span class="inv-fab-text">Nuevo</span>
        </button>
      `;
      
      // Funcionalidad de búsqueda
      document.getElementById("searchProveedoresMobile").addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = proveedoresData.filter(p => 
          p.nombre?.toLowerCase().includes(query) ||
          p.contacto?.toLowerCase().includes(query) ||
          p.ciudad?.toLowerCase().includes(query) ||
          p.telefono?.includes(query) ||
          p.email?.toLowerCase().includes(query)
        );
        document.getElementById("providersList").innerHTML = renderProveedoresCardsMobile(filtered);
      });
      
    } else {
      // ========== VISTA DESKTOP: Grid Profesional ==========
      container.innerHTML = `
        <div class="inv-providers-desktop">
          <!-- Header con Estadísticas -->
          <div class="inv-providers-header-desktop">
            <div class="inv-section-title-group">
              <h2 class="inv-section-title">🏭 Gestión de Proveedores</h2>
              <p class="inv-section-subtitle">Administra tu red de proveedores y contactos comerciales</p>
            </div>
            
            <div class="inv-providers-stats-desktop">
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">👥</div>
                <div>
                  <div class="inv-stat-card-mini-value">${totalProveedores}</div>
                  <div class="inv-stat-card-mini-label">Total</div>
                </div>
              </div>
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">🏙️</div>
                <div>
                  <div class="inv-stat-card-mini-value">${ciudadesUnicas}</div>
                  <div class="inv-stat-card-mini-label">Ciudades</div>
                </div>
              </div>
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">📧</div>
                <div>
                  <div class="inv-stat-card-mini-value">${conEmail}</div>
                  <div class="inv-stat-card-mini-label">Con Email</div>
                </div>
              </div>
              <div class="inv-stat-card-mini">
                <div class="inv-stat-card-mini-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">📱</div>
                <div>
                  <div class="inv-stat-card-mini-value">${conTelefono}</div>
                  <div class="inv-stat-card-mini-label">Con Teléfono</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Toolbar -->
          <div class="inv-providers-toolbar">
            <div class="inv-search-container-desktop">
              <span class="inv-search-icon">🔍</span>
              <input 
                type="search" 
                id="searchProveedoresDesktop" 
                placeholder="Buscar por nombre, ciudad, contacto..." 
                class="inv-search-input-desktop"
              >
            </div>
            <button class="inv-btn inv-btn-success" onclick="openNewProveedor()">
              ➕ Nuevo Proveedor
            </button>
          </div>
          
          <!-- Grid de Proveedores -->
          <div class="inv-providers-grid" id="providersGrid">
            ${renderProveedoresCardsDesktop(proveedoresData)}
          </div>
        </div>
      `;
      
      // Funcionalidad de búsqueda
      document.getElementById("searchProveedoresDesktop").addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = proveedoresData.filter(p => 
          p.nombre?.toLowerCase().includes(query) ||
          p.contacto?.toLowerCase().includes(query) ||
          p.ciudad?.toLowerCase().includes(query) ||
          p.telefono?.includes(query) ||
          p.email?.toLowerCase().includes(query)
        );
        document.getElementById("providersGrid").innerHTML = renderProveedoresCardsDesktop(filtered);
      });
    }
    
  } catch (error) {
    Logger.error("Error al cargar proveedores:", error);
    showToast("Error al cargar proveedores", "error");
  }
}

// Renderizar cards móviles
function renderProveedoresCardsMobile(proveedores) {
  if (proveedores.length === 0) {
    return `
      <div class="inv-empty-state-mobile">
        <div class="inv-empty-state-icon">🏭</div>
        <h3 class="inv-empty-state-title">No hay proveedores</h3>
        <p class="inv-empty-state-text">Comienza agregando tu primer proveedor</p>
        <button class="inv-btn inv-btn-primary" onclick="openNewProveedor()">
          ➕ Agregar Proveedor
        </button>
      </div>
    `;
  }
  
  return proveedores.map(p => {
    const initials = getInitials(p.nombre);
    const avatarColor = getColorFromString(p.nombre);
    
    return `
      <div class="inv-provider-card-mobile">
        <div class="inv-provider-card-header-mobile">
          <div class="inv-provider-avatar" style="background: ${avatarColor};">
            ${initials}
          </div>
          <div class="inv-provider-info-mobile">
            <h3 class="inv-provider-name">${p.nombre}</h3>
            ${p.ciudad ? `<span class="inv-provider-city">📍 ${p.ciudad}</span>` : ''}
          </div>
        </div>
        
        <div class="inv-provider-card-body-mobile">
          ${p.contacto ? `
            <div class="inv-provider-detail">
              <span class="inv-provider-detail-icon">👤</span>
              <span class="inv-provider-detail-text">${p.contacto}</span>
            </div>
          ` : ''}
          
          ${p.telefono ? `
            <div class="inv-provider-detail">
              <span class="inv-provider-detail-icon">📱</span>
              <a href="tel:${p.telefono}" class="inv-provider-detail-link">${p.telefono}</a>
            </div>
          ` : ''}
          
          ${p.email ? `
            <div class="inv-provider-detail">
              <span class="inv-provider-detail-icon">📧</span>
              <a href="mailto:${p.email}" class="inv-provider-detail-link">${p.email}</a>
            </div>
          ` : ''}
        </div>
        
        <div class="inv-provider-card-actions-mobile">
          ${p.telefono ? `
            <a href="tel:${p.telefono}" class="inv-provider-action-btn inv-provider-action-call" title="Llamar">
              📞
            </a>
            <a href="https://wa.me/${p.telefono.replace(/\D/g, '')}" target="_blank" class="inv-provider-action-btn inv-provider-action-whatsapp" title="WhatsApp">
              💬
            </a>
          ` : ''}
          ${p.email ? `
            <a href="mailto:${p.email}" class="inv-provider-action-btn inv-provider-action-email" title="Email">
              ✉️
            </a>
          ` : ''}
          <button onclick="viewProveedor(${p.id})" class="inv-provider-action-btn inv-provider-action-view" title="Ver detalles">
            👁️
          </button>
          <button onclick="editProveedor(${p.id})" class="inv-provider-action-btn inv-provider-action-edit" title="Editar">
            ✏️
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Renderizar cards desktop
function renderProveedoresCardsDesktop(proveedores) {
  if (proveedores.length === 0) {
    return `
      <div class="inv-empty-state-desktop">
        <div class="inv-empty-state-icon">🏭</div>
        <h3 class="inv-empty-state-title">No hay proveedores registrados</h3>
        <p class="inv-empty-state-text">Comienza agregando proveedores para gestionar tus contactos comerciales</p>
        <button class="inv-btn inv-btn-primary inv-btn-large" onclick="openNewProveedor()">
          ➕ Agregar Primer Proveedor
        </button>
      </div>
    `;
  }
  
  return proveedores.map(p => {
    const initials = getInitials(p.nombre);
    const avatarColor = getColorFromString(p.nombre);
    
    return `
      <div class="inv-provider-card-desktop">
        <div class="inv-provider-card-header-desktop">
          <div class="inv-provider-avatar-large" style="background: ${avatarColor};">
            ${initials}
          </div>
          <div class="inv-provider-header-info">
            <h3 class="inv-provider-name-desktop">${p.nombre}</h3>
            ${p.ciudad ? `
              <span class="inv-provider-badge">
                <span class="inv-provider-badge-icon">📍</span>
                ${p.ciudad}
              </span>
            ` : ''}
          </div>
        </div>
        
        <div class="inv-provider-card-body-desktop">
          ${p.contacto ? `
            <div class="inv-provider-info-row">
              <span class="inv-provider-info-label">
                <span class="inv-provider-info-icon">👤</span>
                Contacto
              </span>
              <span class="inv-provider-info-value">${p.contacto}</span>
            </div>
          ` : ''}
          
          ${p.telefono ? `
            <div class="inv-provider-info-row">
              <span class="inv-provider-info-label">
                <span class="inv-provider-info-icon">📱</span>
                Teléfono
              </span>
              <a href="tel:${p.telefono}" class="inv-provider-info-link">${p.telefono}</a>
            </div>
          ` : ''}
          
          ${p.email ? `
            <div class="inv-provider-info-row">
              <span class="inv-provider-info-label">
                <span class="inv-provider-info-icon">📧</span>
                Email
              </span>
              <a href="mailto:${p.email}" class="inv-provider-info-link">${p.email}</a>
            </div>
          ` : ''}
          
          ${p.direccion ? `
            <div class="inv-provider-info-row">
              <span class="inv-provider-info-label">
                <span class="inv-provider-info-icon">🏢</span>
                Dirección
              </span>
              <span class="inv-provider-info-value-small">${p.direccion}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="inv-provider-card-footer-desktop">
          <div class="inv-provider-quick-actions">
            ${p.telefono ? `
              <a href="tel:${p.telefono}" class="inv-btn-icon" title="Llamar">
                📞
              </a>
              <a href="https://wa.me/${p.telefono.replace(/\D/g, '')}" target="_blank" class="inv-btn-icon" title="WhatsApp">
                💬
              </a>
            ` : ''}
            ${p.email ? `
              <a href="mailto:${p.email}" class="inv-btn-icon" title="Email">
                ✉️
              </a>
            ` : ''}
          </div>
          <div class="inv-provider-main-actions">
            <button onclick="viewProveedor(${p.id})" class="inv-btn inv-btn-secondary inv-btn-sm">
              👁️ Ver
            </button>
            <button onclick="editProveedor(${p.id})" class="inv-btn inv-btn-primary inv-btn-sm">
              ✏️ Editar
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Función auxiliar: Obtener iniciales
function getInitials(name) {
  if (!name) return '??';
  const words = name.trim().split(' ');
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Función auxiliar: Color desde string
function getColorFromString(str) {
  if (!str) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  
  const colors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

// Función para ver detalles del proveedor
async function viewProveedor(id) {
  try {
    const proveedor = proveedoresData.find(p => p.id === id);
    if (!proveedor) {
      showToast("Proveedor no encontrado", "error");
      return;
    }
    
    const initials = getInitials(proveedor.nombre);
    const avatarColor = getColorFromString(proveedor.nombre);
    
    showModal(`🏭 ${proveedor.nombre}`, `
      <div class="inv-proveedor-detail">
        <div class="inv-proveedor-detail-header">
          <div class="inv-provider-avatar-large" style="background: ${avatarColor}; width: 80px; height: 80px; font-size: 2rem;">
            ${initials}
          </div>
          <div style="text-align: center; margin-top: 1rem;">
            <h2 style="margin: 0; color: var(--inv-text-primary);">${proveedor.nombre}</h2>
            ${proveedor.ciudad ? `<p style="margin: 0.5rem 0 0 0; color: var(--inv-text-secondary);">📍 ${proveedor.ciudad}</p>` : ''}
          </div>
        </div>
        
        <div class="inv-proveedor-detail-body">
          ${proveedor.contacto ? `
            <div class="inv-detail-row">
              <span class="inv-detail-label">👤 Contacto</span>
              <span class="inv-detail-value">${proveedor.contacto}</span>
            </div>
          ` : ''}
          
          ${proveedor.telefono ? `
            <div class="inv-detail-row">
              <span class="inv-detail-label">📱 Teléfono</span>
              <a href="tel:${proveedor.telefono}" class="inv-detail-link">${proveedor.telefono}</a>
            </div>
          ` : ''}
          
          ${proveedor.email ? `
            <div class="inv-detail-row">
              <span class="inv-detail-label">📧 Email</span>
              <a href="mailto:${proveedor.email}" class="inv-detail-link">${proveedor.email}</a>
            </div>
          ` : ''}
          
          ${proveedor.direccion ? `
            <div class="inv-detail-row">
              <span class="inv-detail-label">🏢 Dirección</span>
              <span class="inv-detail-value">${proveedor.direccion}</span>
            </div>
          ` : ''}
          
          ${proveedor.notas ? `
            <div class="inv-detail-row" style="flex-direction: column; align-items: flex-start;">
              <span class="inv-detail-label">📝 Notas</span>
              <span class="inv-detail-value" style="white-space: pre-wrap; margin-top: 0.5rem;">${proveedor.notas}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="inv-proveedor-detail-actions">
          ${proveedor.telefono ? `
            <a href="tel:${proveedor.telefono}" class="inv-btn inv-btn-secondary" style="flex: 1;">
              📞 Llamar
            </a>
            <a href="https://wa.me/${proveedor.telefono.replace(/\D/g, '')}" target="_blank" class="inv-btn inv-btn-success" style="flex: 1;">
              💬 WhatsApp
            </a>
          ` : ''}
          ${proveedor.email ? `
            <a href="mailto:${proveedor.email}" class="inv-btn inv-btn-info" style="flex: 1;">
              ✉️ Email
            </a>
          ` : ''}
        </div>
      </div>
    `, `
      <button type="button" class="btn-secondary" onclick="hideModal()">Cerrar</button>
      <button type="button" class="btn-primary" onclick="hideModal(); editProveedor(${id})">✏️ Editar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al ver proveedor:", error);
    showToast("Error al cargar detalles", "error");
  }
}

// ========== VISTA: REPORTES ==========
async function loadReportes(container) {
  showLoading(container, "Cargando reportes...");
  
  try {
    const isMobile = window.innerWidth <= 768;
    
    // Obtener datos para métricas rápidas
    const kpis = await InventoryDB.obtenerKPIsDashboard();
    const productos = await InventoryDB.obtenerTodosProductos();
    const ventasHoy = await InventoryDB.obtenerTodasVentas(); // Filtrar por hoy en producción
    
    // Calcular métricas
    const totalProductos = productos.length;
    const stockBajo = productos.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo)).length;
    const ventasHoyCount = ventasHoy.filter(v => {
      const fecha = new Date(v.fecha);
      const hoy = new Date();
      return fecha.toDateString() === hoy.toDateString();
    }).length;
    
    const ultimaActualizacion = new Date().toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    if (isMobile) {
      // ========== VISTA MÓVIL ==========
      container.innerHTML = `
        <div class="inv-reports-mobile">
          <!-- Header con métricas -->
          <div class="inv-reports-header-mobile">
            <div class="inv-reports-welcome">
              <h2 class="inv-reports-title">📈 Centro de Reportes</h2>
              <p class="inv-reports-subtitle">Analítica e informes del negocio</p>
            </div>
            
            <div class="inv-reports-quick-metrics">
              <div class="inv-quick-metric">
                <span class="inv-quick-metric-icon">📦</span>
                <div>
                  <div class="inv-quick-metric-value">${totalProductos}</div>
                  <div class="inv-quick-metric-label">Productos</div>
                </div>
              </div>
              <div class="inv-quick-metric">
                <span class="inv-quick-metric-icon" style="color: ${stockBajo > 0 ? 'var(--inv-warning)' : 'var(--inv-success)'};">
                  ${stockBajo > 0 ? '⚠️' : '✅'}
                </span>
                <div>
                  <div class="inv-quick-metric-value">${stockBajo}</div>
                  <div class="inv-quick-metric-label">Stock Bajo</div>
                </div>
              </div>
              <div class="inv-quick-metric">
                <span class="inv-quick-metric-icon">💰</span>
                <div>
                  <div class="inv-quick-metric-value">${ventasHoyCount}</div>
                  <div class="inv-quick-metric-label">Ventas Hoy</div>
                </div>
              </div>
            </div>
            
            <div class="inv-reports-last-update">
              <span class="inv-last-update-icon">🕐</span>
              <span class="inv-last-update-text">Actualizado: ${ultimaActualizacion}</span>
            </div>
          </div>
          
          <!-- Reportes por Categoría -->
          <div class="inv-reports-content-mobile">
            <!-- Reportes Financieros -->
            <div class="inv-report-category-mobile">
              <div class="inv-category-header-mobile">
                <span class="inv-category-icon">💵</span>
                <h3 class="inv-category-title">Reportes Financieros</h3>
              </div>
              <div class="inv-reports-list-mobile">
                ${renderReportCardMobile('utilidades', '💰', 'Reporte de Utilidades', 'Análisis de ganancias y márgenes', 'success')}
                ${renderReportCardMobile('ventasMes', '📊', 'Ventas del Mes', 'Resumen mensual de ventas', 'primary')}
              </div>
            </div>
            
            <!-- Reportes de Inventario -->
            <div class="inv-report-category-mobile">
              <div class="inv-category-header-mobile">
                <span class="inv-category-icon">📦</span>
                <h3 class="inv-category-title">Reportes de Inventario</h3>
              </div>
              <div class="inv-reports-list-mobile">
                ${renderReportCardMobile('stockBajo', '⚠️', 'Stock Bajo', `${stockBajo} productos requieren atención`, 'warning')}
                ${renderReportCardMobile('rotacion', '🔄', 'Rotación de Inventario', 'Productos más y menos vendidos', 'info')}
                ${renderReportCardMobile('valorInventario', '💎', 'Valor del Inventario', 'Valuación total del stock', 'success')}
              </div>
            </div>
            
            <!-- Reportes de Análisis -->
            <div class="inv-report-category-mobile">
              <div class="inv-category-header-mobile">
                <span class="inv-category-icon">📈</span>
                <h3 class="inv-category-title">Análisis y Tendencias</h3>
              </div>
              <div class="inv-reports-list-mobile">
                ${renderReportCardMobile('proveedores', '🏭', 'Ranking de Proveedores', 'Análisis de compras por proveedor', 'info')}
                ${renderReportCardMobile('categorias', '🏷️', 'Ventas por Categoría', 'Productos más rentables', 'primary')}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // ========== VISTA DESKTOP ==========
      container.innerHTML = `
        <div class="inv-reports-desktop">
          <!-- Header -->
          <div class="inv-reports-header-desktop">
            <div class="inv-reports-welcome-desktop">
              <h2 class="inv-reports-title-desktop">📈 Centro de Reportes e Informes</h2>
              <p class="inv-reports-subtitle-desktop">Analítica avanzada, métricas de negocio y reportes exportables</p>
            </div>
            
            <div class="inv-reports-actions-desktop">
              <button class="inv-btn inv-btn-secondary" onclick="window.print()">
                🖨️ Imprimir
              </button>
              <button class="inv-btn inv-btn-primary" onclick="showToast('Función de exportar en desarrollo', 'info')">
                📥 Exportar Todo
              </button>
            </div>
          </div>
          
          <!-- Métricas KPI -->
          <div class="inv-reports-kpis-desktop">
            <div class="inv-kpi-card-report" style="--kpi-color: #667eea;">
              <div class="inv-kpi-card-header">
                <span class="inv-kpi-card-icon">📦</span>
                <span class="inv-kpi-card-trend inv-trend-up">↗ +5%</span>
              </div>
              <div class="inv-kpi-card-body">
                <div class="inv-kpi-card-value">${totalProductos}</div>
                <div class="inv-kpi-card-label">Total Productos</div>
              </div>
            </div>
            
            <div class="inv-kpi-card-report" style="--kpi-color: ${stockBajo > 0 ? '#f59e0b' : '#10b981'};">
              <div class="inv-kpi-card-header">
                <span class="inv-kpi-card-icon">${stockBajo > 0 ? '⚠️' : '✅'}</span>
                <span class="inv-kpi-card-trend ${stockBajo > 0 ? 'inv-trend-down' : 'inv-trend-neutral'}">
                  ${stockBajo > 0 ? '↘' : '→'} ${stockBajo}
                </span>
              </div>
              <div class="inv-kpi-card-body">
                <div class="inv-kpi-card-value">${stockBajo}</div>
                <div class="inv-kpi-card-label">Stock Bajo</div>
              </div>
            </div>
            
            <div class="inv-kpi-card-report" style="--kpi-color: #f093fb;">
              <div class="inv-kpi-card-header">
                <span class="inv-kpi-card-icon">💰</span>
                <span class="inv-kpi-card-trend inv-trend-up">↗ ${ventasHoyCount}</span>
              </div>
              <div class="inv-kpi-card-body">
                <div class="inv-kpi-card-value">${(kpis.totalVentas || 0).toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</div>
                <div class="inv-kpi-card-label">Ventas Totales</div>
              </div>
            </div>
            
            <div class="inv-kpi-card-report" style="--kpi-color: #43e97b;">
              <div class="inv-kpi-card-header">
                <span class="inv-kpi-card-icon">💵</span>
                <span class="inv-kpi-card-trend inv-trend-up">↗ +12%</span>
              </div>
              <div class="inv-kpi-card-body">
                <div class="inv-kpi-card-value">${(kpis.utilidadTotal || 0).toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</div>
                <div class="inv-kpi-card-label">Utilidad Total</div>
              </div>
            </div>
          </div>
          
          <div class="inv-reports-last-update-desktop">
            <span class="inv-last-update-icon">🕐</span>
            <span>Última actualización: ${ultimaActualizacion}</span>
          </div>
          
          <!-- Grid de Reportes -->
          <div class="inv-reports-grid-desktop">
            <!-- Reportes Financieros -->
            <div class="inv-report-section-desktop">
              <div class="inv-report-section-header">
                <h3 class="inv-report-section-title">💵 Reportes Financieros</h3>
              </div>
              <div class="inv-report-cards-desktop">
                ${renderReportCardDesktop('utilidades', '💰', 'Reporte de Utilidades', 'Análisis detallado de ganancias, márgenes y rentabilidad por producto', 'success')}
                ${renderReportCardDesktop('ventasMes', '📊', 'Ventas del Mes', 'Resumen mensual completo con gráficos y comparativas', 'primary')}
              </div>
            </div>
            
            <!-- Reportes de Inventario -->
            <div class="inv-report-section-desktop">
              <div class="inv-report-section-header">
                <h3 class="inv-report-section-title">📦 Reportes de Inventario</h3>
              </div>
              <div class="inv-report-cards-desktop">
                ${renderReportCardDesktop('stockBajo', '⚠️', 'Productos con Stock Bajo', `${stockBajo} productos requieren reposición inmediata`, 'warning')}
                ${renderReportCardDesktop('rotacion', '🔄', 'Rotación de Inventario', 'Análisis de productos más y menos vendidos con sugerencias', 'info')}
                ${renderReportCardDesktop('valorInventario', '💎', 'Valor del Inventario', 'Valuación total del inventario actual por categorías', 'success')}
              </div>
            </div>
            
            <!-- Reportes de Análisis -->
            <div class="inv-report-section-desktop">
              <div class="inv-report-section-header">
                <h3 class="inv-report-section-title">📈 Análisis y Tendencias</h3>
              </div>
              <div class="inv-report-cards-desktop">
                ${renderReportCardDesktop('proveedores', '🏭', 'Ranking de Proveedores', 'Análisis de compras y desempeño por proveedor', 'info')}
                ${renderReportCardDesktop('categorias', '🏷️', 'Análisis por Categoría', 'Ventas y rentabilidad segmentada por categorías', 'primary')}
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
  } catch (error) {
    Logger.error("Error al cargar reportes:", error);
    showToast("Error al cargar reportes", "error");
  }
}

// Renderizar card móvil
function renderReportCardMobile(tipo, icon, title, description, variant) {
  const variantColors = {
    success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  };
  
  const onClick = `generarReporte('${tipo}')`;
  
  return `
    <div class="inv-report-card-mobile" onclick="${onClick}">
      <div class="inv-report-card-icon-mobile" style="background: ${variantColors[variant]};">
        ${icon}
      </div>
      <div class="inv-report-card-content-mobile">
        <h4 class="inv-report-card-title-mobile">${title}</h4>
        <p class="inv-report-card-description-mobile">${description}</p>
      </div>
      <div class="inv-report-card-action-mobile">
        <span class="inv-report-card-arrow">→</span>
      </div>
    </div>
  `;
}

// Renderizar card desktop
function renderReportCardDesktop(tipo, icon, title, description, variant) {
  const variantColors = {
    success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  };
  
  const onClick = `generarReporte('${tipo}')`;
  
  return `
    <div class="inv-report-card-desktop">
      <div class="inv-report-card-header-desktop">
        <div class="inv-report-card-icon-desktop" style="background: ${variantColors[variant]};">
          ${icon}
        </div>
        <div class="inv-report-card-info-desktop">
          <h4 class="inv-report-card-title-desktop">${title}</h4>
          <p class="inv-report-card-description-desktop">${description}</p>
        </div>
      </div>
      <div class="inv-report-card-actions-desktop">
        <button class="inv-btn inv-btn-secondary inv-btn-sm" onclick="showToast('Función en desarrollo', 'info')">
          👁️ Vista Previa
        </button>
        <button class="inv-btn inv-btn-primary inv-btn-sm" onclick="${onClick}">
          📊 Generar
        </button>
      </div>
    </div>
  `;
}

// Función unificada para generar reportes
async function generarReporte(tipo) {
  switch(tipo) {
    case 'utilidades':
      await generarReporteUtilidades();
      break;
    case 'rotacion':
      await generarReporteRotacion();
      break;
    case 'stockBajo':
      await generarReporteStockBajo();
      break;
    case 'ventasMes':
      await generarReporteVentasMes();
      break;
    case 'valorInventario':
      await generarReporteValorInventario();
      break;
    case 'proveedores':
      await generarReporteProveedores();
      break;
    case 'categorias':
      await generarReporteCategorias();
      break;
    default:
      showToast('Reporte no disponible', 'warning');
  }
}

// ========== VISTA: AUDITORÍA ==========
async function loadAuditoria(container) {
  showLoading(container, "Cargando auditoría...");
  
  try {
    const auditoria = await InventoryDB.obtenerAuditoria(100);
    const isMobile = window.innerWidth <= 768;
    
    if (auditoria.length === 0) {
      container.innerHTML = `
        <div class="inv-empty-state-${isMobile ? 'mobile' : 'desktop'}">
          <div style="font-size: 4rem; margin-bottom: 1rem;">📋</div>
          <h3>Sin registros de auditoría</h3>
          <p>No hay actividad registrada en el sistema</p>
        </div>
      `;
      return;
    }
    
    // Calcular estadísticas
    const stats = calcularEstadisticasAuditoria(auditoria);
    
    // Agrupar por día
    const auditoriaAgrupada = agruparAuditoriaPorDia(auditoria);
    
    const ahora = new Date();
    const ultimaActualizacion = ahora.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    if (isMobile) {
      // ========== VISTA MÓVIL ==========
      container.innerHTML = `
        <div class="inv-audit-mobile">
          <!-- Header -->
          <div class="inv-audit-header-mobile">
            <div class="inv-audit-welcome">
              <h2 class="inv-audit-title">📋 Registro de Auditoría</h2>
              <p class="inv-audit-subtitle">Historial de actividad del sistema</p>
            </div>
            
            <!-- Métricas rápidas -->
            <div class="inv-audit-stats-mobile">
              <div class="inv-audit-stat-card">
                <span class="inv-audit-stat-icon">📝</span>
                <div>
                  <div class="inv-audit-stat-value">${stats.totalAcciones}</div>
                  <div class="inv-audit-stat-label">Acciones</div>
                </div>
              </div>
              <div class="inv-audit-stat-card">
                <span class="inv-audit-stat-icon" style="color: var(--inv-success);">✅</span>
                <div>
                  <div class="inv-audit-stat-value">${stats.hoy}</div>
                  <div class="inv-audit-stat-label">Hoy</div>
                </div>
              </div>
              <div class="inv-audit-stat-card">
                <span class="inv-audit-stat-icon" style="color: var(--inv-primary);">📊</span>
                <div>
                  <div class="inv-audit-stat-value">${stats.entidades}</div>
                  <div class="inv-audit-stat-label">Entidades</div>
                </div>
              </div>
            </div>
            
            <!-- Filtros rápidos -->
            <div class="inv-audit-filters-mobile">
              <button class="inv-filter-chip active" onclick="filtrarAuditoria('todos')">
                🔍 Todos
              </button>
              <button class="inv-filter-chip" onclick="filtrarAuditoria('CREATE')">
                ➕ Crear
              </button>
              <button class="inv-filter-chip" onclick="filtrarAuditoria('UPDATE')">
                ✏️ Editar
              </button>
              <button class="inv-filter-chip" onclick="filtrarAuditoria('DELETE')">
                🗑️ Eliminar
              </button>
            </div>
            
            <div class="inv-audit-last-update">
              <span class="inv-last-update-icon">🕐</span>
              <span class="inv-last-update-text">Actualizado: ${ultimaActualizacion}</span>
            </div>
          </div>
          
          <!-- Timeline de eventos -->
          <div class="inv-audit-timeline-mobile" id="auditTimelineMobile">
            ${Object.entries(auditoriaAgrupada).map(([fecha, eventos]) => 
              renderTimelineDiaMobile(fecha, eventos)
            ).join('')}
          </div>
        </div>
      `;
    } else {
      // ========== VISTA DESKTOP ==========
      container.innerHTML = `
        <div class="inv-audit-desktop">
          <!-- Header -->
          <div class="inv-audit-header-desktop">
            <div class="inv-audit-welcome-desktop">
              <h2 class="inv-audit-title-desktop">📋 Registro de Auditoría del Sistema</h2>
              <p class="inv-audit-subtitle-desktop">Trazabilidad completa de todas las operaciones y cambios realizados</p>
            </div>
            
            <div class="inv-audit-actions-desktop">
              <button class="inv-btn inv-btn-secondary" onclick="exportarAuditoria()">
                📥 Exportar
              </button>
              <button class="inv-btn inv-btn-primary" onclick="location.reload()">
                🔄 Actualizar
              </button>
            </div>
          </div>
          
          <!-- KPIs -->
          <div class="inv-audit-kpis-desktop">
            <div class="inv-audit-kpi-card" style="--kpi-color: #667eea;">
              <div class="inv-audit-kpi-icon">📝</div>
              <div class="inv-audit-kpi-content">
                <div class="inv-audit-kpi-value">${stats.totalAcciones}</div>
                <div class="inv-audit-kpi-label">Total Acciones</div>
              </div>
            </div>
            
            <div class="inv-audit-kpi-card" style="--kpi-color: #10b981;">
              <div class="inv-audit-kpi-icon">✅</div>
              <div class="inv-audit-kpi-content">
                <div class="inv-audit-kpi-value">${stats.hoy}</div>
                <div class="inv-audit-kpi-label">Actividad Hoy</div>
              </div>
            </div>
            
            <div class="inv-audit-kpi-card" style="--kpi-color: #f59e0b;">
              <div class="inv-audit-kpi-icon">📊</div>
              <div class="inv-audit-kpi-content">
                <div class="inv-audit-kpi-value">${stats.entidades}</div>
                <div class="inv-audit-kpi-label">Entidades Diferentes</div>
              </div>
            </div>
            
            <div class="inv-audit-kpi-card" style="--kpi-color: #3b82f6;">
              <div class="inv-audit-kpi-icon">🔄</div>
              <div class="inv-audit-kpi-content">
                <div class="inv-audit-kpi-value">${stats.ultimaSemana}</div>
                <div class="inv-audit-kpi-label">Última Semana</div>
              </div>
            </div>
          </div>
          
          <!-- Filtros -->
          <div class="inv-audit-filters-desktop">
            <div class="inv-filter-group">
              <button class="inv-filter-btn active" onclick="filtrarAuditoria('todos')">
                🔍 Todas las Acciones
              </button>
              <button class="inv-filter-btn" onclick="filtrarAuditoria('CREATE')">
                ➕ Creaciones
              </button>
              <button class="inv-filter-btn" onclick="filtrarAuditoria('UPDATE')">
                ✏️ Actualizaciones
              </button>
              <button class="inv-filter-btn" onclick="filtrarAuditoria('DELETE')">
                🗑️ Eliminaciones
              </button>
              <button class="inv-filter-btn" onclick="filtrarAuditoria('SCAN')">
                📷 Escaneos
              </button>
            </div>
            
            <div class="inv-audit-info">
              <span class="inv-last-update-icon">🕐</span>
              <span>Última actualización: ${ultimaActualizacion}</span>
            </div>
          </div>
          
          <!-- Timeline de eventos -->
          <div class="inv-audit-timeline-desktop" id="auditTimelineDesktop">
            ${Object.entries(auditoriaAgrupada).map(([fecha, eventos]) => 
              renderTimelineDiaDesktop(fecha, eventos)
            ).join('')}
          </div>
        </div>
      `;
    }
    
  } catch (error) {
    Logger.error("Error al cargar auditoría:", error);
    showToast("Error al cargar auditoría", "error");
  }
}

// Funciones auxiliares de auditoría
function calcularEstadisticasAuditoria(auditoria) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  const haceSemana = new Date();
  haceSemana.setDate(haceSemana.getDate() - 7);
  
  const entidadesUnicas = new Set(auditoria.map(a => a.entidad));
  
  return {
    totalAcciones: auditoria.length,
    hoy: auditoria.filter(a => new Date(a.created_at) >= hoy).length,
    ultimaSemana: auditoria.filter(a => new Date(a.created_at) >= haceSemana).length,
    entidades: entidadesUnicas.size
  };
}

function agruparAuditoriaPorDia(auditoria) {
  const grupos = {};
  
  auditoria.forEach(registro => {
    const fecha = new Date(registro.created_at);
    const fechaKey = fecha.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (!grupos[fechaKey]) {
      grupos[fechaKey] = [];
    }
    grupos[fechaKey].push(registro);
  });
  
  return grupos;
}

function getAuditActionIcon(accion) {
  const icons = {
    'CREATE': '➕',
    'UPDATE': '✏️',
    'DELETE': '🗑️',
    'SCAN': '📷',
    'SELL': '💰',
    'ASSOCIATE': '🔗',
    'LOGIN': '🔐',
    'LOGOUT': '👋'
  };
  return icons[accion] || '📝';
}

function getAuditActionColor(accion) {
  const colors = {
    'CREATE': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'UPDATE': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    'DELETE': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    'SCAN': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'SELL': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    'ASSOCIATE': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    'LOGIN': 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    'LOGOUT': 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
  };
  return colors[accion] || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
}

function getAuditActionLabel(accion) {
  const labels = {
    'CREATE': 'Creación',
    'UPDATE': 'Actualización',
    'DELETE': 'Eliminación',
    'SCAN': 'Escaneo',
    'SELL': 'Venta',
    'ASSOCIATE': 'Asociación',
    'LOGIN': 'Inicio de sesión',
    'LOGOUT': 'Cierre de sesión'
  };
  return labels[accion] || accion;
}

function getEntityIcon(entidad) {
  const icons = {
    'producto': '📦',
    'productos': '📦',
    'venta': '💰',
    'ventas': '💰',
    'proveedor': '🏭',
    'proveedores': '🏭',
    'codigo_barras': '🏷️',
    'codigos_barras': '🏷️',
    'usuario': '👤',
    'usuarios': '👤'
  };
  return icons[entidad?.toLowerCase()] || '📄';
}

function renderTimelineDiaMobile(fecha, eventos) {
  const esHoy = fecha.includes(new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }));
  
  return `
    <div class="inv-audit-day-group-mobile">
      <div class="inv-audit-day-header-mobile">
        <span class="inv-audit-day-badge ${esHoy ? 'today' : ''}">${esHoy ? '📍 ' : ''}${fecha}</span>
        <span class="inv-audit-day-count">${eventos.length} eventos</span>
      </div>
      
      <div class="inv-audit-events-mobile">
        ${eventos.map(evento => `
          <div class="inv-audit-event-card-mobile" data-action="${evento.accion}">
            <div class="inv-audit-event-icon-mobile" style="background: ${getAuditActionColor(evento.accion)};">
              ${getAuditActionIcon(evento.accion)}
            </div>
            <div class="inv-audit-event-content-mobile">
              <div class="inv-audit-event-header-mobile">
                <span class="inv-audit-event-title">${getAuditActionLabel(evento.accion)}</span>
                <span class="inv-audit-event-time">${new Date(evento.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div class="inv-audit-event-entity">
                ${getEntityIcon(evento.entidad)} ${evento.entidad}
                ${evento.entidad_id ? `<span class="inv-audit-event-id">#${evento.entidad_id}</span>` : ''}
              </div>
              ${evento.detalles && Object.keys(evento.detalles).length > 0 ? `
                <div class="inv-audit-event-details">
                  ${formatearDetallesAuditoria(evento.detalles)}
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTimelineDiaDesktop(fecha, eventos) {
  const esHoy = fecha.includes(new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }));
  
  return `
    <div class="inv-audit-day-group-desktop">
      <div class="inv-audit-day-header-desktop">
        <span class="inv-audit-day-badge-desktop ${esHoy ? 'today' : ''}">${esHoy ? '📍 ' : ''}${fecha}</span>
        <div class="inv-audit-day-line"></div>
        <span class="inv-audit-day-count-desktop">${eventos.length} eventos registrados</span>
      </div>
      
      <div class="inv-audit-events-grid-desktop">
        ${eventos.map(evento => `
          <div class="inv-audit-event-card-desktop" data-action="${evento.accion}">
            <div class="inv-audit-event-header-desktop">
              <div class="inv-audit-event-icon-desktop" style="background: ${getAuditActionColor(evento.accion)};">
                ${getAuditActionIcon(evento.accion)}
              </div>
              <div class="inv-audit-event-info">
                <div class="inv-audit-event-title-desktop">${getAuditActionLabel(evento.accion)}</div>
                <div class="inv-audit-event-meta">
                  ${getEntityIcon(evento.entidad)} ${evento.entidad}
                  ${evento.entidad_id ? `<span class="inv-audit-event-id-desktop">#${evento.entidad_id}</span>` : ''}
                </div>
              </div>
              <div class="inv-audit-event-time-desktop">
                ${new Date(evento.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            ${evento.detalles && Object.keys(evento.detalles).length > 0 ? `
              <div class="inv-audit-event-details-desktop">
                ${formatearDetallesAuditoria(evento.detalles)}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function formatearDetallesAuditoria(detalles) {
  if (!detalles || typeof detalles !== 'object') return '';
  
  const entries = Object.entries(detalles);
  if (entries.length === 0) return '';
  
  return entries.map(([key, value]) => {
    let displayValue = value;
    if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    } else if (typeof value === 'string' && value.length > 50) {
      displayValue = value.substring(0, 47) + '...';
    }
    
    return `<div class="inv-audit-detail-item">
      <span class="inv-audit-detail-key">${key}:</span>
      <span class="inv-audit-detail-value">${displayValue}</span>
    </div>`;
  }).join('');
}

function filtrarAuditoria(tipo) {
  // Actualizar botones activos
  document.querySelectorAll('.inv-filter-chip, .inv-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  // Filtrar eventos
  const eventos = document.querySelectorAll('[data-action]');
  eventos.forEach(evento => {
    if (tipo === 'todos') {
      evento.style.display = '';
    } else {
      if (evento.dataset.action === tipo) {
        evento.style.display = '';
      } else {
        evento.style.display = 'none';
      }
    }
  });
  
  // Ocultar días sin eventos visibles
  const grupos = document.querySelectorAll('.inv-audit-day-group-mobile, .inv-audit-day-group-desktop');
  grupos.forEach(grupo => {
    const eventosVisibles = Array.from(grupo.querySelectorAll('[data-action]')).filter(e => e.style.display !== 'none');
    if (eventosVisibles.length === 0) {
      grupo.style.display = 'none';
    } else {
      grupo.style.display = '';
    }
  });
}

function exportarAuditoria() {
  showToast('Función de exportación en desarrollo', 'info');
}

// ========== FUNCIONES DE PRODUCTOS ==========
async function openNewProduct() {
  // Cargar proveedores
  const proveedores = await InventoryDB.obtenerTodosProveedores();
  
  showModal("➕ Nuevo Producto", `
    <form id="formNewProduct" class="form-vertical">
      <div class="inv-alert inv-alert-info" style="margin-bottom: 1rem;">
        <strong>ℹ️ Flujo de registro:</strong><br>
        1. Registra primero la información del producto<br>
        2. Luego podrás escanear códigos de barras para asociarlos<br>
        3. El stock aumentará automáticamente con cada código escaneado
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Nombre del Producto *</label>
          <input type="text" name="nombre" required class="form-input" placeholder="Ej: Camisa Polo Azul">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Categoría</label>
          <input type="text" name="categoria" class="form-input" list="categorias" placeholder="Ej: Ropa">
          <datalist id="categorias">
            <option value="Electrónica">
            <option value="Hogar">
            <option value="Ropa">
            <option value="Alimentos">
            <option value="Accesorios">
            <option value="Calzado">
          </datalist>
        </div>
        <div class="form-group">
          <label>Marca</label>
          <input type="text" name="marca" class="form-input" placeholder="Ej: Nike">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Stock Mínimo Alerta</label>
          <input type="number" name="stock_minimo" min="0" step="1" class="form-input" value="5" placeholder="Cantidad mínima antes de alertar">
          <small style="color: var(--gray-600); font-size: 0.875rem;">Se te notificará cuando el stock sea menor a este valor</small>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Costo Unitario *</label>
          <input type="number" name="costo_unitario_base" required min="0" step="0.01" class="form-input" placeholder="0.00">
          <small style="color: var(--gray-600); font-size: 0.875rem;">Costo por unidad del producto</small>
        </div>
        <div class="form-group">
          <label>Gastos Asociados</label>
          <input type="number" name="gastos_asociados_base" min="0" step="0.01" class="form-input" value="0" placeholder="0.00">
          <small style="color: var(--gray-600); font-size: 0.875rem;">Envío, comisiones, impuestos, etc.</small>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Margen de Ganancia (%) *</label>
          <input type="number" name="margen_sugerido_pct" required min="0" step="0.01" class="form-input" value="30" placeholder="30">
          <small style="color: var(--gray-600); font-size: 0.875rem;">Porcentaje de ganancia sobre el costo total</small>
        </div>
        <div class="form-group">
          <label>Precio de Venta Sugerido</label>
          <input type="number" id="precioCalculado" readonly class="form-input" style="background: var(--gray-100); font-weight: 600; color: var(--success);" placeholder="Se calculará automáticamente">
          <small style="color: var(--gray-600); font-size: 0.875rem;">Precio calculado incluyendo margen</small>
        </div>
      </div>
      
      <div class="form-group">
        <label>Proveedor Principal</label>
        <select name="proveedor_principal_id" class="form-input">
          <option value="">Sin proveedor</option>
          ${proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
        </select>
      </div>
      
      <div class="form-group">
        <label>Ubicación en Bodega</label>
        <input type="text" name="ubicacion" class="form-input" placeholder="Ej: Bodega A - Estante 3 - Nivel 2">
      </div>
    </form>
  `, `
    <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="submit" form="formNewProduct" class="btn-primary">✅ Crear Producto</button>
  `);
  
  // Auto-calcular precio
  const form = document.getElementById("formNewProduct");
  const calcularPrecio = () => {
    const costo = parseFloat(form.costo_unitario_base.value) || 0;
    const gastos = parseFloat(form.gastos_asociados_base.value) || 0;
    const margen = parseFloat(form.margen_sugerido_pct.value) || 0;
    const precioSugerido = (costo + gastos) * (1 + margen / 100);
    document.getElementById("precioCalculado").value = precioSugerido.toFixed(2);
  };
  
  form.costo_unitario_base.addEventListener("input", calcularPrecio);
  form.gastos_asociados_base.addEventListener("input", calcularPrecio);
  form.margen_sugerido_pct.addEventListener("input", calcularPrecio);
  
  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Convertir números
    data.stock_actual = 0; // Inicia en 0, se incrementará al asociar códigos
    data.stock_minimo = parseFloat(data.stock_minimo) || 0;
    data.costo_unitario_base = parseFloat(data.costo_unitario_base);
    data.gastos_asociados_base = parseFloat(data.gastos_asociados_base) || 0;
    data.margen_sugerido_pct = parseFloat(data.margen_sugerido_pct);
    data.proveedor_principal_id = data.proveedor_principal_id ? parseInt(data.proveedor_principal_id) : null;
    
    const result = await InventoryDB.crearProducto(data);
    
    if (result.success) {
      showToast("✅ Producto creado exitosamente", "success");
      hideModal();
      
      // Preguntar si desea comenzar a escanear códigos de barras
      setTimeout(() => {
        if (confirm(`¿Deseas comenzar a escanear códigos de barras para "${data.nombre}"?\n\nCada código escaneado aumentará el stock en 1 unidad.`)) {
          viewProducto(result.data.id);
        } else {
          loadProductos(document.getElementById("viewProductos"));
        }
      }, 500);
    } else {
      showToast("Error: " + result.error, "error");
    }
  });
}

// ========== FUNCIONES DE VENTAS ==========
async function openQuickSale() {
  carritoVenta = [];
  
  showModal("💰 Nueva Venta", `
    <div class="venta-quick-container">
      <div class="venta-scanner-section">
        <button class="btn-primary btn-large" onclick="scannerMode='venta'; openScanner()">
          📷 Escanear Producto
        </button>
        <p style="text-align: center; margin-top: 1rem; opacity: 0.8; position: relative; z-index: 1;">
          o busca manualmente
        </p>
        <input type="search" id="searchProductoVenta" placeholder="Buscar por nombre o SKU..." class="form-input">
        <div id="searchResultsVenta" class="search-results"></div>
      </div>
      
      <div class="venta-carrito-section">
        <h4>Carrito de Ventas</h4>
        <div id="carritoVentaContainer"></div>
        
        <div class="venta-totales">
          <div class="venta-total-row">
            <span>Subtotal</span>
            <span id="ventaSubtotal">$0</span>
          </div>
          <div class="venta-total-row venta-total-main">
            <span>Total a Pagar</span>
            <span id="ventaTotal">$0</span>
          </div>
        </div>
        
        <div class="form-group">
          <label>💳 Método de Pago</label>
          <select id="ventaMetodoPago" class="form-input">
            <option value="efectivo">💵 Efectivo</option>
            <option value="transferencia">🏦 Transferencia Bancaria</option>
            <option value="nequi">📱 Nequi</option>
            <option value="datafono">💳 Datáfono</option>
            <option value="daviplata">💰 Daviplata</option>
            <option value="bancolombia">🏛️ Bancolombia</option>
            <option value="pse">🔗 PSE</option>
            <option value="tarjeta_credito">💳 Tarjeta de Crédito</option>
            <option value="tarjeta_debito">💳 Tarjeta de Débito</option>
            <option value="credito_propio">🏷️ Crédito Propio</option>
            <option value="inversiones_mg">💼 Inversiones MG</option>
            <option value="consignacion">🏧 Consignación</option>
            <option value="intercambio">🔄 Intercambio</option>
          </select>
        </div>
      </div>
    </div>
  `, `
    <button type="button" class="btn-secondary" onclick="hideModal()">
      <span style="margin-right: 0.5rem;">❌</span>
      Cancelar
    </button>
    <button type="button" class="btn-primary" onclick="confirmarVenta()" id="btnConfirmarVenta" disabled>
      <span style="margin-right: 0.5rem;">✅</span>
      Confirmar Venta
    </button>
  `);
  
  // Renderizar carrito vacío (ahora que el modal ya está en el DOM)
  renderCarritoVenta();
  
  // Búsqueda de productos con mejor UX
  const searchInput = document.getElementById("searchProductoVenta");
  const resultsContainer = document.getElementById("searchResultsVenta");
  
  // Agregar animación de focus al input
  searchInput.addEventListener("focus", () => {
    searchInput.style.transform = "scale(1.02)";
  });
  
  searchInput.addEventListener("blur", () => {
    searchInput.style.transform = "scale(1)";
  });
  
  let searchTimeout;
  searchInput.addEventListener("input", async (e) => {
    const query = e.target.value.toLowerCase();
    
    // Debounce para mejor performance
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      return;
    }
    
    // Mostrar indicador de carga
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 1rem; color: rgba(255,255,255,0.7);">🔍 Buscando...</div>';
    
    searchTimeout = setTimeout(async () => {
      try {
        const productos = await InventoryDB.obtenerTodosProductos({ activo: true });
        const filtered = productos.filter(p => 
          p.nombre?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query)
        ).slice(0, 5);
        
        if (filtered.length === 0) {
          resultsContainer.innerHTML = '<div style="text-align: center; padding: 1rem; color: rgba(255,255,255,0.7);">📭 Sin resultados</div>';
          return;
        }
        
        resultsContainer.innerHTML = filtered.map((p, index) => `
          <div class="search-result-item" onclick="agregarAlCarritoVenta(${JSON.stringify(p).replace(/"/g, '&quot;')})" style="animation-delay: ${index * 0.1}s">
            <strong>${p.nombre}</strong>
            <span>SKU: ${p.sku} | Stock: ${p.stock_actual} unidades</span>
            <span style="font-weight: 600; color: var(--inv-primary);">${formatCurrency(p.precio_sugerido)}</span>
          </div>
        `).join('');
      } catch (error) {
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 1rem; color: rgba(255,255,255,0.7);">❌ Error en búsqueda</div>';
      }
    }, 300);
  });
}

function agregarAlCarritoVenta(producto) {
  const existing = carritoVenta.find(item => item.producto_id === producto.id);
  
  if (existing) {
    if (existing.cantidad >= producto.stock_actual) {
      showToast(`⚠️ Stock máximo alcanzado (${producto.stock_actual} unidades)`, "warning");
      return;
    }
    existing.cantidad++;
    showToast(`📈 ${producto.nombre} aumentado a ${existing.cantidad} unidades`, "success");
  } else {
    carritoVenta.push({
      producto_id: producto.id,
      nombre: producto.nombre,
      sku: producto.sku,
      precio_sugerido: producto.precio_sugerido,
      precio_real: producto.precio_sugerido,
      costo: producto.costo_unitario_base,
      cantidad: 1,
      stock_disponible: producto.stock_actual,
    });
    showToast(`✅ ${producto.nombre} agregado al carrito`, "success");
  }
  
  // Limpiar búsqueda
  const searchInput = document.getElementById("searchProductoVenta");
  const resultsContainer = document.getElementById("searchResultsVenta");
  if (searchInput) searchInput.value = '';
  if (resultsContainer) resultsContainer.innerHTML = '';
  
  renderCarritoVenta();
  vibrate([50, 30, 50]); // Patrón de vibración para feedback táctil
  
  // Animación del botón de confirmación
  const btnConfirmar = document.getElementById("btnConfirmarVenta");
  if (btnConfirmar) {
    btnConfirmar.style.transform = 'scale(1.05)';
    setTimeout(() => {
      btnConfirmar.style.transform = 'scale(1)';
    }, 200);
  }
}

function renderCarritoVenta() {
  const container = document.getElementById("carritoVentaContainer");
  const btnConfirmar = document.getElementById("btnConfirmarVenta");
  
  // Verificación de seguridad
  if (!container) {
    console.warn("carritoVentaContainer no encontrado en el DOM");
    return;
  }
  
  if (carritoVenta.length === 0) {
    container.innerHTML = '<p>El carrito está vacío<br>¡Agrega productos para comenzar!</p>';
    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.style.opacity = '0.6';
      btnConfirmar.style.transform = 'scale(0.95)';
    }
    return;
  }
  
  container.innerHTML = carritoVenta.map((item, index) => `
    <div class="carrito-item" data-index="${index}">
      <div class="carrito-item-info">
        <strong>${item.nombre}</strong>
        <small>${item.sku}</small>
      </div>
      
      <div class="carrito-item-controls">
        <div class="carrito-cantidad-section">
          <button class="btn-icon-sm" onclick="cambiarCantidadCarrito(${index}, -1)" title="Reducir cantidad">
            <span style="line-height: 1;">−</span>
          </button>
          <input type="number" 
                 value="${item.cantidad}" 
                 min="1" 
                 max="${item.stock_disponible}" 
                 onchange="actualizarCantidadCarrito(${index}, this.value)" 
                 class="carrito-cantidad-input"
                 title="Cantidad">
          <button class="btn-icon-sm" onclick="cambiarCantidadCarrito(${index}, 1)" title="Aumentar cantidad">
            <span style="line-height: 1;">+</span>
          </button>
        </div>
        
        <div class="carrito-stock-info" style="font-size: 0.75rem; color: var(--inv-text-tertiary); text-align: center;">
          Stock: ${item.stock_disponible}
        </div>
      </div>
      
      <div class="carrito-item-price">
        <input type="number" 
               value="${item.precio_real}" 
               step="0.01" 
               min="0"
               onchange="actualizarPrecioCarrito(${index}, this.value)" 
               class="carrito-precio-input"
               placeholder="Precio unitario"
               title="Precio unitario">
        <button class="btn-icon-sm btn-danger" 
                onclick="eliminarDeCarrito(${index})" 
                title="Eliminar producto">
          🗑️
        </button>
      </div>
      
      <div class="carrito-item-subtotal" style="text-align: right; margin-top: var(--inv-space-2); font-weight: 600; color: var(--inv-primary);">
        Subtotal: ${formatCurrency(item.precio_real * item.cantidad)}
      </div>
    </div>
  `).join('');
  
  // Animar entrada de items
  setTimeout(() => {
    const items = container.querySelectorAll('.carrito-item');
    items.forEach((item, index) => {
      item.style.animationDelay = `${index * 0.1}s`;
    });
  }, 10);
  
  actualizarTotalesVenta();
  
  if (btnConfirmar) {
    btnConfirmar.disabled = false;
    btnConfirmar.style.opacity = '1';
    btnConfirmar.style.transform = 'scale(1)';
    
    // Agregar efecto de pulso sutil al botón cuando hay items
    btnConfirmar.style.animation = 'pulse 2s infinite';
  }
}

function cambiarCantidadCarrito(index, delta) {
  const item = carritoVenta[index];
  const nuevaCantidad = item.cantidad + delta;
  
  if (nuevaCantidad <= 0) {
    // Si la cantidad llega a 0, confirmar eliminación
    if (confirm(`¿Eliminar "${item.nombre}" del carrito?`)) {
      eliminarDeCarrito(index);
    }
    return;
  }
  
  if (nuevaCantidad > item.stock_disponible) {
    showToast(`⚠️ Stock insuficiente. Máximo: ${item.stock_disponible} unidades`, "warning");
    vibrate([100, 50, 100]);
    
    // Animación de "shake" para indicar error
    const itemElement = document.querySelector(`[data-index="${index}"]`);
    if (itemElement) {
      itemElement.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => {
        itemElement.style.animation = '';
      }, 500);
    }
    return;
  }
  
  item.cantidad = nuevaCantidad;
  renderCarritoVenta();
  vibrate(50); // Vibración suave para feedback
  
  // Mostrar toast solo para cambios significativos
  if (Math.abs(delta) > 1 || nuevaCantidad % 5 === 0) {
    showToast(`📊 ${item.nombre}: ${nuevaCantidad} unidades`, "info");
  }
}

function actualizarCantidadCarrito(index, valor) {
  const cantidad = parseInt(valor);
  const item = carritoVenta[index];
  
  if (isNaN(cantidad) || cantidad < 1) {
    showToast("⚠️ Cantidad debe ser mayor a 0", "warning");
    renderCarritoVenta();
    return;
  }
  
  if (cantidad > item.stock_disponible) {
    showToast(`⚠️ Stock insuficiente. Máximo: ${item.stock_disponible} unidades`, "warning");
    renderCarritoVenta();
    return;
  }
  
  const cantidadAnterior = item.cantidad;
  item.cantidad = cantidad;
  
  renderCarritoVenta();
  
  if (cantidad !== cantidadAnterior) {
    vibrate(30);
    showToast(`📊 Cantidad actualizada: ${cantidad} unidades`, "success");
  }
}

function actualizarPrecioCarrito(index, valor) {
  const precio = parseFloat(valor);
  const item = carritoVenta[index];
  
  if (isNaN(precio) || precio < 0) {
    showToast("⚠️ Precio debe ser mayor o igual a 0", "warning");
    renderCarritoVenta();
    return;
  }
  
  const precioAnterior = item.precio_real;
  item.precio_real = precio;
  
  actualizarTotalesVenta();
  
  // Actualizar solo el subtotal del item sin renderizar todo
  const itemElement = document.querySelector(`[data-index="${index}"] .carrito-item-subtotal`);
  if (itemElement) {
    itemElement.textContent = `Subtotal: ${formatCurrency(precio * item.cantidad)}`;
    
    // Animación para destacar el cambio
    itemElement.style.background = 'var(--inv-success-light)';
    itemElement.style.borderRadius = 'var(--inv-radius-md)';
    itemElement.style.padding = '0.25rem 0.5rem';
    
    setTimeout(() => {
      itemElement.style.background = '';
      itemElement.style.borderRadius = '';
      itemElement.style.padding = '';
    }, 1000);
  }
  
  if (precio !== precioAnterior) {
    vibrate(30);
    const diferencia = precio - precioAnterior;
    const icono = diferencia > 0 ? '📈' : '📉';
    showToast(`${icono} Precio actualizado: ${formatCurrency(precio)}`, "info");
  }
}

function eliminarDeCarrito(index) {
  const item = carritoVenta[index];
  const itemElement = document.querySelector(`[data-index="${index}"]`);
  
  // Animación de salida
  if (itemElement) {
    itemElement.style.transform = 'translateX(-100%)';
    itemElement.style.opacity = '0';
    itemElement.style.transition = 'all 0.3s ease-out';
  }
  
  setTimeout(() => {
    carritoVenta.splice(index, 1);
    renderCarritoVenta();
    showToast(`🗑️ "${item.nombre}" eliminado del carrito`, "info");
    vibrate(100);
  }, 300);
}

function actualizarTotalesVenta() {
  const subtotal = carritoVenta.reduce((sum, item) => sum + (item.precio_real * item.cantidad), 0);
  
  const subtotalElement = document.getElementById("ventaSubtotal");
  const totalElement = document.getElementById("ventaTotal");
  
  if (subtotalElement && totalElement) {
    // Animación de actualización de números
    const oldSubtotal = subtotalElement.textContent;
    const oldTotal = totalElement.textContent;
    
    const newSubtotalText = formatCurrency(subtotal);
    const newTotalText = formatCurrency(subtotal);
    
    if (oldSubtotal !== newSubtotalText) {
      // Efecto de "flip" para los números
      subtotalElement.style.transform = 'rotateX(90deg)';
      totalElement.style.transform = 'rotateX(90deg)';
      
      setTimeout(() => {
        subtotalElement.textContent = newSubtotalText;
        totalElement.textContent = newTotalText;
        
        subtotalElement.style.transform = 'rotateX(0deg)';
        totalElement.style.transform = 'rotateX(0deg)';
      }, 150);
      
      // Agregar clase temporal para destacar el cambio
      const totalesContainer = document.querySelector('.venta-totales');
      if (totalesContainer) {
        totalesContainer.style.animation = 'pulse 0.6s ease-out';
        setTimeout(() => {
          totalesContainer.style.animation = '';
        }, 600);
      }
    }
  }
  
  // Actualizar contador de items en el título del carrito
  const carritoTitle = document.querySelector('.venta-carrito-section h4');
  if (carritoTitle) {
    const totalItems = carritoVenta.reduce((sum, item) => sum + item.cantidad, 0);
    const baseTitle = "Carrito de Ventas";
    if (totalItems > 0) {
      carritoTitle.innerHTML = `🛒 ${baseTitle} <span style="background: var(--inv-primary); color: white; padding: 0.25rem 0.5rem; border-radius: var(--inv-radius-full); font-size: 0.8rem; margin-left: 0.5rem;">${totalItems}</span>`;
    } else {
      carritoTitle.innerHTML = `🛒 ${baseTitle}`;
    }
  }
}

async function confirmarVenta() {
  if (carritoVenta.length === 0) {
    showToast("El carrito está vacío", "warning");
    return;
  }
  
  const metodoPago = document.getElementById("ventaMetodoPago").value;
  
  // Preparar datos de venta
  const subtotal = carritoVenta.reduce((sum, item) => sum + (item.precio_real * item.cantidad), 0);
  const utilidad = carritoVenta.reduce((sum, item) => 
    sum + ((item.precio_real - item.costo) * item.cantidad), 0);
  
  const ventaData = {
    fecha: new Date().toISOString(),
    metodo_pago: metodoPago,
    subtotal,
    descuento: 0,
    total: subtotal,
    utilidad_total_real: utilidad,
  };
  
  const items = carritoVenta.map(item => ({
    producto_id: item.producto_id,
    cantidad: item.cantidad,
    precio_unitario_sugerido_en_el_momento: item.precio_sugerido,
    precio_unitario_real_vendido: item.precio_real,
    costo_unitario_en_el_momento: item.costo,
    utilidad_item_real: (item.precio_real - item.costo) * item.cantidad,
  }));
  
  // Registrar venta
  const result = await InventoryDB.registrarVenta(ventaData, items);
  
  if (result.success) {
    showToast("¡Venta registrada exitosamente!", "success");
    hideModal();
    if (currentView === "ventas") {
      loadVentas(document.getElementById("viewVentas"));
    }
  } else {
    showToast("Error: " + result.error, "error");
  }
}

// ========== FUNCIONES DE COMPRAS ==========
async function openNewCompra() {
  const proveedores = await InventoryDB.obtenerTodosProveedores();
  const productos = await InventoryDB.obtenerTodosProductos({ activo: true });
  
  let itemsCompra = [];
  
  showModal("🛒 Nueva Compra", `
    <div class="inv-new-purchase-modal">
      <form id="formNewCompra" class="inv-purchase-form">
        <!-- Información básica de la compra -->
        <div class="inv-purchase-form-section">
          <h3 class="inv-purchase-section-title">
            <span class="inv-purchase-section-icon">📋</span>
            <span>Información Básica</span>
          </h3>
          
          <div class="inv-purchase-form-grid">
            <div class="inv-form-group">
              <label class="inv-form-label">
                <span class="inv-form-label-icon">🏭</span>
                <span>Proveedor</span>
              </label>
              <select name="proveedor_id" class="inv-form-input inv-form-select">
                <option value="">Sin proveedor</option>
                ${proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
              </select>
            </div>
            
            <div class="inv-form-group">
              <label class="inv-form-label">
                <span class="inv-form-label-icon">📅</span>
                <span>Fecha *</span>
              </label>
              <input type="date" name="fecha" required class="inv-form-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
          </div>
          
          <div class="inv-purchase-form-grid">
            <div class="inv-form-group">
              <label class="inv-form-label">
                <span class="inv-form-label-icon">📄</span>
                <span>Referencia/Factura</span>
              </label>
              <input type="text" name="referencia" class="inv-form-input" placeholder="Número de factura o referencia">
            </div>
            
            <div class="inv-form-group">
              <label class="inv-form-label">
                <span class="inv-form-label-icon">💳</span>
                <span>Método de Pago</span>
              </label>
              <select name="metodo_pago" class="inv-form-input inv-form-select">
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">🏦 Transferencia</option>
                <option value="credito">💳 Crédito</option>
                <option value="cheque">📝 Cheque</option>
              </select>
            </div>
          </div>
        </div>
        
        <!-- Productos de la compra -->
        <div class="inv-purchase-form-section">
          <h3 class="inv-purchase-section-title">
            <span class="inv-purchase-section-icon">📦</span>
            <span>Productos</span>
          </h3>
          
          <div class="inv-product-selector-container">
            <div class="inv-form-group">
              <label class="inv-form-label">Agregar Producto</label>
              <div class="inv-product-selector">
                <select id="productoCompraSelect" class="inv-form-input inv-form-select">
                  <option value="">🔍 Seleccionar producto...</option>
                  ${productos.map(p => `<option value="${p.id}" data-name="${p.nombre}">${p.nombre} (${p.sku})</option>`).join('')}
                </select>
                <button type="button" class="inv-btn inv-btn-outline inv-btn-sm" onclick="openProductQuickAdd()">
                  ➕ Crear Producto
                </button>
              </div>
            </div>
          </div>
          
          <div class="inv-purchase-items-container">
            <div id="itemsCompraContainer" class="inv-purchase-items-list">
              <div class="inv-empty-items-state">
                <div class="inv-empty-items-icon">📦</div>
                <p class="inv-empty-items-text">No hay productos agregados</p>
                <p class="inv-empty-items-hint">Selecciona productos de la lista para agregar a la compra</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Totales y gastos -->
        <div class="inv-purchase-form-section">
          <h3 class="inv-purchase-section-title">
            <span class="inv-purchase-section-icon">💰</span>
            <span>Cálculo de Totales</span>
          </h3>
          
          <div class="inv-purchase-totals-container">
            <div class="inv-form-group">
              <label class="inv-form-label">
                <span class="inv-form-label-icon">🚚</span>
                <span>Gastos Adicionales</span>
              </label>
              <div class="inv-input-with-hint">
                <input type="number" id="gastosAdicionales" min="0" step="0.01" value="0" class="inv-form-input" placeholder="0.00">
                <span class="inv-input-hint">Envío, impuestos, otros gastos</span>
              </div>
            </div>
            
            <div class="inv-purchase-summary-card">
              <div class="inv-purchase-summary-row">
                <span class="inv-summary-label">Subtotal productos:</span>
                <span class="inv-summary-value" id="compraSubtotal">$0</span>
              </div>
              <div class="inv-purchase-summary-row">
                <span class="inv-summary-label">Gastos adicionales:</span>
                <span class="inv-summary-value" id="compraGastos">$0</span>
              </div>
              <div class="inv-purchase-summary-row inv-summary-total">
                <span class="inv-summary-label">Total a pagar:</span>
                <span class="inv-summary-value" id="compraTotal">$0</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">
      <span>❌</span>
      <span>Cancelar</span>
    </button>
    <button type="submit" form="formNewCompra" class="inv-btn inv-btn-success" id="btnGuardarCompra" disabled>
      <span>💾</span>
      <span>Guardar Compra</span>
    </button>
  `);
  
  // Agregar producto
  document.getElementById("productoCompraSelect").addEventListener("change", (e) => {
    const productoId = parseInt(e.target.value);
    if (!productoId) return;
    
    const option = e.target.selectedOptions[0];
    const nombreProducto = option.dataset.name;
    
    // Verificar si ya está agregado
    const yaExiste = itemsCompra.find(item => item.producto_id === productoId);
    if (yaExiste) {
      showToast("Este producto ya está agregado", "warning");
      e.target.value = "";
      return;
    }
    
    itemsCompra.push({
      producto_id: productoId,
      nombre: nombreProducto,
      cantidad: 1,
      costo_unitario: 0,
    });
    
    e.target.value = "";
    renderItemsCompra();
    
    // Animación de feedback
    const container = document.getElementById("itemsCompraContainer");
    container.style.transform = "scale(1.02)";
    setTimeout(() => {
      container.style.transform = "scale(1)";
    }, 200);
  });
  
  function renderItemsCompra() {
    const container = document.getElementById("itemsCompraContainer");
    
    if (itemsCompra.length === 0) {
      container.innerHTML = `
        <div class="inv-empty-items-state">
          <div class="inv-empty-items-icon">📦</div>
          <p class="inv-empty-items-text">No hay productos agregados</p>
          <p class="inv-empty-items-hint">Selecciona productos de la lista para agregar a la compra</p>
        </div>
      `;
      document.getElementById("btnGuardarCompra").disabled = true;
      return;
    }
    
    container.innerHTML = `
      <div class="inv-purchase-items-header">
        <span class="inv-items-count">${itemsCompra.length} producto${itemsCompra.length !== 1 ? 's' : ''}</span>
        <button type="button" class="inv-btn inv-btn-outline inv-btn-sm" onclick="clearAllItems()">
          🗑️ Limpiar todo
        </button>
      </div>
      
      <div class="inv-purchase-items-grid">
        ${itemsCompra.map((item, index) => `
          <div class="inv-purchase-item-card" data-index="${index}">
            <div class="inv-purchase-item-header">
              <div class="inv-purchase-item-name">
                <span class="inv-purchase-item-icon">📦</span>
                <span>${item.nombre}</span>
              </div>
              <button type="button" class="inv-btn-icon inv-btn-danger-soft" onclick="removeItem(${index})" title="Eliminar producto">
                🗑️
              </button>
            </div>
            
            <div class="inv-purchase-item-inputs">
              <div class="inv-input-group">
                <label class="inv-input-label">Cantidad</label>
                <div class="inv-quantity-input">
                  <button type="button" class="inv-quantity-btn" onclick="adjustQuantity(${index}, -1)">−</button>
                  <input type="number" 
                         value="${item.cantidad}" 
                         min="0.01" 
                         step="0.01"
                         class="inv-quantity-field"
                         onchange="updateQuantity(${index}, this.value)"
                         onblur="calcularTotalesCompra()">
                  <button type="button" class="inv-quantity-btn" onclick="adjustQuantity(${index}, 1)">+</button>
                </div>
              </div>
              
              <div class="inv-input-group">
                <label class="inv-input-label">Costo Unitario</label>
                <div class="inv-price-input">
                  <span class="inv-currency-symbol">$</span>
                  <input type="number" 
                         value="${item.costo_unitario}" 
                         min="0" 
                         step="0.01"
                         class="inv-price-field"
                         placeholder="0.00"
                         onchange="updateUnitCost(${index}, this.value)"
                         onblur="calcularTotalesCompra()">
                </div>
              </div>
            </div>
            
            <div class="inv-purchase-item-total">
              <span class="inv-item-total-label">Subtotal:</span>
              <span class="inv-item-total-amount">${formatCurrency(item.cantidad * item.costo_unitario)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    document.getElementById("btnGuardarCompra").disabled = false;
    calcularTotalesCompra();
  }
  
  // Funciones auxiliares para el manejo de items
  window.removeItem = function(index) {
    itemsCompra.splice(index, 1);
    renderItemsCompra();
    showToast("Producto eliminado", "info");
  };
  
  window.clearAllItems = function() {
    if (confirm("¿Estás seguro de que quieres eliminar todos los productos?")) {
      itemsCompra = [];
      renderItemsCompra();
      showToast("Todos los productos eliminados", "info");
    }
  };
  
  window.adjustQuantity = function(index, delta) {
    const newQuantity = Math.max(0.01, itemsCompra[index].cantidad + delta);
    itemsCompra[index].cantidad = newQuantity;
    document.querySelector(`[data-index="${index}"] .inv-quantity-field`).value = newQuantity;
    calcularTotalesCompra();
    updateItemSubtotal(index);
  };
  
  window.updateQuantity = function(index, value) {
    const quantity = Math.max(0.01, parseFloat(value) || 0.01);
    itemsCompra[index].cantidad = quantity;
    updateItemSubtotal(index);
  };
  
  window.updateUnitCost = function(index, value) {
    const cost = Math.max(0, parseFloat(value) || 0);
    itemsCompra[index].costo_unitario = cost;
    updateItemSubtotal(index);
  };
  
  function updateItemSubtotal(index) {
    const item = itemsCompra[index];
    const subtotal = item.cantidad * item.costo_unitario;
    const card = document.querySelector(`[data-index="${index}"]`);
    if (card) {
      const totalElement = card.querySelector('.inv-item-total-amount');
      if (totalElement) {
        totalElement.textContent = formatCurrency(subtotal);
      }
    }
    calcularTotalesCompra();
  }
  
  window.calcularTotalesCompra = function() {
    const subtotal = itemsCompra.reduce((sum, item) => sum + (item.cantidad * item.costo_unitario), 0);
    const gastosAdicionales = parseFloat(document.getElementById("gastosAdicionales").value) || 0;
    const total = subtotal + gastosAdicionales;
    
    document.getElementById("compraSubtotal").textContent = formatCurrency(subtotal);
    document.getElementById("compraGastos").textContent = formatCurrency(gastosAdicionales);
    document.getElementById("compraTotal").textContent = formatCurrency(total);
    
    // Actualizar el botón de guardar
    const btnGuardar = document.getElementById("btnGuardarCompra");
    if (btnGuardar) {
      if (total > 0 && itemsCompra.length > 0) {
        btnGuardar.disabled = false;
        btnGuardar.querySelector('span:last-child').textContent = `Guardar Compra (${formatCurrency(total)})`;
      } else {
        btnGuardar.disabled = true;
        btnGuardar.querySelector('span:last-child').textContent = 'Guardar Compra';
      }
    }
  };
  
  // Event listeners
  document.getElementById("gastosAdicionales").addEventListener("input", calcularTotalesCompra);
  
  // Función para crear producto rápido (placeholder)
  window.openProductQuickAdd = function() {
    showToast("Función de creación rápida en desarrollo", "info");
  };
  
  // Renderizado inicial
  renderItemsCompra();
  
  // Submit
  document.getElementById("formNewCompra").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (itemsCompra.length === 0) {
      showToast("Debes agregar al menos un item", "warning");
      return;
    }
    
    const formData = new FormData(e.target);
    const subtotal = itemsCompra.reduce((sum, item) => sum + (item.cantidad * item.costo_unitario), 0);
    const gastosTotal = parseFloat(document.getElementById("gastosAdicionales").value) || 0;
    
    // Prorratear gastos
    const gastoPorItem = gastosTotal / itemsCompra.length;
    
    const compraData = {
      proveedor_id: formData.get("proveedor_id") ? parseInt(formData.get("proveedor_id")) : null,
      fecha: formData.get("fecha"),
      referencia: formData.get("referencia"),
      metodo_pago: formData.get("metodo_pago"),
      subtotal,
      gastos_total: gastosTotal,
      total: subtotal + gastosTotal,
    };
    
    const items = itemsCompra.map(item => ({
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      costo_unitario_real: item.costo_unitario,
      gastos_prorrateados: gastoPorItem,
      costo_total_item: (item.cantidad * item.costo_unitario) + gastoPorItem,
    }));
    
    const result = await InventoryDB.registrarCompra(compraData, items);
    
    if (result.success) {
      showToast("Compra registrada exitosamente", "success");
      hideModal();
      if (currentView === "compras") {
        loadCompras(document.getElementById("viewCompras"));
      }
    } else {
      showToast("Error: " + result.error, "error");
    }
  });
}

// ========== FUNCIONES DE PROVEEDORES ==========
async function openNewProveedor() {
  showModal("➕ Nuevo Proveedor", `
    <form id="formNewProveedor" class="form-vertical">
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" name="nombre" required class="form-input">
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Contacto</label>
          <input type="text" name="contacto" class="form-input">
        </div>
        <div class="form-group">
          <label>Teléfono</label>
          <input type="tel" name="telefono" class="form-input">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-input">
        </div>
        <div class="form-group">
          <label>Ciudad</label>
          <input type="text" name="ciudad" class="form-input">
        </div>
      </div>
      
      <div class="form-group">
        <label>Dirección</label>
        <textarea name="direccion" class="form-input" rows="2"></textarea>
      </div>
      
      <div class="form-group">
        <label>Notas</label>
        <textarea name="notas" class="form-input" rows="3"></textarea>
      </div>
    </form>
  `, `
    <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="submit" form="formNewProveedor" class="btn-primary">Guardar</button>
  `);
  
  document.getElementById("formNewProveedor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    const result = await InventoryDB.crearProveedor(data);
    
    if (result.success) {
      showToast("Proveedor creado exitosamente", "success");
      hideModal();
      if (currentView === "proveedores") {
        loadProveedores(document.getElementById("viewProveedores"));
      }
    } else {
      showToast("Error: " + result.error, "error");
    }
  });
}

// ========== SCANNER DE CÓDIGOS DE BARRAS ==========
// ========== MOTOR DE ESCANEO DUAL ==========

/**
 * Enumera las cámaras disponibles y llena el selector
 * Auto-selecciona cámara trasera en móvil si está disponible
 */
async function enumerateCameras() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      Logger.warn("enumerateDevices no disponible");
      return [];
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    Logger.info(`📷 Cámaras encontradas: ${videoDevices.length}`);
    
    availableCameras = videoDevices;
    
    // Auto-seleccionar cámara trasera si no hay selección previa
    if (!selectedCameraId && videoDevices.length > 0) {
      // Buscar cámara trasera (back, rear, environment)
      let backCamera = videoDevices.find(device => {
        const label = device.label.toLowerCase();
        return label.includes('back') || label.includes('rear') || label.includes('environment');
      });
      
      // Si no encuentra trasera, usar la última (suele ser trasera en móvil)
      if (!backCamera && videoDevices.length > 1) {
        backCamera = videoDevices[videoDevices.length - 1];
      }
      
      if (backCamera) {
        selectedCameraId = backCamera.deviceId;
        Logger.info(`🎯 Cámara trasera auto-seleccionada: ${backCamera.label || backCamera.deviceId}`);
      }
    }
    
    // Llenar el selector de cámaras
    if (cameraSelect && videoDevices.length > 1) {
      cameraSelect.innerHTML = '';
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        
        // Intentar identificar cámara trasera en móvil
        let label = device.label || `Cámara ${index + 1}`;
        if (label.toLowerCase().includes('back') || label.toLowerCase().includes('rear')) {
          label = '📷 Cámara Trasera';
        } else if (label.toLowerCase().includes('front')) {
          label = '🤳 Cámara Frontal';
        }
        
        option.textContent = label;
        if (device.deviceId === selectedCameraId) {
          option.selected = true;
        }
        cameraSelect.appendChild(option);
      });
      
      cameraSelect.style.display = 'block';
    }
    
    return videoDevices;
  } catch (error) {
    Logger.error("Error al enumerar cámaras:", error);
    return [];
  }
}

/**
 * Inicia la cámara con constraints pro-escaner
 * Incluye: alta resolución, enfoque continuo, espera real del video
 */
async function startCamera() {
  try {
    // Intentar primero con alta resolución para mejor escaneo
    let constraints = {
      audio: false,
      video: selectedCameraId ? {
        deviceId: { exact: selectedCameraId },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 }
      } : {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 }
      }
    };
    
    Logger.info("🎥 Solicitando cámara con alta resolución...");
    
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback a resolución media si falla alto
      Logger.warn("Fallback a resolución media");
      constraints.video = selectedCameraId ? {
        deviceId: { exact: selectedCameraId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } : {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    scannerStream = stream;
    
    if (!scannerVideo) {
      throw new Error("Video element no encontrado");
    }
    
    scannerVideo.srcObject = stream;
    
    Logger.info("📹 Stream asignado al video, esperando inicio...");
    
    // Esperar a que el video esté REALMENTE listo (método mejorado y robusto)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        Logger.error("⏱️ Timeout esperando video");
        Logger.error(`   readyState: ${scannerVideo.readyState}`);
        Logger.error(`   dimensions: ${scannerVideo.videoWidth}x${scannerVideo.videoHeight}`);
        Logger.error(`   paused: ${scannerVideo.paused}`);
        reject(new Error("Video timeout"));
      }, 15000);
      
      let resolved = false;
      
      const checkReady = () => {
        if (resolved) return;
        
        Logger.info(`🔍 Verificando video - readyState: ${scannerVideo.readyState}, dims: ${scannerVideo.videoWidth}x${scannerVideo.videoHeight}`);
        
        if (
          scannerVideo.readyState >= 2 && 
          scannerVideo.videoWidth > 0 && 
          scannerVideo.videoHeight > 0
        ) {
          resolved = true;
          clearTimeout(timeout);
          Logger.info(`✅ Video listo: ${scannerVideo.videoWidth}x${scannerVideo.videoHeight}`);
          resolve();
        }
      };
      
      // Intentar reproducir y verificar
      const tryPlay = async () => {
        if (resolved) return;
        
        try {
          Logger.info("▶️ Intentando reproducir video...");
          await scannerVideo.play();
          Logger.info("✅ Video reproduciendo");
          
          // Verificar inmediatamente y después de un delay
          setTimeout(checkReady, 100);
          setTimeout(checkReady, 500);
        } catch (err) {
          Logger.warn("⚠️ Error al reproducir:", err.message);
          // No rechazamos aquí, seguimos intentando
        }
      };
      
      // Escuchar múltiples eventos
      scannerVideo.addEventListener('loadedmetadata', () => {
        Logger.info("📊 loadedmetadata event");
        tryPlay();
      }, { once: true });
      
      scannerVideo.addEventListener('loadeddata', () => {
        Logger.info("📊 loadeddata event");
        tryPlay();
      }, { once: true });
      
      scannerVideo.addEventListener('canplay', () => {
        Logger.info("📊 canplay event");
        checkReady();
      }, { once: true });
      
      // Verificación periódica como fallback
      const interval = setInterval(() => {
        if (resolved) {
          clearInterval(interval);
          return;
        }
        checkReady();
        // Intentar play si está pausado
        if (scannerVideo.paused) {
          tryPlay();
        }
      }, 500);
      
      // Intentar inmediatamente si ya está listo
      if (scannerVideo.readyState >= 2) {
        Logger.info("✨ Video ya listo, reproduciendo inmediatamente");
        tryPlay();
      }
    });
    
    // Configurar track con capacidades avanzadas
    const track = stream.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities();
      Logger.info("📸 Capacidades cámara:", capabilities);
      
      // Aplicar enfoque continuo si está disponible
      try {
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          Logger.info("✅ Enfoque continuo activado");
        }
      } catch (err) {
        Logger.warn("No se pudo aplicar enfoque continuo:", err);
      }
      
      // Aplicar exposición automática continua (mejora lectura en pantallas)
      try {
        if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] });
          Logger.info("✅ Exposición continua activada");
        }
      } catch (err) {
        Logger.warn("No se pudo aplicar exposición continua:", err);
      }
      
      // Configurar botón de linterna
      if (capabilities.torch && scannerToggleFlash) {
        scannerToggleFlash.style.display = "block";
        scannerToggleFlash.onclick = async () => {
          try {
            const currentTorch = track.getSettings().torch;
            await track.applyConstraints({ advanced: [{ torch: !currentTorch }] });
            scannerToggleFlash.innerHTML = currentTorch ? '🔦 Linterna' : '🔦 Linterna (Activa)';
          } catch (err) {
            Logger.error("Error al activar linterna:", err);
          }
        };
      }
    }
    
    return stream;
  } catch (error) {
    Logger.error("❌ Error al iniciar cámara:", error);
    
    // Mensajes de error específicos
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      showToast("Permiso de cámara denegado", "error");
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      showToast("No se encontró ninguna cámara", "error");
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      showToast("La cámara está siendo usada por otra aplicación", "error");
    } else {
      showToast("Error al acceder a la cámara", "error");
    }
    
    throw error;
  }
}

/**
 * Inicializa el detector nativo (BarcodeDetector API)
 */
async function initNativeDetector() {
  try {
    if (!('BarcodeDetector' in window)) {
      Logger.warn("BarcodeDetector no disponible en este navegador");
      return false;
    }
    
    // Obtener formatos soportados
    let formats = [];
    try {
      if (window.BarcodeDetector.getSupportedFormats) {
        const allFormats = await window.BarcodeDetector.getSupportedFormats();
        Logger.info("BarcodeDetector formatos disponibles:", allFormats);
        
        // Filtrar a los formatos que nos interesan
        const wantedFormats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'];
        formats = allFormats.filter(f => wantedFormats.includes(f));
        
        Logger.info("BarcodeDetector formatos seleccionados:", formats);
      }
    } catch (err) {
      Logger.warn("No se pudieron obtener formatos específicos, usando todos");
      formats = []; // Usar todos los disponibles
    }
    
    // Crear detector
    if (formats.length > 0) {
      barcodeDetector = new window.BarcodeDetector({ formats });
      Logger.info(`✅ BarcodeDetector creado con ${formats.length} formatos`);
    } else {
      barcodeDetector = new window.BarcodeDetector();
      Logger.info("✅ BarcodeDetector creado con formatos por defecto");
    }
    
    scannerEngine = 'native';
    Logger.info("✅ Motor de escaneo: BarcodeDetector nativo");
    return true;
  } catch (error) {
    Logger.error("Error al inicializar BarcodeDetector:", error);
    return false;
  }
}

/**
 * Inicializa el lector ZXing (fallback) - Modo continuo
 */
async function initZxingFallback() {
  try {
    if (typeof ZXing === 'undefined') {
      Logger.error("Librería ZXing no cargada");
      return false;
    }
    
    // Crear code reader con múltiples formatos y hints optimizados
    const hints = new Map();
    const formats = [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.QR_CODE
    ];
    
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    
    zxingCodeReader = new ZXing.BrowserMultiFormatReader(hints);
    scannerEngine = 'zxing';
    
    Logger.info("✅ Motor de escaneo: ZXing fallback (modo continuo)");
    return true;
  } catch (error) {
    Logger.error("Error al inicializar ZXing:", error);
    return false;
  }
}

/**
 * Valida si un código tiene formato válido
 */
function isValidBarcodeFormat(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Verificar longitud
  if (code.length < CODE_VALIDATION.MIN_LENGTH || code.length > CODE_VALIDATION.MAX_LENGTH) {
    if (SCANNER_DEBUG) Logger.warn(`Código con longitud inválida: ${code.length} caracteres`);
    return false;
  }
  
  // Verificar patrones permitidos
  const isValidPattern = CODE_VALIDATION.ALLOWED_PATTERNS.some(pattern => pattern.test(code));
  if (!isValidPattern) {
    if (SCANNER_DEBUG) Logger.warn(`Código con formato inválido: ${code}`);
    return false;
  }
  
  return true;
}

/**
 * Obtiene el código más frecuente del buffer de validación
 */
function getMostFrequentCode(buffer) {
  const frequency = {};
  buffer.forEach(code => {
    frequency[code] = (frequency[code] || 0) + 1;
  });
  
  let maxCount = 0;
  let mostFrequent = null;
  
  for (const [code, count] of Object.entries(frequency)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = code;
    }
  }
  
  return { code: mostFrequent, frequency: maxCount, total: buffer.length };
}

/**
 * Valida consistencia de código mediante múltiples lecturas
 */
async function validateCodeConsistency(code) {
  if (!isValidBarcodeFormat(code)) {
    if (SCANNER_DEBUG) Logger.warn(`Código rechazado por formato: ${code}`);
    return false;
  }
  
  // Si ya hay una validación en progreso, agregar al buffer
  if (validationInProgress) {
    codeValidationBuffer.push(code);
    
    // Verificar si hemos completado las validaciones
    if (codeValidationBuffer.length >= CODE_VALIDATION.CONSISTENCY_CHECKS) {
      const result = getMostFrequentCode(codeValidationBuffer);
      const consistencyRatio = result.frequency / result.total;
      
      if (SCANNER_DEBUG) {
        Logger.info(`Validación completa: ${result.code} (${result.frequency}/${result.total} = ${Math.round(consistencyRatio * 100)}%)`);
      }
      
      // Si el 70% o más de las lecturas coinciden, considerar válido
      if (consistencyRatio >= 0.7) {
        resetValidation();
        return result.code;
      } else {
        // Lecturas inconsistentes - mostrar opción de confirmación manual
        if (SCANNER_DEBUG) Logger.warn(`Lecturas inconsistentes para código`);
        resetValidation();
        return await showInconsistentReadDialog(codeValidationBuffer);
      }
    }
    return false; // Continuar validando
  }
  
  // Iniciar nueva validación
  validationInProgress = true;
  validationStartTime = Date.now();
  codeValidationBuffer = [code];
  
  // Actualizar UI para mostrar validación en progreso
  updateScannerStatusValidating(code);
  
  // Timeout para validación
  setTimeout(() => {
    if (validationInProgress && codeValidationBuffer.length < CODE_VALIDATION.CONSISTENCY_CHECKS) {
      if (SCANNER_DEBUG) Logger.warn("Timeout en validación - usando lectura parcial");
      
      const result = getMostFrequentCode(codeValidationBuffer);
      if (result.frequency >= 2) { // Al menos 2 lecturas iguales
        resetValidation();
        onValidatedCode(result.code);
      } else {
        resetValidation();
        showTimeoutValidationDialog(codeValidationBuffer);
      }
    }
  }, CODE_VALIDATION.CONSISTENCY_TIMEOUT);
  
  return false; // Continuar validando
}

/**
 * Resetea el sistema de validación
 */
function resetValidation() {
  validationInProgress = false;
  codeValidationBuffer = [];
  validationStartTime = 0;
}

/**
 * Actualiza la UI durante validación
 */
function updateScannerStatusValidating(code) {
  const scannerInfo = document.getElementById('scannerInfo');
  const progress = Math.min(codeValidationBuffer.length / CODE_VALIDATION.CONSISTENCY_CHECKS, 1);
  const percentage = Math.round(progress * 100);
  
  if (scannerInfo) {
    scannerInfo.innerHTML = `
      🔍 Validando código...<br>
      <small>${codeValidationBuffer.length}/${CODE_VALIDATION.CONSISTENCY_CHECKS} lecturas</small>
      <div style="width: 100%; background: rgba(255,255,255,0.3); border-radius: 10px; margin-top: 8px; height: 6px;">
        <div style="width: ${percentage}%; background: #4CAF50; height: 100%; border-radius: 10px; transition: width 0.3s ease;"></div>
      </div>
    `;
    scannerInfo.style.color = '#FFA726';
  }
}

/**
 * Muestra diálogo para lecturas inconsistentes
 */
async function showInconsistentReadDialog(readings) {
  return new Promise((resolve) => {
    const frequency = {};
    readings.forEach(code => {
      frequency[code] = (frequency[code] || 0) + 1;
    });
    
    const codes = Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3); // Top 3 códigos más frecuentes
    
    const options = codes.map(([code, count]) => 
      `<button class="btn-primary" onclick="resolveInconsistent('${code}')" style="margin: 0.5rem; padding: 0.75rem;">
        ${code}<br><small>${count} lectura${count > 1 ? 's' : ''}</small>
      </button>`
    ).join('');
    
    showModal("🔍 Lecturas Inconsistentes", `
      <div style="text-align: center;">
        <p>Se detectaron lecturas diferentes para el mismo código.</p>
        <p><strong>Selecciona el código correcto:</strong></p>
        <div style="display: flex; flex-direction: column; align-items: center;">
          ${options}
          <button class="btn-secondary" onclick="resolveInconsistent(null)" style="margin-top: 1rem;">
            ❌ Cancelar y escanear de nuevo
          </button>
        </div>
      </div>
    `, '');
    
    window.resolveInconsistent = (selectedCode) => {
      hideModal();
      delete window.resolveInconsistent;
      resolve(selectedCode);
    };
  });
}

/**
 * Muestra diálogo para validación con timeout
 */
function showTimeoutValidationDialog(readings) {
  const result = getMostFrequentCode(readings);
  
  if (result.frequency >= 2) {
    showToast(`⚠️ Validación parcial: usando "${result.code}"`, "warning");
    onValidatedCode(result.code);
  } else {
    showToast("❌ No se pudo validar el código. Intenta de nuevo.", "error");
  }
}

/**
 * Procesa un código ya validado
 */
async function onValidatedCode(code) {
  lastValidatedCode = code;
  lastScannedCode = code;
  lastScanTime = Date.now();
  
  if (SCANNER_DEBUG) Logger.info(`✅ Código validado: ${code}`);
  
  // Vibración de éxito
  vibrate([50, 30, 50]);
  
  // Efectos visuales de éxito
  showScannerSuccess();
  
  // Procesar según modo
  await processScan(code);
  
  // Cerrar scanner después de un momento
  setTimeout(() => {
    closeScanner();
  }, 1000);
}

/**
 * Efectos visuales de éxito en scanner
 */
function showScannerSuccess() {
  const viewport = document.querySelector('.inv-scanner-viewport');
  const instructionsBox = document.getElementById('scannerInstructionsBox');
  const scannerInfo = document.getElementById('scannerInfo');
  const overlay = document.querySelector('.inv-scanner-frame');
  const corners = document.querySelectorAll('.inv-scanner-corner');
  
  if (viewport) {
    viewport.classList.add('flash');
    setTimeout(() => viewport.classList.remove('flash'), 400);
  }
  
  if (instructionsBox) {
    instructionsBox.classList.add('success');
  }
  
  if (scannerInfo) {
    scannerInfo.innerHTML = `✅ Código validado correctamente`;
    scannerInfo.style.color = '#4CAF50';
    scannerInfo.style.fontWeight = 'bold';
  }
  
  if (overlay) {
    overlay.style.borderColor = '#4CAF50';
    overlay.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.6)';
  }
  
  corners.forEach(corner => {
    corner.style.borderColor = '#4CAF50';
    corner.style.filter = 'drop-shadow(0 0 16px rgba(76, 175, 80, 0.8))';
  });
}

/**
 * Función unificada para procesar código detectado
 * Ahora con validación de consistencia
 */
async function onBarcodeDetected(code) {
  if (!code) return;
  
  // Evitar procesar el mismo código si ya fue validado recientemente
  const now = Date.now();
  if (code === lastValidatedCode && (now - lastScanTime) < INVENTORY_CONFIG.SCAN_DUPLICATE_TIMEOUT) {
    return;
  }
  
  if (SCANNER_DEBUG) Logger.info(`🎯 Código detectado (sin validar): ${code}`);
  
  // Validar consistencia
  const validatedCode = await validateCodeConsistency(code);
  
  if (validatedCode) {
    await onValidatedCode(validatedCode);
  }
  // Si no está validado aún, continuar escaneando
}

/**
 * Inicia el loop de detección según el motor activo
 */
function startDetectionLoop() {
  if (scannerEngine === 'native') {
    Logger.info("🚀 Iniciando detección con BarcodeDetector nativo");
    detectBarcodeNative();
  } else if (scannerEngine === 'zxing') {
    Logger.info("🚀 Iniciando detección con ZXing continuo");
    detectBarcodeZxingContinuous();
  }
}

/**
 * Detiene el loop de detección y limpia recursos
 */
function stopDetectionLoop() {
  Logger.info("⏹️ Deteniendo detección...");
  scannerActive = false;
  
  // Cancelar animation frame de ZXing
  if (zxingAnimationFrame) {
    cancelAnimationFrame(zxingAnimationFrame);
    zxingAnimationFrame = null;
  }
  
  // Cancelar animation frame de native
  if (nativeAnimationFrame) {
    cancelAnimationFrame(nativeAnimationFrame);
    nativeAnimationFrame = null;
  }
  
  // Resetear ZXing si está activo
  if (zxingCodeReader) {
    try {
      zxingCodeReader.reset();
      Logger.info("✅ ZXing reseteado");
    } catch (err) {
      Logger.warn("Error al resetear ZXing:", err);
    }
  }
}

/**
 * Abre el scanner con flujo correcto: primero cámara, luego motor
 */
async function openScanner() {
  if (!scannerOverlay) {
    Logger.error("Scanner overlay no encontrado");
    showToast("Error: Scanner no disponible", "error");
    return;
  }
  
  Logger.info("📸 Abriendo scanner...");
  console.log('🔍 Scanner Debug - Iniciando apertura...');
  scannerOverlay.style.display = "flex";
  
  try {
    // 1. Enumerar cámaras disponibles
    console.log('🔍 Scanner Debug - Enumerando cámaras...');
    await enumerateCameras();
    
    // 2. Iniciar cámara PRIMERO (video debe estar listo antes de motor)
    console.log('🔍 Scanner Debug - Iniciando cámara...');
    await startCamera();
    
    // 3. Inicializar motor de detección (primero Native, luego ZXing)
    console.log('🔍 Scanner Debug - Inicializando detectores...');
    const nativeOk = await initNativeDetector();
    console.log('🔍 Scanner Debug - BarcodeDetector nativo:', nativeOk ? '✅ OK' : '❌ No disponible');
    
    if (!nativeOk) {
      const zxingOk = await initZxingFallback();
      console.log('🔍 Scanner Debug - ZXing fallback:', zxingOk ? '✅ OK' : '❌ Error');
      if (!zxingOk) {
        Logger.error("❌ No hay motor de escaneo disponible");
        showToast("Escaneo automático no disponible", "warning");
        showScannerFallback();
        return;
      }
    }
    
    // 4. Activar scanner
    scannerActive = true;
    scannerStartTime = Date.now(); // Track inicio para timeout
    scannerTipsShown = false; // Reset tips
    scannerAttemptCount = 0; // Reset contador de intentos
    
    // 5. Mostrar indicador de actividad
    const activeIndicator = document.getElementById('scannerActiveIndicator');
    if (activeIndicator) {
      activeIndicator.style.display = 'flex';
    }
    
    // 6. Iniciar detección
    console.log('🔍 Scanner Debug - Iniciando detección con engine:', scannerEngine);
    startDetectionLoop();
    
    Logger.info("✅ Scanner activo y listo");
    Logger.info(`📊 Motor: ${scannerEngine}, Resolución video: ${scannerVideo.videoWidth}x${scannerVideo.videoHeight}`);
    
    // Mostrar info en consola para debugging con información completa
    if (SCANNER_DEBUG || true) { // Siempre mostrar info de inicio
      console.log('%c🔍 SCANNER INICIADO', 'background: #4CAF50; color: white; padding: 5px; font-weight: bold;');
      console.log('Engine usado:', scannerEngine);
      console.log('Resolución real videoWidth x videoHeight:', `${scannerVideo.videoWidth} x ${scannerVideo.videoHeight}`);
      console.log('FPS target (interval):', scannerEngine === 'native' ? `${NATIVE_CHECK_INTERVAL}ms (~${Math.round(1000/NATIVE_CHECK_INTERVAL)}fps)` : `${ZXING_CHECK_INTERVAL}ms (~${Math.round(1000/ZXING_CHECK_INTERVAL)}fps)`);
      console.log('Modo ROI disponibles:', 'full, centerLarge, centerMedium, centerSmall');
      console.log('%cDEBUG MODE ACTIVO - Mira la consola para logs de detección', 'background: #FF9800; color: white; padding: 3px;');
      console.log('Para desactivar debug: localStorage.setItem("scanner_debug", "false")');
    }
    
  } catch (error) {
    Logger.error("❌ Error al abrir scanner:", error);
    showScannerFallback();
  }
}

// =============================================================================
// FUNCIONES AUXILIARES PARA CAPTURA Y PREPROCESAMIENTO (ESTRATEGIA MULTI-MODO)
// =============================================================================

/**
 * Captura frame del video al canvas según modo especificado
 * @param {string} mode - 'full', 'centerLarge', 'centerMedium', 'centerSmall'
 * @returns {Object} { canvas, ctx, imageData, width, height, mode }
 */
function captureFrameToCanvas(mode = 'full') {
  if (!scannerVideo || !scannerCanvas) {
    throw new Error('Scanner video o canvas no disponible');
  }
  
  const videoWidth = scannerVideo.videoWidth;
  const videoHeight = scannerVideo.videoHeight;
  
  if (videoWidth === 0 || videoHeight === 0) {
    throw new Error('Video no tiene dimensiones válidas');
  }
  
  let sourceX, sourceY, sourceWidth, sourceHeight;
  let targetWidth, targetHeight;
  
  // Determinar ROI según modo (manteniendo quiet zones)
  switch (mode) {
    case 'full':
      // Frame completo, con downscale inteligente si es muy grande
      sourceX = 0;
      sourceY = 0;
      sourceWidth = videoWidth;
      sourceHeight = videoHeight;
      
      // Downscale si excede 1280px para optimizar performance
      if (videoWidth > 1280) {
        const scale = 1280 / videoWidth;
        targetWidth = 1280;
        targetHeight = Math.floor(videoHeight * scale);
      } else {
        targetWidth = videoWidth;
        targetHeight = videoHeight;
      }
      break;
      
    case 'centerLarge':
      // 90% ancho × 60% alto - ROI grande con suficiente margen
      sourceWidth = Math.floor(videoWidth * 0.90);
      sourceHeight = Math.floor(videoHeight * 0.60);
      sourceX = Math.floor((videoWidth - sourceWidth) / 2);
      sourceY = Math.floor((videoHeight - sourceHeight) / 2);
      targetWidth = sourceWidth;
      targetHeight = sourceHeight;
      break;
      
    case 'centerMedium':
      // 80% ancho × 45% alto - ROI medio
      sourceWidth = Math.floor(videoWidth * 0.80);
      sourceHeight = Math.floor(videoHeight * 0.45);
      sourceX = Math.floor((videoWidth - sourceWidth) / 2);
      sourceY = Math.floor((videoHeight - sourceHeight) / 2);
      targetWidth = sourceWidth;
      targetHeight = sourceHeight;
      break;
      
    case 'centerSmall':
      // 70% ancho × 35% alto - ROI pequeño (último recurso)
      sourceWidth = Math.floor(videoWidth * 0.70);
      sourceHeight = Math.floor(videoHeight * 0.35);
      sourceX = Math.floor((videoWidth - sourceWidth) / 2);
      sourceY = Math.floor((videoHeight - sourceHeight) / 2);
      targetWidth = sourceWidth;
      targetHeight = sourceHeight;
      break;
      
    default:
      throw new Error(`Modo de captura inválido: ${mode}`);
  }
  
  // Configurar canvas
  scannerCanvas.width = targetWidth;
  scannerCanvas.height = targetHeight;
  
  const ctx = scannerCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('No se pudo obtener contexto 2D del canvas');
  }
  
  // Dibujar región seleccionada
  ctx.drawImage(
    scannerVideo,
    sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, targetWidth, targetHeight
  );
  
  if (SCANNER_DEBUG) {
    console.log(`📸 Captura [${mode}]: ${targetWidth}×${targetHeight} desde (${sourceX},${sourceY}) ${sourceWidth}×${sourceHeight}`);
  }
  
  return {
    canvas: scannerCanvas,
    ctx: ctx,
    width: targetWidth,
    height: targetHeight,
    mode: mode
  };
}

/**
 * Obtiene ImageData preprocesado desde canvas
 * @param {CanvasRenderingContext2D} ctx - Contexto 2D del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 * @param {string} level - 'none', 'light', 'full' - Nivel de preprocesamiento
 * @returns {ImageData} ImageData procesado
 */
function getProcessedImageDataFromCanvas(ctx, width, height, level = 'none') {
  let imageData = ctx.getImageData(0, 0, width, height);
  
  if (level === 'light') {
    // Preprocesamiento LIGERO: solo escala de grises y contraste moderado
    imageData = preprocessImageDataLight(imageData);
  } else if (level === 'full') {
    // Preprocesamiento COMPLETO: grises + contraste + binarización (solo para ZXing)
    imageData = preprocessImageData(imageData);
  }
  // 'none': devolver sin procesar
  
  return imageData;
}

/**
 * Preprocesamiento LIGERO para BarcodeDetector nativo
 * Solo aplica: escala de grises + contraste moderado (SIN binarización)
 */
function preprocessImageDataLight(imageData) {
  const data = imageData.data;
  const length = data.length;
  
  // Paso 1: Convertir a escala de grises
  for (let i = 0; i < length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  
  // Paso 2: Aumentar contraste MODERADO (no extremo)
  const contrast = 1.2; // Menos agresivo que 1.3
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  
  for (let i = 0; i < length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }
  
  // NO aplicar binarización para BarcodeDetector
  
  return imageData;
}

/**
 * Función de preprocesamiento de imagen OPTIMIZADA
 * Aplica: escala de grises, contraste, binarización adaptativa
 * VERSIÓN OPTIMIZADA: usa downsampling para threshold adaptativo (más rápido)
 */
function preprocessImageData(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const length = data.length;
  
  // Paso 1: Convertir a escala de grises con ponderación estándar
  for (let i = 0; i < length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  
  // Paso 2: Aumentar contraste
  const contrast = 1.3;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  
  for (let i = 0; i < length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }
  
  // Paso 3: Binarización adaptativa OPTIMIZADA
  // Usar downsampling factor para acelerar cálculo de threshold
  const downsample = 4; // Calcular threshold cada 4 píxeles
  const windowSize = 15;
  const threshold = new Float32Array(width * height);
  
  // Calcular threshold en grid reducido
  for (let y = 0; y < height; y += downsample) {
    for (let x = 0; x < width; x += downsample) {
      let sum = 0;
      let count = 0;
      
      for (let wy = Math.max(0, y - windowSize); wy < Math.min(height, y + windowSize); wy++) {
        for (let wx = Math.max(0, x - windowSize); wx < Math.min(width, x + windowSize); wx++) {
          const idx = (wy * width + wx) * 4;
          sum += data[idx];
          count++;
        }
      }
      
      const t = sum / count - 10; // -10 para ajuste
      
      // Propagar threshold a píxeles vecinos
      for (let dy = 0; dy < downsample && (y + dy) < height; dy++) {
        for (let dx = 0; dx < downsample && (x + dx) < width; dx++) {
          threshold[(y + dy) * width + (x + dx)] = t;
        }
      }
    }
  }
  
  // Aplicar binarización
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const value = data[idx] > threshold[i] ? 255 : 0;
    data[idx] = data[idx + 1] = data[idx + 2] = value;
  }
  
  return imageData;
}

/**
 * Muestra tips al usuario si no detecta en X segundos
 */
function checkAndShowScannerTips() {
  if (scannerTipsShown || !scannerActive) return;
  
  const elapsed = Date.now() - scannerStartTime;
  
  if (elapsed > SCANNER_NO_DETECT_TIMEOUT) {
    scannerTipsShown = true;
    
    // Mostrar tips box si existe
    const tipsBox = document.getElementById('scannerTips');
    const instructionsBox = document.getElementById('scannerInstructionsBox');
    
    if (tipsBox) {
      tipsBox.style.display = 'block';
      tipsBox.classList.add('show');
      
      // Ocultar tips después de 3 segundos (menos intrusivo)
      setTimeout(() => {
        if (tipsBox) {
          tipsBox.classList.remove('show');
          setTimeout(() => {
            if (tipsBox && !tipsBox.classList.contains('show')) {
              tipsBox.style.display = 'none';
            }
          }, 300); // Esperar a que termine la animación de fade out
        }
      }, 3000);
    }
    
    // Comentar scannerInfo intrusivo - ya tenemos tipsBox discreto
    /*
    if (scannerInfo) {
      scannerInfo.innerHTML = `
        <div style="text-align: center; font-size: 0.9em; line-height: 1.4;">
          <strong>💡 Tips para mejor detección:</strong><br>
          • Acerca o aleja el código<br>
          • Evita reflejos de luz<br>
          • Mantén el código dentro del marco<br>
          • Asegúrate de buena iluminación<br>
          <small style="color: #999; margin-top: 8px; display: block;">
            Intentos: ${scannerAttemptCount} | Motor: ${scannerEngine}
          </small>
        </div>
      `;
      scannerInfo.style.color = '#FFA500';
    }
    */
    
    Logger.info(`⏱️ 15 segundos sin detectar - mostrando tips discretos (${scannerAttemptCount} intentos)`);
    
    // Solo mensaje breve y no intrusivo en scannerInfo
    if (scannerInfo) {
      scannerInfo.textContent = "🔍 Buscando código...";
      scannerInfo.style.color = '#FFA500';
    }
    
    // Log adicional de diagnóstico
    if (scannerVideo) {
      console.log('📹 Estado del video:', {
        readyState: scannerVideo.readyState,
        videoWidth: scannerVideo.videoWidth,
        videoHeight: scannerVideo.videoHeight,
        paused: scannerVideo.paused,
        ended: scannerVideo.ended
      });
    }
  }
}

// =============================================================================
// DETECCIÓN CON BARCODE DETECTOR NATIVO (ESTRATEGIA MULTI-INTENTO)
// =============================================================================

/**
 * Detección con BarcodeDetector nativo - Con canvas fallback para mejor compatibilidad
 */
let lastNativeCheck = 0;
const NATIVE_CHECK_INTERVAL = 120; // 8 fps óptimo

async function detectBarcodeNative() {
  if (!scannerActive || !barcodeDetector || !scannerVideo) {
    console.log('❌ Native detection stopped:', { scannerActive, barcodeDetector: !!barcodeDetector, scannerVideo: !!scannerVideo });
    return;
  }
  
  const now = Date.now();
  
  // Debug log every 100 attempts
  if (scannerAttemptCount % 100 === 0) {
    console.log('🔍 Native detection running, attempt:', scannerAttemptCount);
  }
  
  // Throttling para no saturar a 60fps
  if (now - lastNativeCheck < NATIVE_CHECK_INTERVAL) {
    nativeAnimationFrame = requestAnimationFrame(detectBarcodeNative);
    return;
  }
  
  lastNativeCheck = now;
  scannerAttemptCount++; // Incrementar contador
  
  // Mostrar contador cada 20 intentos (cada ~2.4 segundos)
  if (scannerAttemptCount % 20 === 0) {
    Logger.info(`🔍 Intentos de detección: ${scannerAttemptCount}`);
    if (SCANNER_DEBUG) {
      console.log(`🔍 Intento #${scannerAttemptCount}`);
    }
  }
  
  // Verificar timeout y mostrar tips
  checkAndShowScannerTips();
  
  try {
    // Verificar que el video esté listo
    if (scannerVideo.readyState < 2 || scannerVideo.videoWidth === 0) {
      nativeAnimationFrame = requestAnimationFrame(detectBarcodeNative);
      return;
    }
    
    let barcodes = [];
    let detectedFrom = null;
    
    // ESTRATEGIA OPTIMIZADA: Primero intentar directo del video (más rápido y efectivo)
    try {
      barcodes = await barcodeDetector.detect(scannerVideo);
      if (barcodes.length > 0) {
        detectedFrom = 'video-direct';
        console.log('🎯 CÓDIGO DETECTADO directo del video:', barcodes[0].rawValue);
        if (SCANNER_DEBUG) {
          console.log('✅ Detectado directo del video');
        }
      } else if (SCANNER_DEBUG && scannerAttemptCount % 50 === 0) {
        console.log('🔍 Video direct: no codes detected, attempt', scannerAttemptCount);
      }
    } catch (err) {
      if (SCANNER_DEBUG) {
        console.warn('⚠️ Detección directa falló:', err.message);
      }
    }
    
    // Si no detectó directo, probar con canvas en diferentes regiones SIN preprocesamiento
    if (barcodes.length === 0) {
      const modes = ['full', 'centerLarge', 'centerMedium', 'centerSmall'];
      
      for (const mode of modes) {
        try {
          // Capturar frame según modo
          const capture = captureFrameToCanvas(mode);
          
          // IMPORTANTE: NO aplicar preprocesamiento agresivo para BarcodeDetector
          // BarcodeDetector funciona mejor con imágenes naturales
          
          // Intentar detectar desde canvas SIN procesar
          barcodes = await barcodeDetector.detect(capture.canvas);
          
          if (barcodes.length > 0) {
            detectedFrom = mode + '-raw';
            if (SCANNER_DEBUG) {
              console.log(`✅ Detectado con modo: ${mode} (sin preprocesar)`);
            }
            break;
          }
          
          // Si sigue sin detectar, intentar con preprocesamiento LIGERO
          const imageDataLight = getProcessedImageDataFromCanvas(capture.ctx, capture.width, capture.height, 'light');
          capture.ctx.putImageData(imageDataLight, 0, 0);
          
          barcodes = await barcodeDetector.detect(capture.canvas);
          
          if (barcodes.length > 0) {
            detectedFrom = mode + '-light';
            if (SCANNER_DEBUG) {
              console.log(`✅ Detectado con modo: ${mode} (preprocesamiento ligero)`);
            }
            break;
          }
          
        } catch (err) {
          if (SCANNER_DEBUG) {
            console.warn(`⚠️ Modo ${mode} falló:`, err.message);
          }
        }
      }
    }
    
    // Si detectó algo, procesarlo
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      Logger.info(`✅ BarcodeDetector nativo detectó: ${code} [${detectedFrom}]`);
      await onBarcodeDetected(code);
      return; // Detener loop después de detección exitosa
    }
    
    // Continuar loop si no detectó nada
    nativeAnimationFrame = requestAnimationFrame(detectBarcodeNative);
    
  } catch (error) {
    Logger.error("❌ Error en detección nativa:", error);
    nativeAnimationFrame = requestAnimationFrame(detectBarcodeNative);
  }
}

// =============================================================================
// DETECCIÓN CON ZXING (FALLBACK PARA iOS/SAFARI - ESTRATEGIA MULTI-INTENTO)
// =============================================================================

/**
 * Detección con ZXing - Modo continuo con estrategia multi-intento
 * Este es el método MÁS ESTABLE para ZXing (especialmente iOS)
 */
let lastZxingCheck = 0;
const ZXING_CHECK_INTERVAL = 120; // 8 FPS óptimo

async function detectBarcodeZxingContinuous() {
  if (!scannerActive || !zxingCodeReader || !scannerVideo) {
    console.log('❌ ZXing detection stopped:', { scannerActive, zxingCodeReader: !!zxingCodeReader, scannerVideo: !!scannerVideo });
    return;
  }
  
  const now = Date.now();
  
  // Debug log every 100 attempts  
  if (scannerAttemptCount % 100 === 0) {
    console.log('🔍 ZXing detection running, attempt:', scannerAttemptCount);
  }
  
  // Throttling para rendimiento
  if (now - lastZxingCheck < ZXING_CHECK_INTERVAL) {
    zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxingContinuous);
    return;
  }
  
  lastZxingCheck = now;
  scannerAttemptCount++; // Incrementar contador
  
  // Mostrar contador cada 20 intentos
  if (scannerAttemptCount % 20 === 0) {
    Logger.info(`🔍 ZXing intentos: ${scannerAttemptCount}`);
    if (SCANNER_DEBUG) {
      console.log(`🔍 ZXing Intento #${scannerAttemptCount}`);
    }
  }
  
  // Verificar timeout y mostrar tips
  checkAndShowScannerTips();
  
  try {
    // Verificar que el video esté REALMENTE listo
    if (scannerVideo.readyState < 2 || scannerVideo.videoWidth === 0 || scannerVideo.videoHeight === 0) {
      zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxingContinuous);
      return;
    }
    
    // Verificar canvas
    if (!scannerCanvas) {
      Logger.error("❌ Canvas no encontrado");
      zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxingContinuous);
      return;
    }
    
    let result = null;
    let detectedFrom = null;
    
    // ESTRATEGIA MULTI-INTENTO: Probar diferentes regiones
    const modes = ['full', 'centerLarge', 'centerMedium', 'centerSmall'];
    
    for (const mode of modes) {
      try {
        // Capturar frame según modo
        const capture = captureFrameToCanvas(mode);
        
// CAMBIO CRÍTICO: Volver a método estable toDataURL para compatibilidad
        try {
          // Método más compatible: canvas -> dataURL -> Image -> decode
          const dataURL = capture.canvas.toDataURL('image/png');
          const img = new Image();
          img.src = dataURL;
          await new Promise(resolve => img.onload = resolve);
          
          result = await zxingCodeReader.decode(img);
          
          if (result && (result.getText() || result.text)) {
            detectedFrom = mode + '-raw';
            if (SCANNER_DEBUG) {
              console.log(`✅ ZXing detectó con modo: ${mode} (sin preprocesar)`);
            }
            break;
          }
        } catch (e) {
          if (e.name !== 'NotFoundException') {
            if (SCANNER_DEBUG) {
              console.warn('ZXing decode error:', e);
            }
            throw e;
          }
        }
        
        // Si no detectó, intentar con preprocesamiento LIGERO
        const imageDataLight = getProcessedImageDataFromCanvas(capture.ctx, capture.width, capture.height, 'light');
        capture.ctx.putImageData(imageDataLight, 0, 0);
        
        try {
          const dataURL = capture.canvas.toDataURL('image/png');
          const img = new Image();
          img.src = dataURL;
          await new Promise(resolve => img.onload = resolve);
          
          result = await zxingCodeReader.decode(img);
          
          if (result && (result.getText() || result.text)) {
            detectedFrom = mode + '-light';
            if (SCANNER_DEBUG) {
              console.log(`✅ ZXing detectó con modo: ${mode} (preprocesamiento ligero)`);
            }
            break;
          }
        } catch (e) {
          if (e.name !== 'NotFoundException') {
            if (SCANNER_DEBUG) {
              console.warn('ZXing decode light error:', e);
            }
            throw e;
          }
        }
        
        // Como último recurso, intentar con preprocesamiento COMPLETO
        const imageDataFull = getProcessedImageDataFromCanvas(capture.ctx, capture.width, capture.height, 'full');
        capture.ctx.putImageData(imageDataFull, 0, 0);
        
        try {
          const dataURL = capture.canvas.toDataURL('image/png');
          const img = new Image();
          img.src = dataURL;
          await new Promise(resolve => img.onload = resolve);
          
          result = await zxingCodeReader.decode(img);
          
          if (result && (result.getText() || result.text)) {
            detectedFrom = mode + '-full';
            if (SCANNER_DEBUG) {
              console.log(`✅ ZXing detectó con modo: ${mode} (preprocesamiento completo)`);
            }
            break;
          }
        } catch (e) {
          if (e.name !== 'NotFoundException') {
            if (SCANNER_DEBUG) {
              console.warn('ZXing decode full error:', e);
            }
            throw e;
          }
        }
        
      } catch (error) {
        // ZXing lanza NotFoundException cuando no encuentra código (es NORMAL)
        if (error.name !== 'NotFoundException') {
          if (SCANNER_DEBUG) {
            if (SCANNER_DEBUG) {
          console.warn(`⚠️ ZXing modo ${mode} error:`, error.message);
        }
          }
        }
        // Continuar con siguiente modo
      }
    }
    
    // Si detectó algo, procesarlo
    if (result && (result.getText() || result.text)) {
      const code = result.getText ? result.getText() : result.text;
      Logger.info(`✅ ZXing detectó: ${code} [${detectedFrom}]`);
      await onBarcodeDetected(code);
      return; // Detener loop después de detección exitosa
    }
    
  } catch (error) {
    // Solo logear errores reales (no NotFoundException)
    if (error.name !== 'NotFoundException') {
      if (SCANNER_DEBUG) {
        Logger.error("❌ Error ZXing:", error);
      }
    }
  }
  
  // Continuar loop si no detectó nada
  zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxingContinuous);
}

async function processScan(codigo) {
  Logger.info(`Código escaneado: ${codigo} (Modo: ${scannerMode})`);
  console.log(`🎯 CÓDIGO DETECTADO Y PROCESANDO: ${codigo}`);
  
  // Efectos de feedback inmediatos
  playScanSound();
  vibrateDevice();
  showScanFeedback(codigo);
  
  // Buscar producto por código
  const producto = await InventoryDB.buscarProductoPorCodigoBarras(codigo);
  
  if (scannerMode === "venta") {
    if (producto) {
      showScanSuccess();
      showToast(`✅ Producto encontrado: ${producto.nombre}`, "success");
      agregarAlCarritoVenta(producto);
    } else {
      showScanError();
      closeScanner();
      // Mostrar modal con opciones cuando no existe el producto
      setTimeout(() => {
        showCodigoNoRegistradoModal(codigo);
      }, 100);
    }
  } else if (scannerMode === "registro") {
    if (producto) {
      showScanSuccess();
      showToast(`📦 Producto encontrado: ${producto.nombre}`, "success");
      closeScanner();
      // Mostrar modal con información del producto y opciones
      setTimeout(() => {
        showProductoEncontradoModal(producto, codigo);
      }, 100);
    } else {
      showScanSuccess();
      closeScanner();
      // Mostrar modal con opciones para código nuevo
      setTimeout(() => {
        showCodigoNuevoModal(codigo);
      }, 100);
    }
  } else if (scannerMode === "registroTemporal") {
    // Este modo ya no se usa
    document.getElementById("codigoBarras")?.value === codigo;
  } else if (scannerMode === "asociar") {
    if (currentProductoForAssociation) {
      // Verificar si el código ya está asociado a otro producto
      if (producto) {
        if (producto.id === currentProductoForAssociation) {
          showScanError();
          showToast("⚠️ Este código ya está asociado a este producto", "warning");
        } else {
          showScanError();
          showToast(`❌ Este código ya pertenece a: ${producto.nombre}`, "error");
        }
        return;
      }
      
      // Asociar el código e incrementar el stock
      const result = await InventoryDB.asociarCodigoBarrasEIncrementarStock(currentProductoForAssociation, codigo);
      if (result.success) {
        showScanSuccess();
        showToast(`✅ Código asociado - Stock: ${result.nuevoStock}`, "success");
        
        // Actualizar la vista del producto si está abierta
        const productoActual = await InventoryDB.obtenerProductoPorId(currentProductoForAssociation);
        if (productoActual) {
          // Actualizar contador en la UI
          const stockElement = document.getElementById("productoStockActual");
          if (stockElement) {
            stockElement.textContent = productoActual.stock_actual;
          }
          
          // Actualizar lista de códigos
          const listaCodigosElement = document.getElementById("listaCodigosBarras");
          if (listaCodigosElement && productoActual.inv_codigos_barras) {
            listaCodigosElement.innerHTML = productoActual.inv_codigos_barras.length > 0
              ? productoActual.inv_codigos_barras.map((cb, idx) => `
                  <div class="inv-codigo-item">
                    <span class="inv-codigo-numero">#${idx + 1}</span>
                    <span class="inv-codigo-valor">${cb.codigo}</span>
                    <button class="inv-btn-icon-danger" onclick="eliminarCodigoBarras(${cb.id}, ${productoActual.id})" title="Eliminar código">
                      🗑️
                    </button>
                  </div>
                `).join('')
              : '<p style="color: var(--gray-500); text-align: center;">No hay códigos asociados</p>';
          }
        }
      } else {
        showScanError();
        showToast("❌ Error: " + result.error, "error");
      }
    }
  }
}

// =============================================================================
/**
 * Mostrar modal cuando se encuentra un producto asociado al código
 */
function showProductoEncontradoModal(producto, codigo) {
  showModal(`📦 Producto Encontrado`, `
    <div class="inv-codigo-display">
      <div class="inv-codigo-escaneado">
        <span class="inv-codigo-label">Código escaneado:</span>
        <span class="inv-codigo-valor">${codigo}</span>
      </div>
      <div class="inv-alert inv-alert-info">
        ✅ Este código pertenece a un producto registrado
      </div>
    </div>
    
    <div class="inv-producto-info-card">
      <div class="inv-producto-header">
        <h3>${producto.nombre}</h3>
        <span class="inv-producto-sku">${producto.sku || 'Sin SKU'}</span>
      </div>
      
      <div class="inv-producto-detalles">
        <div class="inv-detalle-item">
          <span class="inv-detalle-label">Stock actual:</span>
          <span class="inv-detalle-valor">${producto.stock_actual || 0} unidades</span>
        </div>
        
        ${producto.categoria ? `
          <div class="inv-detalle-item">
            <span class="inv-detalle-label">Categoría:</span>
            <span class="inv-detalle-valor">${producto.categoria}</span>
          </div>
        ` : ''}
        
        ${producto.marca ? `
          <div class="inv-detalle-item">
            <span class="inv-detalle-label">Marca:</span>
            <span class="inv-detalle-valor">${producto.marca}</span>
          </div>
        ` : ''}
        
        ${producto.precio_sugerido ? `
          <div class="inv-detalle-item">
            <span class="inv-detalle-label">Precio sugerido:</span>
            <span class="inv-detalle-valor">$${parseFloat(producto.precio_sugerido).toLocaleString()}</span>
          </div>
        ` : ''}
      </div>
    </div>
    
    <div class="inv-opciones-codigo">
      <div class="inv-opciones-grid">
        <button class="inv-opcion-btn primary" onclick="incrementarStockProducto(${producto.id}, '${codigo}')">
          <div class="inv-opcion-icon">📈</div>
          <div class="inv-opcion-text">
            <strong>Incrementar Stock</strong>
            <small>Agregar +1 unidad al inventario</small>
          </div>
        </button>
        
        <button class="inv-opcion-btn secondary" onclick="hideModal(); viewProducto(${producto.id})">
          <div class="inv-opcion-icon">👁️</div>
          <div class="inv-opcion-text">
            <strong>Ver Detalles Completos</strong>
            <small>Información completa del producto</small>
          </div>
        </button>
      </div>
    </div>
  `, `
    <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
  `);
}

/**
 * Incrementar stock de producto desde escaner
 */
async function incrementarStockProducto(productoId, codigo) {
  try {
    showModal("📈 Incrementando Stock", `
      <div style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Incrementando stock del producto...</p>
      </div>
    `);
    
    const result = await InventoryDB.ajustarStock(productoId, 1, `Stock incrementado vía escáner - Código: ${codigo}`);
    
    if (result.success) {
      hideModal();
      showToast(`✅ Stock incrementado - Nuevo stock: ${result.data.stock_nuevo}`, "success");
      
      // Recargar vista actual si es necesario
      const currentView = document.querySelector('.inv-view.active')?.id;
      if (currentView) {
        loadView(currentView.replace('view', ''));
      }
    } else {
      showModal("❌ Error", `
        <div class="inv-error-display">
          <p><strong>No se pudo incrementar el stock:</strong></p>
          <p class="error-detail">${result.error || 'Error desconocido'}</p>
        </div>
      `, `
        <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
        <button class="inv-btn inv-btn-primary" onclick="incrementarStockProducto(${productoId}, '${codigo}')">Reintentar</button>
      `);
    }
    
  } catch (error) {
    Logger.error("Error al incrementar stock:", error);
    showModal("❌ Error de Sistema", `
      <div class="inv-error-display">
        <p><strong>Error técnico:</strong></p>
        <p class="error-detail">${error.message}</p>
      </div>
    `, `
      <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
    `);
  }
}

/**
 * Confirmar eliminación de producto con modal
 */
function confirmarEliminarProducto(id) {
  const producto = productosData.find(p => p.id === id);
  if (!producto) {
    showToast("Producto no encontrado", "error");
    return;
  }
  
  showModal(`⚠️ Confirmar Eliminación`, `
    <div class="inv-confirmacion-eliminar">
      <div class="inv-producto-eliminar-info">
        <div class="inv-producto-eliminar-icon">📦</div>
        <div class="inv-producto-eliminar-detalles">
          <h4>${producto.nombre}</h4>
          <p><strong>SKU:</strong> ${producto.sku || 'Sin SKU'}</p>
          <p><strong>Stock actual:</strong> ${producto.stock_actual} unidades</p>
          ${producto.categoria ? `<p><strong>Categoría:</strong> ${producto.categoria}</p>` : ''}
        </div>
      </div>
      
      <div class="inv-confirmacion-mensaje">
        <p><strong>¿Estás seguro de que deseas eliminar este producto?</strong></p>
        <p class="inv-advertencia-texto">
          ⚠️ Esta acción desactivará el producto del inventario. 
          El producto no aparecerá en las listas pero se mantendrán 
          sus registros históricos.
        </p>
      </div>
    </div>
  `, `
    <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
    <button class="inv-btn inv-btn-danger" onclick="eliminarProducto(${id})">Sí, Eliminar</button>
  `);
}

/**
 * Eliminar producto definitivamente
 */
async function eliminarProducto(id) {
  try {
    const producto = productosData.find(p => p.id === id);
    if (!producto) {
      showToast("Producto no encontrado", "error");
      return;
    }
    
    // Mostrar loading
    showModal("🗑️ Eliminando Producto", `
      <div style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Eliminando <strong>${producto.nombre}</strong>...</p>
      </div>
    `);
    
    const result = await InventoryDB.eliminarProducto(id);
    
    if (result.success) {
      hideModal();
      showToast(`✅ Producto "${producto.nombre}" eliminado correctamente`, "success");
      
      // Recargar la vista actual de productos
      const currentView = document.querySelector('.inv-view.active')?.id;
      if (currentView === 'productosview') {
        loadView('productos');
      } else {
        // Si estamos en otra vista, solo actualizemos los datos globales
        productosData = await InventoryDB.obtenerTodosProductos({ activo: true });
      }
      
    } else {
      showModal("❌ Error al Eliminar", `
        <div class="inv-error-display">
          <p><strong>No se pudo eliminar el producto:</strong></p>
          <p class="error-detail">${result.error || 'Error desconocido'}</p>
        </div>
      `, `
        <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
        <button class="inv-btn inv-btn-primary" onclick="eliminarProducto(${id})">Reintentar</button>
      `);
      
      showToast(result.error || "Error al eliminar producto", "error");
    }
    
  } catch (error) {
    Logger.error("Error al eliminar producto:", error);
    
    showModal("❌ Error de Sistema", `
      <div class="inv-error-display">
        <p><strong>Error técnico:</strong></p>
        <p class="error-detail">${error.message}</p>
      </div>
    `, `
      <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
    `);
    
    showToast("Error de conexión al eliminar producto", "error");
  }
}

/**
 * Confirmar eliminación de venta con modal
 */
function confirmarEliminarVenta(id) {
  // Buscar la venta en los datos cargados
  const venta = ventasData.find(v => v.id === id);
  if (!venta) {
    showToast("Venta no encontrada", "error");
    return;
  }
  
  const itemsCount = venta.inv_venta_items?.length || 0;
  const fecha = new Date(venta.fecha).toLocaleDateString('es-CO', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  showModal(`⚠️ Confirmar Eliminación de Venta`, `
    <div class="inv-confirmacion-eliminar">
      <div class="inv-venta-eliminar-info">
        <div class="inv-venta-eliminar-icon">🧾</div>
        <div class="inv-venta-eliminar-detalles">
          <h4>Venta #${venta.id}</h4>
          <p><strong>Fecha:</strong> ${fecha}</p>
          <p><strong>Total:</strong> ${formatCurrency(venta.total)}</p>
          <p><strong>Productos:</strong> ${itemsCount} ${itemsCount === 1 ? 'producto' : 'productos'}</p>
          ${venta.metodo_pago ? `<p><strong>Método de pago:</strong> ${venta.metodo_pago}</p>` : ''}
        </div>
      </div>
      
      <div class="inv-confirmacion-mensaje">
        <p><strong>¿Estás seguro de que deseas eliminar esta venta?</strong></p>
        <p class="inv-advertencia-texto">
          ⚠️ <strong>Esta acción:</strong><br>
          • Eliminará permanentemente la venta del sistema<br>
          • Revertirá el stock de todos los productos vendidos<br>
          • No se puede deshacer una vez realizada
        </p>
      </div>
    </div>
  `, `
    <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
    <button class="inv-btn inv-btn-danger" onclick="eliminarVenta(${id})">Sí, Eliminar Venta</button>
  `);
}

/**
 * Eliminar venta definitivamente
 */
async function eliminarVenta(id) {
  try {
    const venta = ventasData.find(v => v.id === id);
    if (!venta) {
      showToast("Venta no encontrada", "error");
      return;
    }
    
    // Mostrar loading
    showModal("🗑️ Eliminando Venta", `
      <div style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Eliminando venta #${venta.id} y revirtiendo stock...</p>
        <small>Esto puede tomar unos momentos</small>
      </div>
    `);
    
    const result = await InventoryDB.eliminarVenta(id);
    
    if (result.success) {
      hideModal();
      showToast(`✅ Venta #${venta.id} eliminada y stock revertido correctamente`, "success");
      
      // Recargar la vista actual de ventas
      const currentView = document.querySelector('.inv-view.active')?.id;
      if (currentView === 'ventasview') {
        loadView('ventas');
      } else {
        // Actualizar datos globales si estamos en otra vista
        ventasData = await InventoryDB.obtenerTodasVentas();
        productosData = await InventoryDB.obtenerTodosProductos({ activo: true });
      }
      
    } else {
      showModal("❌ Error al Eliminar", `
        <div class="inv-error-display">
          <p><strong>No se pudo eliminar la venta:</strong></p>
          <p class="error-detail">${result.error || 'Error desconocido'}</p>
        </div>
      `, `
        <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
        <button class="inv-btn inv-btn-primary" onclick="eliminarVenta(${id})">Reintentar</button>
      `);
      
      showToast(result.error || "Error al eliminar venta", "error");
    }
    
  } catch (error) {
    Logger.error("Error al eliminar venta:", error);
    
    showModal("❌ Error de Sistema", `
      <div class="inv-error-display">
        <p><strong>Error técnico:</strong></p>
        <p class="error-detail">${error.message}</p>
        <p><small>La venta no fue eliminada</small></p>
      </div>
    `, `
      <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
    `);
    
    showToast("Error de conexión al eliminar venta", "error");
  }
}

// MODALES Y FLUJO MEJORADO PARA CÓDIGOS NO REGISTRADOS
// =============================================================================

/**
 * Muestra modal cuando un código no está registrado en modo venta
 */
function showCodigoNoRegistradoModal(codigo) {
  showModal(`🔍 Código No Registrado`, `
    <div class="inv-codigo-display">
      <div class="inv-codigo-escaneado">
        <span class="inv-codigo-label">Código escaneado:</span>
        <span class="inv-codigo-valor">${codigo}</span>
      </div>
      <div class="inv-alert inv-alert-warning">
        ⚠️ Este código de barras no está asociado a ningún producto en tu inventario.
      </div>
    </div>
    
    <div class="inv-opciones-codigo">
      <h4 style="margin: 1rem 0 0.5rem 0; color: var(--text-primary);">¿Qué deseas hacer?</h4>
      <div class="inv-opciones-grid">
        <button class="inv-opcion-btn primary" onclick="crearProductoRapido('${codigo}')">
          <div class="inv-opcion-icon">🆕</div>
          <div class="inv-opcion-text">
            <strong>Crear Producto Nuevo</strong>
            <small>Registrar producto con datos básicos</small>
          </div>
        </button>
        
        <button class="inv-opcion-btn secondary" onclick="mostrarProductosParaAsociar('${codigo}')">
          <div class="inv-opcion-icon">🔗</div>
          <div class="inv-opcion-text">
            <strong>Asociar a Producto Existente</strong>
            <small>Vincular código a producto ya registrado</small>
          </div>
        </button>
      </div>
    </div>
  `, `
    <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
  `);
}

/**
 * Muestra modal cuando se detecta un código nuevo en modo registro
 */
function showCodigoNuevoModal(codigo) {
  showModal(`✅ Código Nuevo Detectado`, `
    <div class="inv-codigo-display">
      <div class="inv-codigo-escaneado">
        <span class="inv-codigo-label">Código escaneado:</span>
        <span class="inv-codigo-valor">${codigo}</span>
      </div>
      <div class="inv-alert inv-alert-success">
        ✅ Este código está disponible para usar. Elige cómo proceder:
      </div>
    </div>
    
    <div class="inv-opciones-codigo">
      <div class="inv-opciones-grid">
        <button class="inv-opcion-btn primary" onclick="crearProductoRapido('${codigo}')">
          <div class="inv-opcion-icon">🆕</div>
          <div class="inv-opcion-text">
            <strong>Crear Producto Nuevo</strong>
            <small>Registrar producto con este código</small>
          </div>
        </button>
        
        <button class="inv-opcion-btn secondary" onclick="mostrarProductosParaAsociar('${codigo}')">
          <div class="inv-opcion-icon">🔗</div>
          <div class="inv-opcion-text">
            <strong>Asociar a Producto Existente</strong>
            <small>Agregar como código adicional</small>
          </div>
        </button>
      </div>
    </div>
  `, `
    <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
  `);
}

/**
 * Crear producto con datos básicos y código asociado
 */
async function crearProductoRapido(codigo) {
  hideModal();
  
  // Cargar proveedores
  const proveedores = await InventoryDB.obtenerTodosProveedores();
  
  showModal(`🆕 Crear Producto - Código: ${codigo}`, `
    <form id="formProductoRapido" class="form-vertical">
      <div class="inv-codigo-display">
        <div class="inv-codigo-escaneado">
          <span class="inv-codigo-label">Código de barras:</span>
          <span class="inv-codigo-valor">${codigo}</span>
        </div>
      </div>
      
      <div class="form-group">
        <label>Nombre del Producto *</label>
        <input type="text" name="nombre" required class="form-input" placeholder="Ej: Camisa Polo Azul" autofocus>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Categoría</label>
          <input type="text" name="categoria" class="form-input" list="categorias" placeholder="Ej: Ropa">
          <datalist id="categorias">
            <option value="Electrónica">
            <option value="Hogar">
            <option value="Ropa">
            <option value="Alimentos">
            <option value="Accesorios">
            <option value="Calzado">
          </datalist>
        </div>
        <div class="form-group">
          <label>Marca</label>
          <input type="text" name="marca" class="form-input" placeholder="Ej: Nike">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Costo Unitario *</label>
          <input type="number" name="costo_unitario_base" required min="0" step="0.01" class="form-input" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Precio de Venta *</label>
          <input type="number" name="precio_venta" required min="0" step="0.01" class="form-input" placeholder="0.00">
        </div>
      </div>
      
      <div class="form-group">
        <label>Proveedor</label>
        <select name="proveedor_principal_id" class="form-input">
          <option value="">Sin proveedor</option>
          ${proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
        </select>
      </div>
      
      <input type="hidden" name="codigo_barras" value="${codigo}">
    </form>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="submit" form="formProductoRapido" class="inv-btn inv-btn-primary">✅ Crear Producto</button>
  `);
  
  // Manejar envío del formulario
  document.getElementById('formProductoRapido').addEventListener('submit', async (e) => {
    e.preventDefault();
    await procesarCreacionProductoRapido(new FormData(e.target));
  });
}

/**
 * Procesa la creación de producto rápido con código asociado
 */
async function procesarCreacionProductoRapido(formData) {
  try {
    showLoading(document.body, "Creando producto...");
    
    const productoData = {
      nombre: formData.get('nombre'),
      categoria: formData.get('categoria') || null,
      marca: formData.get('marca') || null,
      costo_unitario_base: parseFloat(formData.get('costo_unitario_base')) || 0,
      precio_venta: parseFloat(formData.get('precio_venta')) || 0,
      proveedor_principal_id: formData.get('proveedor_principal_id') || null,
      stock_minimo: 5, // Valor por defecto
      ubicacion: null,
      stock_actual: 1 // Iniciar con 1 por el código escaneado
    };
    
    // Crear producto
    const result = await InventoryDB.crearProducto(productoData);
    
    if (result.success) {
      // Asociar código de barras
      const codigoBarras = formData.get('codigo_barras');
      const codigoResult = await InventoryDB.asociarCodigoBarras(result.producto.id, codigoBarras);
      
      if (codigoResult.success) {
        hideModal();
        showToast(`✅ Producto "${productoData.nombre}" creado y código asociado`, "success");
        
        // Recargar vista de productos
        loadView('productos');
      } else {
        throw new Error(codigoResult.error || 'Error al asociar código de barras');
      }
    } else {
      throw new Error(result.error || 'Error al crear producto');
    }
    
  } catch (error) {
    Logger.error("Error al crear producto rápido:", error);
    showToast("Error: " + error.message, "error");
    // Recargar vista actual si hay error
    const currentView = document.querySelector('.inv-view.active')?.id;
    if (currentView) {
      loadView(currentView.replace('view', ''));
    }
  }
}

/**
 * Muestra lista de productos existentes para asociar código
 */
async function mostrarProductosParaAsociar(codigo) {
  hideModal();
  
  try {
    // Mostrar modal de carga sin destruir el DOM
    showModal("🔍 Cargando Productos", `
      <div style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Cargando productos disponibles...</p>
      </div>
    `);
    
    Logger.info("Buscando productos para asociar código:", codigo);
    const productos = await InventoryDB.obtenerTodosProductos();
    Logger.info(`Encontrados ${productos.length} productos`);
    
    if (productos.length === 0) {
      // Mostrar mensaje de no hay productos
      document.body.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
          <h3>No hay productos registrados</h3>
          <p>Crea un producto primero antes de asociar códigos.</p>
          <button class="inv-btn inv-btn-primary" onclick="crearProductoRapido('${codigo}')">Crear Producto</button>
        </div>
      `;
      showToast("No hay productos registrados. Crea uno primero.", "info");
      setTimeout(() => crearProductoRapido(codigo), 500);
      return;
    }
    
    showModal(`🔗 Asociar Código: ${codigo}`, `
      <div class="inv-codigo-display">
        <div class="inv-codigo-escaneado">
          <span class="inv-codigo-label">Código a asociar:</span>
          <span class="inv-codigo-valor">${codigo}</span>
        </div>
      </div>
      
      <div class="inv-productos-lista">
        <div class="inv-buscar-producto">
          <input type="text" id="buscarProductoAsociar" placeholder="🔍 Buscar producto..." class="form-input">
        </div>
        
        <div class="inv-productos-grid" id="productosParaAsociar">
          ${productos.map(p => `
            <div class="inv-producto-card" onclick="asociarCodigoAProducto('${codigo}', ${p.id})">
              <div class="inv-producto-info">
                <strong>${p.nombre}</strong>
                <div class="inv-producto-detalles">
                  <span>Stock: ${p.stock_actual || 0}</span>
                  ${p.categoria ? `<span>${p.categoria}</span>` : ''}
                  ${p.marca ? `<span>${p.marca}</span>` : ''}
                </div>
              </div>
              <div class="inv-producto-accion">→</div>
            </div>
          `).join('')}
        </div>
      </div>
    `, `
      <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
    `);
    
    // Funcionalidad de búsqueda - con validación
    const buscarInput = document.getElementById('buscarProductoAsociar');
    if (buscarInput) {
      buscarInput.addEventListener('input', (e) => {
        const filtro = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.inv-producto-card');
        
        cards.forEach(card => {
          const texto = card.textContent.toLowerCase();
          card.style.display = texto.includes(filtro) ? 'flex' : 'none';
        });
      });
    } else {
      Logger.warn("Elemento de búsqueda no encontrado, continuando sin filtro");
    }
    
  } catch (error) {
    Logger.error("Error al cargar productos para asociar:", error);
    Logger.error("Stack trace:", error.stack);
    
    // Mostrar error específico al usuario
    const errorMessage = error.message || "Error desconocido";
    showModal("⚠️ Error al Cargar Productos", `
      <div class="inv-error-display">
        <p><strong>No se pudieron cargar los productos:</strong></p>
        <p class="error-detail">${errorMessage}</p>
        <p><small>Verifica tu conexión a internet e intenta de nuevo.</small></p>
      </div>
    `, `
      <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
      <button class="inv-btn inv-btn-primary" onclick="mostrarProductosParaAsociar('${codigo}')">Reintentar</button>
    `);
    
    showToast("Error al cargar productos. Verifica tu conexión.", "error");
  }
}

/**
 * Asociar código de barras a producto existente
 */
async function asociarCodigoAProducto(codigo, productoId) {
  try {
    // Mostrar estado de carga en el modal actual
    showModal("🔗 Asociando Código", `
      <div style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Asociando código <strong>${codigo}</strong> al producto...</p>
      </div>
    `);
    
    Logger.info(`Asociando código ${codigo} al producto ${productoId}`);
    const result = await InventoryDB.asociarCodigoBarrasEIncrementarStock(productoId, codigo);
    Logger.info("Resultado de asociación:", result);
    
    if (result.success) {
      hideModal();
      showToast(`✅ Código asociado - Nuevo stock: ${result.nuevoStock}`, "success");
      
      // Recargar vista actual
      const currentView = document.querySelector('.inv-view.active')?.id;
      if (currentView) {
        loadView(currentView.replace('view', ''));
      }
    } else {
      // Error específico del negocio
      const errorMsg = result.error || "Error al asociar código";
      Logger.warn("Error en asociación:", errorMsg);
      
      showModal("⚠️ Error al Asociar Código", `
        <div class="inv-error-display">
          <p><strong>No se pudo asociar el código:</strong></p>
          <p class="error-detail">${errorMsg}</p>
        </div>
      `, `
        <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
        <button class="inv-btn inv-btn-primary" onclick="mostrarProductosParaAsociar('${codigo}')">Elegir Otro Producto</button>
      `);
      
      showToast(errorMsg, "error");
    }
    
  } catch (error) {
    // Error técnico/de red
    Logger.error("Error técnico al asociar código:", error);
    Logger.error("Stack trace:", error.stack);
    
    const errorMessage = error.message || "Error de conexión";
    showModal("❌ Error de Sistema", `
      <div class="inv-error-display">
        <p><strong>Error técnico al asociar código:</strong></p>
        <p class="error-detail">${errorMessage}</p>
        <p><small>Verifica tu conexión e intenta de nuevo.</small></p>
      </div>
    `, `
      <button class="inv-btn inv-btn-secondary" onclick="hideModal()">Cerrar</button>
      <button class="inv-btn inv-btn-primary" onclick="asociarCodigoAProducto('${codigo}', ${productoId})">Reintentar</button>
    `);
    
    showToast("Error de conexión al asociar código", "error");
  }
}

// Nuevas funciones de feedback para el scanner
function playScanSound() {
  try {
    // Crear sonido de beep con Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 2000; // Frecuencia del beep
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    // Fallback silencioso si no hay soporte de audio
    console.log('Audio no soportado');
  }
}

function vibrateDevice() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]); // Patrón de vibración
    }
  } catch (e) {
    // Vibración no soportada
    console.log('Vibración no soportada');
  }
}

function showScanFeedback(codigo) {
  const scannerResult = document.getElementById('scannerResult');
  if (scannerResult) {
    scannerResult.textContent = codigo;
    scannerResult.classList.add('inv-scanner-result-show');
    
    // Ocultar después de 2 segundos
    setTimeout(() => {
      scannerResult.classList.remove('inv-scanner-result-show');
    }, 2000);
  }
}

function showScanSuccess() {
  const scannerOverlay = document.getElementById('scannerOverlay');
  if (scannerOverlay) {
    scannerOverlay.classList.add('inv-scanner-success');
    
    // Remover clase después de la animación
    setTimeout(() => {
      scannerOverlay.classList.remove('inv-scanner-success');
    }, 600);
  }
}

function showScanError() {
  const scannerOverlay = document.getElementById('scannerOverlay');
  if (scannerOverlay) {
    scannerOverlay.classList.add('inv-scanner-error');
    
    // Remover clase después de la animación
    setTimeout(() => {
      scannerOverlay.classList.remove('inv-scanner-error');
    }, 600);
  }
}

function showScannerFallback() {
  if (scannerFallback) {
    scannerFallback.style.display = "block";
  }
  const viewport = document.querySelector(".inv-scanner-viewport");
  const controls = document.querySelector(".inv-scanner-controls");
  
  if (viewport) viewport.style.display = "none";
  if (controls) controls.style.display = "none";
}

function closeScanner() {
  // Detener loop de detección
  stopDetectionLoop();
  
  scannerActive = false;
  scannerStartTime = 0; // Reset timer
  scannerTipsShown = false; // Reset tips
  scannerAttemptCount = 0; // Reset contador
  
  Logger.info(`📊 Total de intentos en esta sesión: ${scannerAttemptCount}`);
  
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  
  if (scannerVideo) {
    scannerVideo.srcObject = null;
  }
  
  if (scannerOverlay) {
    scannerOverlay.style.display = "none";
  }
  
  if (scannerFallback) {
    scannerFallback.style.display = "none";
  }
  
  if (scannerToggleFlash) {
    scannerToggleFlash.style.display = "none";
  }
  
  if (cameraSelect) {
    cameraSelect.style.display = "none";
  }
  
  document.querySelector(".inv-scanner-viewport")?.style.setProperty('display', 'flex');
  document.querySelector(".inv-scanner-controls")?.style.setProperty('display', 'flex');
  
  // Ocultar indicador de actividad
  const activeIndicator = document.getElementById('scannerActiveIndicator');
  if (activeIndicator) {
    activeIndicator.style.display = 'none';
  }
  
  // Restablecer estado visual completo
  const instructionsBox = document.getElementById('scannerInstructionsBox');
  const scannerInfo = document.getElementById('scannerInfo');
  const overlay = document.querySelector('.inv-scanner-frame');
  const corners = document.querySelectorAll('.inv-scanner-corner');
  
  if (instructionsBox) {
    instructionsBox.classList.remove('success');
  }
  
  if (scannerInfo) {
    scannerInfo.innerHTML = "Listo para escanear";
    scannerInfo.style.color = '';
    scannerInfo.style.fontWeight = '';
  }
  
  if (overlay) {
    overlay.style.borderColor = '';
    overlay.style.boxShadow = '';
  }
  
  corners.forEach(corner => {
    corner.style.borderColor = '';
    corner.style.filter = '';
  });
  
  lastScannedCode = null;
}

if (scannerClose) {
  scannerClose.addEventListener("click", closeScanner);
}

if (scannerManualInput) {
  scannerManualInput.addEventListener("click", () => {
    closeScanner();
    showScannerFallback();
  });
}

// Botón de información del scanner
const scannerInfoBtn = document.getElementById('scannerInfoBtn');
if (scannerInfoBtn) {
  scannerInfoBtn.addEventListener('click', () => {
    showModal('ℹ️ Información del Scanner', `
      <div style="text-align: left; line-height: 1.6;">
        <h4>🔍 Cómo usar el scanner:</h4>
        <ul>
          <li><strong>Posición:</strong> Mantén el código de barras a 10-30cm de la cámara</li>
          <li><strong>Iluminación:</strong> Asegúrate de tener buena luz, evita reflejos</li>
          <li><strong>Estabilidad:</strong> Mantén el dispositivo firme para mejor enfoque</li>
          <li><strong>Orientación:</strong> El código puede estar horizontal o vertical</li>
        </ul>
        
        <h4 style="margin-top: 1rem;">⚙️ Compatibilidad:</h4>
        <ul>
          <li><strong>Chrome/Edge:</strong> Usa BarcodeDetector nativo (más rápido)</li>
          <li><strong>Safari/Firefox:</strong> Usa ZXing como fallback</li>
          <li><strong>Formatos soportados:</strong> EAN-13, EAN-8, Code-128, QR</li>
        </ul>
      </div>
    `, `<button onclick="hideModal()" class="inv-btn inv-btn-primary">Entendido</button>`);
  });
}

// Input manual mejorado con botón clear
const clearManualInput = document.getElementById('clearManualInput');

if (manualBarcodeInput && clearManualInput) {
  manualBarcodeInput.addEventListener('input', (e) => {
    if (e.target.value.length > 0) {
      clearManualInput.style.display = 'block';
    } else {
      clearManualInput.style.display = 'none';
    }
  });
  
  clearManualInput.addEventListener('click', () => {
    manualBarcodeInput.value = '';
    clearManualInput.style.display = 'none';
    manualBarcodeInput.focus();
  });
}

if (btnManualBarcodeSubmit && manualBarcodeInput) {
  btnManualBarcodeSubmit.addEventListener("click", () => {
    const codigo = manualBarcodeInput.value.trim();
    if (codigo) {
      processScan(codigo);
      closeScanner();
    }
  });
}

// Event listener para cambio de cámara
if (cameraSelect) {
  cameraSelect.addEventListener("change", async (e) => {
    selectedCameraId = e.target.value;
    
    if (selectedCameraId && scannerActive) {
      Logger.info("Cambiando a cámara:", selectedCameraId);
      
      // Detener detección
      stopDetectionLoop();
      
      // Detener stream actual
      if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
      }
      
      try {
        // Iniciar nueva cámara
        await startCamera();
        
        // Reiniciar detección
        startDetectionLoop();
        
        showToast("Cámara cambiada", "success");
      } catch (error) {
        Logger.error("Error al cambiar cámara:", error);
        showToast("No se pudo cambiar la cámara", "error");
      }
    }
  });
}

// ========== OTRAS FUNCIONES ==========
function openAssociateBarcode(productoId) {
  currentProductoForAssociation = productoId;
  scannerMode = "asociar";
  openScanner();
}

async function viewProducto(id) {
  try {
    const producto = await InventoryDB.obtenerProductoPorId(id);
    
    if (!producto) {
      showToast("❌ Producto no encontrado", "error");
      return;
    }
    
    const stockBajo = parseFloat(producto.stock_actual) < parseFloat(producto.stock_minimo);
    const stockCero = parseFloat(producto.stock_actual) === 0;
    
    showModal(`📦 ${producto.nombre}`, `
      <div class="inv-producto-detail">
        <!-- Información Principal -->
        <div class="inv-producto-info-grid">
          <!-- Stock Destacado -->
          <div class="inv-stock-card ${stockCero ? 'stock-zero' : stockBajo ? 'stock-low' : 'stock-ok'}">
            <div class="inv-stock-label">Stock Actual</div>
            <div class="inv-stock-value" id="productoStockActual">${producto.stock_actual}</div>
            <div class="inv-stock-status">
              ${stockCero ? '❌ Sin stock' : stockBajo ? '⚠️ Stock bajo' : '✅ Stock normal'}
            </div>
          </div>
          
          <!-- Información Básica -->
          <div class="inv-info-section">
            <div class="inv-info-row">
              <span class="inv-info-label">SKU:</span>
              <span class="inv-info-value">${producto.sku}</span>
            </div>
            ${producto.categoria ? `
              <div class="inv-info-row">
                <span class="inv-info-label">Categoría:</span>
                <span class="inv-info-value">${producto.categoria}</span>
              </div>
            ` : ''}
            ${producto.marca ? `
              <div class="inv-info-row">
                <span class="inv-info-label">Marca:</span>
                <span class="inv-info-value">${producto.marca}</span>
              </div>
            ` : ''}
            <div class="inv-info-row">
              <span class="inv-info-label">Precio:</span>
              <span class="inv-info-value" style="color: var(--success); font-weight: 600;">
                $${parseFloat(producto.precio_sugerido).toLocaleString('es-CO', {minimumFractionDigits: 0})}
              </span>
            </div>
            ${producto.ubicacion ? `
              <div class="inv-info-row">
                <span class="inv-info-label">Ubicación:</span>
                <span class="inv-info-value">${producto.ubicacion}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        <!-- Sección de Códigos de Barras -->
        <div class="inv-codigos-section">
          <div class="inv-section-header">
            <h3 class="inv-section-title">🏷️ Códigos de Barras Asociados</h3>
            <span class="inv-badge inv-badge-primary">${producto.inv_codigos_barras?.length || 0} códigos</span>
          </div>
          
          <!-- Alerta informativa -->
          <div class="inv-alert inv-alert-info" style="margin-bottom: 1rem;">
            <strong>ℹ️ Gestión de stock por códigos:</strong><br>
            Cada código de barras escaneado representa una unidad del producto.<br>
            El stock aumenta automáticamente con cada código asociado.
          </div>
          
          <!-- Botón de Escaneo -->
          <button 
            class="inv-btn inv-btn-primary inv-btn-large" 
            onclick="currentProductoForAssociation=${id}; scannerMode='asociar'; openScanner()"
            style="width: 100%; margin-bottom: 1.5rem; padding: 1.5rem; font-size: 1.125rem;"
          >
            📷 Escanear Código de Barras
          </button>
          
          <!-- Lista de Códigos -->
          <div class="inv-codigos-list" id="listaCodigosBarras">
            ${producto.inv_codigos_barras && producto.inv_codigos_barras.length > 0 
              ? producto.inv_codigos_barras.map((cb, idx) => `
                  <div class="inv-codigo-item">
                    <span class="inv-codigo-numero">#${idx + 1}</span>
                    <span class="inv-codigo-valor">${cb.codigo}</span>
                    <button 
                      class="inv-btn-icon-danger" 
                      onclick="eliminarCodigoBarras(${cb.id}, ${id})" 
                      title="Eliminar código"
                    >
                      🗑️
                    </button>
                  </div>
                `)

.join('')
              : '<p style="color: var(--gray-500); text-align: center; padding: 2rem;">No hay códigos asociados aún.<br>Comienza escaneando códigos para asociar.</p>'
            }
          </div>
        </div>
        
        <!-- Acciones Adicionales -->
        <div class="inv-actions-grid" style="margin-top: 1.5rem;">
          <button class="inv-btn inv-btn-secondary" onclick="editProducto(${id})">
            ✏️ Editar Producto
          </button>
          <button class="inv-btn inv-btn-secondary" onclick="adjustStock(${id})">
            📊 Ajustar Stock
          </button>
        </div>
      </div>
    `, `
      <button type="button" class="btn-secondary" onclick="hideModal(); loadView('productos')">
        Cerrar
      </button>
    `);
    
    // Guardar referencia global para el scanner
    currentProductoForAssociation = id;
    
  } catch (error) {
    Logger.error("Error al ver producto:", error);
    showToast("Error al cargar producto", "error");
  }
}

async function eliminarCodigoBarras(codigoId, productoId) {
  if (!confirm("¿Estás seguro de eliminar este código de barras?\n\n⚠️ IMPORTANTE: Esto NO reducirá el stock automáticamente.\nDeberás ajustar el stock manualmente si lo deseas.")) {
    return;
  }
  
  try {
    const result = await InventoryDB.eliminarCodigoBarras(codigoId);
    
    if (result.success) {
      showToast("✅ Código eliminado exitosamente", "success");
      // Recargar la vista del producto
      viewProducto(productoId);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    Logger.error("Error al eliminar código:", error);
    showToast("❌ Error al eliminar código", "error");
  }
}

async function editProducto(id) {
  // Implementar edición de producto
  showToast("Edición en desarrollo", "info");
}

// Ajustar stock de producto
async function adjustStock(id) {
  const producto = productosData.find(p => p.id === id);
  if (!producto) {
    showToast("Producto no encontrado", "error");
    return;
  }
  
  showModal(`📊 Ajustar Stock: ${producto.nombre}`, `
    <div style="display: flex; flex-direction: column; gap: var(--inv-space-4);">
      <!-- Stock Actual -->
      <div style="background: var(--inv-bg-secondary); padding: var(--inv-space-4); border-radius: var(--inv-radius-lg); text-align: center;">
        <div style="font-size: 0.875rem; color: var(--inv-text-secondary); margin-bottom: var(--inv-space-2);">Stock Actual</div>
        <div style="font-size: 2.5rem; font-weight: 700; color: var(--inv-primary);">${producto.stock_actual}</div>
      </div>
      
      <!-- Tipo de Ajuste -->
      <div class="inv-form-group">
        <label class="inv-form-label">Tipo de Ajuste</label>
        <select id="adjustType" class="inv-form-select" onchange="document.getElementById('adjustQuantity').focus()">
          <option value="add">➕ Aumentar Stock (Entrada)</option>
          <option value="remove">➖ Reducir Stock (Salida)</option>
          <option value="set">🎯 Establecer Cantidad Exacta</option>
        </select>
      </div>
      
      <!-- Cantidad -->
      <div class="inv-form-group">
        <label class="inv-form-label required">Cantidad</label>
        <input type="number" id="adjustQuantity" class="inv-form-input" min="0" step="0.01" placeholder="Ej: 10" required>
      </div>
      
      <!-- Nota -->
      <div class="inv-form-group">
        <label class="inv-form-label">Nota (Opcional)</label>
        <textarea id="adjustNote" class="inv-form-textarea" placeholder="Ej: Ajuste por inventario físico, producto dañado, etc." rows="3"></textarea>
      </div>
    </div>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="button" class="inv-btn inv-btn-primary" onclick="confirmAdjustStock(${id})">
      ✅ Confirmar Ajuste
    </button>
  `);
  
  // Focus en cantidad
  setTimeout(() => {
    document.getElementById("adjustQuantity")?.focus();
  }, 300);
}

async function confirmAdjustStock(id) {
  const type = document.getElementById("adjustType").value;
  const quantityInput = document.getElementById("adjustQuantity");
  const note = document.getElementById("adjustNote").value;
  
  const quantity = parseFloat(quantityInput.value);
  
  if (!quantity || quantity <= 0) {
    showToast("Ingresa una cantidad válida", "warning");
    quantityInput.focus();
    return;
  }
  
  const producto = productosData.find(p => p.id === id);
  const stockActual = parseFloat(producto.stock_actual);
  let nuevoStock;
  let cantidadMovimiento;
  
  if (type === "add") {
    nuevoStock = stockActual + quantity;
    cantidadMovimiento = quantity;
  } else if (type === "remove") {
    nuevoStock = Math.max(0, stockActual - quantity);
    cantidadMovimiento = -quantity;
    
    if (nuevoStock === 0 && stockActual - quantity < 0) {
      showToast(`Solo hay ${stockActual} unidades disponibles`, "warning");
      return;
    }
  } else if (type === "set") {
    nuevoStock = quantity;
    cantidadMovimiento = quantity - stockActual;
  }
  
  try {
    // Ajustar stock (actualiza producto y registra movimiento automáticamente)
    const result = await InventoryDB.ajustarStock(id, cantidadMovimiento, note || 'Ajuste manual');
    
    if (result.success) {
      showToast(`Stock ajustado: ${stockActual} → ${nuevoStock}`, "success");
      hideModal();
      
      // Recargar vista
      loadView('productos');
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    Logger.error("Error al ajustar stock:", error);
    showToast(error.message || "Error al ajustar stock", "error");
  }
}

async function viewVenta(id) {
  openSaleDetail(id);
}

async function viewCompra(id) {
  try {
    showLoading(document.body, "Cargando detalle de compra...");
    const compra = await InventoryDB.obtenerCompraPorId(id);
    
    if (!compra) {
      showToast("Compra no encontrada", "error");
      return;
    }
    
    const items = compra.inv_compra_items || [];
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.cantidad || 0) * parseFloat(item.costo_unitario || 0)), 0);
    const gastosAdicionales = parseFloat(compra.total || 0) - subtotal;
    
    showModal(`🛒 Detalle de Compra #${compra.id}`, `
      <div class="inv-purchase-detail-modal">
        <!-- Header de la compra -->
        <div class="inv-purchase-detail-header">
          <div class="inv-purchase-main-info">
            <div class="inv-purchase-id-badge">#${compra.id}</div>
            <div class="inv-purchase-date">
              <span class="inv-purchase-date-icon">📅</span>
              <span>${formatDate(compra.fecha)}</span>
            </div>
          </div>
          <div class="inv-purchase-total-badge">
            ${formatCurrency(compra.total || 0)}
          </div>
        </div>
        
        <!-- Info de la compra -->
        <div class="inv-purchase-info-grid">
          <div class="inv-purchase-info-card">
            <div class="inv-purchase-info-label">🏭 Proveedor</div>
            <div class="inv-purchase-info-value">${compra.proveedor?.nombre || 'Sin proveedor'}</div>
          </div>
          <div class="inv-purchase-info-card">
            <div class="inv-purchase-info-label">📄 Referencia</div>
            <div class="inv-purchase-info-value">${compra.referencia || 'Sin referencia'}</div>
          </div>
          <div class="inv-purchase-info-card">
            <div class="inv-purchase-info-label">💳 Método de Pago</div>
            <div class="inv-purchase-info-value">${compra.metodo_pago || 'No especificado'}</div>
          </div>
          <div class="inv-purchase-info-card">
            <div class="inv-purchase-info-label">📦 Total Items</div>
            <div class="inv-purchase-info-value">${items.length} productos</div>
          </div>
        </div>
        
        <!-- Items de la compra -->
        <div class="inv-purchase-items-section">
          <h4 class="inv-purchase-items-title">
            <span>📦</span>
            <span>Productos Comprados</span>
          </h4>
          
          <div class="inv-purchase-items-list">
            ${items.map(item => `
              <div class="inv-purchase-item-card">
                <div class="inv-purchase-item-info">
                  <div class="inv-purchase-item-name">${item.inv_productos?.nombre || 'Producto no encontrado'}</div>
                  <div class="inv-purchase-item-meta">
                    <span class="inv-purchase-item-quantity">Cantidad: ${parseFloat(item.cantidad || 0).toFixed(2)}</span>
                    <span class="inv-purchase-item-unit-cost">${formatCurrency(item.costo_unitario || 0)} c/u</span>
                  </div>
                </div>
                <div class="inv-purchase-item-total">
                  ${formatCurrency((parseFloat(item.cantidad || 0) * parseFloat(item.costo_unitario || 0)))}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Resumen financiero -->
        <div class="inv-purchase-summary">
          <div class="inv-purchase-summary-row">
            <span>Subtotal productos:</span>
            <span>${formatCurrency(subtotal)}</span>
          </div>
          ${gastosAdicionales > 0 ? `
            <div class="inv-purchase-summary-row">
              <span>Gastos adicionales:</span>
              <span>${formatCurrency(gastosAdicionales)}</span>
            </div>
          ` : ''}
          <div class="inv-purchase-summary-row inv-purchase-summary-total">
            <span>Total pagado:</span>
            <span>${formatCurrency(compra.total || 0)}</span>
          </div>
        </div>
        
        <!-- Información adicional -->
        ${compra.notas ? `
          <div class="inv-purchase-notes">
            <h4>📝 Notas</h4>
            <p>${compra.notas}</p>
          </div>
        ` : ''}
      </div>
    `, `
      <button onclick="hideModal()" class="inv-btn inv-btn-secondary">Cerrar</button>
      ${compra.referencia ? `<button onclick="window.print()" class="inv-btn inv-btn-outline">🖨️ Imprimir</button>` : ''}
    `);
    
  } catch (error) {
    Logger.error("Error al cargar detalle de compra:", error);
    showToast("Error al cargar el detalle de la compra", "error");
  }
  // No es necesario hideLoading() porque showModal reemplaza el contenido
}

async function editProveedor(id) {
  // Implementar edición de proveedor
  showToast("Edición en desarrollo", "info");
}

// ========== FUNCIONES AUXILIARES PARA COMPRAS ==========
function renderComprasCardsMobile(compras) {
  if (compras.length === 0) {
    return '<div class="inv-empty-message">No hay compras registradas</div>';
  }

  return compras.map(compra => `
    <div class="inv-purchase-card-mobile" onclick="viewCompra(${compra.id})">
      <div class="inv-purchase-card-header">
        <div class="inv-purchase-card-id">#${compra.id}</div>
        <div class="inv-purchase-card-date">${formatDate(compra.fecha)}</div>
      </div>
      
      <div class="inv-purchase-card-info">
        <div class="inv-purchase-card-supplier">
          <span class="inv-purchase-card-icon">🏭</span>
          <span>${compra.proveedor?.nombre || 'Sin proveedor'}</span>
        </div>
        ${compra.referencia ? `
          <div class="inv-purchase-card-reference">
            <span class="inv-purchase-card-icon">📄</span>
            <span>${compra.referencia}</span>
          </div>
        ` : ''}
      </div>
      
      <div class="inv-purchase-card-footer">
        <div class="inv-purchase-card-items">
          <span class="inv-purchase-card-icon">📦</span>
          <span>${compra.inv_compra_items?.length || 0} productos</span>
        </div>
        <div class="inv-purchase-card-total">
          ${formatCurrency(compra.total || 0)}
        </div>
      </div>
      
      <div class="inv-purchase-card-ripple"></div>
    </div>
  `).join('');
}

function renderComprasCardsDesktop(compras) {
  if (compras.length === 0) {
    return '<div class="inv-empty-message-desktop">No hay compras registradas</div>';
  }

  return compras.map(compra => `
    <div class="inv-purchase-card-desktop" onclick="viewCompra(${compra.id})">
      <div class="inv-purchase-card-desktop-header">
        <div class="inv-purchase-card-desktop-id">#${compra.id}</div>
        <div class="inv-purchase-card-desktop-date">
          <span class="inv-icon">📅</span>
          <span>${formatDate(compra.fecha)}</span>
        </div>
      </div>
      
      <div class="inv-purchase-card-desktop-body">
        <div class="inv-purchase-info-row">
          <span class="inv-icon">🏭</span>
          <span class="inv-purchase-label">Proveedor:</span>
          <span class="inv-purchase-value">${compra.proveedor?.nombre || 'Sin proveedor'}</span>
        </div>
        
        ${compra.referencia ? `
          <div class="inv-purchase-info-row">
            <span class="inv-icon">📄</span>
            <span class="inv-purchase-label">Referencia:</span>
            <span class="inv-purchase-value">${compra.referencia}</span>
          </div>
        ` : ''}
        
        <div class="inv-purchase-info-row">
          <span class="inv-icon">💳</span>
          <span class="inv-purchase-label">Método:</span>
          <span class="inv-purchase-value">${compra.metodo_pago || 'No especificado'}</span>
        </div>
      </div>
      
      <div class="inv-purchase-card-desktop-footer">
        <div class="inv-purchase-items-count">
          <span class="inv-icon">📦</span>
          <span>${compra.inv_compra_items?.length || 0} productos</span>
        </div>
        <div class="inv-purchase-total-amount">
          ${formatCurrency(compra.total || 0)}
        </div>
      </div>
      
      <div class="inv-purchase-card-desktop-hover"></div>
    </div>
  `).join('');
}

function setupComprasFiltering(comprasOriginal) {
  const isMobile = window.innerWidth <= 768;
  const searchId = isMobile ? 'searchComprasMobile' : 'searchComprasDesktop';
  const filterProveedorId = isMobile ? 'filterProveedorMobile' : 'filterProveedorDesktop';
  const filterMesId = isMobile ? 'filterMesMobile' : 'filterMesDesktop';
  const containerId = isMobile ? 'purchasesList' : 'purchasesGrid';
  const emptyStateId = isMobile ? 'emptyStatePurchases' : 'emptyStatePurchasesDesktop';
  
  function applyFilters() {
    const searchTerm = document.getElementById(searchId)?.value.toLowerCase() || '';
    const proveedorFilter = document.getElementById(filterProveedorId)?.value || '';
    const mesFilter = document.getElementById(filterMesId)?.value || '';
    
    let filtered = comprasOriginal.filter(compra => {
      // Filtro de búsqueda
      const matchesSearch = !searchTerm || 
        compra.referencia?.toLowerCase().includes(searchTerm) ||
        compra.proveedor?.nombre?.toLowerCase().includes(searchTerm) ||
        compra.id?.toString().includes(searchTerm);
      
      // Filtro de proveedor
      const matchesProveedor = !proveedorFilter || 
        compra.proveedor?.nombre === proveedorFilter;
      
      // Filtro de mes
      let matchesMes = true;
      if (mesFilter) {
        const fechaCompra = new Date(compra.fecha);
        const ahora = new Date();
        
        switch (mesFilter) {
          case 'este-mes':
            matchesMes = fechaCompra.getMonth() === ahora.getMonth() && 
                        fechaCompra.getFullYear() === ahora.getFullYear();
            break;
          case 'ultimo-mes':
            const ultimoMes = new Date(ahora.getFullYear(), ahora.getMonth() - 1);
            matchesMes = fechaCompra.getMonth() === ultimoMes.getMonth() && 
                        fechaCompra.getFullYear() === ultimoMes.getFullYear();
            break;
          case 'ultimos-3-meses':
            const tresMesesAtras = new Date();
            tresMesesAtras.setMonth(ahora.getMonth() - 3);
            matchesMes = fechaCompra >= tresMesesAtras;
            break;
        }
      }
      
      return matchesSearch && matchesProveedor && matchesMes;
    });
    
    // Renderizar resultados
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);
    
    if (filtered.length > 0) {
      container.innerHTML = isMobile ? 
        renderComprasCardsMobile(filtered) : 
        renderComprasCardsDesktop(filtered);
      container.style.display = 'block';
      emptyState.style.display = 'none';
    } else {
      container.style.display = 'none';
      emptyState.style.display = 'flex';
    }
  }
  
  // Event listeners
  document.getElementById(searchId)?.addEventListener('input', applyFilters);
  document.getElementById(filterProveedorId)?.addEventListener('change', applyFilters);
  document.getElementById(filterMesId)?.addEventListener('change', applyFilters);
}

function formatCurrencyShort(amount) {
  const num = parseFloat(amount || 0);
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `$${(num / 1000).toFixed(0)}K`;
  }
  return formatCurrency(num);
}

// Reportes
async function generarReporteUtilidades() {
  showToast("Generando reporte de utilidades...", "info");
  
  try {
    const ventas = await InventoryDB.obtenerTodasVentas();
    
    if (ventas.length === 0) {
      showToast("No hay datos de ventas para generar el reporte", "warning");
      return;
    }
    
    // Calcular utilidades por producto
    const utilidadesPorProducto = {};
    let utilidadTotal = 0;
    let ventasTotal = 0;
    
    ventas.forEach(venta => {
      const utilidad = parseFloat(venta.precio_venta || 0) - parseFloat(venta.precio_compra || 0);
      utilidadTotal += utilidad;
      ventasTotal += parseFloat(venta.precio_venta || 0);
      
      if (!utilidadesPorProducto[venta.producto_id]) {
        utilidadesPorProducto[venta.producto_id] = {
          nombre: venta.inv_productos?.nombre || 'Producto Desconocido',
          utilidad: 0,
          unidadesVendidas: 0,
          ventas: 0
        };
      }
      
      utilidadesPorProducto[venta.producto_id].utilidad += utilidad;
      utilidadesPorProducto[venta.producto_id].unidadesVendidas += 1;
      utilidadesPorProducto[venta.producto_id].ventas += parseFloat(venta.precio_venta || 0);
    });
    
    const productosOrdenados = Object.values(utilidadesPorProducto)
      .sort((a, b) => b.utilidad - a.utilidad);
    
    const margenPromedio = ventasTotal > 0 ? ((utilidadTotal / ventasTotal) * 100).toFixed(2) : 0;
    
    showModal("💰 Reporte de Utilidades", `
      <div class="inv-report-modal">
        <!-- Resumen de KPIs -->
        <div class="inv-report-kpis">
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div class="inv-report-kpi-label">Utilidad Total</div>
            <div class="inv-report-kpi-value">${utilidadTotal.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div class="inv-report-kpi-label">Ventas Totales</div>
            <div class="inv-report-kpi-value">${ventasTotal.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <div class="inv-report-kpi-label">Margen Promedio</div>
            <div class="inv-report-kpi-value">${margenPromedio}%</div>
          </div>
        </div>
        
        <!-- Tabla de detalle -->
        <div class="inv-report-table-container">
          <h3 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--inv-text-primary);">
            📊 Utilidades por Producto
          </h3>
          <table class="inv-report-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidades</th>
                <th>Ventas</th>
                <th>Utilidad</th>
                <th>Margen %</th>
              </tr>
            </thead>
            <tbody>
              ${productosOrdenados.map(p => {
                const margen = p.ventas > 0 ? ((p.utilidad / p.ventas) * 100).toFixed(2) : 0;
                return `
                  <tr>
                    <td><strong>${p.nombre}</strong></td>
                    <td>${p.unidadesVendidas}</td>
                    <td>${p.ventas.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</td>
                    <td style="color: ${p.utilidad >= 0 ? 'var(--inv-success)' : 'var(--inv-danger)'}; font-weight: 600;">
                      ${p.utilidad.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
                    </td>
                    <td><span class="inv-badge" style="background: ${margen >= 30 ? 'var(--inv-success-light)' : margen >= 15 ? 'var(--inv-warning-light)' : 'var(--inv-danger-light)'};">${margen}%</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `, `
      <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
      <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al generar reporte de utilidades:", error);
    showToast("Error al generar el reporte", "error");
  }
}

async function generarReporteRotacion() {
  showToast("Generando reporte de rotación...", "info");
  
  try {
    const productos = await InventoryDB.obtenerTodosProductos();
    const ventas = await InventoryDB.obtenerTodasVentas();
    
    // Contar ventas por producto
    const ventasPorProducto = {};
    ventas.forEach(venta => {
      if (!ventasPorProducto[venta.producto_id]) {
        ventasPorProducto[venta.producto_id] = 0;
      }
      ventasPorProducto[venta.producto_id]++;
    });
    
    // Clasificar productos
    const productosConVentas = productos.map(p => ({
      ...p,
      totalVentas: ventasPorProducto[p.id] || 0,
      rotacion: ventasPorProducto[p.id] 
        ? (parseFloat(p.stock_actual) > 0 
            ? (ventasPorProducto[p.id] / parseFloat(p.stock_actual)).toFixed(2) 
            : '∞') 
        : 0
    }));
    
    const masVendidos = productosConVentas
      .filter(p => p.totalVentas > 0)
      .sort((a, b) => b.totalVentas - a.totalVentas)
      .slice(0, 10);
    
    const menosVendidos = productosConVentas
      .filter(p => p.totalVentas === 0 && parseFloat(p.stock_actual) > 0)
      .sort((a, b) => parseFloat(b.stock_actual) - parseFloat(a.stock_actual))
      .slice(0, 10);
    
    showModal("🔄 Reporte de Rotación de Inventario", `
      <div class="inv-report-modal">
        <!-- Métricas -->
        <div class="inv-report-kpis">
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div class="inv-report-kpi-label">Productos Activos</div>
            <div class="inv-report-kpi-value">${masVendidos.length}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            <div class="inv-report-kpi-label">Sin Movimiento</div>
            <div class="inv-report-kpi-value">${menosVendidos.length}</div>
          </div>
        </div>
        
        <!-- Productos más vendidos -->
        <div class="inv-report-section">
          <h3 class="inv-report-section-title">🏆 Top 10 Productos Más Vendidos</h3>
          ${masVendidos.length > 0 ? `
            <table class="inv-report-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Ventas</th>
                  <th>Stock Actual</th>
                  <th>Índice Rotación</th>
                </tr>
              </thead>
              <tbody>
                ${masVendidos.map((p, idx) => `
                  <tr>
                    <td><span class="inv-badge inv-badge-primary">${idx + 1}</span></td>
                    <td><strong>${p.nombre}</strong></td>
                    <td style="color: var(--inv-success); font-weight: 600;">${p.totalVentas} unidades</td>
                    <td>${p.stock_actual}</td>
                    <td><span class="inv-badge inv-badge-success">${p.rotacion}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="inv-empty-message">No hay productos con ventas registradas</p>'}
        </div>
        
        <!-- Productos sin movimiento -->
        <div class="inv-report-section">
          <h3 class="inv-report-section-title">⚠️ Productos Sin Movimiento (Con Stock)</h3>
          ${menosVendidos.length > 0 ? `
            <table class="inv-report-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock Actual</th>
                  <th>Precio</th>
                  <th>Valor Inmovilizado</th>
                </tr>
              </thead>
              <tbody>
                ${menosVendidos.map(p => {
                  const valorInmovilizado = parseFloat(p.stock_actual) * parseFloat(p.precio_sugerido || 0);
                  return `
                    <tr>
                      <td><strong>${p.nombre}</strong></td>
                      <td style="color: var(--inv-warning); font-weight: 600;">${p.stock_actual}</td>
                      <td>${parseFloat(p.precio_sugerido).toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</td>
                      <td style="color: var(--inv-danger);">${valorInmovilizado.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="inv-alert inv-alert-warning" style="margin-top: 1rem;">
              <strong>💡 Recomendación:</strong> Considere estrategias de descuento o promociones para estos productos
            </div>
          ` : '<p class="inv-empty-message">¡Excelente! Todos los productos tienen movimiento</p>'}
        </div>
      </div>
    `, `
      <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
      <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al generar reporte de rotación:", error);
    showToast("Error al generar el reporte", "error");
  }
}

async function generarReporteStockBajo() {
  const productos = await InventoryDB.obtenerTodosProductos({ stockBajo: true });
  
  if (productos.length === 0) {
    showToast("✅ No hay productos con stock bajo", "success");
    return;
  }
  
  // Calcular valor a reponer
  let valorTotalReponer = 0;
  const productosConCalculo = productos.map(p => {
    const cantidadReponer = parseFloat(p.stock_minimo) - parseFloat(p.stock_actual);
    const valorReponer = cantidadReponer * parseFloat(p.precio_sugerido || 0);
    valorTotalReponer += valorReponer;
    return {
      ...p,
      cantidadReponer,
      valorReponer
    };
  });
  
  showModal("⚠️ Productos con Stock Bajo", `
    <div class="inv-report-modal">
      <!-- KPIs -->
      <div class="inv-report-kpis">
        <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          <div class="inv-report-kpi-label">Productos Afectados</div>
          <div class="inv-report-kpi-value">${productos.length}</div>
        </div>
        <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
          <div class="inv-report-kpi-label">Valor a Reponer</div>
          <div class="inv-report-kpi-value" style="font-size: 1.25rem;">
            ${valorTotalReponer.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
          </div>
        </div>
      </div>
      
      <!-- Tabla -->
      <div class="inv-report-table-container">
        <table class="inv-report-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Stock Actual</th>
              <th>Stock Mínimo</th>
              <th>A Reponer</th>
              <th>Valor Estimado</th>
            </tr>
          </thead>
          <tbody>
            ${productosConCalculo.map(p => `
              <tr>
                <td><strong>${p.nombre}</strong></td>
                <td style="color: var(--inv-danger); font-weight: 600;">${p.stock_actual}</td>
                <td>${p.stock_minimo}</td>
                <td style="color: var(--inv-info); font-weight: 600;">${p.cantidadReponer}</td>
                <td>${p.valorReponer.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="inv-alert inv-alert-warning" style="margin-top: 1.5rem;">
        <strong>⚠️ Acción Requerida:</strong> Estos productos necesitan reposición urgente
      </div>
    </div>
  `, `
    <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
    <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
  `);
}

async function generarReporteVentasMes() {
  showToast("Generando reporte de ventas del mes...", "info");
  
  try {
    const ventas = await InventoryDB.obtenerTodasVentas();
    
    // Filtrar ventas del mes actual
    const mesActual = new Date().getMonth();
    const añoActual = new Date().getFullYear();
    
    const ventasMes = ventas.filter(v => {
      const fecha = new Date(v.fecha);
      return fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual;
    });
    
    if (ventasMes.length === 0) {
      showToast("No hay ventas registradas este mes", "warning");
      return;
    }
    
    // Calcular métricas
    const totalVentas = ventasMes.reduce((sum, v) => sum + parseFloat(v.precio_venta || 0), 0);
    const totalUtilidad = ventasMes.reduce((sum, v) => 
      sum + (parseFloat(v.precio_venta || 0) - parseFloat(v.precio_compra || 0)), 0);
    const promedioVenta = totalVentas / ventasMes.length;
    
    // Agrupar por día
    const ventasPorDia = {};
    ventasMes.forEach(v => {
      const dia = new Date(v.fecha).getDate();
      if (!ventasPorDia[dia]) {
        ventasPorDia[dia] = { cantidad: 0, monto: 0 };
      }
      ventasPorDia[dia].cantidad++;
      ventasPorDia[dia].monto += parseFloat(v.precio_venta || 0);
    });
    
    const nombreMes = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    
    showModal(`📊 Ventas de ${nombreMes}`, `
      <div class="inv-report-modal">
        <!-- KPIs -->
        <div class="inv-report-kpis">
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div class="inv-report-kpi-label">Total Ventas</div>
            <div class="inv-report-kpi-value">${totalVentas.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div class="inv-report-kpi-label">Utilidad</div>
            <div class="inv-report-kpi-value">${totalUtilidad.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <div class="inv-report-kpi-label">Cantidad Ventas</div>
            <div class="inv-report-kpi-value">${ventasMes.length}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
            <div class="inv-report-kpi-label">Promedio por Venta</div>
            <div class="inv-report-kpi-value" style="font-size: 1.25rem;">
              ${promedioVenta.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
            </div>
          </div>
        </div>
        
        <!-- Ventas por día -->
        <div class="inv-report-section">
          <h3 class="inv-report-section-title">📅 Ventas por Día</h3>
          <table class="inv-report-table">
            <thead>
              <tr>
                <th>Día</th>
                <th>Cantidad</th>
                <th>Monto Total</th>
                <th>Promedio</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(ventasPorDia)
                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                .map(([dia, datos]) => `
                  <tr>
                    <td><strong>Día ${dia}</strong></td>
                    <td>${datos.cantidad} ventas</td>
                    <td style="color: var(--inv-success); font-weight: 600;">
                      ${datos.monto.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
                    </td>
                    <td>${(datos.monto / datos.cantidad).toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `, `
      <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
      <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al generar reporte de ventas del mes:", error);
    showToast("Error al generar el reporte", "error");
  }
}

async function generarReporteValorInventario() {
  showToast("Generando reporte de valor de inventario...", "info");
  
  try {
    const productos = await InventoryDB.obtenerTodosProductos();
    
    if (productos.length === 0) {
      showToast("No hay productos en el inventario", "warning");
      return;
    }
    
    // Calcular valores
    let valorTotal = 0;
    let totalUnidades = 0;
    const productosPorCategoria = {};
    
    productos.forEach(p => {
      const stock = parseFloat(p.stock_actual || 0);
      const precio = parseFloat(p.precio_sugerido || 0);
      const valor = stock * precio;
      
      valorTotal += valor;
      totalUnidades += stock;
      
      const categoria = p.categoria || 'Sin Categoría';
      if (!productosPorCategoria[categoria]) {
        productosPorCategoria[categoria] = { valor: 0, unidades: 0, productos: 0 };
      }
      
      productosPorCategoria[categoria].valor += valor;
      productosPorCategoria[categoria].unidades += stock;
      productosPorCategoria[categoria].productos++;
    });
    
    const valorPromedio = valorTotal / productos.length;
    
    showModal("💎 Valor del Inventario", `
      <div class="inv-report-modal">
        <!-- KPIs -->
        <div class="inv-report-kpis">
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div class="inv-report-kpi-label">Valor Total</div>
            <div class="inv-report-kpi-value" style="font-size: 1.5rem;">
              ${valorTotal.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
            </div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div class="inv-report-kpi-label">Total Productos</div>
            <div class="inv-report-kpi-value">${productos.length}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <div class="inv-report-kpi-label">Total Unidades</div>
            <div class="inv-report-kpi-value">${totalUnidades}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
            <div class="inv-report-kpi-label">Valor Promedio</div>
            <div class="inv-report-kpi-value" style="font-size: 1.25rem;">
              ${valorPromedio.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
            </div>
          </div>
        </div>
        
        <!-- Por categoría -->
        <div class="inv-report-section">
          <h3 class="inv-report-section-title">🏷️ Valor por Categoría</h3>
          <table class="inv-report-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Productos</th>
                <th>Unidades</th>
                <th>Valor Total</th>
                <th>% del Total</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(productosPorCategoria)
                .sort(([,a], [,b]) => b.valor - a.valor)
                .map(([categoria, datos]) => {
                  const porcentaje = ((datos.valor / valorTotal) * 100).toFixed(2);
                  return `
                    <tr>
                      <td><strong>${categoria}</strong></td>
                      <td>${datos.productos}</td>
                      <td>${datos.unidades}</td>
                      <td style="color: var(--inv-success); font-weight: 600;">
                        ${datos.valor.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
                      </td>
                      <td><span class="inv-badge inv-badge-primary">${porcentaje}%</span></td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `, `
      <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
      <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al generar reporte de valor de inventario:", error);
    showToast("Error al generar el reporte", "error");
  }
}

async function generarReporteProveedores() {
  showToast("Generando ranking de proveedores...", "info");
  
  try {
    const proveedores = await InventoryDB.obtenerTodosProveedores();
    const productos = await InventoryDB.obtenerTodosProductos();
    
    if (proveedores.length === 0) {
      showToast("No hay proveedores registrados", "warning");
      return;
    }
    
    // Análisis por proveedor
    const analisisProveedores = proveedores.map(prov => {
      const productosProveedor = productos.filter(p => p.proveedor_id === prov.id);
      const totalProductos = productosProveedor.length;
      const totalUnidades = productosProveedor.reduce((sum, p) => sum + parseFloat(p.stock_actual || 0), 0);
      const valorInventario = productosProveedor.reduce((sum, p) => 
        sum + (parseFloat(p.stock_actual || 0) * parseFloat(p.precio_sugerido || 0)), 0);
      
      return {
        nombre: prov.nombre,
        totalProductos,
        totalUnidades,
        valorInventario,
        contacto: prov.telefono || prov.email || 'N/A'
      };
    }).sort((a, b) => b.valorInventario - a.valorInventario);
    
    const totalValor = analisisProveedores.reduce((sum, p) => sum + p.valorInventario, 0);
    
    showModal("🏭 Ranking de Proveedores", `
      <div class="inv-report-modal">
        <!-- KPIs -->
        <div class="inv-report-kpis">
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div class="inv-report-kpi-label">Total Proveedores</div>
            <div class="inv-report-kpi-value">${proveedores.length}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div class="inv-report-kpi-label">Valor Total</div>
            <div class="inv-report-kpi-value" style="font-size: 1.25rem;">
              ${totalValor.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
            </div>
          </div>
        </div>
        
        <!-- Tabla -->
        <div class="inv-report-section">
          <h3 class="inv-report-section-title">🏆 Ranking por Valor de Inventario</h3>
          <table class="inv-report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Proveedor</th>
                <th>Productos</th>
                <th>Unidades</th>
                <th>Valor Inventario</th>
                <th>% del Total</th>
              </tr>
            </thead>
            <tbody>
              ${analisisProveedores.map((prov, idx) => {
                const porcentaje = totalValor > 0 ? ((prov.valorInventario / totalValor) * 100).toFixed(2) : 0;
                return `
                  <tr>
                    <td><span class="inv-badge ${idx < 3 ? 'inv-badge-primary' : 'inv-badge-secondary'}">${idx + 1}</span></td>
                    <td><strong>${prov.nombre}</strong><br><small style="color: var(--inv-text-secondary);">${prov.contacto}</small></td>
                    <td>${prov.totalProductos}</td>
                    <td>${prov.totalUnidades}</td>
                    <td style="color: var(--inv-success); font-weight: 600;">
                      ${prov.valorInventario.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
                    </td>
                    <td><span class="inv-badge inv-badge-info">${porcentaje}%</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `, `
      <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
      <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al generar reporte de proveedores:", error);
    showToast("Error al generar el reporte", "error");
  }
}

async function generarReporteCategorias() {
  showToast("Generando análisis por categorías...", "info");
  
  try {
    const productos = await InventoryDB.obtenerTodosProductos();
    const ventas = await InventoryDB.obtenerTodasVentas();
    
    // Agrupar por categoría
    const categorias = {};
    
    productos.forEach(p => {
      const cat = p.categoria || 'Sin Categoría';
      if (!categorias[cat]) {
        categorias[cat] = { 
          productos: 0, 
          stock: 0, 
          valorInventario: 0,
          ventas: 0,
          utilidad: 0 
        };
      }
      
      categorias[cat].productos++;
      categorias[cat].stock += parseFloat(p.stock_actual || 0);
      categorias[cat].valorInventario += parseFloat(p.stock_actual || 0) * parseFloat(p.precio_sugerido || 0);
    });
    
    // Agregar datos de ventas
    ventas.forEach(v => {
      const cat = v.inv_productos?.categoria || 'Sin Categoría';
      if (categorias[cat]) {
        categorias[cat].ventas += parseFloat(v.precio_venta || 0);
        categorias[cat].utilidad += parseFloat(v.precio_venta || 0) - parseFloat(v.precio_compra || 0);
      }
    });
    
    const categoriasOrdenadas = Object.entries(categorias)
      .sort(([,a], [,b]) => b.ventas - a.ventas);
    
    const totalVentas = Object.values(categorias).reduce((sum, c) => sum + c.ventas, 0);
    const totalUtilidad = Object.values(categorias).reduce((sum, c) => sum + c.utilidad, 0);
    
    showModal("🏷️ Análisis por Categoría", `
      <div class="inv-report-modal">
        <!-- KPIs -->
        <div class="inv-report-kpis">
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div class="inv-report-kpi-label">Total Categorías</div>
            <div class="inv-report-kpi-value">${Object.keys(categorias).length}</div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <div class="inv-report-kpi-label">Ventas Totales</div>
            <div class="inv-report-kpi-value" style="font-size: 1.25rem;">
              ${totalVentas.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
            </div>
          </div>
          <div class="inv-report-kpi-card" style="--kpi-bg: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <div class="inv-report-kpi-label">Utilidad Total</div>
            <div class="inv-report-kpi-value" style="font-size: 1.25rem;">
              ${totalUtilidad.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
            </div>
          </div>
        </div>
        
        <!-- Tabla -->
        <div class="inv-report-section">
          <h3 class="inv-report-section-title">📊 Desempeño por Categoría</h3>
          <table class="inv-report-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Productos</th>
                <th>Stock</th>
                <th>Ventas</th>
                <th>Utilidad</th>
                <th>% Ventas</th>
              </tr>
            </thead>
            <tbody>
              ${categoriasOrdenadas.map(([cat, datos]) => {
                const porcentaje = totalVentas > 0 ? ((datos.ventas / totalVentas) * 100).toFixed(2) : 0;
                return `
                  <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${datos.productos}</td>
                    <td>${datos.stock}</td>
                    <td style="color: var(--inv-success); font-weight: 600;">
                      ${datos.ventas.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
                    </td>
                    <td style="color: var(--inv-primary); font-weight: 600;">
                      ${datos.utilidad.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}
                    </td>
                    <td><span class="inv-badge inv-badge-primary">${porcentaje}%</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `, `
      <button onclick="window.print()" class="inv-btn inv-btn-secondary">🖨️ Imprimir</button>
      <button onclick="hideModal()" class="inv-btn inv-btn-primary">Cerrar</button>
    `);
    
  } catch (error) {
    Logger.error("Error al generar reporte de categorías:", error);
    showToast("Error al generar el reporte", "error");
  }
}

function vibrate(duration = 100) {
  if ("vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}

// ========== INICIALIZACIÓN ==========
window.addEventListener("DOMContentLoaded", () => {
  Logger.info("Inventarios MG - Panel cargado");
  checkSession();
});

// Prevenir zoom en iOS en inputs
document.addEventListener("touchstart", function() {}, { passive: true });
