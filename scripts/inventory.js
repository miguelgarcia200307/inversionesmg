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

// ========== ESTADO GLOBAL ==========
let currentUser = null;
let currentView = "dashboard";
let productosData = [];
let proveedoresData = [];
let scannerActive = false;
let scannerStream = null;
let lastScannedCode = null;
let lastScanTime = 0;
let barcodeDetector = null;
let scannerMode = "venta"; // 'venta', 'registro', 'asociar'
let currentProductoForAssociation = null;
let carritoVenta = []; // Carrito de ventas
let loginAttempts = 0;
let loginLockoutUntil = null;

// ========== VARIABLES DEL MOTOR DE ESCANEO ==========
let scannerEngine = null; // 'native' o 'zxing'
let zxingCodeReader = null;
let zxingAnimationFrame = null;
let availableCameras = [];
let selectedCameraId = null;

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
  toast.className = "toast";
  toast.classList.add(type);
  toast.classList.add("active");
  toast.textContent = message;
  
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
}

function showModal(title, content, footer = "") {
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modalFooter.innerHTML = footer;
  modalOverlay.classList.add("active");
}

function hideModal() {
  modalOverlay.classList.remove("active");
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
  
  // Botón de menú móvil
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
    
    container.innerHTML = `
      <div class="inv-dashboard">
        <!-- Header con gradiente -->
        <div class="inv-dashboard-header">
          <h1 class="inv-dashboard-title">📊 Dashboard Inventarios</h1>
          <p class="inv-dashboard-subtitle">Visión general del estado de tu inventario</p>
        </div>
        
        <!-- KPIs Premium -->
        <div class="inv-kpi-grid">
          <div class="inv-kpi-card">
            <div class="inv-kpi-header">
              <div class="inv-kpi-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                📦
              </div>
              <div class="inv-kpi-badge info">Inventario</div>
            </div>
            <div class="inv-kpi-body">
              <div class="inv-kpi-label">Total Productos</div>
              <div class="inv-kpi-value">${kpis.totalProductos}</div>
            </div>
            <div class="inv-kpi-footer">
              <span class="inv-kpi-trend up">↑ Activos</span>
              <span>En stock</span>
            </div>
          </div>
          
          <div class="inv-kpi-card">
            <div class="inv-kpi-header">
              <div class="inv-kpi-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                💰
              </div>
              <div class="inv-kpi-badge success">Valorización</div>
            </div>
            <div class="inv-kpi-body">
              <div class="inv-kpi-label">Valor al Costo</div>
              <div class="inv-kpi-value">${formatCurrency(kpis.valorInventarioCosto)}</div>
            </div>
            <div class="inv-kpi-footer">
              <span>Inversión total</span>
            </div>
          </div>
          
          <div class="inv-kpi-card">
            <div class="inv-kpi-header">
              <div class="inv-kpi-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                📈
              </div>
              <div class="inv-kpi-badge success">Potencial</div>
            </div>
            <div class="inv-kpi-body">
              <div class="inv-kpi-label">Valor Sugerido</div>
              <div class="inv-kpi-value">${formatCurrency(kpis.valorInventarioSugerido)}</div>
            </div>
            <div class="inv-kpi-footer">
              <span class="inv-kpi-trend up">↑ ${kpis.valorInventarioCosto > 0 ? Math.round(((kpis.valorInventarioSugerido - kpis.valorInventarioCosto) / kpis.valorInventarioCosto) * 100) : 0}%</span>
              <span>Margen proyectado</span>
            </div>
          </div>
          
          <div class="inv-kpi-card">
            <div class="inv-kpi-header">
              <div class="inv-kpi-icon" style="background: ${kpis.productosBajoStock > 0 ? 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' : 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'};">
                ${kpis.productosBajoStock > 0 ? '⚠️' : '✅'}
              </div>
              <div class="inv-kpi-badge ${kpis.productosBajoStock > 0 ? 'warning' : 'success'}">
                ${kpis.productosBajoStock > 0 ? 'Alerta' : 'Normal'}
              </div>
            </div>
            <div class="inv-kpi-body">
              <div class="inv-kpi-label">Stock Bajo</div>
              <div class="inv-kpi-value">${kpis.productosBajoStock}</div>
            </div>
            <div class="inv-kpi-footer">
              <span>${kpis.productosBajoStock > 0 ? 'Requiere atención' : 'Todo en orden'}</span>
            </div>
          </div>
          
          <div class="inv-kpi-card">
            <div class="inv-kpi-header">
              <div class="inv-kpi-icon" style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);">
                🛒
              </div>
              <div class="inv-kpi-badge info">Este Mes</div>
            </div>
            <div class="inv-kpi-body">
              <div class="inv-kpi-label">Ventas del Mes</div>
              <div class="inv-kpi-value">${formatCurrency(kpis.ventasMesTotal)}</div>
            </div>
            <div class="inv-kpi-footer">
              <span class="inv-kpi-trend up">↑ ${kpis.cantidadVentasMes}</span>
              <span>transacciones</span>
            </div>
          </div>
          
          <div class="inv-kpi-card">
            <div class="inv-kpi-header">
              <div class="inv-kpi-icon" style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);">
                💵
              </div>
              <div class="inv-kpi-badge success">Ganancia</div>
            </div>
            <div class="inv-kpi-body">
              <div class="inv-kpi-label">Utilidad del Mes</div>
              <div class="inv-kpi-value">${formatCurrency(kpis.utilidadMesTotal)}</div>
            </div>
            <div class="inv-kpi-footer">
              <span class="inv-kpi-trend up">↑ ${kpis.ventasMesTotal > 0 ? Math.round((kpis.utilidadMesTotal / kpis.ventasMesTotal) * 100) : 0}%</span>
              <span>margen real</span>
            </div>
          </div>
        </div>
        
        <!-- Acciones rápidas -->
        <div class="inv-action-section">
          <h2 class="inv-section-title">⚡ Acciones Rápidas</h2>
          <div class="inv-action-grid">
            <div class="inv-action-card" onclick="openQuickSale()">
              <span class="inv-action-icon">💳</span>
              <h3 class="inv-action-title">Nueva Venta</h3>
              <p class="inv-action-description">Registra una venta rápida con scanner de código de barras</p>
            </div>
            
            <div class="inv-action-card" onclick="openNewProduct()">
              <span class="inv-action-icon">➕</span>
              <h3 class="inv-action-title">Nuevo Producto</h3>
              <p class="inv-action-description">Agrega un producto al inventario</p>
            </div>
            
            <div class="inv-action-card" onclick="openNewCompra()">
              <span class="inv-action-icon">🛒</span>
              <h3 class="inv-action-title">Nueva Compra</h3>
              <p class="inv-action-description">Registra entrada de inventario</p>
            </div>
            
            <div class="inv-action-card" onclick="scannerMode='registro'; openScanner()">
              <span class="inv-action-icon">📷</span>
              <h3 class="inv-action-title">Escanear Código</h3>
              <p class="inv-action-description">Usa el scanner para buscar productos</p>
            </div>
          </div>
        </div>
        
        <!-- Productos más vendidos -->
        ${productosMasVendidos.length > 0 ? `
          <div class="inv-products-section">
            <div class="inv-products-header">
              <h2 class="inv-section-title">🏆 Top 5 Productos Más Vendidos</h2>
            </div>
            <div class="inv-table-container">
              <table class="inv-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Unidades Vendidas</th>
                  </tr>
                </thead>
                <tbody>
                  ${productosMasVendidos.map((p, i) => `
                    <tr>
                      <td><strong>${i + 1}</strong></td>
                      <td>${p.nombre || 'Sin nombre'}</td>
                      <td><code style="background: var(--inv-bg-secondary); padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem;">${p.sku}</code></td>
                      <td><span class="inv-badge-success"><strong>${p.cantidad_total}</strong> unidades</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;
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
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // Vista Mobile: Cards tipo App Nativa
      container.innerHTML = `
        <!-- Header Sticky -->
        <div class="inv-products-sticky-header">
          <div class="inv-products-search-bar">
            <span class="inv-search-icon-mobile">🔍</span>
            <input type="search" id="searchProductosMobile" placeholder="Buscar productos..." class="inv-search-input-mobile">
          </div>
          
          <!-- Filtros Rápidos -->
          <div class="inv-filter-chips">
            <button class="inv-chip active" data-filter="all">📦 Todos</button>
            <button class="inv-chip" data-filter="low-stock">⚠️ Stock Bajo</button>
            <button class="inv-chip" data-filter="categoria">🏷️ Por Categoría</button>
          </div>
        </div>
        
        <!-- Lista de Productos (Cards) -->
        <div class="inv-products-mobile-list" id="productosListMobile">
          ${renderProductosCards(productosData)}
        </div>
        
        <!-- FAB Floating Action Button -->
        <button class="inv-fab inv-fab-extended" onclick="openNewProduct()" aria-label="Nuevo Producto">
          <span>➕</span>
          <span class="inv-fab-text">Nuevo</span>
        </button>
      `;
      
      // Search functionality
      document.getElementById("searchProductosMobile").addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = productosData.filter(p => 
          p.nombre?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query) ||
          p.categoria?.toLowerCase().includes(query) ||
          p.marca?.toLowerCase().includes(query)
        );
        document.getElementById("productosListMobile").innerHTML = renderProductosCards(filtered);
      });
      
      // Chips filters
      document.querySelectorAll(".inv-chip").forEach(chip => {
        chip.addEventListener("click", (e) => {
          // Toggle active
          document.querySelectorAll(".inv-chip").forEach(c => c.classList.remove("active"));
          e.target.classList.add("active");
          
          const filter = e.target.dataset.filter;
          let filtered = productosData;
          
          if (filter === "low-stock") {
            filtered = productosData.filter(p => parseFloat(p.stock_actual) < parseFloat(p.stock_minimo));
          }
          
          document.getElementById("productosListMobile").innerHTML = renderProductosCards(filtered);
        });
      });
      
    } else {
      // Vista Desktop: Tabla
      container.innerHTML = `
        <div class="inv-products-section inv-products-desktop-view">
          <div class="inv-products-header">
            <h2 class="inv-section-title">📦 Gestión de Productos</h2>
            <div class="inv-products-toolbar">
              <div class="inv-search-container">
                <span class="inv-search-icon">🔍</span>
                <input type="search" id="searchProductos" placeholder="Buscar por nombre, SKU o categoría..." class="inv-search-input">
              </div>
              <button class="inv-btn inv-btn-success" onclick="openNewProduct()">
                ➕ Nuevo Producto
              </button>
              <button class="inv-btn inv-btn-secondary" onclick="scannerMode='registro'; openScanner()">
                📷 Escanear
              </button>
            </div>
          </div>
          
          <div class="inv-table-container">
            <table class="inv-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Stock Actual</th>
                  <th>Stock Mínimo</th>
                  <th>Costo Base</th>
                  <th>Precio Sugerido</th>
                  <th>Acciones</th>
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
      document.getElementById("searchProductos").addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = productosData.filter(p => 
          p.nombre?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query) ||
          p.categoria?.toLowerCase().includes(query)
        );
        document.getElementById("productosTableBody").innerHTML = renderProductosTable(filtered);
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
      <div class="inv-empty-state-mobile">
        <div class="inv-empty-state-icon">📦</div>
        <h3 class="inv-empty-state-title">No hay productos</h3>
        <p class="inv-empty-state-text">Comienza agregando tu primer producto al inventario</p>
        <button class="inv-btn inv-btn-primary" onclick="openNewProduct()">
          ➕ Crear Producto
        </button>
      </div>
    `;
  }
  
  return productos.map(p => {
    const stockBajo = parseFloat(p.stock_actual) < parseFloat(p.stock_minimo);
    const stockCritico = parseFloat(p.stock_actual) === 0;
    const stockWarning = parseFloat(p.stock_actual) <= parseFloat(p.stock_minimo) * 1.5 && !stockCritico;
    
    let stockClass = 'stock-ok';
    let cardClass = '';
    
    if (stockCritico) {
      stockClass = 'stock-danger';
      cardClass = 'low-stock';
    } else if (stockBajo) {
      stockClass = 'stock-danger';
      cardClass = 'low-stock';
    } else if (stockWarning) {
      stockClass = 'stock-warning';
      cardClass = 'warning-stock';
    }
    
    return `
      <div class="inv-product-card ${cardClass}" onclick="openProductDetail(${p.id})">
        <!-- Header -->
        <div class="inv-product-card-header">
          <div class="inv-product-card-title-section">
            <h3 class="inv-product-card-title">${p.nombre}</h3>
            <div class="inv-product-card-subtitle">
              <span class="inv-product-card-sku">${p.sku}</span>
              ${p.marca ? `<span>• ${p.marca}</span>` : ''}
            </div>
          </div>
          
          <div class="inv-product-stock-badge">
            <div class="inv-stock-number ${stockClass}">${p.stock_actual}</div>
            <div class="inv-stock-label">En Stock</div>
          </div>
        </div>
        
        <!-- Body -->
        <div class="inv-product-card-body">
          <div class="inv-product-info-item">
            <div class="inv-product-info-label">Categoría</div>
            <div class="inv-product-info-value">${p.categoria || 'Sin categoría'}</div>
          </div>
          
          <div class="inv-product-info-item">
            <div class="inv-product-info-label">Stock Mínimo</div>
            <div class="inv-product-info-value">${p.stock_minimo}</div>
          </div>
          
          <div class="inv-product-info-item">
            <div class="inv-product-info-label">Costo Base</div>
            <div class="inv-product-info-value">${formatCurrency(p.costo_unitario_base)}</div>
          </div>
          
          <div class="inv-product-info-item">
            <div class="inv-product-info-label">Precio Sugerido</div>
            <div class="inv-product-info-value price">${formatCurrency(p.precio_sugerido)}</div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="inv-product-card-footer" onclick="event.stopPropagation();">
          <button class="inv-product-action-btn primary" onclick="editProducto(${p.id})" title="Editar">
            ✏️ Editar
          </button>
          <button class="inv-product-action-btn secondary" onclick="openProductActions(${p.id})" title="Más acciones">
            ⋯ Más
          </button>
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
    </div>
  `, `
    <button type="button" class="inv-btn inv-btn-secondary" onclick="hideModal()">Cancelar</button>
  `);
}

function renderProductosTable(productos) {
  if (productos.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--inv-text-tertiary);">📦 No hay productos registrados</td></tr>';
  }
  
  return productos.map(p => {
    const stockBajo = p.stock_actual < p.stock_minimo;
    return `
      <tr>
        <td><code style="background: var(--inv-bg-secondary); padding: 0.25rem 0.5rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 600;">${p.sku}</code></td>
        <td>
          <div>
            <strong style="display: block; margin-bottom: 0.25rem;">${p.nombre}</strong>
            ${p.marca ? `<small style="color: var(--inv-text-tertiary);">${p.marca}${p.modelo ? ' ' + p.modelo : ''}</small>` : ''}
          </div>
        </td>
        <td><span class="inv-badge-info">${p.categoria || 'Sin categoría'}</span></td>
        <td>
          <span class="inv-badge ${stockBajo ? 'inv-badge-danger' : 'inv-badge-success'}">
            ${p.stock_actual} ${stockBajo ? '⚠️' : ''}
          </span>
        </td>
        <td>${p.stock_minimo}</td>
        <td><strong>${formatCurrency(p.costo_unitario_base)}</strong></td>
        <td><strong style="color: var(--inv-success);">${formatCurrency(p.precio_sugerido)}</strong></td>
        <td>
          <div style="display: flex; gap: 0.5rem;">
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="viewProducto(${p.id})" title="Ver detalles">👁️</button>
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="editProducto(${p.id})" title="Editar">✏️</button>
            <button class="inv-btn inv-btn-icon inv-btn-secondary" onclick="openAssociateBarcode(${p.id})" title="Código de barras">🏷️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ========== VISTA: VENTAS ==========
async function loadVentas(container) {
  showLoading(container, "Cargando ventas...");
  
  try {
    const ventas = await InventoryDB.obtenerTodasVentas();
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
          ${ventas.length > 0 ? renderVentasCards(ventas) : `
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
        const filtered = ventas.filter(v => 
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
    
    container.innerHTML = `
      <div class="view-header">
        <div class="view-actions">
          <button class="btn-primary" onclick="openNewCompra()">
            🛒 Nueva Compra
          </button>
        </div>
      </div>
      
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Referencia</th>
              <th>Items</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${compras.map(c => `
              <tr>
                <td><code>#${c.id}</code></td>
                <td>${formatDate(c.fecha)}</td>
                <td>${c.proveedor?.nombre || 'Sin proveedor'}</td>
                <td>${c.referencia || '-'}</td>
                <td>${c.inv_compra_items?.length || 0} items</td>
                <td><strong>${formatCurrency(c.total)}</strong></td>
                <td class="table-actions">
                  <button class="btn-icon" onclick="viewCompra(${c.id})" title="Ver detalle">👁️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
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
    
    container.innerHTML = `
      <div class="view-header">
        <div class="view-actions">
          <button class="btn-primary" onclick="openNewProveedor()">
            ➕ Nuevo Proveedor
          </button>
        </div>
      </div>
      
      <div class="proveedores-grid">
        ${proveedoresData.map(p => `
          <div class="proveedor-card">
            <div class="proveedor-card-header">
              <h3 class="proveedor-card-title">${p.nombre}</h3>
            </div>
            <div class="proveedor-card-body">
              <p><strong>Contacto:</strong> ${p.contacto || '-'}</p>
              <p><strong>Teléfono:</strong> ${p.telefono || '-'}</p>
              <p><strong>Email:</strong> ${p.email || '-'}</p>
              <p><strong>Ciudad:</strong> ${p.ciudad || '-'}</p>
            </div>
            <div class="proveedor-card-footer">
              <button class="btn-secondary-sm" onclick="editProveedor(${p.id})">✏️ Editar</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al cargar proveedores:", error);
    showToast("Error al cargar proveedores", "error");
  }
}

// ========== VISTA: REPORTES ==========
async function loadReportes(container) {
  container.innerHTML = `
    <div class="section-card">
      <div class="section-card-header">
        <h3 class="section-card-title">📈 Reportes</h3>
      </div>
      <div class="reportes-grid">
        <button class="report-card" onclick="generarReporteUtilidades()">
          <div class="report-card-icon">💵</div>
          <div class="report-card-title">Reporte de Utilidades</div>
        </button>
        
        <button class="report-card" onclick="generarReporteRotacion()">
          <div class="report-card-icon">🔄</div>
          <div class="report-card-title">Rotación de Inventario</div>
        </button>
        
        <button class="report-card" onclick="generarReporteStockBajo()">
          <div class="report-card-icon">⚠️</div>
          <div class="report-card-title">Productos con Stock Bajo</div>
        </button>
        
        <button class="report-card" onclick="generarReporteVentasMes()">
          <div class="report-card-icon">📊</div>
          <div class="report-card-title">Ventas del Mes</div>
        </button>
      </div>
    </div>
  `;
}

// ========== VISTA: AUDITORÍA ==========
async function loadAuditoria(container) {
  showLoading(container, "Cargando auditoría...");
  
  try {
    const auditoria = await InventoryDB.obtenerAuditoria(50);
    
    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>ID</th>
              <th>Detalles</th>
            </tr>
          </thead>
          <tbody>
            ${auditoria.map(a => `
              <tr>
                <td>${formatDateTime(a.created_at)}</td>
                <td><code>${a.accion}</code></td>
                <td>${a.entidad}</td>
                <td>${a.entidad_id || '-'}</td>
                <td><small>${JSON.stringify(a.detalles || {})}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al cargar auditoría:", error);
    showToast("Error al cargar auditoría", "error");
  }
}

// ========== FUNCIONES DE PRODUCTOS ==========
async function openNewProduct() {
  // Cargar proveedores
  const proveedores = await InventoryDB.obtenerTodosProveedores();
  
  showModal("➕ Nuevo Producto", `
    <form id="formNewProduct" class="form-vertical">
      <div class="form-row">
        <div class="form-group">
          <label>Nombre *</label>
          <input type="text" name="nombre" required class="form-input">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Categoría</label>
          <input type="text" name="categoria" class="form-input" list="categorias">
          <datalist id="categorias">
            <option value="Electrónica">
            <option value="Hogar">
            <option value="Ropa">
            <option value="Alimentos">
          </datalist>
        </div>
        <div class="form-group">
          <label>Marca</label>
          <input type="text" name="marca" class="form-input">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Stock Inicial *</label>
          <input type="number" name="stock_actual" required min="0" step="0.01" class="form-input">
        </div>
        <div class="form-group">
          <label>Stock Mínimo</label>
          <input type="number" name="stock_minimo" min="0" step="0.01" class="form-input" value="5">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Costo Unitario *</label>
          <input type="number" name="costo_unitario_base" required min="0" step="0.01" class="form-input">
        </div>
        <div class="form-group">
          <label>Gastos Asociados</label>
          <input type="number" name="gastos_asociados_base" min="0" step="0.01" class="form-input" value="0">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Margen (%) *</label>
          <input type="number" name="margen_sugerido_pct" required min="0" step="0.01" class="form-input" value="30">
        </div>
        <div class="form-group">
          <label>Precio Sugerido (calculado)</label>
          <input type="number" id="precioCalculado" readonly class="form-input" style="background: var(--gray-100);">
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
        <label>Ubicación</label>
        <input type="text" name="ubicacion" class="form-input" placeholder="Ej: Bodega A - Estante 3">
      </div>
      
      <div class="form-group">
        <label>Código de Barras (opcional)</label>
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" id="codigoBarras" class="form-input" placeholder="Escanear o ingresar">
          <button type="button" class="btn-secondary" onclick="scannerMode='registroTemporal'; openScanner()">📷</button>
        </div>
      </div>
    </form>
  `, `
    <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="submit" form="formNewProduct" class="btn-primary">Guardar Producto</button>
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
    data.stock_actual = parseFloat(data.stock_actual);
    data.stock_minimo = parseFloat(data.stock_minimo) || 0;
    data.costo_unitario_base = parseFloat(data.costo_unitario_base);
    data.gastos_asociados_base = parseFloat(data.gastos_asociados_base) || 0;
    data.margen_sugerido_pct = parseFloat(data.margen_sugerido_pct);
    data.proveedor_principal_id = data.proveedor_principal_id ? parseInt(data.proveedor_principal_id) : null;
    
    const result = await InventoryDB.crearProducto(data);
    
    if (result.success) {
      // Si hay código de barras, asociarlo
      const codigoBarras = document.getElementById("codigoBarras").value.trim();
      if (codigoBarras) {
        await InventoryDB.asociarCodigoBarras(result.data.id, codigoBarras);
      }
      
      showToast("Producto creado exitosamente", "success");
      hideModal();
      loadProductos(document.getElementById("viewProductos"));
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
        <p style="text-align: center; margin-top: 1rem; color: var(--gray-600);">
          o busca manualmente
        </p>
        <input type="search" id="searchProductoVenta" placeholder="Buscar producto..." class="form-input">
        <div id="searchResultsVenta" class="search-results"></div>
      </div>
      
      <div class="venta-carrito-section">
        <h4>Carrito</h4>
        <div id="carritoVentaContainer"></div>
        
        <div class="venta-totales">
          <div class="venta-total-row">
            <span>Subtotal:</span>
            <span id="ventaSubtotal">$0</span>
          </div>
          <div class="venta-total-row venta-total-main">
            <span>Total:</span>
            <span id="ventaTotal">$0</span>
          </div>
        </div>
        
        <div class="form-group">
          <label>Método de Pago</label>
          <select id="ventaMetodoPago" class="form-input">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="nequi">Nequi</option>
            <option value="datafono">Datáfono</option>
          </select>
        </div>
      </div>
    </div>
  `, `
    <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="button" class="btn-primary" onclick="confirmarVenta()" id="btnConfirmarVenta" disabled>
      Confirmar Venta
    </button>
  `);
  
  // Renderizar carrito vacío (ahora que el modal ya está en el DOM)
  renderCarritoVenta();
  
  // Búsqueda de productos
  const searchInput = document.getElementById("searchProductoVenta");
  const resultsContainer = document.getElementById("searchResultsVenta");
  
  searchInput.addEventListener("input", async (e) => {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      return;
    }
    
    const productos = await InventoryDB.obtenerTodosProductos({ activo: true });
    const filtered = productos.filter(p => 
      p.nombre?.toLowerCase().includes(query) ||
      p.sku?.toLowerCase().includes(query)
    ).slice(0, 5);
    
    resultsContainer.innerHTML = filtered.map(p => `
      <div class="search-result-item" onclick="agregarAlCarritoVenta(${JSON.stringify(p).replace(/"/g, '&quot;')})">
        <strong>${p.nombre}</strong>
        <span>${p.sku} - Stock: ${p.stock_actual}</span>
        <span>${formatCurrency(p.precio_sugerido)}</span>
      </div>
    `).join('');
  });
}

function agregarAlCarritoVenta(producto) {
  const existing = carritoVenta.find(item => item.producto_id === producto.id);
  
  if (existing) {
    existing.cantidad++;
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
  }
  
  renderCarritoVenta();
  vibrate();
  showToast(`${producto.nombre} agregado al carrito`, "success");
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
    container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">Carrito vacío</p>';
    if (btnConfirmar) btnConfirmar.disabled = true;
    return;
  }
  
  container.innerHTML = carritoVenta.map((item, index) => `
    <div class="carrito-item">
      <div class="carrito-item-info">
        <strong>${item.nombre}</strong>
        <small>${item.sku}</small>
      </div>
      <div class="carrito-item-controls">
        <button class="btn-icon-sm" onclick="cambiarCantidadCarrito(${index}, -1)">−</button>
        <input type="number" value="${item.cantidad}" min="1" max="${item.stock_disponible}" 
               onchange="actualizarCantidadCarrito(${index}, this.value)" class="carrito-cantidad-input">
        <button class="btn-icon-sm" onclick="cambiarCantidadCarrito(${index}, 1)">+</button>
      </div>
      <div class="carrito-item-price">
        <input type="number" value="${item.precio_real}" step="0.01" min="0"
               onchange="actualizarPrecioCarrito(${index}, this.value)" class="carrito-precio-input">
        <button class="btn-icon-sm btn-danger" onclick="eliminarDeCarrito(${index})">🗑️</button>
      </div>
    </div>
  `).join('');
  
  actualizarTotalesVenta();
  if (btnConfirmar) btnConfirmar.disabled = false;
}

function cambiarCantidadCarrito(index, delta) {
  const item = carritoVenta[index];
  const nuevaCantidad = item.cantidad + delta;
  
  if (nuevaCantidad > 0 && nuevaCantidad <= item.stock_disponible) {
    item.cantidad = nuevaCantidad;
    renderCarritoVenta();
  } else if (nuevaCantidad > item.stock_disponible) {
    showToast("Stock insuficiente", "warning");
  }
}

function actualizarCantidadCarrito(index, valor) {
  const cantidad = parseInt(valor);
  const item = carritoVenta[index];
  
  if (cantidad > 0 && cantidad <= item.stock_disponible) {
    item.cantidad = cantidad;
    renderCarritoVenta();
  } else {
    showToast("Cantidad inválida", "warning");
    renderCarritoVenta();
  }
}

function actualizarPrecioCarrito(index, valor) {
  const precio = parseFloat(valor);
  if (precio >= 0) {
    carritoVenta[index].precio_real = precio;
    actualizarTotalesVenta();
  }
}

function eliminarDeCarrito(index) {
  carritoVenta.splice(index, 1);
  renderCarritoVenta();
}

function actualizarTotalesVenta() {
  const subtotal = carritoVenta.reduce((sum, item) => sum + (item.precio_real * item.cantidad), 0);
  document.getElementById("ventaSubtotal").textContent = formatCurrency(subtotal);
  document.getElementById("ventaTotal").textContent = formatCurrency(subtotal);
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
    <form id="formNewCompra" class="form-vertical">
      <div class="form-row">
        <div class="form-group">
          <label>Proveedor</label>
          <select name="proveedor_id" class="form-input">
            <option value="">Sin proveedor</option>
            ${proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" name="fecha" required class="form-input" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Referencia/Factura</label>
          <input type="text" name="referencia" class="form-input">
        </div>
        <div class="form-group">
          <label>Método de Pago</label>
          <select name="metodo_pago" class="form-input">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="credito">Crédito</option>
          </select>
        </div>
      </div>
      
      <h4>Items de Compra</h4>
      <div class="form-group">
        <label>Agregar Producto</label>
        <select id="productoCompraSelect" class="form-input">
          <option value="">Seleccionar producto</option>
          ${productos.map(p => `<option value="${p.id}" data-name="${p.nombre}">${p.nombre} (${p.sku})</option>`).join('')}
        </select>
      </div>
      
      <div id="itemsCompraContainer"></div>
      
      <div class="compra-totales">
        <div class="form-row">
          <div class="form-group">
            <label>Gastos Adicionales (envío, impuestos, etc.)</label>
            <input type="number" id="gastosAdicionales" min="0" step="0.01" value="0" class="form-input">
          </div>
        </div>
        <div class="total-row">
          <span>Subtotal:</span>
          <span id="compraSubtotal">$0</span>
        </div>
        <div class="total-row total-main">
          <span>Total:</span>
          <span id="compraTotal">$0</span>
        </div>
      </div>
    </form>
  `, `
    <button type="button" class="btn-secondary" onclick="hideModal()">Cancelar</button>
    <button type="submit" form="formNewCompra" class="btn-primary" id="btnGuardarCompra" disabled>
      Guardar Compra
    </button>
  `);
  
  // Agregar producto
  document.getElementById("productoCompraSelect").addEventListener("change", (e) => {
    const productoId = parseInt(e.target.value);
    if (!productoId) return;
    
    const option = e.target.selectedOptions[0];
    const nombreProducto = option.dataset.name;
    
    itemsCompra.push({
      producto_id: productoId,
      nombre: nombreProducto,
      cantidad: 1,
      costo_unitario: 0,
    });
    
    e.target.value = "";
    renderItemsCompra();
  });
  
  function renderItemsCompra() {
    const container = document.getElementById("itemsCompraContainer");
    
    if (itemsCompra.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">No hay items</p>';
      document.getElementById("btnGuardarCompra").disabled = true;
      return;
    }
    
    container.innerHTML = itemsCompra.map((item, index) => `
      <div class="compra-item">
        <div class="compra-item-name">${item.nombre}</div>
        <div class="compra-item-controls">
          <input type="number" placeholder="Cantidad" value="${item.cantidad}" min="1" step="0.01"
                 onchange="itemsCompra[${index}].cantidad = parseFloat(this.value); calcularTotalesCompra()" 
                 class="form-input-sm">
          <input type="number" placeholder="Costo unitario" value="${item.costo_unitario}" min="0" step="0.01"
                 onchange="itemsCompra[${index}].costo_unitario = parseFloat(this.value); calcularTotalesCompra()" 
                 class="form-input-sm">
          <button class="btn-icon-sm btn-danger" onclick="itemsCompra.splice(${index}, 1); this.closest('.compra-item').remove(); calcularTotalesCompra()">🗑️</button>
        </div>
      </div>
    `).join('');
    
    document.getElementById("btnGuardarCompra").disabled = false;
    calcularTotalesCompra();
  }
  
  window.calcularTotalesCompra = function() {
    const subtotal = itemsCompra.reduce((sum, item) => sum + (item.cantidad * item.costo_unitario), 0);
    const gastosAdicionales = parseFloat(document.getElementById("gastosAdicionales").value) || 0;
    const total = subtotal + gastosAdicionales;
    
    document.getElementById("compraSubtotal").textContent = formatCurrency(subtotal);
    document.getElementById("compraTotal").textContent = formatCurrency(total);
  };
  
  document.getElementById("gastosAdicionales").addEventListener("input", calcularTotalesCompra);
  
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
 */
async function enumerateCameras() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      Logger.warn("enumerateDevices no disponible");
      return [];
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    Logger.info(`Cámaras encontradas: ${videoDevices.length}`, videoDevices);
    
    availableCameras = videoDevices;
    
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
 * Inicia la cámara con constraints robustos
 */
async function startCamera() {
  try {
    // Construir constraints
    let constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    
    // Si hay una cámara seleccionada, usarla específicamente
    if (selectedCameraId) {
      constraints.video = {
        deviceId: { exact: selectedCameraId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    }
    
    Logger.info("Solicitando cámara con constraints:", constraints);
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    scannerStream = stream;
    
    if (scannerVideo) {
      scannerVideo.srcObject = stream;
      
      // Esperar a que el video esté listo
      await new Promise((resolve) => {
        scannerVideo.onloadedmetadata = () => {
          scannerVideo.play().then(resolve).catch(err => {
            Logger.error("Error al reproducir video:", err);
            resolve();
          });
        };
      });
    }
    
    // Verificar si tiene linterna
    const track = stream.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities();
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
    Logger.error("Error al iniciar cámara:", error);
    
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
    
    // Intentar obtener formatos soportados
    let formats = [];
    try {
      if (window.BarcodeDetector.getSupportedFormats) {
        formats = await window.BarcodeDetector.getSupportedFormats();
        Logger.info("BarcodeDetector formatos soportados:", formats);
      }
    } catch (err) {
      Logger.warn("No se pudieron obtener formatos, usando defaults");
      formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'];
    }
    
    // Crear detector con formatos
    if (formats.length > 0) {
      barcodeDetector = new window.BarcodeDetector({ formats });
    } else {
      barcodeDetector = new window.BarcodeDetector();
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
 * Inicializa el lector ZXing (fallback)
 */
async function initZxingFallback() {
  try {
    if (typeof ZXing === 'undefined') {
      Logger.error("Librería ZXing no cargada");
      return false;
    }
    
    // Crear code reader con múltiples formatos
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
    
    Logger.info("✅ Motor de escaneo: ZXing fallback");
    return true;
  } catch (error) {
    Logger.error("Error al inicializar ZXing:", error);
    return false;
  }
}

/**
 * Inicia el loop de detección según el motor activo
 */
function startDetectionLoop() {
  if (scannerEngine === 'native') {
    detectBarcodeNative();
  } else if (scannerEngine === 'zxing') {
    detectBarcodeZxing();
  }
}

/**
 * Detiene el loop de detección
 */
function stopDetectionLoop() {
  scannerActive = false;
  
  if (zxingAnimationFrame) {
    cancelAnimationFrame(zxingAnimationFrame);
    zxingAnimationFrame = null;
  }
  
  if (zxingCodeReader) {
    try {
      zxingCodeReader.reset();
    } catch (err) {
      Logger.warn("Error al resetear ZXing:", err);
    }
  }
}

async function openScanner() {
  if (!scannerOverlay) {
    Logger.error("Scanner overlay no encontrado");
    showToast("Error: Scanner no disponible", "error");
    return;
  }
  
  scannerOverlay.style.display = "flex";
  
  try {
    // Enumerar cámaras disponibles
    await enumerateCameras();
    
    // Intentar inicializar detector nativo primero
    const nativeOk = await initNativeDetector();
    
    // Si falla, intentar ZXing
    if (!nativeOk) {
      const zxingOk = await initZxingFallback();
      if (!zxingOk) {
        Logger.error("No hay motor de escaneo disponible");
        showToast("Escaneo automático no disponible", "warning");
        showScannerFallback();
        return;
      }
    }
    
    // Iniciar cámara
    await startCamera();
    
    scannerActive = true;
    
    // Mostrar indicador de actividad
    const activeIndicator = document.getElementById('scannerActiveIndicator');
    if (activeIndicator) {
      activeIndicator.style.display = 'flex';
    }
    
    // Iniciar detección
    startDetectionLoop();
    
  } catch (error) {
    Logger.error("Error al abrir scanner:", error);
    showScannerFallback();
  }
}

async function detectBarcodeNative() {
  if (!scannerActive || !barcodeDetector || !scannerVideo) return;
  
  try {
    const barcodes = await barcodeDetector.detect(scannerVideo);
    
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      
      // Anti-duplicado
      const now = Date.now();
      if (code === lastScannedCode && (now - lastScanTime) < INVENTORY_CONFIG.SCAN_DUPLICATE_TIMEOUT) {
        requestAnimationFrame(detectBarcodeNative);
        return;
      }
      
      lastScannedCode = code;
      lastScanTime = now;
      
      vibrate();
      
      // Efecto de flash visual
      const viewport = document.querySelector('.inv-scanner-viewport');
      if (viewport) {
        viewport.classList.add('flash');
        setTimeout(() => viewport.classList.remove('flash'), 400);
      }
      
      // Feedback visual de éxito
      const instructionsBox = document.getElementById('scannerInstructionsBox');
      const scannerInfo = document.getElementById('scannerInfo');
      
      if (instructionsBox) {
        instructionsBox.classList.add('success');
      }
      
      if (scannerInfo) {
        scannerInfo.textContent = `Código detectado`;
      }
      
      // Procesar según modo
      await processScan(code);
      
      // Cerrar scanner automáticamente después de 1 segundo
      setTimeout(() => {
        if (instructionsBox) {
          instructionsBox.classList.remove('success');
        }
        closeScanner();
      }, 1000);
      
      return;
    }
    
    requestAnimationFrame(detectBarcodeNative);
    
  } catch (error) {
    Logger.error("Error en detección:", error);
    requestAnimationFrame(detectBarcodeNative);
  }
}

/**
 * Detección con ZXing (fallback) - Con throttling para rendimiento
 */
let lastZxingCheck = 0;
const ZXING_CHECK_INTERVAL = 150; // ms entre intentos de lectura

async function detectBarcodeZxing() {
  if (!scannerActive || !zxingCodeReader || !scannerVideo) return;
  
  const now = Date.now();
  
  // Throttling para no saturar CPU
  if (now - lastZxingCheck < ZXING_CHECK_INTERVAL) {
    zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxing);
    return;
  }
  
  lastZxingCheck = now;
  
  try {
    // Verificar que el video esté listo
    if (scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) {
      zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxing);
      return;
    }
    
    // Intentar decodificar desde el video
    const result = await zxingCodeReader.decodeOnceFromVideoElement(scannerVideo);
    
    if (result && result.text) {
      const code = result.text;
      
      // Anti-duplicado
      if (code === lastScannedCode && (now - lastScanTime) < INVENTORY_CONFIG.SCAN_DUPLICATE_TIMEOUT) {
        zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxing);
        return;
      }
      
      lastScannedCode = code;
      lastScanTime = now;
      
      vibrate();
      
      // Efecto de flash visual
      const viewport = document.querySelector('.inv-scanner-viewport');
      if (viewport) {
        viewport.classList.add('flash');
        setTimeout(() => viewport.classList.remove('flash'), 400);
      }
      
      // Feedback visual de éxito
      const instructionsBox = document.getElementById('scannerInstructionsBox');
      const scannerInfo = document.getElementById('scannerInfo');
      
      if (instructionsBox) {
        instructionsBox.classList.add('success');
      }
      
      if (scannerInfo) {
        scannerInfo.textContent = `Código detectado`;
      }
      
      // Procesar según modo
      await processScan(code);
      
      // Cerrar scanner automáticamente después de 1 segundo
      setTimeout(() => {
        if (instructionsBox) {
          instructionsBox.classList.remove('success');
        }
        closeScanner();
      }, 1000);
      
      return;
    }
    
  } catch (error) {
    // ZXing lanza error cuando no encuentra código, es normal
    // Solo logear errores graves
    if (error.name !== 'NotFoundException') {
      Logger.warn("Error en detección ZXing:", error);
    }
  }
  
  zxingAnimationFrame = requestAnimationFrame(detectBarcodeZxing);
}

async function processScan(codigo) {
  Logger.info(`Código escaneado: ${codigo} (Modo: ${scannerMode})`);
  
  // Buscar producto por código
  const producto = await InventoryDB.buscarProductoPorCodigoBarras(codigo);
  
  if (scannerMode === "venta") {
    if (producto) {
      agregarAlCarritoVenta(producto);
    } else {
      showToast("Producto no registrado", "warning");
      closeScanner();
      setTimeout(() => {
        if (confirm("Producto no registrado. ¿Deseas registrarlo ahora?")) {
          openNewProduct();
          setTimeout(() => {
            document.getElementById("codigoBarras").value = codigo;
          }, 100);
        }
      }, 100);
    }
  } else if (scannerMode === "registro") {
    if (producto) {
      showToast("Este código ya está asociado a: " + producto.nombre, "info");
      closeScanner();
      setTimeout(() => viewProducto(producto.id), 500);
    } else {
      closeScanner();
      setTimeout(() => {
        openNewProduct();
        setTimeout(() => {
          document.getElementById("codigoBarras").value = codigo;
        }, 100);
      }, 100);
    }
  } else if (scannerMode === "registroTemporal") {
    document.getElementById("codigoBarras").value = codigo;
  } else if (scannerMode === "asociar") {
    if (currentProductoForAssociation) {
      const result = await InventoryDB.asociarCodigoBarras(currentProductoForAssociation, codigo);
      if (result.success) {
        showToast("Código asociado exitosamente", "success");
      } else {
        showToast("Error: " + result.error, "error");
      }
    }
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
  
  // Restablecer estado visual
  const instructionsBox = document.getElementById('scannerInstructionsBox');
  const scannerInfo = document.getElementById('scannerInfo');
  
  if (instructionsBox) {
    instructionsBox.classList.remove('success');
  }
  
  if (scannerInfo) {
    scannerInfo.textContent = "Listo para escanear";
  }
  
  lastScannedCode = null;
}

if (scannerClose) {
  scannerClose.addEventListener("click", closeScanner);
}

if (scannerManualInput) {
  scannerManualInput.addEventListener("click", () => {
    closeScanner();
    const codigo = prompt("Ingresa el código de barras manualmente:");
    if (codigo) {
      processScan(codigo);
    }
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
  // Implementar vista de detalle de producto
  showToast("Vista de detalle en desarrollo", "info");
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
  // Implementar vista de detalle de compra
  showToast("Vista de detalle en desarrollo", "info");
}

async function editProveedor(id) {
  // Implementar edición de proveedor
  showToast("Edición en desarrollo", "info");
}

// Reportes
async function generarReporteUtilidades() {
  showToast("Generando reporte...", "info");
  // Implementar
}

async function generarReporteRotacion() {
  showToast("Generando reporte...", "info");
  // Implementar
}

async function generarReporteStockBajo() {
  const productos = await InventoryDB.obtenerTodosProductos({ stockBajo: true });
  
  if (productos.length === 0) {
    showToast("No hay productos con stock bajo", "success");
    return;
  }
  
  showModal("⚠️ Productos con Stock Bajo", `
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Stock Actual</th>
            <th>Stock Mínimo</th>
          </tr>
        </thead>
        <tbody>
          ${productos.map(p => `
            <tr>
              <td>${p.nombre}</td>
              <td class="text-warning"><strong>${p.stock_actual}</strong></td>
              <td>${p.stock_minimo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `, `<button onclick="hideModal()" class="btn-primary">Cerrar</button>`);
}

async function generarReporteVentasMes() {
  showToast("Generando reporte...", "info");
  // Implementar
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
