// Inversiones MG - Panel de Administración
// Maneja toda la lógica del panel admin

// ========== ESTADO GLOBAL ==========
let currentUser = null;
let currentView = "dashboard";
let clientesData = [];
let obligacionesData = [];
let clientesDataLastFetch = null;
let clientesDataLoading = false;

// ========== ELEMENTOS DEL DOM ==========
const loginScreen = document.getElementById("loginScreen");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnMenu = document.getElementById("btnMenu");
const adminSidebar = document.getElementById("adminSidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const topbarTitle = document.getElementById("topbarTitle");
const adminUserName = document.getElementById("adminUserName");
const currentDate = document.getElementById("currentDate");
const modalOverlay = document.getElementById("modalOverlay");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
const modalClose = document.getElementById("modalClose");

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
  const toast = document.getElementById("toastAdmin");
  
  // Remover clases previas
  toast.className = "toast";
  
  // Agregar clase según tipo
  const typeClass = {
    info: "info",
    success: "success",
    warning: "warning",
    error: "error",
  };
  
  toast.classList.add(typeClass[type] || "info");
  toast.classList.add("active");
  toast.textContent = message;
  
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
}

// ========== CARGA CENTRALIZADA DE CLIENTES ==========
/**
 * Garantiza que clientesData esté cargado y actualizado.
 * Solución al bug: el wizard dependía de clientesData pero solo se llenaba en loadClientes().
 * Ahora cualquier módulo puede llamar a esta función para asegurar que haya clientes disponibles.
 * 
 * @param {Object} options - Opciones de carga
 * @param {boolean} options.force - Forzar recarga desde BD ignorando caché
 * @param {boolean} options.silent - No mostrar toast de error (para carga en background)
 * @returns {Promise<Array>} Array de clientes cargados
 */
async function ensureClientesDataLoaded({ force = false, silent = false } = {}) {
  // Si ya está cargando, esperar a que termine
  if (clientesDataLoading) {
    Logger.info("Esperando carga de clientes en progreso...");
    // Esperar máximo 5 segundos
    let attempts = 0;
    while (clientesDataLoading && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    return clientesData;
  }
  
  // Si ya hay datos en memoria y no es recarga forzada
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  const now = Date.now();
  const isCacheValid = clientesDataLastFetch && (now - clientesDataLastFetch) < CACHE_DURATION;
  
  if (!force && clientesData.length > 0 && isCacheValid) {
    Logger.debug(`Usando clientes en caché (${clientesData.length} clientes)`);
    return clientesData;
  }
  
  // Cargar desde BD
  clientesDataLoading = true;
  Logger.info("Cargando clientes desde base de datos...");
  
  try {
    const clientes = await obtenerTodosClientes();
    clientesData = clientes;
    clientesDataLastFetch = now;
    clientesDataLoading = false;
    
    Logger.success(`Clientes cargados: ${clientesData.length}`);
    return clientesData;
    
  } catch (error) {
    clientesDataLoading = false;
    Logger.error("Error al cargar clientes:", error);
    
    if (!silent) {
      showToast("Error al cargar clientes. Verifica tu conexión.", "error");
    }
    
    // Si falla pero había datos previos, mantenerlos
    return clientesData;
  }
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
  const session = localStorage.getItem(CONFIG.SESSION_KEY);
  if (session) {
    try {
      const sessionData = JSON.parse(session);
      const now = Date.now();
      
      if (now < sessionData.expiry) {
        currentUser = sessionData.user;
        Logger.success(`Sesión activa: ${sessionData.user.nombre}`);
        showAdminPanel();
        return true;
      } else {
        Logger.info("Sesión expirada, redirigiendo al login");
        localStorage.removeItem(CONFIG.SESSION_KEY);
      }
    } catch (error) {
      Logger.error("Error al verificar sesión:", error);
      localStorage.removeItem(CONFIG.SESSION_KEY);
    }
  }
  return false;
}

function saveSession(user) {
  const sessionData = {
    user,
    expiry: Date.now() + CONFIG.SESSION_DURATION,
  };
  localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(sessionData));
}

function clearSession() {
  localStorage.removeItem(CONFIG.SESSION_KEY);
  currentUser = null;
}

// ========== LOGIN ==========
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const user = loginUser.value.trim();
  const password = loginPassword.value;
  
  loginError.classList.remove("active");
  btnLogin.disabled = true;
  btnLogin.textContent = "Verificando...";
  
  // Autenticación con ruteo por credenciales
  // Créditos: miguelgarcia / miguel2003
  // Inventarios: inventarios / inv2026
  setTimeout(() => {
    if (user === "miguelgarcia" && password === "miguel2003") {
      // Usuario de créditos (panel actual)
      currentUser = { 
        username: user, 
        nombre: "Miguel García",
        role: "admin" 
      };
      saveSession(currentUser);
      showAdminPanel();
    } else if (user === "inventarios" && password === "inv2026") {
      // Usuario de inventarios - guardar sesión y redirigir
      const inventoryUser = { 
        username: user, 
        nombre: "Administrador Inventarios",
        role: "inventarios" 
      };
      const sessionData = {
        user: inventoryUser,
        expiry: Date.now() + (8 * 60 * 60 * 1000) // 8 horas
      };
      localStorage.setItem("inversionesmg_inventory_session", JSON.stringify(sessionData));
      Logger.info("Sesión de inventarios guardada, redirigiendo...");
      window.location.href = "inventarios.html";
    } else {
      loginError.textContent = "Usuario o contraseña incorrectos";
      loginError.classList.add("active");
      btnLogin.disabled = false;
      btnLogin.textContent = "Iniciar sesión";
    }
  }, 800);
});

function showAdminPanel() {
  loginScreen.style.display = "none";
  adminPanel.style.display = "flex";
  adminUserName.textContent = currentUser.username;
  
  // Fecha actual
  currentDate.textContent = formatDate(new Date());
  
  // Configurar navegación
  setupNavigation();
  
  // Cargar vista inicial (AUTOMÁTICAMENTE)
  navigateToView("dashboard");
  Logger.info("Dashboard cargado automáticamente después del login");
}

// ========== LOGOUT ==========
btnLogout.addEventListener("click", () => {
  if (confirm("¿Seguro que deseas cerrar sesión?")) {
    clearSession();
    location.reload();
  }
});

// ========== NAVEGACIÓN MEJORADA - COMPLETAMENTE FUNCIONAL ==========
function setupNavigation() {
  // Obtener todos los elementos de navegación
  const sidebarNavItems = document.querySelectorAll(".admin-sidebar .nav-item");
  const mobileNavItems = document.querySelectorAll(".mobile-nav .mobile-nav-item");
  
  // Configurar navegación del sidebar
  sidebarNavItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) {
        navigateToView(view);
      }
    });
  });
  
  // Configurar navegación móvil
  mobileNavItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) {
        navigateToView(view);
      }
    });
  });
  
  Logger.info("✅ Sistema de navegación configurado");
}

/**
 * Navega a una vista específica (SPA interno)
 */
function navigateToView(view) {
  if (!view) {
    Logger.error("Vista no especificada");
    return;
  }
  
  Logger.info(`📍 Navegando a: ${view}`);
  
  // Actualizar estado
  currentView = view;
  
  // Actualizar clases activas en sidebar
  document.querySelectorAll(".admin-sidebar .nav-item").forEach(item => {
    if (item.dataset.view === view) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
  
  // Actualizar clases activas en móvil
  document.querySelectorAll(".mobile-nav .mobile-nav-item").forEach(item => {
    if (item.dataset.view === view) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
  
  // Cerrar sidebar en móvil si está abierto
  closeSidebar();
  
  // Ocultar todas las vistas
  document.querySelectorAll(".view-content").forEach(v => {
    v.style.display = "none";
  });
  
  // Mostrar vista seleccionada
  const viewKey = view.charAt(0).toUpperCase() + view.slice(1);
  const viewElement = document.getElementById(`view${viewKey}`);
  
  if (viewElement) {
    viewElement.style.display = "block";
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    Logger.error(`Vista no encontrada: view${viewKey}`);
  }
  
  // Actualizar título del topbar
  const titles = {
    dashboard: "Dashboard",
    clientes: "Clientes",
    obligaciones: "Obligaciones",
    pagos: "Pagos",
    refinanciacion: "Refinanciación",
    descuentos: "Descuentos",
    documentos: "Documentos",
    auditoria: "Auditoría"
  };
  
  topbarTitle.textContent = titles[view] || "Panel Admin";
  
  // Cargar contenido de la vista
  loadViewContent(view);
}

/**
 * Carga el contenido de una vista
 */
function loadViewContent(view) {
  switch (view) {
    case "dashboard":
      loadDashboard();
      break;
    case "clientes":
      loadClientes();
      break;
    case "obligaciones":
      loadObligaciones();
      break;
    case "pagos":
      loadPagos();
      break;
    case "refinanciacion":
      loadRefinanciacion();
      break;
    case "descuentos":
      loadDescuentos();
      break;
    case "documentos":
      loadDocumentos();
      break;
    case "auditoria":
      loadAuditoria();
      break;
    default:
      Logger.warn(`Vista no implementada: ${view}`);
  }
}

// ========== MENU MÓVIL - COMPLETAMENTE FUNCIONAL ==========
function openSidebar() {
  adminSidebar.classList.add("open");
  sidebarOverlay.classList.add("active");
  document.body.style.overflow = "hidden"; // Prevenir scroll del body
  Logger.debug("Sidebar abierto");
}

function closeSidebar() {
  adminSidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
  document.body.style.overflow = ""; // Restaurar scroll
  Logger.debug("Sidebar cerrado");
}

function toggleSidebar() {
  if (adminSidebar.classList.contains("open")) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// Botón hamburguesa
btnMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSidebar();
  Logger.info("🍔 Toggle sidebar");
});

// Overlay - cerrar al hacer click fuera
sidebarOverlay.addEventListener("click", () => {
  closeSidebar();
  Logger.info("Sidebar cerrado por overlay");
});

// Cerrar con tecla Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && adminSidebar.classList.contains("open")) {
    closeSidebar();
    Logger.info("Sidebar cerrado con Escape");
  }
});

// ========== MODAL ==========
modalClose.addEventListener("click", hideModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    hideModal();
  }
});

// ========== DASHBOARD ==========
async function loadDashboard() {
  const container = document.getElementById("viewDashboard");
  showLoading(container, "Cargando dashboard...");
  
  try {
    const kpis = await obtenerKPIs();
    const cuotasPorVencer = await obtenerCuotasPorVencer(7);
    const cuotasVencidas = await obtenerCuotasVencidas();
    
    container.innerHTML = `
      <!-- KPIs -->
      <div class="dashboard-kpis">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Capital Invertido</span>
            <div class="kpi-icon" style="background-color: var(--primary-100); color: var(--primary-600);">💼</div>
          </div>
          <div class="kpi-value">${formatCurrency(kpis.totalInvertido)}</div>
          <div class="kpi-subtitle">Capital en obligaciones vigentes</div>
        </div>
        
        <div class="kpi-card success">
          <div class="kpi-header">
            <span class="kpi-label">Recaudado</span>
            <div class="kpi-icon" style="background-color: var(--success-light); color: var(--success);">✓</div>
          </div>
          <div class="kpi-value">${formatCurrency(kpis.totalRecaudado)}</div>
          <div class="kpi-subtitle">Total pagado histórico</div>
        </div>
        
        <div class="kpi-card warning">
          <div class="kpi-header">
            <span class="kpi-label">Por Recaudar</span>
            <div class="kpi-icon" style="background-color: var(--warning-light); color: var(--warning);">⏳</div>
          </div>
          <div class="kpi-value">${formatCurrency(kpis.totalPorRecaudar)}</div>
          <div class="kpi-subtitle">Saldo pendiente total</div>
        </div>
        
        <div class="kpi-card danger">
          <div class="kpi-header">
            <span class="kpi-label">Cartera Vencida</span>
            <div class="kpi-icon" style="background-color: var(--danger-light); color: var(--danger);">⚠️</div>
          </div>
          <div class="kpi-value">${formatCurrency(kpis.carteraVencida)}</div>
          <div class="kpi-subtitle">Cuotas en mora</div>
        </div>
      </div>
      
      <!-- Listas -->
      <div class="dashboard-sections">
        <div class="list-card">
          <div class="list-header">
            <h3 class="list-title">Próximas a vencer (7 días)</h3>
            <span class="badge badge-warning">${cuotasPorVencer.length}</span>
          </div>
          <div class="list-body">
            ${cuotasPorVencer.length === 0 ? `
              <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                No hay cuotas por vencer en los próximos 7 días
              </div>
            ` : cuotasPorVencer.slice(0, 5).map(c => `
              <div class="list-item">
                <div class="list-item-header">
                  <span class="list-item-title">${c.obligaciones.clientes.nombre}</span>
                  <span class="badge badge-warning">${formatCurrency(c.valor_cuota)}</span>
                </div>
                <div class="list-item-meta">
                  <span>Cuota #${c.numero}</span>
                  <span>Vence: ${formatDate(c.fecha_vencimiento)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
        
        <div class="list-card">
          <div class="list-header">
            <h3 class="list-title">Cuotas vencidas</h3>
            <span class="badge badge-danger">${cuotasVencidas.length}</span>
          </div>
          <div class="list-body">
            ${cuotasVencidas.length === 0 ? `
              <div style="text-align: center; padding: 2rem; color: var(--gray-500);">
                No hay cuotas vencidas
              </div>
            ` : cuotasVencidas.slice(0, 5).map(c => {
              const venc = new Date(c.fecha_vencimiento);
              venc.setHours(0, 0, 0, 0);
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              const diasMora = getDaysDifference(venc, hoy);
              
              return `
                <div class="list-item">
                  <div class="list-item-header">
                    <span class="list-item-title">${c.obligaciones.clientes.nombre}</span>
                    <span class="badge badge-danger">${diasMora} días</span>
                  </div>
                  <div class="list-item-meta">
                    <span>Cuota #${c.numero}</span>
                    <span>${formatCurrency(c.valor_cuota)}</span>
                    <span>Venció: ${formatDate(c.fecha_vencimiento)}</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    Logger.error("Error al cargar dashboard:", error);
    container.innerHTML = `
      <div class="alert alert-danger">
        Error al cargar el dashboard. Por favor, recarga la página.
      </div>
    `;
  }
}

// ========== CLIENTES ==========
async function loadClientes() {
  const container = document.getElementById("viewClientes");
  showLoading(container, "Cargando clientes...");
  
  try {
    // Usar función centralizada para cargar clientes
    await ensureClientesDataLoaded({ force: true });
    
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-header-title">Clientes</h2>
        <button class="btn btn-primary" onclick="mostrarFormularioCliente()">
          + Nuevo
        </button>
      </div>
      
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          class="search-input" 
          placeholder="Buscar por nombre o documento..."
          id="searchClientes"
        >
      </div>
      
      <div class="cards-grid" id="clientesCards">
        ${clientesData.map(cliente => renderClienteCard(cliente)).join("")}
      </div>
    `;
    
    // Búsqueda en tiempo real
    document.getElementById("searchClientes").addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      const filtrados = clientesData.filter(c => 
        c.nombre.toLowerCase().includes(query) ||
        c.documento.includes(query)
      );
      document.getElementById("clientesCards").innerHTML = 
        filtrados.map(cliente => renderClienteCard(cliente)).join("");
    });
  } catch (error) {
    Logger.error("Error al cargar clientes:", error);
    container.innerHTML = `<div class="alert alert-danger">Error al cargar clientes</div>`;
  }
}

function renderClienteCard(cliente) {
  const estadoChip = cliente.estado === "activo" 
    ? `<span class="chip chip-success">Activo</span>`
    : `<span class="chip chip-neutral">Inactivo</span>`;
  
  return `
    <div class="card-item">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-title">${cliente.nombre}</div>
          <div class="card-subtitle">${cliente.tipo_documento} ${cliente.documento}</div>
        </div>
        <div class="card-header-right">
          ${estadoChip}
          <button class="card-menu-btn" onclick="mostrarMenuCliente(${cliente.id}, event)" aria-label="Opciones">
            ⋮
          </button>
        </div>
      </div>
      
      <div class="card-body">
        ${cliente.telefono ? `
          <div class="card-info-row">
            <span class="card-info-icon">📞</span>
            <span class="card-info-label">Teléfono</span>
            <a href="tel:${cliente.telefono}" class="card-info-value" style="color: var(--corp-primary);">
              ${cliente.telefono}
            </a>
          </div>
        ` : ''}
        
        ${cliente.email ? `
          <div class="card-info-row">
            <span class="card-info-icon">📧</span>
            <span class="card-info-label">Email</span>
            <span class="card-info-value">${cliente.email}</span>
          </div>
        ` : ''}
        
        ${cliente.ciudad ? `
          <div class="card-info-row">
            <span class="card-info-icon">📍</span>
            <span class="card-info-label">Ciudad</span>
            <span class="card-info-value">${cliente.ciudad}</span>
          </div>
        ` : ''}
      </div>
      
      <div class="card-footer">
        <button class="card-action-btn card-action-btn-primary" onclick="verFichaCliente(${cliente.id})">
          Ver Detalle
        </button>
        <button class="card-action-btn card-action-btn-secondary" onclick="editarCliente(${cliente.id})">
          Editar
        </button>
      </div>
    </div>
  `;
}

function mostrarMenuCliente(clienteId, event) {
  event.stopPropagation();
  const cliente = clientesData.find(c => c.id === clienteId);
  if (!cliente) return;
  
  showModal(
    "Opciones de Cliente",
    `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button class="btn btn-primary" onclick="verFichaCliente(${clienteId}); closeModal();" style="width: 100%;">
          👤 Ver Detalle Completo
        </button>
        <button class="btn btn-primary" onclick="editarCliente(${clienteId}); closeModal();" style="width: 100%;">
          ✏️ Editar Cliente
        </button>
        <button class="btn btn-primary" onclick="closeModal(); setTimeout(() => mostrarFormularioObligacion(${clienteId}), 300);" style="width: 100%;">
          💼 Nueva Obligación
        </button>
        <button class="btn btn-danger" onclick="confirmarEliminarCliente(${clienteId}); closeModal();" style="width: 100%;">
          🗑️ Eliminar Cliente
        </button>
      </div>
    `
  );
}

function mostrarFormularioCliente(clienteId = null) {
  const cliente = clienteId ? clientesData.find(c => c.id === clienteId) : null;
  const isEdit = !!cliente;
  
  showModal(
    isEdit ? "Editar Cliente" : "Nuevo Cliente",
    `
      <form id="formCliente">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Tipo de documento</label>
            <select class="form-select" id="tipoDocumento" required>
              <option value="CC" ${cliente?.tipo_documento === "CC" ? "selected" : ""}>Cédula (CC)</option>
              <option value="CE" ${cliente?.tipo_documento === "CE" ? "selected" : ""}>Cédula Extranjería (CE)</option>
              <option value="NIT" ${cliente?.tipo_documento === "NIT" ? "selected" : ""}>NIT</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Número de documento</label>
            <input 
              type="text" 
              class="form-input" 
              id="documento" 
              value="${cliente?.documento || ""}"
              required
              maxlength="10"
              pattern="[0-9]*"
            >
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Nombre completo</label>
          <input 
            type="text" 
            class="form-input" 
            id="nombre" 
            value="${cliente?.nombre || ""}"
            required
          >
        </div>
        
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input 
              type="tel" 
              class="form-input" 
              id="telefono" 
              value="${cliente?.telefono || ""}"
              pattern="[0-9]{10}"
            >
          </div>
          
          <div class="form-group">
            <label class="form-label">Email (opcional)</label>
            <input 
              type="email" 
              class="form-input" 
              id="email" 
              value="${cliente?.email || ""}"
            >
          </div>
        </div>
        
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Departamento</label>
            <input 
              type="text" 
              class="form-input" 
              id="departamento" 
              value="${cliente?.departamento || ""}"
            >
          </div>
          
          <div class="form-group">
            <label class="form-label">Ciudad</label>
            <input 
              type="text" 
              class="form-input" 
              id="ciudad" 
              value="${cliente?.ciudad || ""}"
            >
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Dirección (opcional)</label>
          <input 
            type="text" 
            class="form-input" 
            id="direccion" 
            value="${cliente?.direccion || ""}"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-select" id="estado">
            <option value="activo" ${!cliente || cliente?.estado === "activo" ? "selected" : ""}>Activo</option>
            <option value="inactivo" ${cliente?.estado === "inactivo" ? "selected" : ""}>Inactivo</option>
          </select>
        </div>
      </form>
    `,
    `
      <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarCliente(${clienteId || null})">
        ${isEdit ? "Guardar cambios" : "Crear cliente"}
      </button>
    `
  );
}

async function guardarCliente(clienteId) {
  const data = {
    tipo_documento: document.getElementById("tipoDocumento").value,
    documento: document.getElementById("documento").value.trim(),
    nombre: document.getElementById("nombre").value.trim(),
    telefono: document.getElementById("telefono").value.trim(),
    email: document.getElementById("email").value.trim(),
    departamento: document.getElementById("departamento").value.trim(),
    ciudad: document.getElementById("ciudad").value.trim(),
    direccion: document.getElementById("direccion").value.trim(),
    estado: document.getElementById("estado").value,
  };
  
  // Validaciones
  if (!validarDocumento(data.documento)) {
    showToast("Documento inválido", "error");
    return;
  }
  
  try {
    let result;
    if (clienteId) {
      result = await actualizarCliente(clienteId, data);
      await registrarAuditoria({
        admin_user: currentUser.username,
        accion: "actualizar",
        entidad: "cliente",
        entidad_id: clienteId,
        detalle_json: data,
      });
    } else {
      result = await crearCliente(data);
      await registrarAuditoria({
        admin_user: currentUser.username,
        accion: "crear",
        entidad: "cliente",
        entidad_id: result.data?.id,
        detalle_json: data,
      });
    }
    
    if (result.success) {
      showToast(clienteId ? "Cliente actualizado" : "Cliente creado", "success");
      hideModal();
      loadClientes();
    } else {
      showToast("Error al guardar cliente", "error");
    }
  } catch (error) {
    Logger.error("Error al guardar cliente:", error);
    showToast("Error al guardar cliente", "error");
  }
}

// ========================================
// ELIMINACIÓN DE CLIENTES CON CONFIRMACIÓN
// ========================================

/**
 * Muestra modal de confirmación para eliminar cliente
 * Requiere escribir ELIMINAR para confirmar
 * ADVERTENCIA: Elimina TODO en cascada (obligaciones, cuotas, pagos, documentos)
 */
async function confirmarEliminarCliente(clienteId) {
  // Verificar sesión
  if (!currentUser || !currentUser.username) {
    showToast("Sesión inválida. No se puede eliminar.", "error");
    return;
  }

  // Buscar cliente en caché
  await ensureClientesDataLoaded();
  const cliente = clientesData.find(c => c.id === clienteId);
  if (!cliente) {
    showToast("Cliente no encontrado", "error");
    return;
  }

  // Obtener snapshot completo con conteos
  const snapshotResult = await obtenerSnapshotClienteParaEliminacion(clienteId);
  if (!snapshotResult.success) {
    showToast(`Error al cargar datos: ${snapshotResult.error}`, "error");
    return;
  }

  const { counts } = snapshotResult;

  // Modal de confirmación MUY FUERTE
  const modalBody = `
    <div class="danger-box">
      <h3 style="margin-top: 0; color: var(--danger);">🚨 PELIGRO: Eliminación Masiva</h3>
      <p style="font-size: 1.1rem;"><strong>Esta acción NO se puede deshacer y eliminará TODO.</strong></p>
    </div>

    <div class="info-section" style="margin: 1.5rem 0;">
      <h4>Cliente a eliminar:</h4>
      <ul style="list-style: none; padding-left: 0;">
        <li><strong>ID:</strong> #${cliente.id}</li>
        <li><strong>Nombre:</strong> ${cliente.nombre}</li>
        <li><strong>Documento:</strong> ${cliente.tipo_documento} ${cliente.documento}</li>
        <li><strong>Teléfono:</strong> ${cliente.telefono || 'N/A'}</li>
        <li><strong>Ciudad:</strong> ${cliente.ciudad || 'N/A'}</li>
      </ul>
    </div>

    <div class="danger-box">
      <h4>⚠️ Se eliminarán en cascada (NO REVERSIBLE):</h4>
      <ul style="font-size: 1rem;">
        <li>📁 <strong style="font-size: 1.2rem;">${counts.obligaciones_total}</strong> obligaciones completas</li>
        <li>📋 <strong style="font-size: 1.2rem;">${counts.cuotas_total}</strong> cuotas</li>
        <li>💰 <strong style="font-size: 1.2rem;">${counts.pagos_total}</strong> pagos registrados</li>
        <li>📄 <strong style="font-size: 1.2rem;">${counts.documentos_total}</strong> documentos</li>
      </ul>
      <p style="margin-top: 1rem; padding: 1rem; background: var(--danger-light); border-left: 4px solid var(--danger); color: var(--danger-dark); font-weight: bold;">
        Se perderá TODA la información financiera e histórico de este cliente de forma PERMANENTE.
      </p>
    </div>

    <div class="form-group" style="margin-top: 2rem;">
      <label class="form-label" style="font-size: 1rem; font-weight: bold;">
        Para confirmar, escribe: <span style="color: var(--danger);">ELIMINAR</span>
      </label>
      <input 
        type="text" 
        class="form-input" 
        id="inputConfirmEliminarCliente"
        placeholder="Escribe ELIMINAR para confirmar"
        autocomplete="off"
      >
      <p style="font-size: 0.875rem; color: var(--gray-600); margin-top: 0.5rem;">
        Cliente: <strong>${cliente.nombre}</strong> (ID: #${clienteId}, Doc: ${cliente.documento})
      </p>
    </div>
  `;

  const modalFooter = `
    <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
    <button class="btn btn-danger" id="btnConfirmEliminarCliente" disabled>
      🗑️ ELIMINAR TODO DEFINITIVAMENTE
    </button>
  `;

  showModal("⚠️ Eliminar Cliente y Todo su Historial", modalBody, modalFooter);

  // Habilitar botón solo cuando el input coincide
  setTimeout(() => {
    const input = document.getElementById("inputConfirmEliminarCliente");
    const btnConfirm = document.getElementById("btnConfirmEliminarCliente");

    input.addEventListener("input", () => {
      if (input.value === "ELIMINAR") {
        btnConfirm.disabled = false;
      } else {
        btnConfirm.disabled = true;
      }
    });

    btnConfirm.addEventListener("click", () => {
      ejecutarEliminarCliente(clienteId);
    });
  }, 100);
}

/**
 * Ejecuta la eliminación del cliente
 */
async function ejecutarEliminarCliente(clienteId) {
  const btnConfirm = document.getElementById("btnConfirmEliminarCliente");
  const btnCancel = document.querySelector(".modal-footer .btn-secondary");

  // Deshabilitar botones y mostrar loading
  btnConfirm.disabled = true;
  btnConfirm.innerHTML = '<span class="btn-loading"></span> Eliminando todo...';
  if (btnCancel) btnCancel.disabled = true;

  try {
    const resultado = await eliminarClienteConAuditoria(clienteId, currentUser.username);

    if (resultado.success) {
      hideModal();
      showToast(`Cliente #${clienteId} y todo su historial eliminados correctamente`, "success");
      
      // Remover de caché local
      clientesData = clientesData.filter(c => c.id !== clienteId);
      
      // Recargar clientes
      await loadClientes();

      // Recargar obligaciones si la vista está activa
      const viewObligaciones = document.getElementById("viewObligaciones");
      if (viewObligaciones && viewObligaciones.style.display !== "none") {
        if (typeof loadObligaciones === 'function') {
          await loadObligaciones();
        }
      }

      // Limpiar selección del módulo de pagos si el cliente era seleccionado
      if (typeof selectedClientePagos !== 'undefined' && selectedClientePagos?.id === clienteId) {
        if (typeof limpiarSeleccionPagos === 'function') {
          limpiarSeleccionPagos();
        }
      }
    } else {
      showToast(`Error al eliminar: ${resultado.error}`, "error");
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '🗑️ ELIMINAR TODO DEFINITIVAMENTE';
      if (btnCancel) btnCancel.disabled = false;
    }
  } catch (error) {
    Logger.error("Error inesperado al eliminar cliente:", error);
    showToast("Error inesperado al eliminar cliente", "error");
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = '🗑️ ELIMINAR TODO DEFINITIVAMENTE';
    if (btnCancel) btnCancel.disabled = false;
  }
}

// Continúa en el siguiente mensaje...
