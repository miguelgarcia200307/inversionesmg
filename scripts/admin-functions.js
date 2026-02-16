// Inversiones MG - Funciones complementarias del Admin
// Continuación de funciones de gestión

// ========== FICHA CLIENTE ==========
async function verFichaCliente(clienteId) {
  try {
    const cliente = clientesData.find(c => c.id === clienteId);
    if (!cliente) return;
    
    const obligaciones = await obtenerObligacionesCliente(clienteId);
    const auditoria = await obtenerAuditoria({ entidad: "cliente", entidad_id: clienteId });
    
    showModal(
      `Ficha de Cliente`,
      `
        <div class="client-profile">
          <div class="client-profile-header">
            <h3 class="client-profile-name">${cliente.nombre}</h3>
            <div class="client-profile-meta">
              <span>${cliente.tipo_documento}: ${cliente.documento}</span>
              <span class="badge ${cliente.estado === "activo" ? "badge-success" : "badge-neutral"}">
                ${cliente.estado}
              </span>
            </div>
          </div>
          
          <div class="client-profile-body">
            <h4 style="margin-bottom: 1rem;">Información de contacto</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Teléfono</span>
                <span class="info-value">${cliente.telefono || "-"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Email</span>
                <span class="info-value">${cliente.email || "-"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Ciudad</span>
                <span class="info-value">${cliente.ciudad || "-"}, ${cliente.departamento || "-"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Dirección</span>
                <span class="info-value">${cliente.direccion || "-"}</span>
              </div>
            </div>
            
            <h4 style="margin: 2rem 0 1rem;">Obligaciones (${obligaciones.length})</h4>
            ${obligaciones.length === 0 ? `
              <p style="color: var(--gray-600); text-align: center; padding: 2rem;">
                No tiene obligaciones registradas
              </p>
            ` : `
              <div style="display: grid; gap: 1rem;">
                ${obligaciones.map(o => {
                  const cuotasPagadas = o.cuotas.filter(c => c.estado === "pagada").length;
                  return `
                    <div class="card">
                      <div class="card-body">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                          <strong>${o.tipo === "prestamo" ? "Préstamo" : "Producto"} #${o.id}</strong>
                          <span class="badge ${o.estado.includes("mora") ? "badge-danger" : "badge-success"}">
                            ${o.estado.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div style="color: var(--gray-600); font-size: 0.875rem;">
                          Capital: ${formatCurrency(o.capital)} | 
                          Cuotas: ${cuotasPagadas}/${o.cuotas.length} |
                          Fecha: ${formatDate(o.fecha_inicio)}
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `}
            
            <h4 style="margin: 2rem 0 1rem;">Historial de cambios</h4>
            ${auditoria.length === 0 ? `
              <p style="color: var(--gray-600); text-align: center; padding: 1rem;">
                No hay registros
              </p>
            ` : `
              <div class="timeline">
                ${auditoria.slice(0, 5).map(a => `
                  <div class="timeline-item">
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                      <div class="timeline-header">
                        <span class="timeline-title">${a.accion} - ${a.admin_user}</span>
                        <span class="timeline-date">${formatDateTime(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
          </div>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="hideModal(); editarCliente(${clienteId})">Editar</button>
      `
    );
  } catch (error) {
    Logger.error("Error al cargar ficha cliente:", error);
    showToast("Error al cargar ficha", "error");
  }
}

function editarCliente(clienteId) {
  mostrarFormularioCliente(clienteId);
}

// ========== OBLIGACIONES ==========
async function loadObligaciones() {
  const container = document.getElementById("viewObligaciones");
  showLoading(container, "Cargando obligaciones...");
  
  try {
    // Cargar clientes para el wizard (en background)
    await ensureClientesDataLoaded({ silent: true });
    
    // FIX DUPLICACIÓN: Consulta directa optimizada
    Logger.info("Cargando todas las obligaciones...");
    const obligaciones = await obtenerTodasObligaciones();
    Logger.info(`Obligaciones obtenidas de BD: ${obligaciones.length}`);
    
    // BLINDAJE: Deduplicación por ID
    const obligacionesMap = new Map();
    obligaciones.forEach(obl => {
      if (obligacionesMap.has(obl.id)) {
        Logger.warn(`⚠️ Obligación duplicada detectada: ID ${obl.id}`);
        const existente = obligacionesMap.get(obl.id);
        const cuotasExistente = existente.cuotas?.length || 0;
        const cuotasNueva = obl.cuotas?.length || 0;
        if (cuotasNueva > cuotasExistente) {
          obligacionesMap.set(obl.id, obl);
        }
      } else {
        obligacionesMap.set(obl.id, obl);
      }
    });
    
    obligacionesData = Array.from(obligacionesMap.values());
    Logger.success(`Obligaciones únicas cargadas: ${obligacionesData.length}`);
    
    if (obligaciones.length > obligacionesData.length) {
      const duplicados = obligaciones.length - obligacionesData.length;
      Logger.warn(`🔧 Se eliminaron ${duplicados} duplicado(s)`);
      showToast(`Se detectaron y corrigieron ${duplicados} obligación(es) duplicada(s)`, "warning");
    }
    
    container.innerHTML = `
      <div class="obligaciones-header">
        <div class="obligaciones-header-content">
          <div class="obligaciones-header-text">
            <h2 class="obligaciones-title">Obligaciones</h2>
            <p class="obligaciones-subtitle">Gestión de préstamos y productos</p>
          </div>
          <button class="btn-nueva-obligacion" onclick="mostrarFormularioObligacion()">
            <span class="btn-nueva-icon">+</span>
            <span class="btn-nueva-text">Nueva</span>
          </button>
        </div>
      </div>
      
      <div class="obligaciones-filters" id="obligacionesFilters">
        <button class="filter-chip active" data-filter="todas">
          <span class="filter-chip-text">Todas</span>
        </button>
        <button class="filter-chip" data-filter="prestamo">
          <span class="filter-chip-icon">💰</span>
          <span class="filter-chip-text">Préstamos</span>
        </button>
        <button class="filter-chip" data-filter="producto">
          <span class="filter-chip-icon">📦</span>
          <span class="filter-chip-text">Productos</span>
        </button>
        <button class="filter-chip" data-filter="vigente_al_dia">
          <span class="filter-chip-icon">✅</span>
          <span class="filter-chip-text">Al día</span>
        </button>
        <button class="filter-chip" data-filter="vigente_en_mora">
          <span class="filter-chip-icon">⚠️</span>
          <span class="filter-chip-text">En mora</span>
        </button>
      </div>
      
      <div class="obligaciones-list" id="obligacionesCards">
        ${obligacionesData.length === 0 
          ? `<div class="obl-empty-state">
               <div class="obl-empty-icon">📋</div>
               <h3 class="obl-empty-title">No hay obligaciones</h3>
               <p class="obl-empty-text">Crea una nueva obligación para comenzar</p>
             </div>`
          : obligacionesData.map(o => renderObligacionCard(o)).join("")
        }
      </div>
    `;
    
    // Filtros
    document.querySelectorAll(".filter-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        const filter = btn.dataset.filter;
        let filtradas = obligacionesData;
        
        if (filter !== "todas") {
          if (filter === "prestamo" || filter === "producto") {
            filtradas = obligacionesData.filter(o => o.tipo === filter);
          } else {
            filtradas = obligacionesData.filter(o => o.estado === filter);
          }
        }
        
        const cardsContainer = document.getElementById("obligacionesCards");
        if (filtradas.length === 0) {
          const filterName = btn.textContent.trim();
          cardsContainer.innerHTML = `
            <div class="obl-empty-state">
              <div class="obl-empty-icon">🔍</div>
              <h3 class="obl-empty-title">Sin resultados</h3>
              <p class="obl-empty-text">No hay obligaciones en "${filterName}"</p>
            </div>
          `;
        } else {
          cardsContainer.innerHTML = filtradas.map(o => renderObligacionCard(o)).join("");
        }
      });
    });
  } catch (error) {
    Logger.error("Error al cargar obligaciones:", error);
    container.innerHTML = `<div class="alert alert-danger">Error al cargar obligaciones</div>`;
  }
}

function renderObligacionCard(obligacion) {
  const cuotasPagadas = obligacion.cuotas?.filter(c => c.estado === "pagada").length || 0;
  const totalCuotas = obligacion.cuotas?.length || 0;
  const nombreCliente = obligacion.clientes?.nombre || "[Cliente no encontrado]";
  const progreso = totalCuotas > 0 ? Math.round((cuotasPagadas / totalCuotas) * 100) : 0;
  
  const enMora = obligacion.estado.includes("mora");
  const finalizada = obligacion.estado === "finalizada";
  
  // Determinar estado y color
  let estadoBadge = "";
  let estadoClass = "";
  
  if (finalizada) {
    estadoBadge = "Finalizada";
    estadoClass = "obl-badge-neutral";
  } else if (enMora) {
    estadoBadge = "En Mora";
    estadoClass = "obl-badge-danger";
  } else {
    estadoBadge = "Al Día";
    estadoClass = "obl-badge-success";
  }
  
  // Tipo de obligación
  const tipoChip = obligacion.tipo === "prestamo"
    ? `<span class="obl-type-chip obl-type-prestamo">Préstamo</span>`
    : `<span class="obl-type-chip obl-type-producto">Producto</span>`;
  
  // Calcular próxima cuota si existe
  const proximaCuota = obligacion.cuotas?.find(c => c.estado === "pendiente");
  const proximaCuotaInfo = proximaCuota 
    ? `<div class="obl-info-item">
         <span class="obl-info-icon">📅</span>
         <div class="obl-info-content">
           <span class="obl-info-label">Próxima cuota</span>
           <span class="obl-info-value">${formatDate(proximaCuota.fecha_vencimiento)}</span>
         </div>
       </div>`
    : "";
  
  return `
    <div class="obl-card">
      <!-- Header -->
      <div class="obl-card-header">
        <div class="obl-card-header-left">
          <h3 class="obl-card-title">${nombreCliente}</h3>
          <p class="obl-card-subtitle">Obligación #${obligacion.id}</p>
        </div>
        <div class="obl-card-header-right">
          ${tipoChip}
          <button class="obl-menu-btn" onclick="mostrarMenuObligacion(${obligacion.id}, event)" aria-label="Opciones">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="4" r="1.5" fill="currentColor"/>
              <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="10" cy="16" r="1.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Monto Principal (Hero) -->
      <div class="obl-card-hero">
        <div class="obl-hero-amount">${formatCurrency(obligacion.capital)}</div>
        <div class="obl-hero-label">Capital</div>
      </div>
      
      <!-- Grid de Información -->
      <div class="obl-info-grid">
        <div class="obl-info-item">
          <span class="obl-info-icon">💳</span>
          <div class="obl-info-content">
            <span class="obl-info-label">Cuota mensual</span>
            <span class="obl-info-value">${formatCurrency(obligacion.cuotas?.[0]?.valor_cuota || 0)}</span>
          </div>
        </div>
        
        <div class="obl-info-item">
          <span class="obl-info-icon">📊</span>
          <div class="obl-info-content">
            <span class="obl-info-label">Progreso</span>
            <span class="obl-info-value">${cuotasPagadas}/${totalCuotas}</span>
          </div>
        </div>
        
        <div class="obl-info-item">
          <span class="obl-info-icon">📆</span>
          <div class="obl-info-content">
            <span class="obl-info-label">Inicio</span>
            <span class="obl-info-value">${formatDate(obligacion.fecha_inicio)}</span>
          </div>
        </div>
        
        <div class="obl-info-item">
          <span class="obl-info-icon">${enMora ? "⚠️" : finalizada ? "✔️" : "✅"}</span>
          <div class="obl-info-content">
            <span class="obl-info-label">Estado</span>
            <span class="obl-badge ${estadoClass}">${estadoBadge}</span>
          </div>
        </div>
        
        ${proximaCuotaInfo}
      </div>
      
      <!-- Barra de Progreso -->
      <div class="obl-progress-container">
        <div class="obl-progress-bar">
          <div class="obl-progress-fill" style="width: ${progreso}%"></div>
        </div>
        <div class="obl-progress-text">${cuotasPagadas} de ${totalCuotas} cuotas pagadas</div>
      </div>
      
      <!-- Acciones -->
      <div class="obl-card-actions">
        <button class="obl-btn obl-btn-primary" onclick="verDetalleObligacion(${obligacion.id})">
          Ver detalle
        </button>
        <button class="obl-btn obl-btn-secondary" onclick="mostrarBottomSheetObligacion(${obligacion.id}, event)">
          Acciones
        </button>
      </div>
    </div>
  `;
}

function mostrarMenuObligacion(obligacionId, event) {
  if (event) event.stopPropagation();
  
  showModal(
    "Opciones de Obligación",
    `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button class="btn btn-primary" onclick="verDetalleObligacion(${obligacionId}); closeModal();" style="width: 100%;">
          📋 Ver Detalle Completo
        </button>
        <button class="btn btn-primary" onclick="closeModal(); setTimeout(() => registrarPagoDesdeMenu(${obligacionId}), 300);" style="width: 100%;">
          💰 Registrar Pago
        </button>
        <button class="btn btn-primary" onclick="closeModal(); setTimeout(() => iniciarRefinanciacion(${obligacionId}), 300);" style="width: 100%;">
          🔄 Refinanciar
        </button>
        <button class="btn btn-danger" onclick="confirmarEliminarObligacion(${obligacionId}); closeModal();" style="width: 100%;">
          🗑️ Eliminar Obligación
        </button>
      </div>
    `
  );
}

function mostrarBottomSheetObligacion(obligacionId, event) {
  if (event) event.stopPropagation();
  
  // Crear bottom sheet
  const bottomSheet = document.createElement("div");
  bottomSheet.className = "obl-bottom-sheet-overlay";
  bottomSheet.innerHTML = `
    <div class="obl-bottom-sheet">
      <div class="obl-bottom-sheet-handle"></div>
      <div class="obl-bottom-sheet-header">
        <h3>Acciones</h3>
        <button class="obl-bottom-sheet-close" onclick="cerrarBottomSheet()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="obl-bottom-sheet-content">
        <button class="obl-bottom-sheet-btn" onclick="verDetalleObligacion(${obligacionId}); cerrarBottomSheet();">
          <span class="obl-bottom-sheet-btn-icon">📋</span>
          <div class="obl-bottom-sheet-btn-content">
            <span class="obl-bottom-sheet-btn-title">Ver detalle</span>
            <span class="obl-bottom-sheet-btn-subtitle">Ver información completa</span>
          </div>
        </button>
        
        <button class="obl-bottom-sheet-btn" onclick="cerrarBottomSheet(); setTimeout(() => registrarPagoDesdeMenu(${obligacionId}), 300);">
          <span class="obl-bottom-sheet-btn-icon">💰</span>
          <div class="obl-bottom-sheet-btn-content">
            <span class="obl-bottom-sheet-btn-title">Registrar pago</span>
            <span class="obl-bottom-sheet-btn-subtitle">Aplicar pago a cuotas</span>
          </div>
        </button>
        
        <button class="obl-bottom-sheet-btn" onclick="cerrarBottomSheet(); setTimeout(() => iniciarRefinanciacion(${obligacionId}), 300);">
          <span class="obl-bottom-sheet-btn-icon">🔄</span>
          <div class="obl-bottom-sheet-btn-content">
            <span class="obl-bottom-sheet-btn-title">Refinanciar</span>
            <span class="obl-bottom-sheet-btn-subtitle">Reestructurar obligación</span>
          </div>
        </button>
        
        <button class="obl-bottom-sheet-btn" onclick="verHistorialObligacion(${obligacionId});">
          <span class="obl-bottom-sheet-btn-icon">📜</span>
          <div class="obl-bottom-sheet-btn-content">
            <span class="obl-bottom-sheet-btn-title">Ver historial</span>
            <span class="obl-bottom-sheet-btn-subtitle">Pagos y movimientos</span>
          </div>
        </button>
        
        <button class="obl-bottom-sheet-btn" onclick="editarObligacion(${obligacionId});">
          <span class="obl-bottom-sheet-btn-icon">✏️</span>
          <div class="obl-bottom-sheet-btn-content">
            <span class="obl-bottom-sheet-btn-title">Editar</span>
            <span class="obl-bottom-sheet-btn-subtitle">Modificar información</span>
          </div>
        </button>
        
        <div class="obl-bottom-sheet-divider"></div>
        
        <button class="obl-bottom-sheet-btn obl-bottom-sheet-btn-danger" onclick="confirmarEliminarObligacion(${obligacionId}); cerrarBottomSheet();">
          <span class="obl-bottom-sheet-btn-icon">🗑️</span>
          <div class="obl-bottom-sheet-btn-content">
            <span class="obl-bottom-sheet-btn-title">Eliminar</span>
            <span class="obl-bottom-sheet-btn-subtitle">Eliminar obligación</span>
          </div>
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(bottomSheet);
  
  // Animar entrada
  setTimeout(() => {
    bottomSheet.classList.add("active");
  }, 10);
  
  // Cerrar al hacer clic en el overlay
  bottomSheet.addEventListener("click", (e) => {
    if (e.target === bottomSheet) {
      cerrarBottomSheet();
    }
  });
}

function cerrarBottomSheet() {
  const bottomSheet = document.querySelector(".obl-bottom-sheet-overlay");
  if (bottomSheet) {
    bottomSheet.classList.remove("active");
    setTimeout(() => {
      bottomSheet.remove();
    }, 300);
  }
}

function verHistorialObligacion(obligacionId) {
  // Implementación del historial
  cerrarBottomSheet();
  verDetalleObligacion(obligacionId);
}

function editarObligacion(obligacionId) {
  // Implementación de edición
  cerrarBottomSheet();
  showToast("Función de edición en desarrollo", "info");
}

function registrarPagoDesdeMenu(obligacionId) {
  navigateToView("pagos");
  // Aquí podrías pre-seleccionar la obligación si tienes esa funcionalidad
}

function iniciarRefinanciacion(obligacionId) {
  navigateToView("refinanciacion");
  // Aquí podrías pre-seleccionar la obligación
}

// ========== ESTADO DEL WIZARD DE OBLIGACIÓN ==========
let wizardObligacion = {
  tipo: null,
  cliente: null,
  detalles: null
};

let wizardStep = "tipo"; // tipo, cliente, detalles
let isWizardSubmitting = false;
let wizardClientesLoading = false;
let wizardClientesLoadError = null;

function resetWizardObligacion() {
  wizardObligacion = {
    tipo: null,
    cliente: null,
    detalles: null
  };
  wizardStep = "tipo";
  isWizardSubmitting = false;
  wizardClientesLoading = false;
  wizardClientesLoadError = null;
}

/**
 * Abre el wizard de nueva obligación.
 * FIX BUG: Ahora es async y carga clientes antes de mostrar el paso 2.
 * Antes fallaba porque dependía de clientesData que solo se llenaba en loadClientes().
 */
async function mostrarFormularioObligacion() {
  resetWizardObligacion();
  
  showModal(
    "Nueva Obligación",
    `
      <div class="obl-wizard">
        <div class="tabs" id="wizardTabs">
          <button type="button" class="tab active" data-tab="tipo" id="tabBtnTipo">
            <span class="tab-number">1</span>
            <span class="tab-text">Tipo</span>
          </button>
          <button type="button" class="tab" data-tab="cliente" id="tabBtnCliente" disabled>
            <span class="tab-number">2</span>
            <span class="tab-text">Cliente</span>
          </button>
          <button type="button" class="tab" data-tab="detalles" id="tabBtnDetalles" disabled>
            <span class="tab-number">3</span>
            <span class="tab-text">Detalles</span>
          </button>
        </div>
        
        <div class="wizard-content">
          <div class="tab-content active" id="tabTipo">
            <h4>Selecciona el tipo de obligación</h4>
            <div class="tipo-grid">
              <div class="tipo-card" id="tipoCardPrestamo" onclick="selectTipoObligacion('prestamo')">
                <div class="tipo-icon">💰</div>
                <strong>Préstamo</strong>
                <p>Financiación en efectivo</p>
                <div class="tipo-check">✓</div>
              </div>
              <div class="tipo-card" id="tipoCardProducto" onclick="selectTipoObligacion('producto')">
                <div class="tipo-icon">📱</div>
                <strong>Producto</strong>
                <p>Financiación de artículo</p>
                <div class="tipo-check">✓</div>
              </div>
            </div>
          </div>
          
          <div class="tab-content" id="tabCliente" style="display: none;">
            <div id="clienteSeleccionadoInfo" style="display: none;" class="selected-info-card">
              <div class="selected-info-header">
                <strong>Cliente seleccionado:</strong>
                <button type="button" class="btn-clear-selection" onclick="clearClienteSelection()">Cambiar</button>
              </div>
              <div id="clienteSeleccionadoBody"></div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Buscar cliente</label>
              <input type="text" class="form-input" id="searchClienteObligacion" 
                placeholder="Buscar por nombre, documento o teléfono..." 
                oninput="filtrarClientesObligacion()">
            </div>
            <div id="clientesListObligacion" class="clientes-list"></div>
          </div>
          
          <div class="tab-content" id="tabDetalles" style="display: none;">
            <!-- Se llenará dinámicamente según el tipo -->
          </div>
        </div>
      </div>
    `,
    `
      <div class="modal-footer-wizard">
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
        <div class="wizard-nav-buttons">
          <button type="button" class="btn btn-secondary" id="btnWizardBack" onclick="wizardGoBack()" style="display: none;">
            ← Atrás
          </button>
          <button type="button" class="btn btn-primary" id="btnWizardNext" onclick="wizardGoNext()" disabled>
            Siguiente →
          </button>
          <button type="button" class="btn btn-primary" id="btnWizardCreate" onclick="crearNuevaObligacion()" style="display: none;">
            Crear Obligación
          </button>
        </div>
      </div>
    `
  );
  
  // Cargar clientes en background mientras el usuario ve el paso 1
  // Esto mejora UX: cuando llegue al paso 2, los clientes ya estarán cargados
  loadClientesParaWizard();
}

/**
 * Carga clientes para el wizard en background.
 * Se ejecuta al abrir el wizard para que estén listos cuando el usuario llegue al paso 2.
 */
async function loadClientesParaWizard() {
  wizardClientesLoading = true;
  wizardClientesLoadError = null;
  
  try {
    Logger.info("Cargando clientes para wizard...");
    await ensureClientesDataLoaded();
    wizardClientesLoading = false;
    Logger.success(`Clientes listos para wizard: ${clientesData.length}`);
    
    // Si el usuario ya está en el paso Cliente, re-renderizar
    if (wizardStep === "cliente") {
      renderClientesListObligacion();
    }
    
  } catch (error) {
    wizardClientesLoading = false;
    wizardClientesLoadError = error.message || "Error desconocido";
    Logger.error("Error cargando clientes para wizard:", error);
    
    // Si el usuario ya está en el paso Cliente, mostrar error
    if (wizardStep === "cliente") {
      renderClientesListObligacion();
    }
  }
}

function selectTipoObligacion(tipo) {
  wizardObligacion.tipo = tipo;
  
  // Visual feedback
  document.querySelectorAll('.tipo-card').forEach(card => card.classList.remove('selected'));
  const selectedCard = document.getElementById(`tipoCard${tipo === 'prestamo' ? 'Prestamo' : 'Producto'}`);
  if (selectedCard) selectedCard.classList.add('selected');
  
  // Habilitar botón siguiente
  const btnNext = document.getElementById('btnWizardNext');
  if (btnNext) {
    btnNext.disabled = false;
  }
  
  Logger.info(`Tipo de obligación seleccionado: ${tipo}`);
}

function renderClientesListObligacion() {
  const container = document.getElementById('clientesListObligacion');
  if (!container) return;
  
  // Estado: Cargando
  if (wizardClientesLoading) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <p class="empty-state-title">Cargando clientes...</p>
        <p class="empty-state-text">Espera un momento...</p>
      </div>
    `;
    return;
  }
  
  // Estado: Error al cargar
  if (wizardClientesLoadError && clientesData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <p class="empty-state-title">Error al cargar clientes</p>
        <p class="empty-state-text">${wizardClientesLoadError}</p>
        <button type="button" class="btn btn-primary" onclick="reintentarCargarClientes()" style="margin-top: 1rem;">
          🔄 Reintentar
        </button>
      </div>
    `;
    return;
  }
  
  // Estado: Sin clientes en BD
  if (clientesData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <p class="empty-state-title">No hay clientes registrados</p>
        <p class="empty-state-text">Primero debes crear un cliente antes de crear una obligación.</p>
        <button type="button" class="btn btn-primary" onclick="hideModal(); loadView('clientes');" style="margin-top: 1rem;">
          + Crear Cliente
        </button>
      </div>
    `;
    return;
  }
  
  // Filtrar solo clientes activos (manejo robusto de estado)
  const clientesActivos = clientesData.filter(c => {
    const estado = String(c.estado || '').toLowerCase().trim();
    return estado === 'activo';
  });
  
  // Estado: No hay clientes activos (pero sí existen en BD)
  if (clientesActivos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-title">No hay clientes activos</p>
        <p class="empty-state-text">Hay ${clientesData.length} cliente(s) registrado(s), pero ninguno está activo.</p>
        <button type="button" class="btn btn-primary" onclick="hideModal(); loadView('clientes');" style="margin-top: 1rem;">
          Ir a Clientes
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = clientesActivos.map(c => `
    <div class="list-item cliente-item" data-cliente-id="${c.id}" onclick="selectClienteObligacion(${c.id})">
      <div class="list-item-header">
        <span class="list-item-title">${c.nombre}</span>
      </div>
      <div class="list-item-meta">
        <span>${c.tipo_documento}: ${c.documento}</span>
        ${c.telefono ? `<span>📞 ${c.telefono}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function filtrarClientesObligacion() {
  const search = document.getElementById('searchClienteObligacion');
  if (!search) return;
  
  const query = search.value.toLowerCase().trim();
  const container = document.getElementById('clientesListObligacion');
  if (!container) return;
  
  // Filtrar solo clientes activos (manejo robusto de estado)
  const clientesActivos = clientesData.filter(c => {
    const estado = String(c.estado || '').toLowerCase().trim();
    return estado === 'activo';
  });
  
  const filtered = clientesActivos.filter(c => {
    return (
      c.nombre.toLowerCase().includes(query) ||
      c.documento.includes(query) ||
      (c.telefono && c.telefono.includes(query))
    );
  });
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p class="empty-state-title">No se encontraron resultados</p>
        <p class="empty-state-text">Intenta con otro término de búsqueda.</p>
        <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('searchClienteObligacion').value = ''; filtrarClientesObligacion();" style="margin-top: 1rem;">
          Limpiar búsqueda
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(c => `
    <div class="list-item cliente-item" data-cliente-id="${c.id}" onclick="selectClienteObligacion(${c.id})">
      <div class="list-item-header">
        <span class="list-item-title">${c.nombre}</span>
      </div>
      <div class="list-item-meta">
        <span>${c.tipo_documento}: ${c.documento}</span>
        ${c.telefono ? `<span>📞 ${c.telefono}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function selectClienteObligacion(clienteId) {
  const cliente = clientesData.find(c => c.id === clienteId);
  if (!cliente) return;
  
  wizardObligacion.cliente = {
    id: cliente.id,
    nombre: cliente.nombre,
    documento: cliente.documento,
    tipo_documento: cliente.tipo_documento
  };
  
  // Marcar visualmente
  document.querySelectorAll('.cliente-item').forEach(item => item.classList.remove('selected'));
  const selectedItem = document.querySelector(`.cliente-item[data-cliente-id="${clienteId}"]`);
  if (selectedItem) selectedItem.classList.add('selected');
  
  // Mostrar info del cliente seleccionado
  const infoCard = document.getElementById('clienteSeleccionadoInfo');
  const infoBody = document.getElementById('clienteSeleccionadoBody');
  
  if (infoCard && infoBody) {
    infoBody.innerHTML = `
      <div class="selected-cliente-name">${cliente.nombre}</div>
      <div class="selected-cliente-meta">${cliente.tipo_documento}: ${cliente.documento}</div>
    `;
    infoCard.style.display = 'block';
  }
  
  // Habilitar botón siguiente
  const btnNext = document.getElementById('btnWizardNext');
  if (btnNext) {
    btnNext.disabled = false;
  }
  
  Logger.info(`Cliente seleccionado: ${cliente.nombre} (ID: ${clienteId})`);
}

/**
 * Reintenta cargar clientes cuando falla la carga inicial.
 * Llamado desde el bot\u00f3n "Reintentar" en el estado de error.
 */
async function reintentarCargarClientes() {
  Logger.info("Reintentando carga de clientes...");
  await loadClientesParaWizard();
}

function clearClienteSelection() {
  wizardObligacion.cliente = null;
  
  document.querySelectorAll('.cliente-item').forEach(item => item.classList.remove('selected'));
  
  const infoCard = document.getElementById('clienteSeleccionadoInfo');
  if (infoCard) infoCard.style.display = 'none';
  
  const btnNext = document.getElementById('btnWizardNext');
  if (btnNext) btnNext.disabled = true;
  
  const search = document.getElementById('searchClienteObligacion');
  if (search) search.focus();
}

// ========== NAVEGACIÓN DEL WIZARD ==========
function wizardGoNext() {
  if (wizardStep === "tipo" && wizardObligacion.tipo) {
    goToWizardStep("cliente");
  } else if (wizardStep === "cliente" && wizardObligacion.cliente) {
    goToWizardStep("detalles");
  }
}

function wizardGoBack() {
  if (wizardStep === "detalles") {
    goToWizardStep("cliente");
  } else if (wizardStep === "cliente") {
    goToWizardStep("tipo");
  }
}

function goToWizardStep(step) {
  wizardStep = step;
  
  // Definir orden de pasos
  const stepOrder = ['tipo', 'cliente', 'detalles'];
  const currentIndex = stepOrder.indexOf(step);
  
  // Actualizar tabs con estados (activo, completado, deshabilitado)
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    const tabName = tab.getAttribute('data-tab');
    const tabIndex = stepOrder.indexOf(tabName);
    
    if (tabName === step) {
      // Paso activo
      tab.classList.add('active');
      tab.classList.remove('completed');
      tab.disabled = false;
    } else if (tabIndex < currentIndex) {
      // Pasos anteriores = completados
      tab.classList.remove('active');
      tab.classList.add('completed');
      tab.disabled = false;
    } else {
      // Pasos futuros = deshabilitados (sin completed)
      tab.classList.remove('active', 'completed');
      tab.disabled = true;
    }
  });
  
  // Actualizar contenido
  document.querySelectorAll('.tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  const activeContent = document.getElementById(`tab${step.charAt(0).toUpperCase() + step.slice(1)}`);
  if (activeContent) {
    activeContent.style.display = 'block';
  }
  
  // Actualizar botones de navegación
  const btnBack = document.getElementById('btnWizardBack');
  const btnNext = document.getElementById('btnWizardNext');
  const btnCreate = document.getElementById('btnWizardCreate');
  
  if (step === "tipo") {
    if (btnBack) btnBack.style.display = 'none';
    if (btnNext) {
      btnNext.style.display = 'inline-flex';
      btnNext.disabled = !wizardObligacion.tipo;
    }
    if (btnCreate) btnCreate.style.display = 'none';
  } else if (step === "cliente") {
    if (btnBack) btnBack.style.display = 'inline-flex';
    if (btnNext) {
      btnNext.style.display = 'inline-flex';
      btnNext.disabled = !wizardObligacion.cliente;
    }
    if (btnCreate) btnCreate.style.display = 'none';
    
    // Habilitar tab cliente
    const tabCliente = document.getElementById('tabBtnCliente');
    if (tabCliente) tabCliente.disabled = false;
  } else if (step === "detalles") {
    if (btnBack) btnBack.style.display = 'inline-flex';
    if (btnNext) btnNext.style.display = 'none';
    if (btnCreate) {
      btnCreate.style.display = 'inline-flex';
      btnCreate.disabled = true; // Se habilitará cuando el formulario sea válido
    }
    
    // Habilitar tab detalles
    const tabDetalles = document.getElementById('tabBtnDetalles');
    if (tabDetalles) tabDetalles.disabled = false;
    
    // Renderizar formulario de detalles
    renderDetallesForm();
  }
  
  Logger.debug(`Wizard navegó a paso: ${step}`);
}

// ========== FORMULARIO DETALLES (PASO 3) ==========
function renderDetallesForm() {
  const container = document.getElementById('tabDetalles');
  if (!container) return;
  
  const hoy = new Date().toISOString().split('T')[0];
  const fechaPrimerPagoDefault = new Date();
  fechaPrimerPagoDefault.setDate(fechaPrimerPagoDefault.getDate() + 15);
  const fechaPrimerPagoStr = fechaPrimerPagoDefault.toISOString().split('T')[0];
  
  container.innerHTML = `
    <form id="formDetallesObligacion" onsubmit="event.preventDefault();">
      <div class="form-section">
        <h4 class="form-section-title">Información Financiera</h4>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">
              Fecha de inicio <span class="required">*</span>
            </label>
            <input type="date" class="form-input" id="fecha_inicio" 
              value="${hoy}" max="2030-12-31" required onchange="validarDetallesForm()">
          </div>
          
          <div class="form-group">
            <label class="form-label">
              Capital <span class="required">*</span>
            </label>
            <input type="number" class="form-input" id="capital" 
              placeholder="500000" min="1" step="1000" required oninput="calcularValorCuota()">
            <small class="form-hint">Monto a financiar en COP</small>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Gestión administrativa</label>
            <input type="number" class="form-input" id="gestion_admin" 
              placeholder="0" min="0" step="1000" value="0" oninput="calcularValorCuota()">
            <small class="form-hint">Tarifa administrativa (opcional)</small>
          </div>
          
          <div class="form-group">
            <label class="form-label">
              Frecuencia de pago <span class="required">*</span>
            </label>
            <select class="form-input" id="frecuencia_dias" required onchange="calcularFechaPrimerPago()">
              <option value="">Selecciona...</option>
              <option value="15" selected>Quincenal (15 días)</option>
              <option value="30">Mensual (30 días)</option>
            </select>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">
              Número de cuotas <span class="required">*</span>
            </label>
            <input type="number" class="form-input" id="num_cuotas" 
              placeholder="12" min="1" max="60" required oninput="calcularValorCuota()">
            <small class="form-hint">Máximo 60 cuotas</small>
          </div>
          
          <div class="form-group">
            <label class="form-label">
              Fecha primer pago <span class="required">*</span>
            </label>
            <input type="date" class="form-input" id="fecha_primer_pago" 
              value="${fechaPrimerPagoStr}" required onchange="validarDetallesForm()">
          </div>
        </div>
        
        <div class="form-group">
          <div class="cuota-calculada-card" id="cuotaCalculadaCard" style="display: none;">
            <div class="cuota-header">
              <span>Valor de cada cuota</span>
              <label class="switch-label">
                <input type="checkbox" id="editarValorCuota" onchange="toggleEditarCuota()">
                <span>Editar manualmente</span>
              </label>
            </div>
            <div class="cuota-valor" id="cuotaCalculadaValor">$0</div>
            <input type="number" class="form-input" id="valor_cuota_manual" 
              style="display: none; margin-top: 0.5rem;" 
              placeholder="Valor manual" min="1" step="1000" oninput="validarDetallesForm()">
            <div id="cuotaDiferencia" class="cuota-diferencia" style="display: none;"></div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <textarea class="form-input" id="descripcion" rows="3" 
            placeholder="Información adicional sobre esta obligación (opcional)"></textarea>
        </div>
      </div>
      
      ${wizardObligacion.tipo === 'producto' ? `
        <div class="form-section">
          <h4 class="form-section-title">Detalles del Producto</h4>
          <p class="form-section-hint">⚠️ <strong>Requerido:</strong> Completa al menos el <strong>Modelo</strong> o agrega información en <strong>Notas</strong></p>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Marca</label>
              <input type="text" class="form-input" id="producto_marca" 
                placeholder="Ej: Samsung, Apple, Xiaomi">
            </div>
            
            <div class="form-group">
              <label class="form-label">Modelo <span class="text-warning">*</span></label>
              <input type="text" class="form-input" id="producto_modelo" 
                placeholder="Ej: Galaxy S21, iPhone 13" oninput="validarDetallesForm()">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">IMEI</label>
              <input type="text" class="form-input" id="producto_imei" 
                placeholder="15 dígitos" maxlength="17" oninput="validarIMEI()">
              <small class="form-hint" id="imeiHint"></small>
            </div>
            
            <div class="form-group">
              <label class="form-label">Serial</label>
              <input type="text" class="form-input" id="producto_serial" 
                placeholder="Número de serie del producto">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Condición</label>
              <select class="form-input" id="producto_condicion">
                <option value="">Selecciona...</option>
                <option value="nuevo">Nuevo</option>
                <option value="usado">Usado</option>
                <option value="reacondicionado">Reacondicionado</option>
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">Accesorios</label>
              <input type="text" class="form-input" id="producto_accesorios" 
                placeholder="Ej: Cargador, audífonos, caja">
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Notas <span class="text-warning">*</span></label>
            <textarea class="form-input" id="producto_notas" rows="3" 
              placeholder="Información adicional del producto" oninput="validarDetallesForm()"></textarea>
            <small class="form-hint">Como alternativa al modelo, describe el producto aquí</small>
          </div>
        </div>
      ` : ''}
      
      <div class="form-section preview-section" id="previewSection" style="display: none;">
        <h4 class="form-section-title">Vista Previa del Plan de Pagos</h4>
        <div id="previewContent"></div>
      </div>
    </form>
  `;
  
  // Configurar listeners
  setTimeout(() => {
    calcularValorCuota();
  }, 100);
}

let valorCuotaCalculado = 0;

function calcularValorCuota() {
  const capitalInput = document.getElementById('capital');
  const gestionInput = document.getElementById('gestion_admin');
  const numCuotasInput = document.getElementById('num_cuotas');
  const cuotaCard = document.getElementById('cuotaCalculadaCard');
  const cuotaValor = document.getElementById('cuotaCalculadaValor');
  const editarCheckbox = document.getElementById('editarValorCuota');
  
  if (!capitalInput || !gestionInput || !numCuotasInput) return;
  
  const capital = parseFloat(capitalInput.value) || 0;
  const gestion = parseFloat(gestionInput.value) || 0;
  const numCuotas = parseInt(numCuotasInput.value) || 0;
  
  if (capital > 0 && numCuotas > 0) {
    const totalFinanciar = capital + gestion;
    valorCuotaCalculado = Math.round(totalFinanciar / numCuotas);
    
    if (cuotaCard) cuotaCard.style.display = 'block';
    if (cuotaValor) cuotaValor.textContent = formatCurrency(valorCuotaCalculado);
    
    // Si está en modo manual, actualizar diferencia
    if (editarCheckbox && editarCheckbox.checked) {
      calcularDiferenciaCuota();
    }
    
    generarPreview();
  } else {
    if (cuotaCard) cuotaCard.style.display = 'none';
  }
  
  validarDetallesForm();
}

function toggleEditarCuota() {
  const checkbox = document.getElementById('editarValorCuota');
  const manualInput = document.getElementById('valor_cuota_manual');
  const cuotaValor = document.getElementById('cuotaCalculadaValor');
  const cuotaDiferencia = document.getElementById('cuotaDiferencia');
  
  if (!checkbox || !manualInput || !cuotaValor) return;
  
  if (checkbox.checked) {
    manualInput.style.display = 'block';
    manualInput.value = valorCuotaCalculado;
    cuotaValor.style.opacity = '0.5';
    if (cuotaDiferencia) cuotaDiferencia.style.display = 'block';
  } else {
    manualInput.style.display = 'none';
    cuotaValor.style.opacity = '1';
    if (cuotaDiferencia) cuotaDiferencia.style.display = 'none';
  }
  
  validarDetallesForm();
}

function calcularDiferenciaCuota() {
  const manualInput = document.getElementById('valor_cuota_manual');
  const cuotaDiferencia = document.getElementById('cuotaDiferencia');
  const numCuotasInput = document.getElementById('num_cuotas');
  
  if (!manualInput || !cuotaDiferencia || !numCuotasInput) return;
  
  const valorManual = parseFloat(manualInput.value) || 0;
  const numCuotas = parseInt(numCuotasInput.value) || 0;
  
  if (valorManual > 0 && numCuotas > 0) {
    const totalManual = valorManual * numCuotas;
    const totalCalculado = valorCuotaCalculado * numCuotas;
    const diferencia = totalManual - totalCalculado;
    
    if (Math.abs(diferencia) > 0) {
      cuotaDiferencia.innerHTML = `
        <span style="font-size: 0.875rem;">
          Total con cuota manual: ${formatCurrency(totalManual)}
          ${diferencia > 0 ? 
            `<span style="color: var(--admin-success);"> (+${formatCurrency(diferencia)})</span>` : 
            `<span style="color: var(--admin-danger);"> (${formatCurrency(diferencia)})</span>`
          }
        </span>
      `;
    } else {
      cuotaDiferencia.innerHTML = '';
    }
  }
}

function calcularFechaPrimerPago() {
  const fechaInicioInput = document.getElementById('fecha_inicio');
  const frecuenciaInput = document.getElementById('frecuencia_dias');
  const fechaPrimerPagoInput = document.getElementById('fecha_primer_pago');
  
  if (!fechaInicioInput || !frecuenciaInput || !fechaPrimerPagoInput) return;
  
  const fechaInicio = new Date(fechaInicioInput.value);
  const frecuencia = parseInt(frecuenciaInput.value);
  
  if (fechaInicio && frecuencia) {
    const fechaPrimerPago = new Date(fechaInicio);
    fechaPrimerPago.setDate(fechaPrimerPago.getDate() + frecuencia);
    fechaPrimerPagoInput.value = fechaPrimerPago.toISOString().split('T')[0];
  }
  
  validarDetallesForm();
}

function validarIMEI() {
  const imeiInput = document.getElementById('producto_imei');
  const imeiHint = document.getElementById('imeiHint');
  
  if (!imeiInput || !imeiHint) return;
  
  const value = imeiInput.value.replace(/\D/g, '');
  const length = value.length;
  
  if (length === 0) {
    imeiHint.textContent = '';
    imeiHint.className = 'form-hint';
  } else if (length < 14) {
    imeiHint.textContent = `${length}/15 - Debe tener al menos 14 dígitos`;
    imeiHint.className = 'form-hint text-warning';
  } else if (length >= 14 && length <= 17) {
    imeiHint.textContent = '✓ IMEI válido';
    imeiHint.className = 'form-hint text-success';
  } else {
    imeiHint.textContent = 'IMEI demasiado largo';
    imeiHint.className = 'form-hint text-danger';
  }
}

function validarDetallesForm() {
  const capitalInput = document.getElementById('capital');
  const numCuotasInput = document.getElementById('num_cuotas');
  const frecuenciaInput = document.getElementById('frecuencia_dias');
  const fechaInicioInput = document.getElementById('fecha_inicio');
  const fechaPrimerPagoInput = document.getElementById('fecha_primer_pago');
  const editarCheckbox = document.getElementById('editarValorCuota');
  const valorManualInput = document.getElementById('valor_cuota_manual');
  const btnCreate = document.getElementById('btnWizardCreate');
  
  if (!capitalInput || !numCuotasInput || !frecuenciaInput || !fechaInicioInput || !fechaPrimerPagoInput || !btnCreate) {
    return false;
  }
  
  // Validaciones básicas
  const capital = parseFloat(capitalInput.value) || 0;
  const numCuotas = parseInt(numCuotasInput.value) || 0;
  const frecuencia = parseInt(frecuenciaInput.value) || 0;
  const fechaInicio = new Date(fechaInicioInput.value);
  const fechaPrimerPago = new Date(fechaPrimerPagoInput.value);
  
  let isValid = true;
  
  if (capital <= 0) isValid = false;
  if (numCuotas < 1 || numCuotas > 60) isValid = false;
  if (frecuencia !== 15 && frecuencia !== 30) isValid = false;
  if (fechaPrimerPago < fechaInicio) isValid = false;
  
  // Si edición manual está activa, validar valor
  if (editarCheckbox && editarCheckbox.checked && valorManualInput) {
    const valorManual = parseFloat(valorManualInput.value) || 0;
    if (valorManual <= 0) isValid = false;
  }
  
  // Si es producto, validar que al menos tenga modelo o notas
  if (wizardObligacion.tipo === 'producto') {
    const modelo = document.getElementById('producto_modelo');
    const notas = document.getElementById('producto_notas');
    
    if (modelo && notas) {
      const hasModelo = modelo.value.trim().length > 0;
      const hasNotas = notas.value.trim().length > 0;
      
      if (!hasModelo && !hasNotas) {
        isValid = false;
      }
    }
  }
  
  btnCreate.disabled = !isValid;
  
  if (isValid) {
    generarPreview();
  }
  
  return isValid;
}

function generarPreview() {
  const previewSection = document.getElementById('previewSection');
  const previewContent = document.getElementById('previewContent');
  
  if (!previewSection || !previewContent) return;
  
  const capitalInput = document.getElementById('capital');
  const gestionInput = document.getElementById('gestion_admin');
  const numCuotasInput = document.getElementById('num_cuotas');
  const frecuenciaInput = document.getElementById('frecuencia_dias');
  const fechaInicioInput = document.getElementById('fecha_inicio');
  const fechaPrimerPagoInput = document.getElementById('fecha_primer_pago');
  const editarCheckbox = document.getElementById('editarValorCuota');
  const valorManualInput = document.getElementById('valor_cuota_manual');
  
  if (!capitalInput || !numCuotasInput || !frecuenciaInput || !fechaInicioInput || !fechaPrimerPagoInput) return;
  
  const capital = parseFloat(capitalInput.value) || 0;
  const gestion = parseFloat(gestionInput.value) || 0;
  const numCuotas = parseInt(numCuotasInput.value) || 0;
  const frecuencia = parseInt(frecuenciaInput.value) || 0;
  const fechaInicio = new Date(fechaInicioInput.value);
  const fechaPrimerPago = new Date(fechaPrimerPagoInput.value);
  
  if (capital <= 0 || numCuotas <= 0 || frecuencia <= 0) {
    previewSection.style.display = 'none';
    return;
  }
  
  // Determinar valor cuota
  let valorCuota = valorCuotaCalculado;
  if (editarCheckbox && editarCheckbox.checked && valorManualInput) {
    valorCuota = parseFloat(valorManualInput.value) || valorCuotaCalculado;
  }
  
  const totalFinanciar = capital + gestion;
  const totalAPagar = valorCuota * numCuotas;
  
  // Calcular fechas de vencimiento (primeras 3 y últimas 2)
  const fechasVencimiento = [];
  for (let i = 0; i < numCuotas; i++) {
    const fecha = new Date(fechaPrimerPago);
    fecha.setDate(fecha.getDate() + (frecuencia * i));
    fechasVencimiento.push(fecha);
  }
  
  const fechaUltimoPago = fechasVencimiento[fechasVencimiento.length - 1];
  
  previewContent.innerHTML = `
    <div class="preview-grid">
      <div class="preview-item">
        <span class="preview-label">Capital</span>
        <span class="preview-value">${formatCurrency(capital)}</span>
      </div>
      ${gestion > 0 ? `
        <div class="preview-item">
          <span class="preview-label">Gestión administrativa</span>
          <span class="preview-value">${formatCurrency(gestion)}</span>
        </div>
      ` : ''}
      <div class="preview-item highlight">
        <span class="preview-label">Total a financiar</span>
        <span class="preview-value">${formatCurrency(totalFinanciar)}</span>
      </div>
      <div class="preview-item highlight">
        <span class="preview-label">Valor de cada cuota</span>
        <span class="preview-value">${formatCurrency(valorCuota)}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">Número de cuotas</span>
        <span class="preview-value">${numCuotas}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">Frecuencia</span>
        <span class="preview-value">${frecuencia === 15 ? 'Quincenal' : 'Mensual'}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">Total a pagar</span>
        <span class="preview-value">${formatCurrency(totalAPagar)}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">Último pago estimado</span>
        <span class="preview-value">${formatDate(fechaUltimoPago)}</span>
      </div>
    </div>
    
    <div class="preview-fechas">
      <strong>Fechas de vencimiento:</strong>
      <div class="fechas-list">
        ${fechasVencimiento.slice(0, 3).map((f, i) => `
          <span class="fecha-item">Cuota ${i + 1}: ${formatDate(f)}</span>
        `).join('')}
        ${numCuotas > 5 ? '<span class="fecha-item">...</span>' : ''}
        ${numCuotas > 3 ? fechasVencimiento.slice(-2).map((f, i) => `
          <span class="fecha-item">Cuota ${numCuotas - 1 + i}: ${formatDate(f)}</span>
        `).join('') : ''}
      </div>
    </div>
  `;
  
  previewSection.style.display = 'block';
}

// ========== CREAR NUEVA OBLIGACIÓN (FUNCIÓN PRINCIPAL) ==========
async function crearNuevaObligacion() {
  if (isWizardSubmitting) {
    Logger.warn("Ya hay una creación en progreso");
    return;
  }
  
  // Validar wizard completo
  if (!wizardObligacion.tipo || !wizardObligacion.cliente) {
    showToast("Faltan datos del wizard", "error");
    return;
  }
  
  // Obtener datos del formulario
  const capitalInput = document.getElementById('capital');
  const gestionInput = document.getElementById('gestion_admin');
  const numCuotasInput = document.getElementById('num_cuotas');
  const frecuenciaInput = document.getElementById('frecuencia_dias');
  const fechaInicioInput = document.getElementById('fecha_inicio');
  const fechaPrimerPagoInput = document.getElementById('fecha_primer_pago');
  const descripcionInput = document.getElementById('descripcion');
  const editarCheckbox = document.getElementById('editarValorCuota');
  const valorManualInput = document.getElementById('valor_cuota_manual');
  
  if (!capitalInput || !numCuotasInput || !frecuenciaInput || !fechaInicioInput || !fechaPrimerPagoInput) {
    showToast("Formulario incompleto", "error");
    return;
  }
  
  const capital = parseFloat(capitalInput.value);
  const gestion = parseFloat(gestionInput.value) || 0;
  const numCuotas = parseInt(numCuotasInput.value);
  const frecuencia = parseInt(frecuenciaInput.value);
  const fechaInicio = fechaInicioInput.value;
  const fechaPrimerPago = fechaPrimerPagoInput.value;
  const descripcion = descripcionInput.value.trim();
  
  // Determinar valor cuota
  let valorCuota = valorCuotaCalculado;
  if (editarCheckbox && editarCheckbox.checked && valorManualInput) {
    valorCuota = parseFloat(valorManualInput.value) || valorCuotaCalculado;
  }
  
  // Validaciones finales
  if (capital <= 0 || numCuotas < 1 || (frecuencia !== 15 && frecuencia !== 30)) {
    showToast("Datos financieros inválidos", "error");
    return;
  }
  
  if (new Date(fechaPrimerPago) < new Date(fechaInicio)) {
    showToast("La fecha del primer pago no puede ser anterior a la fecha de inicio", "error");
    return;
  }
  
  // Cambiar estado a "guardando"
  isWizardSubmitting = true;
  const btnCreate = document.getElementById('btnWizardCreate');
  const btnBack = document.getElementById('btnWizardBack');
  const originalBtnText = btnCreate ? btnCreate.innerHTML : '';
  
  if (btnCreate) {
    btnCreate.disabled = true;
    btnCreate.innerHTML = '<span class="btn-loading"></span> Guardando...';
  }
  if (btnBack) btnBack.disabled = true;
  
  try {
    Logger.info("Iniciando creación de obligación...");
    
    // 1. Crear obligación
    const obligacionData = {
      cliente_id: wizardObligacion.cliente.id,
      tipo: wizardObligacion.tipo,
      fecha_inicio: fechaInicio,
      capital: capital,
      gestion_admin: gestion,
      frecuencia_dias: frecuencia,
      num_cuotas: numCuotas,
      fecha_primer_pago: fechaPrimerPago,
      estado: 'vigente_al_dia',
      descripcion: descripcion || null,
      obligacion_padre_id: null
    };
    
    const resultObligacion = await crearObligacion(obligacionData);
    
    if (!resultObligacion.success) {
      throw new Error(resultObligacion.error || "Error al crear obligación");
    }
    
    const obligacionId = resultObligacion.data.id;
    Logger.success(`Obligación creada con ID: ${obligacionId}`);
    
    // 2. Crear cuotas
    const cuotas = [];
    for (let i = 0; i < numCuotas; i++) {
      const fechaVencimiento = new Date(fechaPrimerPago);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + (frecuencia * i));
      
      cuotas.push({
        obligacion_id: obligacionId,
        numero: i + 1,
        fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
        valor_cuota: valorCuota,
        estado: 'pendiente',
        saldo_pendiente: valorCuota
      });
    }
    
    const resultCuotas = await crearCuotas(cuotas);
    
    if (!resultCuotas.success) {
      // Intentar compensar: eliminar obligación creada
      Logger.error("Error al crear cuotas, intentando compensar...");
      
      try {
        await supabaseClient.from('obligaciones').delete().eq('id', obligacionId);
        Logger.info("Obligación eliminada por compensación");
      } catch (compError) {
        Logger.error("Error en compensación:", compError);
        // Registrar inconsistencia en auditoría
        await registrarAuditoria({
          admin_user: currentUser.username,
          accion: "error_inconsistencia",
          entidad: "obligacion",
          entidad_id: obligacionId,
          detalle_json: {
            error: "Obligación creada pero cuotas fallaron",
            obligacion: obligacionData,
            mensaje: resultCuotas.error
          }
        });
      }
      
      throw new Error(resultCuotas.error || "Error al crear cuotas");
    }
    
    Logger.success(`${numCuotas} cuotas creadas correctamente`);
    
    // 3. Si es producto, crear detalle
    if (wizardObligacion.tipo === 'producto') {
      const marcaInput = document.getElementById('producto_marca');
      const modeloInput = document.getElementById('producto_modelo');
      const imeiInput = document.getElementById('producto_imei');
      const serialInput = document.getElementById('producto_serial');
      const accesoriosInput = document.getElementById('producto_accesorios');
      const condicionInput = document.getElementById('producto_condicion');
      const notasInput = document.getElementById('producto_notas');
      
      const productoData = {
        obligacion_id: obligacionId,
        marca: marcaInput ? marcaInput.value.trim() || null : null,
        modelo: modeloInput ? modeloInput.value.trim() || null : null,
        imei: imeiInput ? imeiInput.value.trim() || null : null,
        serial: serialInput ? serialInput.value.trim() || null : null,
        accesorios: accesoriosInput ? accesoriosInput.value.trim() || null : null,
        condicion: condicionInput ? condicionInput.value || null : null,
        notas: notasInput ? notasInput.value.trim() || null : null
      };
      
      const resultProducto = await crearProductoDetalle(productoData);
      
      if (!resultProducto.success) {
        Logger.warn("Error al crear detalle de producto:", resultProducto.error);
        // No es crítico, continuar
      } else {
        Logger.success("Detalle de producto creado");
      }
    }
    
    // 4. Registrar en auditoría
    const auditoriaDetalle = {
      tipo: wizardObligacion.tipo,
      cliente: wizardObligacion.cliente,
      capital: capital,
      gestion_admin: gestion,
      frecuencia_dias: frecuencia,
      num_cuotas: numCuotas,
      valor_cuota: valorCuota,
      fecha_inicio: fechaInicio,
      fecha_primer_pago: fechaPrimerPago,
      descripcion: descripcion,
      cuotas_generadas: numCuotas,
      primera_cuota: cuotas[0].fecha_vencimiento,
      ultima_cuota: cuotas[cuotas.length - 1].fecha_vencimiento
    };
    
    if (wizardObligacion.tipo === 'producto') {
      const modeloInput = document.getElementById('producto_modelo');
      auditoriaDetalle.producto = {
        modelo: modeloInput ? modeloInput.value : null
      };
    }
    
    await registrarAuditoria({
      admin_user: currentUser.username,
      accion: "crear",
      entidad: "obligacion",
      entidad_id: obligacionId,
      detalle_json: auditoriaDetalle
    });
    
    Logger.success("Auditoría registrada");
    
    // 5. Actualizar UI
    showToast("Obligación creada correctamente", "success");
    hideModal();
    
    // Recargar obligaciones
    await loadObligaciones();
    
    Logger.success("✅ Proceso completado exitosamente");
    
  } catch (error) {
    Logger.error("Error al crear obligación:", error);
    showToast(`Error: ${error.message}`, "error");
    
    // Restaurar botón
    if (btnCreate) {
      btnCreate.disabled = false;
      btnCreate.innerHTML = originalBtnText;
    }
    if (btnBack) btnBack.disabled = false;
    
    isWizardSubmitting = false;
  }
}

function verDetalleObligacion(obligacionId) {
  showToast("Ver detalle obligación - Función en desarrollo", "info");
}

// ========== PAGOS ==========

// Variables globales para módulo de pagos
let selectedClientePagos = null;
let selectedObligacionPagos = null;
let cuotasCurrentPagos = [];
let historialPagosObligacion = [];

// ========== UTILIDADES LOCALSTORAGE PARA RECIENTES ==========

function getClientesRecientes() {
  try {
    const recientes = localStorage.getItem('pagos_clientes_recientes');
    return recientes ? JSON.parse(recientes) : [];
  } catch (error) {
    console.error('Error al leer recientes:', error);
    return [];
  }
}

function guardarClienteReciente(cliente) {
  try {
    let recientes = getClientesRecientes();
    
    // Eliminar cliente si ya existe (para subirlo al top)
    recientes = recientes.filter(c => c.id !== cliente.id);
    
    // Agregar al inicio
    recientes.unshift({
      id: cliente.id,
      nombre: cliente.nombre,
      documento: cliente.documento,
      telefono: cliente.telefono,
      tipo_documento: cliente.tipo_documento,
      timestamp: new Date().toISOString()
    });
    
    // Mantener solo los últimos 10
    recientes = recientes.slice(0, 10);
    
    localStorage.setItem('pagos_clientes_recientes', JSON.stringify(recientes));
  } catch (error) {
    console.error('Error al guardar reciente:', error);
  }
}

async function obtenerClientesRecientesFallback() {
  try {
    const { data, error } = await supabaseClient
      .from("clientes")
      .select("id, nombre, documento, tipo_documento, telefono")
      .order("created_at", { ascending: false })
      .limit(6);

    return data || [];
  } catch (error) {
    console.error("Error al obtener clientes recientes:", error);
    return [];
  }
}

/**
 * Limpia el localStorage de clientes que ya no existen en la DB
 */
async function limpiarClientesRecientesEliminados() {
  try {
    const clientesLocal = getClientesRecientes();
    if (clientesLocal.length === 0) return;
    
    // Validar cada cliente contra la DB (silenciar errores individuales)
    const clientesValidados = await Promise.all(
      clientesLocal.map(async (c) => {
        try {
          const existe = await obtenerClientePorId(c.id);
          return existe ? c : null;
        } catch (err) {
          // Cliente no accesible, considerarlo eliminado
          return null;
        }
      })
    );
    
    // Filtrar los que existen
    const clientesActuales = clientesValidados.filter(c => c !== null);
    
    // Actualizar localStorage solo con los que existen
    if (clientesActuales.length !== clientesLocal.length) {
      localStorage.setItem('pagos_clientes_recientes', JSON.stringify(clientesActuales));
      const eliminados = clientesLocal.length - clientesActuales.length;
      if (eliminados > 0) {
        console.log(`🧹 Limpiados ${eliminados} clientes eliminados del historial`);
      }
    }
  } catch (error) {
    // Error general, no interrumpir el flujo
    console.warn('No se pudo limpiar historial de clientes:', error.message);
  }
}

/**
 * Remueve un cliente específico del localStorage de recientes
 */
function removerClienteReciente(clienteId) {
  try {
    let recientes = getClientesRecientes();
    recientes = recientes.filter(c => c.id !== clienteId);
    localStorage.setItem('pagos_clientes_recientes', JSON.stringify(recientes));
  } catch (error) {
    console.error('Error al remover cliente reciente:', error);
  }
}

async function obtenerCuotasProximas7Dias() {
  try {
    const hoy = new Date();
    const en7Dias = new Date();
    en7Dias.setDate(hoy.getDate() + 7);

    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        id,
        numero,
        fecha_vencimiento,
        valor_cuota,
        saldo_pendiente,
        estado,
        obligacion_id,
        obligaciones (
          id,
          cliente_id,
          clientes (
            id,
            nombre,
            documento,
            tipo_documento
          )
        )
      `)
      .eq("estado", "pendiente")
      .gte("fecha_vencimiento", hoy.toISOString().split('T')[0])
      .lte("fecha_vencimiento", en7Dias.toISOString().split('T')[0])
      .order("fecha_vencimiento", { ascending: true })
      .limit(10);

    if (error) throw error;

    // Aplanar estructura
    return data.map(cuota => ({
      ...cuota,
      numero_cuota: cuota.numero,
      cliente_id: cuota.obligaciones.cliente_id,
      cliente_nombre: cuota.obligaciones.clientes.nombre,
      cliente_documento: cuota.obligaciones.clientes.documento,
      cliente_tipo_documento: cuota.obligaciones.clientes.tipo_documento
    }));

  } catch (error) {
    console.error("Error al obtener cuotas próximas:", error);
    return [];
  }
}

async function obtenerClientesEnMora() {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseClient
      .from("cuotas")
      .select(`
        obligacion_id,
        valor_cuota,
        saldo_pendiente,
        fecha_vencimiento,
        obligaciones (
          cliente_id,
          clientes (
            id,
            nombre,
            documento,
            tipo_documento,
            telefono
          )
        )
      `)
      .eq("estado", "vencida")
      .lt("fecha_vencimiento", hoy);

    if (error) throw error;

    // Agrupar por cliente
    const clientesMap = new Map();
    
    data.forEach(cuota => {
      const cliente = cuota.obligaciones.clientes;
      const saldoCuota = cuota.saldo_pendiente || cuota.valor_cuota;
      const diasMora = Math.ceil((new Date() - new Date(cuota.fecha_vencimiento)) / (1000 * 60 * 60 * 24));

      if (!clientesMap.has(cliente.id)) {
        clientesMap.set(cliente.id, {
          id: cliente.id,
          nombre: cliente.nombre,
          documento: cliente.documento,
          tipo_documento: cliente.tipo_documento,
          telefono: cliente.telefono,
          cuotas_vencidas: 0,
          monto_mora: 0,
          dias_mora: 0
        });
      }

      const clienteData = clientesMap.get(cliente.id);
      clienteData.cuotas_vencidas++;
      clienteData.monto_mora += saldoCuota;
      clienteData.dias_mora = Math.max(clienteData.dias_mora, diasMora);
    });

    return Array.from(clientesMap.values())
      .sort((a, b) => b.dias_mora - a.dias_mora)
      .slice(0, 10);

  } catch (error) {
    console.error("Error al obtener clientes en mora:", error);
    return [];
  }
}

// Funciones placeholder para botones
function mostrarFormularioPagoCliente(clienteId) {
  mostrarFormularioPago(clienteId);
}

/**
 * Toggle preview de comprobante inline
 */
function toggleComprobantePreview(previewId, url = null, tipo = 'imagen') {
  const preview = document.getElementById(previewId);
  const content = document.getElementById(`preview-content-${previewId.replace('preview-', '')}`);
  
  if (!preview) return;
  
  // Toggle visibility
  const isActive = preview.classList.contains('active');
  
  if (isActive) {
    preview.classList.remove('active');
  } else {
    preview.classList.add('active');
    
    // Cargar contenido solo la primera vez
    if (content && !content.innerHTML && url) {
      const esPDF = tipo === 'pdf' || url.toLowerCase().includes('.pdf');
      
      if (esPDF) {
        content.innerHTML = `<iframe src="${url}" title="Comprobante PDF"></iframe>`;
      } else {
        content.innerHTML = `<img src="${url}" alt="Comprobante de pago" loading="lazy">`;
      }
    }
  }
}

async function verHistorialCliente(clienteId) {
  try {
    // Asegurar que el ID sea un número entero
    const idCliente = parseInt(clienteId, 10);
    if (isNaN(idCliente)) {
      showToast("ID de cliente inválido", "error");
      return;
    }

    // Obtener datos del cliente
    const cliente = await obtenerClientePorId(idCliente);

    if (!cliente) {
      showToast("Cliente no encontrado", "error");
      return;
    }

    // Obtener obligaciones del cliente
    const obligaciones = await obtenerObligacionesBasicasCliente(idCliente);

    if (!obligaciones || obligaciones.length === 0) {
      showModal(
        `📋 Historial de Pagos - ${cliente.nombre}`,
        `
          <div class="alert alert-info">
            <p><strong>${cliente.nombre}</strong> no tiene obligaciones registradas.</p>
          </div>
        `,
        `<button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>`
      );
      return;
    }

    const obligacionIds = obligaciones.map(o => o.id);

    // Obtener todos los pagos del cliente
    const resultPagos = await obtenerPagosCliente(idCliente);
    
    if (!resultPagos.success) {
      showToast("Error al cargar pagos", "error");
      return;
    }
    
    const pagos = resultPagos.pagos;
    
    // Generar URLs firmadas para comprobantes
    for (const pago of pagos) {
      if (pago.soporte_path && !pago.soporte_url) {
        const urlFirmada = await obtenerUrlComprobante(pago.soporte_path);
        if (urlFirmada) {
          pago.soporte_url = urlFirmada;
        }
      }
    }

    // Organizar pagos por obligación
    const pagosPorObligacion = {};
    obligaciones.forEach(obl => {
      pagosPorObligacion[obl.id] = {
        obligacion: obl,
        pagos: pagos.filter(p => p.cuotas.obligacion_id === obl.id)
      };
    });

    // Calcular totales
    const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
    const totalObligaciones = obligaciones.reduce((sum, o) => sum + parseFloat(o.capital), 0);
    const porcentajePagado = totalObligaciones > 0 ? (totalPagado / totalObligaciones * 100) : 0;
    const saldoPendiente = totalObligaciones - totalPagado;

    // Renderizar historial con diseño premium tipo app nativa
    const contenido = `
      <style>
        .historial-modal-premium {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .historial-header {
          background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
          padding: 32px 24px;
          margin: -24px -24px 24px -24px;
          border-radius: 12px 12px 0 0;
          color: white;
        }
        
        .historial-avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 16px;
          border: 3px solid rgba(255,255,255,0.15);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        
        .historial-cliente-nombre {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: white;
          text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .historial-cliente-info {
          font-size: 14px;
          opacity: 0.95;
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        
        .historial-cliente-info span {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .historial-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }
        
        .historial-kpi-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          border: 1px solid #e5e7eb;
          transition: all 0.2s ease;
        }
        
        .historial-kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.12);
          border-color: #d1d5db;
        }
        
        .historial-kpi-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          margin-bottom: 12px;
        }
        
        .historial-kpi-icon.success {
          background: #d1fae5;
          color: #065f46;
        }
        
        .historial-kpi-icon.primary {
          background: #dbeafe;
          color: #1e40af;
        }
        
        .historial-kpi-icon.warning {
          background: #fef3c7;
          color: #92400e;
        }
        
        .historial-kpi-value {
          font-size: 28px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 4px;
        }
        
        .historial-kpi-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }
        
        .historial-progress {
          width: 100%;
          height: 8px;
          background: #e5e7eb;
          border-radius: 999px;
          overflow: hidden;
          margin-top: 8px;
        }
        
        .historial-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981 0%, #059669 100%);
          border-radius: 999px;
          transition: width 1s ease-out;
        }
        
        .historial-obligacion {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 24px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          transition: all 0.3s ease;
        }
        
        .historial-obligacion:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border-color: #d1d5db;
        }
        
        .historial-obl-header {
          background: #f9fafb;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .historial-obl-title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .historial-obl-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        }
        
        .historial-obl-name {
          flex: 1;
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }
        
        .historial-obl-stats {
          display: flex;
          gap: 24px;
          margin-top: 12px;
        }
        
        .historial-obl-stat {
          flex: 1;
        }
        
        .historial-obl-stat-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .historial-obl-stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #1f2937;
        }
        
        .historial-timeline {
          padding: 24px;
        }
        
        .historial-timeline-item {
          display: flex;
          gap: 16px;
          padding-bottom: 24px;
          position: relative;
        }
        
        .historial-timeline-item:not(:last-child)::before {
          content: '';
          position: absolute;
          left: 19px;
          top: 48px;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, #e5e7eb 0%, transparent 100%);
        }
        
        .historial-timeline-marker {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
          position: relative;
          z-index: 1;
        }
        
        .historial-timeline-content {
          flex: 1;
          background: #f9fafb;
          border-radius: 12px;
          padding: 16px;
          border: 1px solid #e5e7eb;
        }
        
        .historial-timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        
        .historial-timeline-date {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }
        
        .historial-timeline-amount {
          font-size: 20px;
          font-weight: 700;
          color: #10b981;
        }
        
        .historial-timeline-details {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 13px;
          color: #6b7280;
        }
        
        .historial-timeline-detail {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .historial-timeline-detail strong {
          color: #1f2937;
        }
        
        .historial-metodo-icon {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          background: white;
          border-radius: 6px;
          font-weight: 500;
          color: #374151;
          border: 1px solid #e5e7eb;
        }
        
        .historial-comprobante-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          text-decoration: none;
          border: none;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
          transition: all 0.2s ease;
          cursor: pointer;
        }
        
        .historial-comprobante-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        }
        
        .historial-comprobante-btn:active {
          transform: translateY(0);
        }
        
        .historial-comprobante-preview {
          margin-top: 12px;
          padding: 12px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          display: none;
        }
        
        .historial-comprobante-preview.active {
          display: block;
          animation: slideDown 0.3s ease-out;
        }
        
        .historial-preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .historial-preview-title {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
        }
        
        .historial-preview-actions {
          display: flex;
          gap: 8px;
        }
        
        .historial-preview-btn {
          padding: 4px 10px;
          font-size: 12px;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          background: white;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        
        .historial-preview-btn:hover {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
        
        .historial-preview-content {
          max-height: 400px;
          overflow: auto;
          border-radius: 6px;
          background: #f9fafb;
        }
        
        .historial-preview-content img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 6px;
        }
        
        .historial-preview-content iframe {
          width: 100%;
          height: 400px;
          border: none;
          border-radius: 6px;
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .historial-empty {
          text-align: center;
          padding: 48px 24px;
          color: #9ca3af;
        }
        
        .historial-empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        
        .historial-badge-premium {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        
        .historial-badge-premium.activa {
          background: #d1fae5;
          color: #065f46;
        }
        
        .historial-badge-premium.pagada {
          background: #dbeafe;
          color: #1e40af;
        }
        
        .historial-badge-premium.cancelada {
          background: #f3f4f6;
          color: #4b5563;
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .historial-obligacion {
          animation: slideUp 0.4s ease-out forwards;
        }
        
        .historial-obligacion:nth-child(1) { animation-delay: 0.1s; }
        .historial-obligacion:nth-child(2) { animation-delay: 0.2s; }
        .historial-obligacion:nth-child(3) { animation-delay: 0.3s; }
      </style>
      
      <div class="historial-modal-premium">
        <!-- Header Premium -->
        <div class="historial-header">
          <div class="historial-avatar">${cliente.nombre.charAt(0).toUpperCase()}</div>
          <h2 class="historial-cliente-nombre">${cliente.nombre}</h2>
          <div class="historial-cliente-info">
            <span>📄 ${cliente.tipo_documento || 'CC'} ${cliente.documento}</span>
            ${cliente.telefono ? `<span>📞 ${cliente.telefono}</span>` : ''}
            <span>📊 ${obligaciones.length} obligación${obligaciones.length !== 1 ? 'es' : ''}</span>
            <span>💰 ${pagos.length} pago${pagos.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        
        <!-- KPI Cards -->
        <div class="historial-kpi-grid">
          <div class="historial-kpi-card">
            <div class="historial-kpi-icon primary">💵</div>
            <div class="historial-kpi-value">${formatCurrency(totalObligaciones)}</div>
            <div class="historial-kpi-label">Total Obligaciones</div>
          </div>
          
          <div class="historial-kpi-card">
            <div class="historial-kpi-icon success">✓</div>
            <div class="historial-kpi-value">${formatCurrency(totalPagado)}</div>
            <div class="historial-kpi-label">Total Pagado</div>
            <div class="historial-progress">
              <div class="historial-progress-fill" style="width: ${porcentajePagado}%"></div>
            </div>
          </div>
          
          <div class="historial-kpi-card">
            <div class="historial-kpi-icon warning">⏳</div>
            <div class="historial-kpi-value">${formatCurrency(saldoPendiente)}</div>
            <div class="historial-kpi-label">Saldo Pendiente</div>
          </div>
        </div>
        
        ${obligaciones.length === 0 ? `
          <div class="historial-empty">
            <div class="historial-empty-icon">📋</div>
            <p><strong>Sin obligaciones registradas</strong></p>
            <p style="font-size: 14px; margin-top: 8px;">Este cliente aún no tiene obligaciones en el sistema.</p>
          </div>
        ` : obligaciones.map((obl, idx) => {
          const pagosObl = pagosPorObligacion[obl.id].pagos;
          const totalPagadoObl = pagosObl.reduce((sum, p) => sum + parseFloat(p.monto), 0);
          const porcentajeObl = obl.capital > 0 ? (totalPagadoObl / obl.capital * 100) : 0;
          const saldoObl = obl.capital - totalPagadoObl;
          
          // Icono de método de pago
          const getMetodoIcon = (metodo) => {
            const m = (metodo || 'efectivo').toLowerCase();
            if (m.includes('efectivo')) return '💵';
            if (m.includes('tarjeta') || m.includes('debito') || m.includes('credito')) return '💳';
            if (m.includes('transferencia') || m.includes('nequi') || m.includes('daviplata')) return '📱';
            if (m.includes('cheque')) return '📝';
            return '💰';
          };
          
          return `
            <div class="historial-obligacion" style="opacity: 0;">
              <div class="historial-obl-header">
                <div class="historial-obl-title">
                  <div class="historial-obl-icon">${obl.tipo === 'prestamo' ? '💰' : '📦'}</div>
                  <div class="historial-obl-name">
                    ${obl.tipo === 'prestamo' ? 'Préstamo' : 'Producto'} #${obl.id}
                  </div>
                  <span class="historial-badge-premium ${obl.estado}">
                    ${obl.estado === 'activa' ? '🟢' : obl.estado === 'pagada' ? '✅' : '⚫'}
                    ${obl.estado}
                  </span>
                </div>
                
                <div class="historial-obl-stats">
                  <div class="historial-obl-stat">
                    <div class="historial-obl-stat-label">Capital</div>
                    <div class="historial-obl-stat-value">${formatCurrency(obl.capital)}</div>
                  </div>
                  <div class="historial-obl-stat">
                    <div class="historial-obl-stat-label">Pagado</div>
                    <div class="historial-obl-stat-value" style="color: #10b981;">${formatCurrency(totalPagadoObl)}</div>
                  </div>
                  <div class="historial-obl-stat">
                    <div class="historial-obl-stat-label">Saldo</div>
                    <div class="historial-obl-stat-value" style="color: ${saldoObl > 0 ? '#f59e0b' : '#10b981'};">${formatCurrency(saldoObl)}</div>
                  </div>
                </div>
                
                <div class="historial-progress" style="margin-top: 16px;">
                  <div class="historial-progress-fill" style="width: ${porcentajeObl}%"></div>
                </div>
              </div>
              
              ${pagosObl.length === 0 ? `
                <div class="historial-empty" style="padding: 32px 24px;">
                  <div class="historial-empty-icon" style="font-size: 32px;">💳</div>
                  <p style="font-size: 14px; color: #6b7280;">Sin pagos registrados</p>
                </div>
              ` : `
                <div class="historial-timeline">
                  ${pagosObl.map((pago, pidx) => `
                    <div class="historial-timeline-item">
                      <div class="historial-timeline-marker">💰</div>
                      <div class="historial-timeline-content">
                        <div class="historial-timeline-header">
                          <div>
                            <div class="historial-timeline-date">📅 ${formatDate(pago.fecha_pago)}</div>
                            <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">Cuota #${pago.cuotas.numero}</div>
                          </div>
                          <div class="historial-timeline-amount">${formatCurrency(pago.monto)}</div>
                        </div>
                        <div class="historial-timeline-details">
                          <div class="historial-timeline-detail">
                            <span class="historial-metodo-icon">
                              ${getMetodoIcon(pago.metodo)} ${pago.metodo || 'Efectivo'}
                            </span>
                          </div>
                          ${(pago.soporte_url || pago.soporte_path) ? `
                            <div class="historial-timeline-detail">
                              <button 
                                class="historial-comprobante-btn" 
                                onclick="toggleComprobantePreview('preview-${pago.id}', '${pago.soporte_url}', '${pago.tipo_soporte || 'imagen'}')"
                                id="btn-preview-${pago.id}">
                                📎 Ver Comprobante
                              </button>
                            </div>
                          ` : `
                            <div class="historial-timeline-detail">
                              <span style="font-size: 12px; color: #9ca3af; font-style: italic;">
                                Sin comprobante
                              </span>
                            </div>
                          `}
                        </div>
                        ${(pago.soporte_url || pago.soporte_path) ? `
                          <div class="historial-comprobante-preview" id="preview-${pago.id}">
                            <div class="historial-preview-header">
                              <span class="historial-preview-title">📎 Comprobante de pago</span>
                              <div class="historial-preview-actions">
                                <button class="historial-preview-btn" onclick="window.open('${pago.soporte_url}', '_blank')">
                                  🔍 Ampliar
                                </button>
                                <button class="historial-preview-btn" onclick="toggleComprobantePreview('preview-${pago.id}')">✕</button>
                              </div>
                            </div>
                            <div class="historial-preview-content" id="preview-content-${pago.id}"></div>
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>
    `;

    showModal(
      `📊 Historial de Pagos`,
      contenido,
      `<button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>`
    );

  } catch (error) {
    console.error("Error en verHistorialCliente:", error);
    showToast("Error al cargar historial", "error");
  }
}

function registrarPagoCuota(cuotaId, clienteId) {
  mostrarFormularioPago(clienteId, cuotaId);
}

function verDetalleCuota(cuotaId) {
  // TODO: Implementar vista de detalle de cuota
  showToast("Función en desarrollo", "info");
}

function registrarPagoMora(clienteId) {
  mostrarFormularioPago(clienteId);
}

function contactarCliente(clienteId, telefono) {
  if (telefono && telefono !== '') {
    window.open(`https://wa.me/${telefono.replace(/\D/g, '')}`, '_blank');
  } else {
    showToast("Este cliente no tiene teléfono registrado", "warning");
  }
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function loadPagos() {
  const container = document.getElementById("viewPagos");
  
  container.innerHTML = `
    <!-- Header Premium -->
    <div class="payments-header">
      <div class="payments-header-content">
        <div class="payments-header-text">
          <h2 class="payments-title">Pagos</h2>
          <p class="payments-subtitle">Registro, historial y gestión de pagos</p>
        </div>
        <button class="btn-registrar-pago" onclick="mostrarFormularioPago()">
          <span class="btn-nueva-icon">+</span>
          <span class="btn-registrar-pago-text">Registrar Pago</span>
        </button>
      </div>
    </div>

    <!-- Búsqueda Premium -->
    <div class="payments-search-card">
      <div class="payments-search-wrapper">
        <span class="payments-search-icon">🔍</span>
        <input 
          type="text" 
          id="searchClientePagos" 
          class="payments-search-input" 
          placeholder="Buscar por nombre, documento, teléfono u obligación..."
          autocomplete="off"
        >
        <button class="payments-search-clear" id="btnClearSearch" aria-label="Limpiar búsqueda">
          ×
        </button>
      </div>
      <div class="payments-search-results" id="searchResultsPagos"></div>
    </div>

    <!-- KPI Dashboard -->
    <div class="payments-kpi-grid" id="paymentsKpiGrid">
      <div class="payments-kpi-card">
        <div class="payments-kpi-header">
          <div class="payments-kpi-icon success">✅</div>
        </div>
        <div class="payments-kpi-value" id="kpiPagosHoy">0</div>
        <div class="payments-kpi-label">Pagos registrados hoy</div>
      </div>
      
      <div class="payments-kpi-card">
        <div class="payments-kpi-header">
          <div class="payments-kpi-icon warning">⏳</div>
        </div>
        <div class="payments-kpi-value" id="kpiPendiente">$0</div>
        <div class="payments-kpi-label">Pendiente por cobrar (7 días)</div>
      </div>
      
      <div class="payments-kpi-card">
        <div class="payments-kpi-header">
          <div class="payments-kpi-icon danger">⚠️</div>
        </div>
        <div class="payments-kpi-value" id="kpiEnMora">0</div>
        <div class="payments-kpi-label">Clientes en mora</div>
      </div>
    </div>

    <!-- Paneles de Acceso Rápido -->
    <div id="panelesAccesoRapido">
      <!-- Clientes Recientes -->
      <div class="payments-section">
        <h3 class="payments-section-title">
          <span class="payments-section-title-icon">🕐</span>
          Clientes Recientes
        </h3>
        <div id="listaClientesRecientes"></div>
      </div>

      <!-- Cuotas Próximas -->
      <div class="payments-section">
        <h3 class="payments-section-title">
          <span class="payments-section-title-icon">📅</span>
          Cuotas Próximas
        </h3>
        <div id="listaCuotasProximas"></div>
      </div>

      <!-- Clientes en Mora -->
      <div class="payments-section">
        <h3 class="payments-section-title">
          <span class="payments-section-title-icon">⚠️</span>
          Clientes en Mora
        </h3>
        <div id="listaClientesMora"></div>
      </div>
    </div>

    <!-- Resumen del cliente seleccionado -->
    <div id="clienteResumenPagos" style="display: none;"></div>

    <!-- Panel de obligaciones y cuotas -->
    <div id="obligacionesPanelPagos" style="display: none;"></div>

    <!-- Historial de pagos -->
    <div id="historialPagosPanel" style="display: none;"></div>
  `;

  // Listeners
  setupPagosListeners();
  
  // Limpiar localStorage de clientes eliminados (en segundo plano)
  limpiarClientesRecientesEliminados().catch(err => 
    console.error('Error al limpiar recientes:', err)
  );
  
  // Cargar KPIs y paneles
  await Promise.all([
    cargarKPIPagos(),
    cargarPanelesAccesoRapido()
  ]);
}

function setupPagosListeners() {
  const searchInput = document.getElementById("searchClientePagos");
  const btnClearSearch = document.getElementById("btnClearSearch");

  // Búsqueda con debounce
  let searchTimeout;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const term = e.target.value.trim();
    
    // Mostrar/ocultar botón de limpiar
    btnClearSearch.style.display = term ? "flex" : "none";
    
    if (term.length < 2) {
      document.getElementById("searchResultsPagos").innerHTML = "";
      document.getElementById("searchResultsPagos").classList.remove("active");
      return;
    }

    searchTimeout = setTimeout(() => buscarClientesPagos(term), 400);
  });

  // Limpiar búsqueda
  btnClearSearch.addEventListener("click", () => {
    searchInput.value = "";
    btnClearSearch.style.display = "none";
    document.getElementById("searchResultsPagos").innerHTML = "";
    document.getElementById("searchResultsPagos").classList.remove("active");
    searchInput.focus();
  });

  // Al hacer focus, mostrar resultados si hay texto
  searchInput.addEventListener("focus", (e) => {
    if (e.target.value.trim().length >= 2) {
      document.getElementById("searchResultsPagos").classList.add("active");
    }
  });

  // Al perder focus, ocultar resultados después de un delay
  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      document.getElementById("searchResultsPagos").classList.remove("active");
    }, 200);
  });
}

// ========== CÁLCULO DE KPIs ==========

async function cargarKPIPagos() {
  try {
    const { data: pagosHoy, error: errorPagosHoy } = await supabaseClient
      .from("pagos")
      .select("id")
      .gte("fecha_pago", new Date().toISOString().split('T')[0]);

    const hoy = new Date().toISOString().split('T')[0];
    const en7Dias = new Date();
    en7Dias.setDate(en7Dias.getDate() + 7);
    
    const { data: cuotasProximas, error: errorCuotas } = await supabaseClient
      .from("cuotas")
      .select("valor_cuota, saldo_pendiente")
      .eq("estado", "pendiente")
      .gte("fecha_vencimiento", hoy)
      .lte("fecha_vencimiento", en7Dias.toISOString().split('T')[0]);

    // Obtener clientes en mora (cuotas vencidas agrupadas por cliente)
    const { data: cuotasMora, error: errorMora } = await supabaseClient
      .from("cuotas")
      .select(`
        obligacion_id,
        obligaciones (
          cliente_id,
          clientes (
            id
          )
        )
      `)
      .eq("estado", "vencida")
      .lt("fecha_vencimiento", hoy);

    // Actualizar KPIs
    document.getElementById("kpiPagosHoy").textContent = pagosHoy?.length || 0;
    
    const totalPendiente = cuotasProximas?.reduce((sum, c) => 
      sum + (c.saldo_pendiente || c.valor_cuota), 0
    ) || 0;
    document.getElementById("kpiPendiente").textContent = formatCurrency(totalPendiente);
    
    // Contar clientes únicos en mora
    const clientesMoraUnicos = new Set();
    cuotasMora?.forEach(c => {
      if (c.obligaciones?.clientes?.id) {
        clientesMoraUnicos.add(c.obligaciones.clientes.id);
      }
    });
    document.getElementById("kpiEnMora").textContent = clientesMoraUnicos.size;
    
  } catch (error) {
    console.error("Error al cargar KPIs:", error);
  }
}

// ========== PANELES DE ACCESO RÁPIDO ==========

async function cargarPanelesAccesoRapido() {
  await Promise.all([
    cargarClientesRecientes(),
    cargarCuotasProximas(),
    cargarClientesMora()
  ]);
}

async function cargarClientesRecientes() {
  const container = document.getElementById("listaClientesRecientes");
  
  try {
    // Obtener clientes recientes del localStorage
    const clientesLocal = getClientesRecientes();
    
    // Siempre validar contra la DB y obtener datos frescos
    let clientes = [];
    
    if (clientesLocal.length > 0) {
      // Validar cada cliente del localStorage contra la DB (con manejo de errores)
      const clientesValidados = await Promise.all(
        clientesLocal.slice(0, 6).map(async (c) => {
          try {
            const clienteDB = await obtenerClientePorId(c.id);
            return clienteDB; // null si no existe
          } catch (err) {
            // Cliente no accesible, ignorar
            return null;
          }
        })
      );
      
      // Filtrar los que realmente existen
      clientes = clientesValidados.filter(c => c !== null);
    }
    
    // Si hay menos de 3 clientes validados, completar con los más recientes de la DB
    if (clientes.length < 3) {
      const fallback = await obtenerClientesRecientesFallback();
      
      // Combinar sin duplicados
      const idsExistentes = new Set(clientes.map(c => c.id));
      const clientesNuevos = fallback.filter(c => !idsExistentes.has(c.id));
      
      clientes = [...clientes, ...clientesNuevos];
    }
    
    // Limitar a 3 para mostrar
    clientes = clientes.slice(0, 3);
    
    if (clientes.length === 0) {
      container.innerHTML = `
        <div class="payments-empty">
          <div class="payments-empty-icon">👥</div>
          <p class="payments-empty-text">No hay clientes recientes</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="payments-grid">
        ${clientes.map((c, i) => `
          <div class="payments-client-card" data-cliente-id="${c.id}" style="animation-delay: ${i * 0.05}s;">
            <div class="payments-client-card-header">
              <div class="payments-client-info">
                <div class="payments-client-name">${c.nombre}</div>
                <div class="payments-client-meta">
                  <span>${c.tipo_documento || 'CC'} ${c.documento}</span>
                  ${c.telefono ? `<span>📞 ${c.telefono}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="payments-client-actions">
              <button type="button" class="payments-client-btn payments-client-btn-primary" onclick="mostrarFormularioPagoCliente(${c.id})">
                💰 Registrar pago
              </button>
              <button type="button" class="payments-client-btn payments-client-btn-secondary" onclick="verHistorialCliente(${c.id})">
                📋 Ver historial
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    
  } catch (error) {
    console.error("Error al cargar recientes:", error);
    container.innerHTML = `
      <div class="payments-error">
        <span class="payments-error-icon">⚠️</span>
        <span>Error al cargar clientes</span>
      </div>
    `;
  }
}

async function cargarCuotasProximas() {
  const container = document.getElementById("listaCuotasProximas");
  
  try {
    const cuotas = await obtenerCuotasProximas7Dias();
    
    if (cuotas.length === 0) {
      container.innerHTML = `
        <div class="payments-empty">
          <div class="payments-empty-icon">📅</div>
          <p class="payments-empty-text">No hay cuotas próximas a vencer</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="payments-grid">
        ${cuotas.map((cuota, i) => {
          const diasRestantes = Math.ceil((new Date(cuota.fecha_vencimiento) - new Date()) / (1000 * 60 * 60 * 24));
          const esUrgente = diasRestantes <= 2;
          const saldoPendiente = cuota.saldo_pendiente || cuota.valor_cuota;
          
          return `
            <div class="payments-installment-card ${esUrgente ? 'urgent' : ''}" style="animation-delay: ${i * 0.05}s;">
              <div class="payments-installment-header">
                <div class="payments-installment-number">Cuota ${cuota.numero_cuota || cuota.numero}</div>
                <div class="payments-installment-badge ${esUrgente ? 'danger' : 'warning'}">
                  ${diasRestantes === 0 ? 'Hoy' : diasRestantes === 1 ? 'Mañana' : `${diasRestantes} días`}
                </div>
              </div>
              
              <div class="payments-installment-client">
                <div class="payments-installment-avatar">${cuota.cliente_nombre.charAt(0).toUpperCase()}</div>
                <div class="payments-installment-info">
                  <div class="payments-installment-name">${cuota.cliente_nombre}</div>
                  <div class="payments-installment-doc">${cuota.cliente_documento}</div>
                </div>
              </div>
              
              <div class="payments-installment-details">
                <div class="payments-installment-row">
                  <span class="payments-installment-label">Obligación:</span>
                  <span class="payments-installment-value">#${cuota.obligacion_id}</span>
                </div>
                <div class="payments-installment-row">
                  <span class="payments-installment-label">Vencimiento:</span>
                  <span class="payments-installment-value">${formatDate(cuota.fecha_vencimiento)}</span>
                </div>
                <div class="payments-installment-row">
                  <span class="payments-installment-label">Saldo pendiente:</span>
                  <span class="payments-installment-amount">${formatCurrency(saldoPendiente)}</span>
                </div>
              </div>
              
              <div class="payments-installment-actions">
                <button type="button" class="payments-client-btn payments-client-btn-primary" onclick="registrarPagoCuota(${cuota.id}, ${cuota.cliente_id})">
                  💰 Registrar pago
                </button>
                <button type="button" class="payments-client-btn payments-client-btn-secondary" onclick="verDetalleCuota(${cuota.id})">
                  🔍 Ver detalle
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    
  } catch (error) {
    console.error("Error al cargar próximas:", error);
    container.innerHTML = `
      <div class="payments-error">
        <span class="payments-error-icon">⚠️</span>
        <span>Error al cargar cuotas</span>
      </div>
    `;
  }
}

async function cargarClientesMora() {
  const container = document.getElementById("listaClientesMora");
  
  try {
    const clientes = await obtenerClientesEnMora();
    
    if (clientes.length === 0) {
      container.innerHTML = `
        <div class="payments-empty success">
          <div class="payments-empty-icon">✅</div>
          <p class="payments-empty-text">No hay clientes en mora</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="payments-grid">
        ${clientes.map((c, i) => `
          <div class="payments-alert-card" style="animation-delay: ${i * 0.05}s;">
            <div class="payments-alert-header">
              <div class="payments-alert-icon">⚠️</div>
              <div class="payments-alert-badge">${c.dias_mora} día${c.dias_mora !== 1 ? 's' : ''} en mora</div>
            </div>
            
            <div class="payments-alert-client">
              <div class="payments-alert-avatar">${c.nombre.charAt(0).toUpperCase()}</div>
              <div class="payments-alert-info">
                <div class="payments-alert-name">${c.nombre}</div>
                <div class="payments-alert-doc">${c.tipo_documento || 'CC'} ${c.documento}</div>
              </div>
            </div>
            
            <div class="payments-alert-details">
              <div class="payments-alert-row">
                <span class="payments-alert-label">Cuotas vencidas:</span>
                <span class="payments-alert-value danger">${c.cuotas_vencidas}</span>
              </div>
              <div class="payments-alert-row">
                <span class="payments-alert-label">Saldo vencido:</span>
                <span class="payments-alert-amount">${formatCurrency(c.monto_mora)}</span>
              </div>
              ${c.telefono ? `
                <div class="payments-alert-row">
                  <span class="payments-alert-label">Teléfono:</span>
                  <span class="payments-alert-value">📞 ${c.telefono}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="payments-alert-actions">
              <button type="button" class="payments-client-btn payments-client-btn-primary" onclick="registrarPagoMora(${c.id})">
                💰 Registrar pago
              </button>
              <button type="button" class="payments-client-btn payments-client-btn-secondary" onclick="contactarCliente(${c.id}, '${c.telefono || ''}')">
                📩 Contactar
              </button>
            </div>
          </div>
        `).join("")}}
      </div>
    `;
    
  } catch (error) {
    console.error("Error al cargar mora:", error);
    container.innerHTML = `
      <div class="payments-error">
        <span class="payments-error-icon">⚠️</span>
        <span>Error al cargar clientes en mora</span>
      </div>
    `;
  }
}

async function seleccionarClienteDesdePanelRapido(clienteId) {
  try {
    // Obtener datos completos del cliente
    const { data: cliente, error } = await supabaseClient
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single();
    
    if (error || !cliente) {
      showToast("Error al cargar cliente", "error");
      return;
    }
    
    // Ocultar paneles de acceso rápido
    document.getElementById("panelesAccesoRapido").style.display = "none";
    
    // Guardar en recientes
    guardarClienteReciente(cliente);
    
    // Llamar a la función existente para cargar todo
    await seleccionarClientePagos(clienteId);
    
  } catch (error) {
    Logger.error("Error al seleccionar desde panel:", error);
    showToast("Error al cargar cliente", "error");
  }
}

async function buscarClientesPagos(termino) {
  const resultsContainer = document.getElementById("searchResultsPagos");
  
  resultsContainer.innerHTML = `
    <div class="payments-search-item skeleton">
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text"></div>
    </div>
  `;
  resultsContainer.classList.add("active");

  try {
    // Búsqueda mejorada multi-campo
    const { data: clientes, error } = await supabaseClient
      .from("clientes")
      .select("*")
      .or(`nombre.ilike.%${termino}%,documento.ilike.%${termino}%,telefono.ilike.%${termino}%`)
      .order("nombre")
      .limit(8);

    if (error) throw error;

    if (clientes.length === 0) {
      resultsContainer.innerHTML = `
        <div class="payments-search-empty">
          <span class="payments-search-empty-icon">🔍</span>
          <p class="payments-search-empty-text">No se encontraron resultados para "<strong>${termino}</strong>"</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = `
      ${clientes.map((c, i) => `
        <div class="payments-search-item" data-cliente-id="${c.id}" style="animation-delay: ${i * 0.03}s;">
          <div class="payments-search-avatar">${c.nombre.charAt(0).toUpperCase()}</div>
          <div class="payments-search-info">
            <div class="payments-search-name">${highlightMatch(c.nombre, termino)}</div>
            <div class="payments-search-meta">
              <span>${c.tipo_documento || 'CC'} ${highlightMatch(c.documento, termino)}</span>
              ${c.telefono ? `<span>📞 ${highlightMatch(c.telefono, termino)}</span>` : ''}
            </div>
          </div>
          <div class="payments-search-badge ${c.estado === 'activo' ? 'success' : 'neutral'}">
            ${c.estado}
          </div>
        </div>
      `).join("")}
    `;

    // Agregar listeners a los items
    document.querySelectorAll('.payments-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const clienteId = parseInt(item.dataset.clienteId);
        seleccionarClientePagos(clienteId);
        // Limpiar búsqueda
        document.getElementById("searchClientePagos").value = "";
        document.getElementById("btnClearSearch").style.display = "none";
        resultsContainer.innerHTML = "";
        resultsContainer.classList.remove("active");
      });
    });

  } catch (error) {
    console.error("Error al buscar clientes:", error);
    resultsContainer.innerHTML = `
      <div class="payments-search-error">
        <span class="payments-search-error-icon">⚠️</span>
        <span>Error al buscar. Intente nuevamente.</span>
      </div>
    `;
  }
}

function highlightMatch(text, termino) {
  if (!text || !termino) return text;
  const regex = new RegExp(`(${termino})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

async function seleccionarClientePagos(clienteId) {
  try {
    // Asegurar que el ID sea un número entero
    const idCliente = parseInt(clienteId, 10);
    if (isNaN(idCliente)) {
      showToast("ID de cliente inválido", "error");
      return;
    }

    // Obtener cliente
    const cliente = await obtenerClientePorId(idCliente);

    if (!cliente) {
      showToast("Cliente no encontrado", "error");
      return;
    }

    selectedClientePagos = cliente;
    
    // Ocultar paneles de acceso rápido
    const panelesAcceso = document.getElementById("panelesAccesoRapido");
    if (panelesAcceso) {
      panelesAcceso.style.display = "none";
    }
    
    // Guardar en recientes
    guardarClienteReciente(cliente);

    // Obtener resumen financiero
    const resumen = await obtenerResumenFinancieroCliente(idCliente);

    // Mostrar resumen
    const resumenContainer = document.getElementById("clienteResumenPagos");
    resumenContainer.style.display = "block";
    resumenContainer.innerHTML = `
      <div class="card mb-6">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 class="card-title">${cliente.nombre}</h3>
            <p class="text-secondary text-sm" style="margin-top: var(--admin-space-1);">
              ${cliente.tipo_documento}: ${cliente.documento} | 📞 ${cliente.telefono || 'N/A'}
            </p>
          </div>
          <button class="btn-icon btn-ghost" id="btnLimpiarSeleccionPagos" title="Limpiar selección">
            ✕
          </button>
        </div>
        <div class="card-body">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--admin-space-5);">
            <div>
              <div class="info-label">Total Prestado</div>
              <div class="info-value text-primary">${formatCurrency(resumen?.total_prestado || 0)}</div>
            </div>
            <div>
              <div class="info-label">Total Pagado</div>
              <div class="info-value text-success">${formatCurrency(resumen?.total_pagado || 0)}</div>
            </div>
            <div>
              <div class="info-label">Saldo Pendiente</div>
              <div class="info-value ${resumen?.en_mora ? 'text-danger' : 'text-warning'}">
                ${formatCurrency(resumen?.total_pendiente || 0)}
              </div>
            </div>
            <div>
              <div class="info-label">Estado</div>
              <div>
                ${resumen?.en_mora 
                  ? '<span class="badge badge-danger">⚠️ En Mora</span>' 
                  : '<span class="badge badge-success">✓ Al Día</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Event listener para limpiar selección
    document.getElementById('btnLimpiarSeleccionPagos').addEventListener('click', limpiarSeleccionPagos);

    // Cargar obligaciones
    await cargarObligacionesClientePagos(idCliente);

    // Mostrar botones de acción (solo si existen en la vista antigua)
    const btnExportar = document.getElementById("btnExportarPagos");
    const btnNuevo = document.getElementById("btnNuevoPago");
    if (btnExportar) btnExportar.style.display = "inline-flex";
    if (btnNuevo) btnNuevo.style.display = "inline-flex";

  } catch (error) {
    Logger.error("Error al seleccionar cliente:", error);
    showToast("Error al cargar datos del cliente", "error");
  }
}

async function cargarObligacionesClientePagos(clienteId) {
  const container = document.getElementById("obligacionesPanelPagos");
  container.style.display = "block";

  container.innerHTML = `
    <div class="skeleton skeleton-card"></div>
  `;

  try {
    const obligaciones = await obtenerObligacionesCliente(clienteId);

    if (obligaciones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💼</div>
          <p class="empty-state-title">Sin obligaciones</p>
          <p class="empty-state-text">Este cliente no tiene obligaciones registradas.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr; gap: var(--admin-space-6);">
        <!-- Lista de obligaciones -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Obligaciones del Cliente</h3>
          </div>
          <div class="card-body">
            <div style="display: grid; gap: var(--admin-space-3);">
              ${obligaciones.map(obl => {
                const cuotasPagadas = obl.cuotas?.filter(c => c.estado === 'pagada').length || 0;
                const totalCuotas = obl.cuotas?.length || 0;
                const progreso = totalCuotas > 0 ? (cuotasPagadas / totalCuotas) * 100 : 0;

                return `
                  <div class="list-item obligacion-item" data-obligacion-id="${obl.id}" style="cursor: pointer;">
                    <div class="list-item-header">
                      <span class="list-item-title">
                        ${obl.tipo === 'prestamo' ? '💰 Préstamo' : '📱 Producto'} #${obl.id}
                      </span>
                      <span class="badge ${
                        obl.estado === 'vigente_al_dia' ? 'badge-success' 
                        : obl.estado === 'vigente_en_mora' ? 'badge-danger'
                        : obl.estado === 'cancelada' ? 'badge-neutral'
                        : 'badge-warning'
                      }">
                        ${obl.estado.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div class="list-item-meta">
                      <span>Capital: ${formatCurrency(obl.capital)}</span>
                      <span>Cuotas: ${cuotasPagadas}/${totalCuotas}</span>
                      <span>Inicio: ${formatDate(obl.fecha_inicio)}</span>
                    </div>
                    <div style="margin-top: var(--admin-space-3);">
                      <div style="height: 6px; background: var(--admin-surface-2); border-radius: var(--admin-radius-full); overflow: hidden;">
                        <div style="width: ${progreso}%; height: 100%; background: var(--admin-success); transition: width 0.3s;"></div>
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>

        <!-- Detalle de obligación seleccionada -->
        <div id="detalleObligacionPagos"></div>
      </div>
    `;

    // Agregar listeners a las obligaciones
    document.querySelectorAll('.obligacion-item').forEach(item => {
      item.addEventListener('click', () => {
        const obligacionId = parseInt(item.dataset.obligacionId);
        seleccionarObligacionPagos(obligacionId);
      });
    });

  } catch (error) {
    Logger.error("Error al cargar obligaciones:", error);
    container.innerHTML = `
      <div class="alert alert-danger">
        Error al cargar obligaciones. Por favor intente nuevamente.
      </div>
    `;
  }
}

async function seleccionarObligacionPagos(obligacionId) {
  try {
    // Obtener obligación completa
    const obligacion = await obtenerObligacionPorId(obligacionId);
    if (!obligacion) return;

    selectedObligacionPagos = obligacion;
    // CRÍTICO: Ordenar cuotas por número SIEMPRE (orden cronológico fijo)
    // Esto garantiza que pagar una cuota NO cambie su posición visual
    cuotasCurrentPagos = (obligacion.cuotas || []).sort((a, b) => a.numero - b.numero);

    // Obtener historial de pagos
    const pagos = await obtenerPagosObligacionConFiltros(obligacionId);
    historialPagosObligacion = pagos;

    // Renderizar detalle
    const container = document.getElementById("detalleObligacionPagos");
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            Cuotas de ${obligacion.tipo === 'prestamo' ? 'Préstamo' : 'Producto'} #${obligacion.id}
          </h3>
        </div>
        <div class="card-body">
          <!-- Tabla desktop -->
          <div class="table-container" style="display: none;" id="tablaCuotasDesktop">
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th>Vencimiento</th>
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${cuotasCurrentPagos.map(cuota => {
                    const venc = new Date(cuota.fecha_vencimiento);
                    venc.setHours(0, 0, 0, 0);
                    const vencida = venc < hoy && cuota.estado !== 'pagada';
                    const saldo = cuota.saldo_pendiente ?? cuota.valor_cuota;

                    return `
                      <tr>
                        <td><strong>#${cuota.numero}</strong></td>
                        <td>${formatDate(cuota.fecha_vencimiento)}</td>
                        <td>${formatCurrency(cuota.valor_cuota)}</td>
                        <td>${formatCurrency(saldo)}</td>
                        <td>
                          <span class="badge ${
                            cuota.estado === 'pagada' ? 'badge-success'
                            : cuota.estado === 'parcial' ? 'badge-warning'
                            : vencida ? 'badge-danger'
                            : 'badge-neutral'
                          }">
                            ${vencida && cuota.estado !== 'pagada' ? '⚠️ Vencida' : cuota.estado}
                          </span>
                        </td>
                        <td class="table-actions">
                          ${cuota.estado !== 'pagada' ? `
                            <button class="btn btn-sm btn-primary btn-pagar-cuota" data-cuota-id="${cuota.id}">
                              💰 Pagar
                            </button>
                          ` : ''}
                          <button class="btn btn-sm btn-ghost btn-ver-pagos-cuota" data-cuota-id="${cuota.id}">
                            📋 Ver
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Cards móviles -->
          <div id="tablaCuotasMobile" style="display: grid; gap: var(--admin-space-4);"></div>
        </div>
      </div>
    `;

    // Renderizar cards móviles
    renderCuotasMobile();

    // Mostrar/ocultar según ancho
    actualizarVisualizacionCuotas();
    window.addEventListener('resize', actualizarVisualizacionCuotas);

    // Agregar event listeners a botones de cuotas
    document.querySelectorAll('.btn-pagar-cuota').forEach(btn => {
      btn.addEventListener('click', () => {
        const cuotaId = parseInt(btn.dataset.cuotaId);
        abrirModalRegistrarPago(cuotaId);
      });
    });

    document.querySelectorAll('.btn-ver-pagos-cuota').forEach(btn => {
      btn.addEventListener('click', () => {
        const cuotaId = parseInt(btn.dataset.cuotaId);
        verPagosCuota(cuotaId);
      });
    });

    // Mostrar historial
    renderHistorialPagosObligacion();

  } catch (error) {
    Logger.error("Error al seleccionar obligación:", error);
    showToast("Error al cargar detalles de la obligación", "error");
  }
}

function renderCuotasMobile() {
  const container = document.getElementById("tablaCuotasMobile");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  container.innerHTML = cuotasCurrentPagos.map(cuota => {
    const venc = new Date(cuota.fecha_vencimiento);
    venc.setHours(0, 0, 0, 0);
    const vencida = venc < hoy && cuota.estado !== 'pagada';
    const saldo = cuota.saldo_pendiente ?? cuota.valor_cuota;

    return `
      <div class="card" style="border-left: 4px solid ${
        cuota.estado === 'pagada' ? 'var(--admin-success)'
        : cuota.estado === 'parcial' ? 'var(--admin-warning)'
        : vencida ? 'var(--admin-danger)'
        : 'var(--admin-border)'
      };">
        <div class="card-body">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--admin-space-3);">
            <div>
              <strong style="font-size: var(--admin-font-lg);">Cuota #${cuota.numero}</strong>
              <p class="text-tertiary text-sm" style="margin-top: var(--admin-space-1);">
                Vence: ${formatDate(cuota.fecha_vencimiento)}
              </p>
            </div>
            <span class="badge ${
              cuota.estado === 'pagada' ? 'badge-success'
              : cuota.estado === 'parcial' ? 'badge-warning'
              : vencida ? 'badge-danger'
              : 'badge-neutral'
            }">
              ${vencida && cuota.estado !== 'pagada' ? '⚠️ Vencida' : cuota.estado}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--admin-space-4); margin-bottom: var(--admin-space-4);">
            <div>
              <div class="info-label">Valor</div>
              <div class="info-value">${formatCurrency(cuota.valor_cuota)}</div>
            </div>
            <div>
              <div class="info-label">Saldo</div>
              <div class="info-value ${saldo > 0 ? 'text-warning' : 'text-success'}">
                ${formatCurrency(saldo)}
              </div>
            </div>
          </div>

          <div class="btn-group" style="width: 100%;">
            ${cuota.estado !== 'pagada' ? `
              <button class="btn btn-primary btn-block btn-pagar-cuota" data-cuota-id="${cuota.id}">
                💰 Registrar Pago
              </button>
            ` : ''}
            <button class="btn btn-ghost ${cuota.estado !== 'pagada' ? '' : 'btn-block'} btn-ver-pagos-cuota" data-cuota-id="${cuota.id}">
              📋 Ver Pagos
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Agregar event listeners
  document.querySelectorAll('.btn-pagar-cuota').forEach(btn => {
    btn.addEventListener('click', () => {
      const cuotaId = parseInt(btn.dataset.cuotaId);
      abrirModalRegistrarPago(cuotaId);
    });
  });

  document.querySelectorAll('.btn-ver-pagos-cuota').forEach(btn => {
    btn.addEventListener('click', () => {
      const cuotaId = parseInt(btn.dataset.cuotaId);
      verPagosCuota(cuotaId);
    });
  });
}

function actualizarVisualizacionCuotas() {
  const desktop = document.getElementById("tablaCuotasDesktop");
  const mobile = document.getElementById("tablaCuotasMobile");

  if (window.innerWidth >= 768) {
    desktop.style.display = "block";
    mobile.style.display = "none";
  } else {
    desktop.style.display = "none";
    mobile.style.display = "grid";
  }
}

function renderHistorialPagosObligacion() {
  const container = document.getElementById("historialPagosPanel");
  container.style.display = "block";

  if (historialPagosObligacion.length === 0) {
    container.innerHTML = `
      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title">Historial de Pagos</h3>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">💸</div>
            <p class="empty-state-text">No hay pagos registrados para esta obligación.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const totalPagado = historialPagosObligacion.reduce((sum, p) => sum + parseFloat(p.monto), 0);

  container.innerHTML = `
    <div class="card mt-6">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 class="card-title">Historial de Pagos</h3>
          <p class="text-secondary text-sm" style="margin-top: var(--admin-space-1);">
            Total pagado: ${formatCurrency(totalPagado)} | ${historialPagosObligacion.length} pago${historialPagosObligacion.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" id="btnMostrarFiltrosHistorial">
          🔍 Filtrar
        </button>
      </div>
      <div class="card-body">
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cuota</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Referencia</th>
                <th>Admin</th>
                <th>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              ${historialPagosObligacion.map(pago => `
                <tr>
                  <td>${formatDateTime(pago.fecha_pago)}</td>
                  <td><strong>#${pago.cuotas.numero}</strong></td>
                  <td><strong>${formatCurrency(pago.monto)}</strong></td>
                  <td>
                    <span class="badge badge-neutral">${pago.metodo}</span>
                  </td>
                  <td>${pago.referencia || '-'}</td>
                  <td>${pago.created_by || '-'}</td>
                  <td>
                    ${(pago.soporte_path || pago.soporte_url) ? `
                      <button class="btn btn-sm btn-ghost btn-ver-comprobante" 
                        data-pago-id="${pago.id}" 
                        data-path="${pago.soporte_path || ''}" 
                        data-url="${pago.soporte_url || ''}" 
                        data-tipo="${pago.tipo_soporte || 'imagen'}">
                        📎 Ver
                      </button>
                    ` : '-'}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Event listeners para ver comprobantes
  setTimeout(() => {
    document.querySelectorAll('.btn-ver-comprobante').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pagoId = parseInt(btn.dataset.pagoId);
        const path = btn.dataset.path;
        const url = btn.dataset.url;
        const tipo = btn.dataset.tipo;
        
        // Generar URL firmada para visualizar
        await verComprobanteConPath(pagoId, path, url, tipo);
      });
    });

    const btnFiltros = document.getElementById('btnMostrarFiltrosHistorial');
    if (btnFiltros) {
      btnFiltros.addEventListener('click', mostrarFiltrosHistorial);
    }
  }, 100);
}

function limpiarSeleccionPagos() {
  selectedClientePagos = null;
  selectedObligacionPagos = null;
  cuotasCurrentPagos = [];
  historialPagosObligacion = [];

  document.getElementById("clienteResumenPagos").style.display = "none";
  document.getElementById("obligacionesPanelPagos").style.display = "none";
  document.getElementById("historialPagosPanel").style.display = "none";
  
  // Ocultar botones solo si existen
  const btnExportar = document.getElementById("btnExportarPagos");
  const btnNuevo = document.getElementById("btnNuevoPago");
  if (btnExportar) btnExportar.style.display = "none";
  if (btnNuevo) btnNuevo.style.display = "none";
  
  document.getElementById("searchClientePagos").value = "";
  document.getElementById("searchResultsPagos").innerHTML = "";
  
  // Mostrar paneles de acceso rápido nuevamente
  const panelesAcceso = document.getElementById("panelesAccesoRapido");
  if (panelesAcceso) {
    panelesAcceso.style.display = "block";
    cargarPanelesAccesoRapido(); // Recargar para actualizar con el último cliente usado
  }
}

async function abrirModalRegistrarPago(cuotaId) {
  try {
    // Obtener cuota
    const cuota = cuotasCurrentPagos.find(c => c.id === cuotaId);
    if (!cuota) return;

    const saldoPendiente = cuota.saldo_pendiente ?? cuota.valor_cuota;

    const footer = `
      <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarPago">Guardar Pago</button>
    `;

    showModal(
      "Registrar Pago",
      `
        <!-- Contexto -->
        <div class="alert alert-info mb-4">
          <strong>Cliente:</strong> ${selectedClientePagos.nombre} (${selectedClientePagos.documento})<br>
          <strong>Obligación:</strong> #${selectedObligacionPagos.id} - ${selectedObligacionPagos.tipo}<br>
          <strong>Cuota:</strong> #${cuota.numero} | Vence: ${formatDate(cuota.fecha_vencimiento)}<br>
          <strong>Valor cuota:</strong> ${formatCurrency(cuota.valor_cuota)}<br>
          <strong>Saldo pendiente:</strong> ${formatCurrency(saldoPendiente)}
        </div>

        <!-- Formulario -->
        <form id="formRegistrarPago" style="display: grid; gap: var(--admin-space-5);">
          <div class="form-group">
            <label class="form-label form-label-required">Monto a pagar</label>
            <div style="display: flex; gap: var(--admin-space-2);">
              <input 
                type="number" 
                id="montoPago" 
                class="form-input" 
                placeholder="0.00"
                step="0.01"
                min="0.01"
                max="${saldoPendiente}"
                required
              >
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('montoPago').value=${saldoPendiente}">
                Pagar Todo
              </button>
            </div>
            <span class="form-helper">Máximo: ${formatCurrency(saldoPendiente)}</span>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required">Método de pago</label>
            <select id="metodoPago" class="form-select" required>
              <option value="">Seleccionar...</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="consignacion">Consignación</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div class="form-group" id="grupoEntidad" style="display: none;">
            <label class="form-label">Entidad financiera</label>
            <input 
              type="text" 
              id="entidadPago" 
              class="form-input" 
              placeholder="Ej: Bancolombia, Nequi..."
            >
          </div>

          <div class="form-group" id="grupoReferencia" style="display: none;">
            <label class="form-label">Referencia / Número de transacción</label>
            <input 
              type="text" 
              id="referenciaPago" 
              class="form-input" 
              placeholder="Ej: TRX-123456"
            >
          </div>

          <div class="form-group">
            <label class="form-label">Nota interna (opcional)</label>
            <textarea 
              id="notaPago" 
              class="form-textarea" 
              rows="3"
              placeholder="Observaciones, comentarios..."
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Comprobante (opcional)</label>
            <input 
              type="file" 
              id="comprobantePago" 
              class="form-input" 
              accept="image/*,.pdf"
            >
            <span class="form-helper">Formatos: JPG, PNG, PDF. Máximo 5MB</span>
            <div id="previewComprobante" style="margin-top: var(--admin-space-3);"></div>
          </div>
        </form>
      `,
      footer
    );

    // Listeners del formulario
    const metodoPago = document.getElementById("metodoPago");
    const montoPago = document.getElementById("montoPago");
    const comprobantePago = document.getElementById("comprobantePago");
    const btnGuardar = document.getElementById("btnGuardarPago");

    // Mostrar/ocultar campos según método
    metodoPago.addEventListener("change", (e) => {
      const metodo = e.target.value;
      const mostrarRef = metodo !== "efectivo" && metodo !== "";
      document.getElementById("grupoEntidad").style.display = mostrarRef ? "block" : "none";
      document.getElementById("grupoReferencia").style.display = mostrarRef ? "block" : "none";
    });

    // Preview comprobante
    comprobantePago.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById("previewComprobante");

      if (!file) {
        preview.innerHTML = "";
        return;
      }

      // Validar tamaño
      if (file.size > 5 * 1024 * 1024) {
        alert("El archivo excede el tamaño máximo de 5MB");
        comprobantePago.value = "";
        preview.innerHTML = "";
        return;
      }

      // Preview
      if (file.type.includes("image")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.innerHTML = `
            <img src="${e.target.result}" style="max-width: 100%; max-height: 200px; border-radius: var(--admin-radius-lg); border: 1px solid var(--admin-border);">
          `;
        };
        reader.readAsDataURL(file);
      } else if (file.type.includes("pdf")) {
        preview.innerHTML = `
          <div class="alert alert-info">
            📄 Archivo PDF seleccionado: ${file.name}
          </div>
        `;
      }
    });

    // Submit
    btnGuardar.addEventListener("click", () => handleSubmitPago(cuotaId));

  } catch (error) {
    Logger.error("Error al abrir modal:", error);
    showToast("Error al abrir formulario", "error");
  }
}

async function handleSubmitPago(cuotaId) {
  try {
    const form = document.getElementById("formRegistrarPago");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const monto = parseFloat(document.getElementById("montoPago").value);
    const metodo = document.getElementById("metodoPago").value;
    const entidad = document.getElementById("entidadPago").value;
    const referencia = document.getElementById("referenciaPago").value;
    const nota = document.getElementById("notaPago").value;
    const comprobanteFile = document.getElementById("comprobantePago").files[0];

    // Validar monto
    const cuota = cuotasCurrentPagos.find(c => c.id === cuotaId);
    const saldo = cuota.saldo_pendiente ?? cuota.valor_cuota;

    if (monto <= 0 || monto > saldo) {
      showToast("Monto inválido", "error");
      return;
    }

    // Deshabilitar botón y form
    const btnGuardar = document.getElementById("btnGuardarPago");
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Procesando...";

    // Subir comprobante si existe
    let soporteData = { url: null, path: null, tipo: null };

    if (comprobanteFile) {
      btnGuardar.textContent = "Subiendo comprobante...";

      const uploadResult = await subirComprobantePago(comprobanteFile, {
        clienteDocumento: selectedClientePagos.documento,
        obligacionId: selectedObligacionPagos.id,
        cuotaNumero: cuota.numero,
        monto: monto.toFixed(0)
      });

      if (!uploadResult.success) {
        showToast("Error al subir comprobante: " + uploadResult.error, "error");
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Guardar Pago";
        return;
      }

      soporteData = {
        url: uploadResult.url,
        path: uploadResult.path,
        tipo: uploadResult.tipo
      };
    }

    // Procesar pago
    btnGuardar.textContent = "Guardando pago...";

    const resultado = await procesarPago({
      cuota_id: cuotaId,
      monto: monto,
      metodo: metodo,
      referencia: referencia || null,
      entidad_financiera: entidad || null,
      nota: nota || null,
      soporte_url: soporteData.url,
      soporte_path: soporteData.path,
      tipo_soporte: soporteData.tipo,
      admin_user: currentUser.username,
      created_by: currentUser.username
    });

    if (!resultado.success) {
      showToast("Error: " + resultado.error, "error");
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Pago";
      return;
    }

    // Éxito
    showToast(resultado.message, "success");
    hideModal();

    // Recargar vista
    await seleccionarObligacionPagos(selectedObligacionPagos.id);

  } catch (error) {
    Logger.error("Error al guardar pago:", error);
    showToast("Error al procesar el pago", "error");
    
    const btnGuardar = document.getElementById("btnGuardarPago");
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Pago";
    }
  }
}

async function verPagosCuota(cuotaId) {
  try {
    const pagos = await obtenerPagosCuota(cuotaId);
    const cuota = cuotasCurrentPagos.find(c => c.id === cuotaId);

    if (!cuota) return;

    const totalPagado = pagos.reduce((sum, p) => sum + (p.estado === 'activo' ? parseFloat(p.monto) : 0), 0);

    showModal(
      `Pagos de Cuota #${cuota.numero}`,
      `
        <div class="alert alert-info mb-4">
          <strong>Valor cuota:</strong> ${formatCurrency(cuota.valor_cuota)}<br>
          <strong>Total pagado:</strong> ${formatCurrency(totalPagado)}<br>
          <strong>Saldo:</strong> ${formatCurrency((cuota.saldo_pendiente ?? cuota.valor_cuota))}
        </div>

        ${pagos.length === 0 ? `
          <div class="empty-state">
            <p class="empty-state-text">No hay pagos registrados para esta cuota.</p>
          </div>
        ` : `
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Método</th>
                  <th>Admin</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${pagos.map(pago => `
                  <tr>
                    <td>${formatDateTime(pago.fecha_pago)}</td>
                    <td><strong>${formatCurrency(pago.monto)}</strong></td>
                    <td><span class="badge badge-neutral">${pago.metodo}</span></td>
                    <td>${pago.created_by || '-'}</td>
                    <td>
                      <span class="badge ${pago.estado === 'activo' ? 'badge-success' : 'badge-danger'}">
                        ${pago.estado}
                      </span>
                    </td>
                    <td>
                      ${(pago.soporte_path || pago.soporte_url) ? `
                        <button class="btn btn-sm btn-ghost btn-ver-comprobante-modal" 
                          data-pago-id="${pago.id}" 
                          data-path="${pago.soporte_path || ''}" 
                          data-url="${pago.soporte_url || ''}" 
                          data-tipo="${pago.tipo_soporte || 'imagen'}">
                          📎
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      `,
      `<button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>`
    );

    // Event listeners
    setTimeout(() => {
      document.querySelectorAll('.btn-ver-comprobante-modal').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pagoId = parseInt(btn.dataset.pagoId);
          const path = btn.dataset.path;
          const url = btn.dataset.url;
          const tipo = btn.dataset.tipo;
          
          // Generar URL firmada para visualizar
          await verComprobanteConPath(pagoId, path, url, tipo);
        });
      });
    }, 100);
  } catch (error) {
    Logger.error("Error al ver pagos:", error);
    showToast("Error al cargar pagos", "error");
  }
}

/**
 * Visualiza un comprobante usando path (genera signed URL) con fallback a URL directa
 */
async function verComprobanteConPath(pagoId, path, urlFallback, tipo) {
  try {
    let url = null;
    
    // Prioridad 1: Si existe path, generar signed URL (bucket privado)
    if (path) {
      url = await obtenerUrlComprobante(path);
      
      if (!url) {
        throw new Error('No se pudo generar enlace del comprobante. Verifica las políticas de storage.');
      }
    }
    // Prioridad 2: Fallback a URL guardada (para registros antiguos)
    else if (urlFallback) {
      url = urlFallback;
      console.warn('Usando URL fallback para pago antiguo:', pagoId);
    }
    // Sin comprobante
    else {
      showToast('Este pago no tiene comprobante asociado', 'warning');
      return;
    }
    
    // Mostrar comprobante en modal
    verComprobantePago(pagoId, url, tipo, path);
    
  } catch (error) {
    console.error('Error al cargar comprobante:', error);
    showToast(error.message || 'Error al cargar comprobante', 'error');
  }
}

function verComprobantePago(pagoId, url, tipo, path = null) {
  const btnOpenTab = `<button class="btn btn-secondary btn-sm" id="btnOpenComprobanteTab">🔗 Abrir en Nueva Pestaña</button>`;
  const btnOpenPdf = `<button class="btn btn-primary btn-sm mt-2" id="btnOpenPdfTab">📄 Abrir en Nueva Pestaña</button>`;

  showModal(
    "Comprobante de Pago",
    `
      <div style="text-align: center;">
        ${tipo === 'pdf' ? `
          <div class="alert alert-info mb-4">
            <strong>Archivo PDF</strong>
            ${btnOpenPdf}
          </div>
          <embed src="${url}" width="100%" height="600px" type="application/pdf">
        ` : `
          <img src="${url}" style="max-width: 100%; border-radius: var(--admin-radius-lg); border: 1px solid var(--admin-border);">
          <br><br>
          ${btnOpenTab}
        `}
      </div>
    `,
    `<button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>`
  );

  // Event listeners para abrir en nueva pestaña
  setTimeout(() => {
    const btnTab = document.getElementById('btnOpenComprobanteTab');
    const btnPdf = document.getElementById('btnOpenPdfTab');
    
    const abrirEnNuevaTab = async () => {
      // Si tenemos path, regenerar signed URL para evitar problemas de expiración
      if (path) {
        try {
          const urlFresca = await obtenerUrlComprobante(path);
          
          if (urlFresca) {
            window.open(urlFresca, '_blank');
          } else {
            showToast('No se pudo generar enlace temporal', 'error');
          }
        } catch (error) {
          console.error('Error al regenerar URL:', error);
          // Fallback: usar la URL actual del modal
          window.open(url, '_blank');
        }
      } else {
        // Sin path, usar URL directa
        window.open(url, '_blank');
      }
    };
    
    if (btnTab) {
      btnTab.addEventListener('click', abrirEnNuevaTab);
    }
    if (btnPdf) {
      btnPdf.addEventListener('click', abrirEnNuevaTab);
    }
  }, 100);
}

function exportarHistorialPagos() {
  if (!selectedObligacionPagos || historialPagosObligacion.length === 0) {
    showToast("No hay datos para exportar", "warning");
    return;
  }

  try {
    const csv = [
      ['Fecha', 'Cuota', 'Monto', 'Método', 'Referencia', 'Entidad', 'Admin', 'Nota'].join(','),
      ...historialPagosObligacion.map(p => [
        formatDateTime(p.fecha_pago),
        `Cuota #${p.cuotas.numero}`,
        p.monto,
        p.metodo,
        p.referencia || '',
        p.entidad_financiera || '',
        p.created_by || '',
        (p.nota || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos-obligacion-${selectedObligacionPagos.id}-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast("Historial exportado correctamente", "success");
  } catch (error) {
    Logger.error("Error al exportar:", error);
    showToast("Error al exportar historial", "error");
  }
}

function mostrarFiltrosHistorial() {
  showToast("Funcionalidad de filtros avanzados próximamente", "info");
}

function mostrarFormularioPago(clienteId = null, cuotaId = null) {
  // Si hay cuotaId, abrir modal directo (ruta rápida desde cuotas)
  if (cuotaId && typeof abrirModalRegistrarPago === 'function') {
    abrirModalRegistrarPago(cuotaId);
    return;
  }
  
  // Si hay clienteId, abrir wizard en paso 2 (obligaciones del cliente)
  if (clienteId) {
    abrirWizardPago(clienteId);
    return;
  }
  
  // Sin parámetros: abrir wizard completo desde paso 1
  abrirWizardPago();
}

// ========================================
// WIZARD DE REGISTRO DE PAGOS - 3 PASOS
// ========================================

let wizardPagoState = {
  paso: 1,
  clienteSeleccionado: null,
  obligacionSeleccionada: null,
  cuotaSeleccionada: null
};

function resetWizardPago() {
  wizardPagoState = {
    paso: 1,
    clienteSeleccionado: null,
    obligacionSeleccionada: null,
    cuotaSeleccionada: null
  };
}

/**
 * Abre el wizard de registro de pagos
 * @param {number} clienteId - ID del cliente (opcional, salta al paso 2)
 */
async function abrirWizardPago(clienteId = null) {
  resetWizardPago();
  
  // Si viene con clienteId, pre-cargar y saltar al paso 2
  if (clienteId) {
    try {
      // Asegurar que el ID sea un número entero
      const idCliente = parseInt(clienteId, 10);
      if (isNaN(idCliente)) {
        showToast('ID de cliente inválido', 'error');
        return;
      }

      const cliente = await obtenerClientePorId(idCliente);
      
      if (!cliente) {
        showToast('Cliente no encontrado', 'error');
        return;
      }
      
      wizardPagoState.clienteSeleccionado = cliente;
      wizardPagoState.paso = 2;
      renderWizardPago();
      return;
    } catch (error) {
      console.error('Error al pre-cargar cliente:', error);
      showToast('Error al cargar cliente', 'error');
    }
  }
  
  // Paso 1: seleccionar cliente
  renderWizardPago();
}

function renderWizardPago() {
  const paso = wizardPagoState.paso;
  
  let titulo = '';
  let contenido = '';
  let footer = '';
  
  switch (paso) {
    case 1:
      titulo = 'Registrar Pago - Paso 1 de 3';
      contenido = renderPaso1BuscarCliente();
      footer = `<button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>`;
      break;
      
    case 2:
      titulo = `Registrar Pago - Paso 2 de 3`;
      contenido = renderPaso2SeleccionarObligacion();
      footer = `
        <button type="button" class="btn btn-secondary" onclick="volverPaso1Wizard()">← Volver</button>
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      `;
      break;
      
    case 3:
      titulo = `Registrar Pago - Paso 3 de 3`;
      contenido = renderPaso3SeleccionarCuota();
      footer = `
        <button type="button" class="btn btn-secondary" onclick="volverPaso2Wizard()">← Volver</button>
        <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      `;
      break;
  }
  
  showModal(titulo, contenido, footer);
  
  // Inicializar listeners según el paso
  if (paso === 1) inicializarPaso1Listeners();
  if (paso === 2) cargarObligacionesPaso2();
  if (paso === 3) cargarCuotasPaso3();
}

// ========== PASO 1: BUSCAR Y SELECCIONAR CLIENTE ==========

function renderPaso1BuscarCliente() {
  return `
    <div style="padding: var(--space-4) 0;">
      <p style="margin-bottom: var(--space-5); color: var(--corp-neutral-600);">
        Busca al cliente por nombre, documento o teléfono
      </p>
      
      <div class="form-group">
        <label class="form-label">Buscar cliente</label>
        <input 
          type="text" 
          id="wizardBuscarCliente" 
          class="form-input" 
          placeholder="Escribe nombre, documento o teléfono..."
          autocomplete="off"
        >
      </div>
      
      <div id="wizardResultadosClientes" style="margin-top: var(--space-4);"></div>
    </div>
  `;
}

function inicializarPaso1Listeners() {
  const input = document.getElementById('wizardBuscarCliente');
  if (!input) return;
  
  let searchTimeout;
  
  input.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const termino = e.target.value.trim();
    
    if (termino.length < 2) {
      document.getElementById('wizardResultadosClientes').innerHTML = '';
      return;
    }
    
    searchTimeout = setTimeout(() => buscarClientesWizard(termino), 400);
  });
  
  // Auto-focus
  setTimeout(() => input.focus(), 100);
}

async function buscarClientesWizard(termino) {
  const container = document.getElementById('wizardResultadosClientes');
  
  container.innerHTML = `
    <div style="padding: var(--space-6); text-align: center;">
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text"></div>
    </div>
  `;
  
  try {
    const { data: clientes, error } = await supabaseClient
      .from('clientes')
      .select('*')
      .or(`nombre.ilike.%${termino}%,documento.ilike.%${termino}%,telefono.ilike.%${termino}%`)
      .eq('estado', 'activo')
      .order('nombre')
      .limit(10);
    
    if (error) throw error;
    
    if (clientes.length === 0) {
      container.innerHTML = `
        <div style="padding: var(--space-8); text-align: center;">
          <div style="font-size: 3rem; margin-bottom: var(--space-3);">🔍</div>
          <p style="color: var(--corp-neutral-600);">
            No se encontraron clientes con "<strong>${termino}</strong>"
          </p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div style="display: grid; gap: var(--space-3); max-height: 400px; overflow-y: auto; padding: var(--space-2);">
        ${clientes.map(c => `
          <div class="card" style="cursor: pointer; padding: var(--space-4); border: 2px solid var(--corp-neutral-200); transition: all 0.2s;"
               onmouseenter="this.style.borderColor='var(--corp-primary)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'"
               onmouseleave="this.style.borderColor='var(--corp-neutral-200)'; this.style.boxShadow='none'"
               onclick="seleccionarClienteWizard(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', '${c.documento}', '${c.tipo_documento || 'CC'}', '${c.telefono || ''}')">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--corp-primary), #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-size: var(--text-xl); font-weight: 700;">
                ${c.nombre.charAt(0).toUpperCase()}
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: var(--text-base); margin-bottom: var(--space-1);">
                  ${c.nombre}
                </div>
                <div style="font-size: var(--text-sm); color: var(--corp-neutral-600); display: flex; gap: var(--space-3); flex-wrap: wrap;">
                  <span>${c.tipo_documento || 'CC'}: ${c.documento}</span>
                  ${c.telefono ? `<span>📞 ${c.telefono}</span>` : ''}
                </div>
              </div>
              <div style="color: var(--corp-neutral-400); font-size: var(--text-2xl);">→</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
  } catch (error) {
    console.error('Error al buscar clientes:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        Error al buscar clientes. Por favor intente nuevamente.
      </div>
    `;
  }
}

function seleccionarClienteWizard(id, nombre, documento, tipo_documento, telefono) {
  wizardPagoState.clienteSeleccionado = {
    id,
    nombre,
    documento,
    tipo_documento,
    telefono
  };
  
  // Guardar en recientes
  guardarClienteReciente(wizardPagoState.clienteSeleccionado);
  
  // Avanzar al paso 2
  wizardPagoState.paso = 2;
  renderWizardPago();
}

function volverPaso1Wizard() {
  wizardPagoState.paso = 1;
  wizardPagoState.clienteSeleccionado = null;
  renderWizardPago();
}

// ========== PASO 2: SELECCIONAR OBLIGACIÓN ==========

function renderPaso2SeleccionarObligacion() {
  const cliente = wizardPagoState.clienteSeleccionado;
  
  return `
    <div style="padding: var(--space-4) 0;">
      <div class="alert alert-info" style="margin-bottom: var(--space-5);">
        <strong>Cliente:</strong> ${cliente.nombre}<br>
        <strong>${cliente.tipo_documento}:</strong> ${cliente.documento}
      </div>
      
      <p style="margin-bottom: var(--space-4); color: var(--corp-neutral-600);">
        Selecciona la obligación para registrar el pago
      </p>
      
      <div id="wizardObligacionesLista"></div>
    </div>
  `;
}

async function cargarObligacionesPaso2() {
  const container = document.getElementById('wizardObligacionesLista');
  if (!container) return;
  
  container.innerHTML = `
    <div style="padding: var(--space-6); text-align: center;">
      <div class="skeleton skeleton-card"></div>
    </div>
  `;
  
  try {
    const clienteId = wizardPagoState.clienteSeleccionado.id;
    
    const { data: obligaciones, error } = await supabaseClient
      .from('obligaciones')
      .select(`
        *,
        cuotas(id, estado, saldo_pendiente, valor_cuota)
      `)
      .eq('cliente_id', clienteId)
      .in('estado', ['vigente_al_dia', 'vigente_en_mora'])
      .order('fecha_inicio', { ascending: false });
    
    if (error) throw error;
    
    if (obligaciones.length === 0) {
      container.innerHTML = `
        <div style="padding: var(--space-8); text-align: center;">
          <div style="font-size: 3rem; margin-bottom: var(--space-3);">💼</div>
          <p style="color: var(--corp-neutral-600); margin-bottom: var(--space-4);">
            Este cliente no tiene obligaciones activas
          </p>
          <button type="button" class="btn btn-secondary" onclick="hideModal()">Cerrar</button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div style="display: grid; gap: var(--space-4);">
        ${obligaciones.map(obl => {
          const cuotasPendientes = obl.cuotas.filter(c => c.estado !== 'pagada').length;
          const saldoTotal = obl.cuotas
            .filter(c => c.estado !== 'pagada')
            .reduce((sum, c) => sum + (c.saldo_pendiente || c.valor_cuota), 0);
          
          return `
            <div class="card" style="cursor: pointer; padding: var(--space-4); border: 2px solid var(--corp-neutral-200); transition: all 0.2s;"
                 onmouseenter="this.style.borderColor='var(--corp-primary)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.1)'"
                 onmouseleave="this.style.borderColor='var(--corp-neutral-200)'; this.style.transform='none'; this.style.boxShadow='none'"
                 onclick="seleccionarObligacionWizard(${obl.id})">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
                <div>
                  <div style="font-weight: 600; font-size: var(--text-lg); margin-bottom: var(--space-2);">
                    ${obl.tipo === 'prestamo' ? '💰 Préstamo' : '📱 Producto'} #${obl.id}
                  </div>
                  <div style="font-size: var(--text-sm); color: var(--corp-neutral-600);">
                    Inicio: ${formatDate(obl.fecha_inicio)}
                  </div>
                </div>
                <span class="badge ${obl.estado === 'vigente_al_dia' ? 'badge-success' : 'badge-warning'}">
                  ${obl.estado.replace(/_/g, ' ')}
                </span>
              </div>
              
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-4); padding: var(--space-3); background: var(--corp-neutral-50); border-radius: var(--radius-md);">
                <div>
                  <div style="font-size: var(--text-xs); color: var(--corp-neutral-600); margin-bottom: var(--space-1);">Capital</div>
                  <div style="font-weight: 600;">${formatCurrency(obl.capital)}</div>
                </div>
                <div>
                  <div style="font-size: var(--text-xs); color: var(--corp-neutral-600); margin-bottom: var(--space-1);">Saldo pendiente</div>
                  <div style="font-weight: 600; color: var(--corp-warning);">${formatCurrency(saldoTotal)}</div>
                </div>
                <div>
                  <div style="font-size: var(--text-xs); color: var(--corp-neutral-600); margin-bottom: var(--space-1);">Cuotas pendientes</div>
                  <div style="font-weight: 600;">${cuotasPendientes}</div>
                </div>
              </div>
              
              <div style="margin-top: var(--space-3); text-align: right; color: var(--corp-primary); font-weight: 600;">
                Seleccionar →
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    
  } catch (error) {
    console.error('Error al cargar obligaciones:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        Error al cargar obligaciones. Por favor intente nuevamente.
      </div>
    `;
  }
}

async function seleccionarObligacionWizard(obligacionId) {
  try {
    const { data: obligacion, error } = await supabaseClient
      .from('obligaciones')
      .select('*')
      .eq('id', obligacionId)
      .single();
    
    if (error) throw error;
    
    wizardPagoState.obligacionSeleccionada = obligacion;
    wizardPagoState.paso = 3;
    renderWizardPago();
    
  } catch (error) {
    console.error('Error al seleccionar obligación:', error);
    showToast('Error al cargar obligación', 'error');
  }
}

function volverPaso2Wizard() {
  wizardPagoState.paso = 2;
  wizardPagoState.obligacionSeleccionada = null;
  renderWizardPago();
}

// ========== PASO 3: SELECCIONAR CUOTA ==========

function renderPaso3SeleccionarCuota() {
  const cliente = wizardPagoState.clienteSeleccionado;
  const obligacion = wizardPagoState.obligacionSeleccionada;
  
  return `
    <div style="padding: var(--space-4) 0;">
      <div class="alert alert-info" style="margin-bottom: var(--space-5);">
        <strong>Cliente:</strong> ${cliente.nombre}<br>
        <strong>Obligación:</strong> ${obligacion.tipo === 'prestamo' ? 'Préstamo' : 'Producto'} #${obligacion.id}
      </div>
      
      <p style="margin-bottom: var(--space-4); color: var(--corp-neutral-600);">
        Selecciona la cuota a pagar
      </p>
      
      <div id="wizardCuotasLista"></div>
    </div>
  `;
}

async function cargarCuotasPaso3() {
  const container = document.getElementById('wizardCuotasLista');
  if (!container) return;
  
  container.innerHTML = `
    <div style="padding: var(--space-6); text-align: center;">
      <div class="skeleton skeleton-card"></div>
    </div>
  `;
  
  try {
    const obligacionId = wizardPagoState.obligacionSeleccionada.id;
    
    const { data: cuotas, error } = await supabaseClient
      .from('cuotas')
      .select('*')
      .eq('obligacion_id', obligacionId)
      .neq('estado', 'pagada')
      .order('numero', { ascending: true });
    
    if (error) throw error;
    
    if (cuotas.length === 0) {
      container.innerHTML = `
        <div style="padding: var(--space-8); text-align: center;">
          <div style="font-size: 3rem; margin-bottom: var(--space-3);">✅</div>
          <p style="color: var(--corp-success); margin-bottom: var(--space-4);">
            Todas las cuotas están pagadas
          </p>
          <button type="button" class="btn btn-secondary" onclick="hideModal()">Cerrar</button>
        </div>
      `;
      return;
    }
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    container.innerHTML = `
      <div style="display: grid; gap: var(--space-3); max-height: 450px; overflow-y: auto; padding: var(--space-2);">
        ${cuotas.map(cuota => {
          const venc = new Date(cuota.fecha_vencimiento);
          venc.setHours(0, 0, 0, 0);
          const vencida = venc < hoy;
          const diasDiff = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
          const saldo = cuota.saldo_pendiente || cuota.valor_cuota;
          
          let bordColor = 'var(--corp-neutral-300)';
          let estadoTexto = 'Pendiente';
          let estadoBadge = 'badge-neutral';
          
          if (cuota.estado === 'parcial') {
            bordColor = 'var(--corp-warning)';
            estadoTexto = 'Pago parcial';
            estadoBadge = 'badge-warning';
          } else if (vencida) {
            bordColor = 'var(--corp-danger)';
            estadoTexto = `⚠️ Vencida (${Math.abs(diasDiff)} días)`;
            estadoBadge = 'badge-danger';
          } else if (diasDiff <= 3) {
            bordColor = 'var(--corp-warning)';
            estadoTexto = `Vence ${diasDiff === 0 ? 'hoy' : diasDiff === 1 ? 'mañana' : `en ${diasDiff} días`}`;
            estadoBadge = 'badge-warning';
          }
          
          return `
            <div class="card" style="cursor: pointer; padding: var(--space-4); border-left: 4px solid ${bordColor}; border-right: 1px solid var(--corp-neutral-200); border-top: 1px solid var(--corp-neutral-200); border-bottom: 1px solid var(--corp-neutral-200); transition: all 0.2s;"
                 onmouseenter="this.style.transform='translateX(4px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'"
                 onmouseleave="this.style.transform='none'; this.style.boxShadow='none'"
                 onclick="seleccionarCuotaWizard(${cuota.id})">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
                <div>
                  <div style="font-weight: 700; font-size: var(--text-xl); margin-bottom: var(--space-1);">
                    Cuota #${cuota.numero}
                  </div>
                  <div style="font-size: var(--text-sm); color: var(--corp-neutral-600);">
                    Vencimiento: ${formatDate(cuota.fecha_vencimiento)}
                  </div>
                </div>
                <span class="badge ${estadoBadge}">${estadoTexto}</span>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-3);">
                <div>
                  <div style="font-size: var(--text-xs); color: var(--corp-neutral-600); margin-bottom: var(--space-1);">Valor cuota</div>
                  <div style="font-weight: 600; font-size: var(--text-lg);">${formatCurrency(cuota.valor_cuota)}</div>
                </div>
                <div>
                  <div style="font-size: var(--text-xs); color: var(--corp-neutral-600); margin-bottom: var(--space-1);">Saldo pendiente</div>
                  <div style="font-weight: 700; font-size: var(--text-lg); color: ${saldo > 0 ? 'var(--corp-danger)' : 'var(--corp-success)'};">
                    ${formatCurrency(saldo)}
                  </div>
                </div>
              </div>
              
              <div style="text-align: right;">
                <button type="button" class="btn btn-primary btn-sm" onclick="event.stopPropagation(); seleccionarCuotaWizard(${cuota.id})">
                  💰 Registrar pago
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    
  } catch (error) {
    console.error('Error al cargar cuotas:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        Error al cargar cuotas. Por favor intente nuevamente.
      </div>
    `;
  }
}

async function seleccionarCuotaWizard(cuotaId) {
  try {
    // No cerrar el wizard todavía - mostrar loading
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
      modalContent.innerHTML = `
        <div style="padding: var(--space-8); text-align: center;">
          <div class="skeleton skeleton-card"></div>
          <p style="margin-top: var(--space-4); color: var(--corp-neutral-600);">
            Abriendo formulario de pago...
          </p>
        </div>
      `;
    }
    
    // Cargar datos de la cuota desde DB
    const { data: cuota, error: errorCuota } = await supabaseClient
      .from('cuotas')
      .select(`
        *,
        obligaciones (
          *,
          clientes (*)
        )
      `)
      .eq('id', cuotaId)
      .single();
    
    if (errorCuota || !cuota) {
      hideModal();
      showToast('Error al cargar la cuota', 'error');
      return;
    }
    
    const cliente = cuota.obligaciones.clientes;
    const obligacion = cuota.obligaciones;
    const saldoPendiente = cuota.saldo_pendiente ?? cuota.valor_cuota;
    
    // Cerrar wizard y abrir modal de pago
    hideModal();
    
    setTimeout(() => {
      abrirModalRegistrarPagoDirecto(cuota, cliente, obligacion, saldoPendiente);
    }, 300);
    
  } catch (error) {
    console.error('Error al seleccionar cuota:', error);
    hideModal();
    showToast('Error al procesar la cuota', 'error');
  }
}

// Nueva función que no depende de variables globales
async function abrirModalRegistrarPagoDirecto(cuota, cliente, obligacion, saldoPendiente) {
  try {
    const footer = `
      <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" id="btnGuardarPagoDirecto">Guardar Pago</button>
    `;

    showModal(
      "Registrar Pago",
      `
        <!-- Contexto -->
        <div class="alert alert-info mb-4">
          <strong>Cliente:</strong> ${cliente.nombre} (${cliente.documento})<br>
          <strong>Obligación:</strong> #${obligacion.id} - ${obligacion.tipo}<br>
          <strong>Cuota:</strong> #${cuota.numero} | Vence: ${formatDate(cuota.fecha_vencimiento)}<br>
          <strong>Valor cuota:</strong> ${formatCurrency(cuota.valor_cuota)}<br>
          <strong>Saldo pendiente:</strong> ${formatCurrency(saldoPendiente)}
        </div>

        <!-- Formulario -->
        <form id="formRegistrarPagoDirecto" style="display: grid; gap: var(--admin-space-5);">
          <div class="form-group">
            <label class="form-label form-label-required">Monto a pagar</label>
            <div style="display: flex; gap: var(--admin-space-2);">
              <input 
                type="number" 
                id="montoPagoDirecto" 
                class="form-input" 
                placeholder="0.00"
                step="0.01"
                min="0.01"
                max="${saldoPendiente}"
                required
              >
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('montoPagoDirecto').value=${saldoPendiente}">
                Pagar Todo
              </button>
            </div>
            <span class="form-helper">Máximo: ${formatCurrency(saldoPendiente)}</span>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required">Método de pago</label>
            <select id="metodoPagoDirecto" class="form-select" required>
              <option value="">Seleccionar...</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="consignacion">Consignación</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div class="form-group" id="grupoEntidadDirecto" style="display: none;">
            <label class="form-label">Entidad financiera</label>
            <input 
              type="text" 
              id="entidadPagoDirecto" 
              class="form-input" 
              placeholder="Ej: Bancolombia, Nequi..."
            >
          </div>

          <div class="form-group" id="grupoReferenciaDirecto" style="display: none;">
            <label class="form-label">Referencia / Número de transacción</label>
            <input 
              type="text" 
              id="referenciaPagoDirecto" 
              class="form-input" 
              placeholder="Ej: TRX-123456"
            >
          </div>

          <div class="form-group">
            <label class="form-label">Nota interna (opcional)</label>
            <textarea 
              id="notaPagoDirecto" 
              class="form-textarea" 
              rows="3"
              placeholder="Observaciones, comentarios..."
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Comprobante (opcional)</label>
            <input 
              type="file" 
              id="comprobantePagoDirecto" 
              class="form-input" 
              accept="image/*,.pdf"
            >
            <span class="form-helper">Formatos: JPG, PNG, PDF. Máximo 5MB</span>
            <div id="previewComprobanteDirecto" style="margin-top: var(--admin-space-3);"></div>
          </div>
        </form>
      `,
      footer
    );

    // Listeners del formulario
    const metodoPago = document.getElementById("metodoPagoDirecto");
    const montoPago = document.getElementById("montoPagoDirecto");
    const comprobantePago = document.getElementById("comprobantePagoDirecto");
    const btnGuardar = document.getElementById("btnGuardarPagoDirecto");

    // Mostrar/ocultar campos según método
    metodoPago.addEventListener("change", (e) => {
      const metodo = e.target.value;
      const mostrarRef = metodo !== "efectivo" && metodo !== "";
      document.getElementById("grupoEntidadDirecto").style.display = mostrarRef ? "block" : "none";
      document.getElementById("grupoReferenciaDirecto").style.display = mostrarRef ? "block" : "none";
    });

    // Preview comprobante
    comprobantePago.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById("previewComprobanteDirecto");

      if (!file) {
        preview.innerHTML = "";
        return;
      }

      // Validar tamaño
      if (file.size > 5 * 1024 * 1024) {
        alert("El archivo excede el tamaño máximo de 5MB");
        comprobantePago.value = "";
        preview.innerHTML = "";
        return;
      }

      // Preview
      if (file.type.includes("image")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.innerHTML = `
            <img src="${e.target.result}" style="max-width: 100%; max-height: 200px; border-radius: var(--admin-radius-lg); border: 1px solid var(--admin-border);">
          `;
        };
        reader.readAsDataURL(file);
      } else if (file.type.includes("pdf")) {
        preview.innerHTML = `
          <div class="alert alert-info">
            📄 Archivo PDF seleccionado: ${file.name}
          </div>
        `;
      }
    });

    // Submit
    btnGuardar.addEventListener("click", () => handleSubmitPagoDirecto(cuota.id, cliente, obligacion, saldoPendiente));

  } catch (error) {
    console.error("Error al abrir modal:", error);
    showToast("Error al abrir formulario", "error");
  }
}

async function handleSubmitPagoDirecto(cuotaId, cliente, obligacion, saldoPendiente) {
  try {
    const form = document.getElementById("formRegistrarPagoDirecto");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const monto = parseFloat(document.getElementById("montoPagoDirecto").value);
    const metodo = document.getElementById("metodoPagoDirecto").value;
    const entidad = document.getElementById("entidadPagoDirecto").value;
    const referencia = document.getElementById("referenciaPagoDirecto").value;
    const nota = document.getElementById("notaPagoDirecto").value;
    const comprobanteFile = document.getElementById("comprobantePagoDirecto").files[0];

    // Validar monto
    if (monto <= 0 || monto > saldoPendiente) {
      showToast("Monto inválido", "error");
      return;
    }

    // Deshabilitar botón y form
    const btnGuardar = document.getElementById("btnGuardarPagoDirecto");
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Procesando...";

    // Subir comprobante si existe
    let soporteData = { url: null, path: null, tipo: null };

    if (comprobanteFile) {
      btnGuardar.textContent = "Subiendo comprobante...";

      const uploadResult = await subirComprobantePago(comprobanteFile, {
        clienteDocumento: cliente.documento,
        obligacionId: obligacion.id,
        cuotaNumero: cuotaId,
        monto: monto.toFixed(0)
      });

      if (!uploadResult.success) {
        showToast("Error al subir comprobante: " + uploadResult.error, "error");
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Guardar Pago";
        return;
      }

      soporteData = {
        url: uploadResult.url,
        path: uploadResult.path,
        tipo: uploadResult.tipo
      };
    }

    // Procesar pago
    btnGuardar.textContent = "Guardando pago...";

    const resultado = await procesarPago({
      cuota_id: cuotaId,
      monto: monto,
      metodo: metodo,
      nota: nota,
      admin_user: 'admin',
      soporte_url: soporteData.url,
      soporte_path: soporteData.path,
      tipo_soporte: soporteData.tipo,
      referencia: referencia,
      entidad_financiera: entidad
    });

    if (!resultado.success) {
      showToast(resultado.error || "Error al procesar el pago", "error");
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Pago";
      return;
    }

    // Éxito
    showToast("✅ Pago registrado exitosamente", "success");
    hideModal();
    
    // Recargar vista de pagos si está activa
    const viewPagos = document.getElementById('viewPagos');
    if (viewPagos && viewPagos.style.display !== 'none') {
      setTimeout(() => {
        loadPagos();
      }, 500);
    }

  } catch (error) {
    console.error("Error al guardar pago:", error);
    showToast("Error al guardar el pago", "error");
    const btnGuardar = document.getElementById("btnGuardarPagoDirecto");
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Pago";
    }
  }
}

// ========================================
// MÓDULO DE REFINANCIACIÓN - IMPLEMENTACIÓN COMPLETA
// ========================================

// Estado global del módulo
let refinanciacionState = {
  obligaciones: [],
  filtros: {
    busqueda: "",
    tipo: "",
    estado: ""
  }
};

// ========== REFINANCIACIÓN: PANTALLA PRINCIPAL ==========
async function loadRefinanciacion() {
  const container = document.getElementById("viewRefinanciacion");
  showLoading(container, "Cargando obligaciones refinanciables...");
  
  try {
    // Cargar obligaciones refinanciables
    const obligaciones = await obtenerObligacionesRefinanciables();
    refinanciacionState.obligaciones = obligaciones;
    
    renderRefinanciacionView();
    
  } catch (error) {
    Logger.error("Error al cargar refinanciación:", error);
    container.innerHTML = `
      <div class="refin-container">
        <div class="refin-info-banner">
          <strong>⚠️ Error:</strong> No se pudieron cargar las obligaciones. ${error.message}
        </div>
      </div>
    `;
  }
}

function renderRefinanciacionView() {
  const container = document.getElementById("viewRefinanciacion");
  const { busqueda, tipo, estado } = refinanciacionState.filtros;
  
  // Filtrar obligaciones
  let obligacionesFiltradas = refinanciacionState.obligaciones.filter(obl => {
    // Filtro de búsqueda
    if (busqueda) {
      const query = busqueda.toLowerCase();
      const clienteNombre = obl.clientes?.nombre?.toLowerCase() || "";
      const clienteDoc = obl.clientes?.documento || "";
      const obligacionId = String(obl.id);
      
      if (!clienteNombre.includes(query) && 
          !clienteDoc.includes(query) && 
          !obligacionId.includes(query)) {
        return false;
      }
    }
    
    // Filtro de tipo
    if (tipo && obl.tipo !== tipo) {
      return false;
    }
    
    // Filtro de estado
    if (estado && obl.estado !== estado) {
      return false;
    }
    
    return true;
  });
  
  container.innerHTML = `
    <div class="refin-container">
      <!-- Header -->
      <div class="refin-header">
        <div class="refin-header-content">
          <h2 class="refin-header-title">Refinanciación de Obligaciones</h2>
          <p class="refin-header-subtitle">Gestiona y refinancia obligaciones vigentes con saldo pendiente</p>
        </div>
      </div>
      
      <!-- Filters -->
      <div class="refin-filters">
        <div class="refin-filters-header">
          <h3 class="refin-filters-title">
            <span>🔍</span>
            <span>Filtros</span>
          </h3>
        </div>
        <div class="refin-filters-grid">
          <div class="refin-filter-group">
            <label class="refin-filter-label">Búsqueda</label>
            <input 
              type="text" 
              class="refin-filter-input" 
              id="busquedaRefinanciacion" 
              placeholder="Cliente, documento o ID..."
              value="${busqueda}"
              oninput="filtrarRefinanciacion('busqueda', this.value)"
            >
          </div>
          
          <div class="refin-filter-group">
            <label class="refin-filter-label">Tipo</label>
            <select class="refin-filter-select" id="filtroTipoRef" onchange="filtrarRefinanciacion('tipo', this.value)">
              <option value="">Todos</option>
              <option value="prestamo" ${tipo === 'prestamo' ? 'selected' : ''}>Préstamo</option>
              <option value="producto" ${tipo === 'producto' ? 'selected' : ''}>Producto</option>
            </select>
          </div>
          
          <div class="refin-filter-group">
            <label class="refin-filter-label">Estado</label>
            <select class="refin-filter-select" id="filtroEstadoRef" onchange="filtrarRefinanciacion('estado', this.value)">
              <option value="">Todos</option>
              <option value="vigente_al_dia" ${estado === 'vigente_al_dia' ? 'selected' : ''}>Al día</option>
              <option value="vigente_en_mora" ${estado === 'vigente_en_mora' ? 'selected' : ''}>En mora</option>
            </select>
          </div>
        </div>
      </div>
      
      <!-- Data Section -->
      <div class="refin-data-section">
        ${obligacionesFiltradas.length === 0 ? `
          <div class="refin-empty">
            <div class="refin-empty-icon">📋</div>
            <p class="refin-empty-title">No hay obligaciones refinanciables</p>
            <p class="refin-empty-text">
              ${busqueda || tipo || estado ? 
                'No se encontraron resultados con los filtros aplicados.' : 
                'No hay obligaciones vigentes al día o en mora.'}
            </p>
          </div>
        ` : `
          <!-- Desktop: Table View -->
          <div class="refin-table-wrapper">
            <table class="refin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Capital</th>
                  <th>Cuotas</th>
                  <th>Saldo Pendiente</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${obligacionesFiltradas.map(o => {
                  const cuotasPagadas = o.cuotas?.filter(c => c.estado === "pagada").length || 0;
                  const totalCuotas = o.cuotas?.length || 0;
                  const saldoPendiente = o.saldo_pendiente_calculado || 0;
                  
                  return `
                    <tr>
                      <td><strong>#${o.id}</strong></td>
                      <td>
                        <div>${o.clientes?.nombre || "[Sin nombre]"}</div>
                        <small style="color: var(--gray-600);">${o.clientes?.documento || ""}</small>
                      </td>
                      <td>
                        <span class="refin-badge refin-badge-${o.tipo}">
                          ${o.tipo === 'prestamo' ? 'Préstamo' : 'Producto'}
                        </span>
                      </td>
                      <td>${formatCurrency(o.capital)}</td>
                      <td>${cuotasPagadas}/${totalCuotas}</td>
                      <td><strong>${formatCurrency(saldoPendiente)}</strong></td>
                      <td>
                        <span class="refin-badge refin-badge-${o.estado.includes('mora') ? 'mora' : 'dia'}">
                          ${o.estado.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <button 
                          type="button"
                          class="refin-btn-action refin-btn-secondary" 
                          onclick="verDetalleRefinanciacion(${o.id})"
                          title="Ver detalle">
                          👁️
                        </button>
                        <button 
                          type="button"
                          class="refin-btn-action" 
                          onclick="iniciarWizardRefinanciacion(${o.id})"
                          title="Refinanciar">
                          🔄
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
          
          <!-- Mobile: Cards View -->
          <div class="refin-cards">
            ${obligacionesFiltradas.map(o => {
              const cuotasPagadas = o.cuotas?.filter(c => c.estado === "pagada").length || 0;
              const totalCuotas = o.cuotas?.length || 0;
              const saldoPendiente = o.saldo_pendiente_calculado || 0;
              
              return `
                <div class="refin-card">
                  <div class="refin-card-header">
                    <div class="refin-card-header-left">
                      <div class="refin-card-id">#${o.id}</div>
                    </div>
                    <div class="refin-card-badges">
                      <span class="refin-badge refin-badge-${o.tipo}">
                        ${o.tipo === 'prestamo' ? 'Préstamo' : 'Producto'}
                      </span>
                      <span class="refin-badge refin-badge-${o.estado.includes('mora') ? 'mora' : 'dia'}">
                        ${o.estado.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  
                  <div class="refin-card-body">
                    <div class="refin-card-section">
                      <h5 class="refin-card-section-title">Cliente</h5>
                      <div class="refin-card-client">
                        <div class="refin-card-client-icon">👤</div>
                        <div class="refin-card-client-info">
                          <p class="refin-card-client-name">${o.clientes?.nombre || "[Sin nombre]"}</p>
                          <p class="refin-card-client-doc">${o.clientes?.documento || ""}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div class="refin-card-details">
                      <div class="refin-card-detail">
                        <span class="refin-card-detail-label">Capital</span>
                        <span class="refin-card-detail-value">${formatCurrency(o.capital)}</span>
                      </div>
                      <div class="refin-card-detail">
                        <span class="refin-card-detail-label">Cuotas</span>
                        <span class="refin-card-detail-value">${cuotasPagadas}/${totalCuotas}</span>
                      </div>
                    </div>
                    
                    <div class="refin-card-saldo-highlight">
                      <p class="refin-card-saldo-amount">${formatCurrency(saldoPendiente)}</p>
                      <p class="refin-card-saldo-label">Saldo Pendiente</p>
                    </div>
                  </div>
                  
                  <div class="refin-card-footer">
                    <div class="refin-card-actions">
                      <button 
                        type="button"
                        class="refin-btn-action refin-btn-secondary" 
                        onclick="verDetalleRefinanciacion(${o.id})">
                        <span>👁️</span>
                        <span>Ver</span>
                      </button>
                      <button 
                        type="button"
                        class="refin-btn-action" 
                        onclick="iniciarWizardRefinanciacion(${o.id})">
                        <span>🔄</span>
                        <span>Refinanciar</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    </div>
  `;
}

function filtrarRefinanciacion(campo, valor) {
  refinanciacionState.filtros[campo] = valor;
  renderRefinanciacionView();
}

// ========== DETALLE DE OBLIGACIÓN PARA REFINANCIACIÓN ==========
async function verDetalleRefinanciacion(obligacionId) {
  try {
    const obligacion = await obtenerObligacionPorId(obligacionId);
    if (!obligacion) {
      showToast("Obligación no encontrada", "error");
      return;
    }
    
    // Obtener árbol de refinanciación
    const arbol = await obtenerArbolRefinanciacion(obligacionId);
    
    const cuotasPagadas = obligacion.cuotas?.filter(c => c.estado === "pagada").length || 0;
    const cuotasVencidas = obligacion.cuotas?.filter(c => c.estado === "vencida").length || 0;
    const saldoPendiente = obligacion.cuotas
      ?.filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
      .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0) || 0;
    
    const totalPagado = obligacion.cuotas
      ?.filter(c => c.estado === "pagada")
      .reduce((sum, c) => sum + parseFloat(c.valor_cuota), 0) || 0;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    showModal(
      `Detalle de Obligación #${obligacion.id}`,
      `
        <div class="detail-card">
          <div class="detail-section">
            <h4>Información General</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Cliente</span>
                <span class="info-value">${obligacion.clientes?.nombre}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Documento</span>
                <span class="info-value">${obligacion.clientes?.documento}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Tipo</span>
                <span class="info-value">${obligacion.tipo === 'prestamo' ? 'Préstamo' : 'Producto'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Estado</span>
                <span class="info-value">
                  <span class="badge ${obligacion.estado.includes('mora') ? 'badge-danger' : 'badge-success'}">
                    ${obligacion.estado.replace(/_/g, " ")}
                  </span>
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Capital</span>
                <span class="info-value">${formatCurrency(obligacion.capital)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Gestión Admin</span>
                <span class="info-value">${formatCurrency(obligacion.gestion_admin || 0)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Frecuencia</span>
                <span class="info-value">${obligacion.frecuencia_dias} días</span>
              </div>
              <div class="info-item">
                <span class="info-label">Fecha Inicio</span>
                <span class="info-value">${formatDate(obligacion.fecha_inicio)}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h4>Resumen Financiero</h4>
            <div class="summary-cards">
              <div class="summary-card">
                <div class="summary-label">Cuotas Pagadas</div>
                <div class="summary-value">${cuotasPagadas} / ${obligacion.cuotas?.length || 0}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Total Pagado</div>
                <div class="summary-value">${formatCurrency(totalPagado)}</div>
              </div>
              <div class="summary-card highlight">
                <div class="summary-label">Saldo Pendiente</div>
                <div class="summary-value">${formatCurrency(saldoPendiente)}</div>
              </div>
              <div class="summary-card ${cuotasVencidas > 0 ? 'danger' : ''}">
                <div class="summary-label">Cuotas Vencidas</div>
                <div class="summary-value">${cuotasVencidas}</div>
              </div>
            </div>
          </div>
          
          ${arbol && (arbol.padre || arbol.hijas.length > 0) ? `
            <div class="detail-section">
              <h4>Árbol de Refinanciación</h4>
              <div class="refinancing-tree">
                ${arbol.padre ? `
                  <div class="tree-item tree-parent">
                    <strong>📄 Obligación Padre:</strong> #${arbol.padre.id} - 
                    ${arbol.padre.estado} (${formatCurrency(arbol.padre.capital)})
                  </div>
                ` : ''}
                
                <div class="tree-item tree-current">
                  <strong>📌 Actual:</strong> #${obligacion.id}
                </div>
                
                ${arbol.hijas.length > 0 ? `
                  <div class="tree-children">
                    <strong>Refinanciaciones de esta obligación:</strong>
                    ${arbol.hijas.map(h => `
                      <div class="tree-item tree-child">
                        🔄 #${h.id} - ${h.estado} (${formatCurrency(h.capital)}) - ${formatDate(h.fecha_inicio)}
                      </div>
                    `).join("")}
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
          
          <div class="detail-section">
            <h4>Plan de Pagos</h4>
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vencimiento</th>
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  ${obligacion.cuotas?.map(c => {
                    const venc = new Date(c.fecha_vencimiento);
                    const diasMora = c.estado !== 'pagada' && venc < hoy ? 
                      Math.floor((hoy - venc) / (1000 * 60 * 60 * 24)) : 0;
                    
                    return `
                      <tr>
                        <td>${c.numero}</td>
                        <td>${formatDate(c.fecha_vencimiento)}</td>
                        <td>${formatCurrency(c.valor_cuota)}</td>
                        <td>${formatCurrency(c.saldo_pendiente ?? c.valor_cuota)}</td>
                        <td>
                          <span class="badge ${
                            c.estado === 'pagada' ? 'badge-success' : 
                            c.estado === 'vencida' || diasMora > 0 ? 'badge-danger' : 
                            'badge-neutral'
                          }">
                            ${c.estado}${diasMora > 0 ? ` (${diasMora}d)` : ''}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join("") || '<tr><td colspan="5">Sin cuotas</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="hideModal(); iniciarWizardRefinanciacion(${obligacionId})">
          🔄 Refinanciar
        </button>
      `
    );
    
  } catch (error) {
    Logger.error("Error al ver detalle:", error);
    showToast("Error al cargar detalle", "error");
  }
}

// ========== WIZARD DE REFINANCIACIÓN ==========
let wizardRefinanciacion = {
  obligacionOriginal: null,
  paso: 1,
  datos: {
    saldoBase: 0,
    incluirPenalidad: false,
    penalidad: 0,
    condonacion: 0,
    saldoFinal: 0,
    fecha_inicio: null,
    fecha_primer_pago: null,
    frecuencia_dias: 30,
    num_cuotas: 0,
    capital: 0,
    gestion_admin: 0,
    valor_cuota: 0,
    motivo: ""
  }
};

async function iniciarWizardRefinanciacion(obligacionId) {
  try {
    const obligacion = await obtenerObligacionPorId(obligacionId);
    if (!obligacion) {
      showToast("Obligación no encontrada", "error");
      return;
    }
    
    // Validaciones previas
    if (obligacion.estado === "cancelada") {
      showToast("No se puede refinanciar una obligación cancelada", "warning");
      return;
    }
    
    if (obligacion.estado === "refinanciada") {
      const confirmar = confirm("Esta obligación ya fue refinanciada. ¿Desea refinanciarla nuevamente?");
      if (!confirmar) return;
    }
    
    // Calcular saldo pendiente
    const saldoPendiente = obligacion.cuotas
      ?.filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
      .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0) || 0;
    
    if (saldoPendiente <= 0) {
      showToast("Esta obligación no tiene saldo pendiente para refinanciar", "warning");
      return;
    }
    
    // Calcular penalidad estimada
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    let penalidadTotal = 0;
    
    obligacion.cuotas?.forEach(c => {
      if (c.estado !== 'pagada' && c.estado !== 'refinanciada') {
        const venc = new Date(c.fecha_vencimiento);
        venc.setHours(0, 0, 0, 0);
        if (venc < hoy) {
          const diasMora = Math.floor((hoy - venc) / (1000 * 60 * 60 * 24));
          if (diasMora > 0) {
            penalidadTotal += diasMora * (CONFIG?.PENALIDAD_DIARIA || 5000);
          }
        }
      }
    });
    
    // Inicializar wizard
    wizardRefinanciacion = {
      obligacionOriginal: obligacion,
      paso: 1,
      datos: {
        saldoBase: saldoPendiente,
        incluirPenalidad: false,
        penalidad: penalidadTotal,
        condonacion: 0,
        saldoFinal: saldoPendiente,
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_primer_pago: null,
        frecuencia_dias: obligacion.frecuencia_dias || 30,
        num_cuotas: 0,
        capital: saldoPendiente,
        gestion_admin: 0,
        valor_cuota: 0,
        motivo: ""
      }
    };
    
    renderWizardRefinanciacion();
    
  } catch (error) {
    Logger.error("Error al iniciar wizard:", error);
    showToast("Error al iniciar refinanciación", "error");
  }
}

function renderWizardRefinanciacion() {
  const { paso, obligacionOriginal, datos } = wizardRefinanciacion;
  
  let contenido = "";
  let footer = "";
  
  if (paso === 1) {
    // PASO 1: Diagnóstico
    contenido = `
      <div class="refin-wizard-step">
        <div class="refin-wizard-header">
          <h3>Paso 1: Diagnóstico de la Obligación</h3>
          <p>Revisa el estado actual y el saldo a refinanciar</p>
        </div>
        
        <div class="refin-info-banner">
          <strong>Cliente:</strong> ${obligacionOriginal.clientes?.nombre} <br>
          <strong>Obligación:</strong> #${obligacionOriginal.id} - ${obligacionOriginal.tipo === 'prestamo' ? 'Préstamo' : 'Producto'}
        </div>
        
        <div class="refin-summary-cards">
          <div class="refin-summary-card">
            <div class="refin-summary-label">Capital Original</div>
            <div class="refin-summary-value">${formatCurrency(obligacionOriginal.capital)}</div>
          </div>
          <div class="refin-summary-card">
            <div class="refin-summary-label">Cuotas Pagadas</div>
            <div class="refin-summary-value">${obligacionOriginal.cuotas?.filter(c => c.estado === 'pagada').length} / ${obligacionOriginal.cuotas?.length}</div>
          </div>
          <div class="refin-summary-card highlight">
            <div class="refin-summary-label">Saldo Pendiente</div>
            <div class="refin-summary-value">${formatCurrency(datos.saldoBase)}</div>
          </div>
          <div class="refin-summary-card ${datos.penalidad > 0 ? 'danger' : ''}">
            <div class="refin-summary-label">Penalidad Estimada</div>
            <div class="refin-summary-value">${formatCurrency(datos.penalidad)}</div>
          </div>
        </div>
        
        <div class="refin-form-group">
          <label class="refin-checkbox-label">
            <input 
              type="checkbox" 
              id="incluirPenalidad"
              ${datos.incluirPenalidad ? 'checked' : ''}
              onchange="toggleIncluirPenalidad(this.checked)"
            >
            <span>Incluir penalidad en el saldo a refinanciar</span>
          </label>
          <small>Si se activa, la penalidad será parte del nuevo capital</small>
        </div>
        
        <div class="refin-form-group">
          <label class="refin-form-label">Condonación / Descuento (opcional)</label>
          <input 
            type="number" 
            class="refin-form-input" 
            id="condonacion"
            value="${datos.condonacion}"
            min="0"
            max="${datos.saldoBase}"
            step="1000"
            oninput="calcularSaldoFinalRefinanciacion()"
            placeholder="Monto a perdonar"
          >
          <small>Monto que se reducirá del saldo pendiente</small>
        </div>
        
        <div class="refin-result-box">
          <strong>Saldo Final a Refinanciar:</strong>
          <div class="refin-result-value" id="saldoFinalDisplay">${formatCurrency(datos.saldoFinal)}</div>
        </div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="avanzarPasoRefinanciacion()">
        Siguiente →
      </button>
    `;
    
  } else if (paso === 2) {
    // PASO 2: Nuevo Plan
    contenido = `
      <div class="refin-wizard-step">
        <div class="refin-wizard-header">
          <h3>Paso 2: Definir Nuevo Plan de Pagos</h3>
          <p>Configura las condiciones de la nueva obligación</p>
        </div>
        
        <div class="refin-result-box">
          <strong>Monto a Refinanciar:</strong>
          <div class="refin-result-value">${formatCurrency(datos.saldoFinal)}</div>
        </div>
        
        <div class="refin-form-grid grid-2">
          <div class="refin-form-group">
            <label class="refin-form-label">Fecha de Inicio</label>
            <input 
              type="date" 
              class="refin-form-input" 
              id="fechaInicioRef"
              value="${datos.fecha_inicio}"
              onchange="actualizarFechaInicioRef(this.value)"
            >
          </div>
          
          <div class="refin-form-group">
            <label class="refin-form-label">Fecha Primer Pago</label>
            <input 
              type="date" 
              class="refin-form-input" 
              id="fechaPrimerPagoRef"
              value="${datos.fecha_primer_pago || ''}"
              onchange="actualizarFechaPrimerPagoRef(this.value)"
            >
          </div>
          
          <div class="refin-form-group">
            <label class="refin-form-label">Frecuencia (días)</label>
            <select class="refin-form-select" id="frecuenciaRef" onchange="actualizarFrecuenciaRef(this.value)">
              <option value="15" ${datos.frecuencia_dias === 15 ? 'selected' : ''}>Quincenal (15 días)</option>
              <option value="30" ${datos.frecuencia_dias === 30 ? 'selected' : ''}>Mensual (30 días)</option>
            </select>
          </div>
          
          <div class="refin-form-group">
            <label class="refin-form-label">Número de Cuotas</label>
            <input 
              type="number" 
              class="refin-form-input" 
              id="numCuotasRef"
              value="${datos.num_cuotas}"
              min="1"
              max="60"
              onchange="calcularValorCuotaRef()"
            >
          </div>
          
          <div class="refin-form-group">
            <label class="refin-form-label">Capital (Editable)</label>
            <input 
              type="number" 
              class="refin-form-input" 
              id="capitalRef"
              value="${datos.capital}"
              step="1000"
              onchange="calcularValorCuotaRef()"
            >
            <small>Por defecto es el saldo a refinanciar</small>
          </div>
          
          <div class="refin-form-group">
            <label class="refin-form-label">Gestión Admin</label>
            <input 
              type="number" 
              class="refin-form-input" 
              id="gestionAdminRef"
              value="${datos.gestion_admin}"
              min="0"
              step="1000"
              onchange="calcularValorCuotaRef()"
              placeholder="0"
            >
          </div>
        </div>
        
        <div class="refin-result-box">
          <strong>Valor de cada Cuota:</strong>
          <div class="refin-result-value" id="valorCuotaDisplay">${datos.valor_cuota > 0 ? formatCurrency(datos.valor_cuota) : '-'}</div>
        </div>
        
        <div class="refin-form-group">
          <label class="refin-form-label">Motivo de la Refinanciación (obligatorio)</label>
          <textarea 
            class="refin-form-textarea" 
            id="motivoRef"
            rows="3"
            placeholder="Describe el motivo de la refinanciación..."
          >${datos.motivo}</textarea>
        </div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="retrocederPasoRefinanciacion()">← Atrás</button>
      <button type="button" class="btn btn-primary" onclick="avanzarPasoRefinanciacion()">
        Siguiente →
      </button>
    `;
    
  } else if (paso === 3) {
    // PASO 3: Confirmación
    contenido = `
      <div class="refin-wizard-step">
        <div class="refin-wizard-header">
          <h3>Paso 3: Confirmación Final</h3>
          <p>Revisa cuidadosamente antes de confirmar</p>
        </div>
        
        <div class="refin-confirmation-summary">
          <div class="refin-confirmation-section">
            <h4>📄 Obligación Original</h4>
            <div class="refin-info-grid">
              <div class="refin-info-item">
                <span class="refin-info-label">ID</span>
                <span class="refin-info-value">#${obligacionOriginal.id}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Saldo Pendiente</span>
                <span class="refin-info-value">${formatCurrency(datos.saldoBase)}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Estado Actual</span>
                <span class="refin-info-value">${obligacionOriginal.estado}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Cuotas Afectadas</span>
                <span class="refin-info-value">${obligacionOriginal.cuotas?.filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada').length || 0}</span>
              </div>
            </div>
          </div>
          
          <div class="refin-confirmation-section highlight">
            <h4>✨ Nueva Obligación</h4>
            <div class="refin-info-grid">
              <div class="refin-info-item">
                <span class="refin-info-label">Capital</span>
                <span class="refin-info-value">${formatCurrency(datos.capital)}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Gestión Admin</span>
                <span class="refin-info-value">${formatCurrency(datos.gestion_admin)}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Total a Financiar</span>
                <span class="refin-info-value"><strong>${formatCurrency(datos.capital + datos.gestion_admin)}</strong></span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Número de Cuotas</span>
                <span class="refin-info-value">${datos.num_cuotas}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Valor Cuota</span>
                <span class="refin-info-value"><strong>${formatCurrency(datos.valor_cuota)}</strong></span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Frecuencia</span>
                <span class="refin-info-value">${datos.frecuencia_dias} días</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Fecha Inicio</span>
                <span class="refin-info-value">${formatDate(datos.fecha_inicio)}</span>
              </div>
              <div class="refin-info-item">
                <span class="refin-info-label">Primer Pago</span>
                <span class="refin-info-value">${formatDate(datos.fecha_primer_pago)}</span>
              </div>
            </div>
          </div>
          
          ${datos.condonacion > 0 || datos.incluirPenalidad ? `
            <div class="refin-confirmation-section">
              <h4>💰 Ajustes Aplicados</h4>
              <ul style="margin: 0; padding-left: 1.5rem;">
                ${datos.incluirPenalidad ? `<li>Penalidad incluida: ${formatCurrency(datos.penalidad)}</li>` : ''}
                ${datos.condonacion > 0 ? `<li>Condonación aplicada: ${formatCurrency(datos.condonacion)}</li>` : ''}
              </ul>
            </div>
          ` : ''}
          
          <div class="refin-confirmation-section">
            <h4>📝 Motivo</h4>
            <p style="margin: 0; padding: 0.75rem; background: var(--gray-50); border-radius: 6px;">
              ${datos.motivo || "[Sin motivo]"}
            </p>
          </div>
          
          <div class="refin-alert-warning">
            <strong>⚠️ Importante:</strong> Al confirmar, la obligación original cambiará a estado "refinanciada" 
            y sus cuotas pendientes quedarán marcadas como "refinanciada". Esta acción quedará registrada en auditoría.
          </div>
        </div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="retrocederPasoRefinanciacion()">← Atrás</button>
      <button type="button" class="btn btn-primary" onclick="ejecutarRefinanciacion()" id="btnConfirmarRef">
        ✅ Confirmar Refinanciación
      </button>
    `;
  }
  
  showModal(
    `Refinanciar Obligación #${obligacionOriginal.id} - Paso ${paso}/3`,
    contenido,
    footer
  );
  
  // Re-calcular saldo final en paso 1
  if (paso === 1) {
    calcularSaldoFinalRefinanciacion();
  }
}

// Funciones auxiliares del wizard
function toggleIncluirPenalidad(checked) {
  wizardRefinanciacion.datos.incluirPenalidad = checked;
  calcularSaldoFinalRefinanciacion();
}

function calcularSaldoFinalRefinanciacion() {
  const { saldoBase, penalidad, incluirPenalidad } = wizardRefinanciacion.datos;
  const condonacionInput = document.getElementById('condonacion');
  const condonacion = condonacionInput ? parseFloat(condonacionInput.value) || 0 : 0;
  
  wizardRefinanciacion.datos.condonacion = condonacion;
  
  let saldoFinal = saldoBase;
  if (incluirPenalidad) {
    saldoFinal += penalidad;
  }
  saldoFinal -= condonacion;
  saldoFinal = Math.max(0, saldoFinal);
  
  wizardRefinanciacion.datos.saldoFinal = saldoFinal;
  wizardRefinanciacion.datos.capital = saldoFinal;
  
  const display = document.getElementById('saldoFinalDisplay');
  if (display) {
    display.textContent = formatCurrency(saldoFinal);
  }
}

function actualizarFechaInicioRef(fecha) {
  wizardRefinanciacion.datos.fecha_inicio = fecha;
}

function actualizarFechaPrimerPagoRef(fecha) {
  wizardRefinanciacion.datos.fecha_primer_pago = fecha;
}

function actualizarFrecuenciaRef(valor) {
  wizardRefinanciacion.datos.frecuencia_dias = parseInt(valor);
}

function calcularValorCuotaRef() {
  const numCuotasInput = document.getElementById('numCuotasRef');
  const capitalInput = document.getElementById('capitalRef');
  const gestionInput = document.getElementById('gestionAdminRef');
  
  const numCuotas = numCuotasInput ? parseInt(numCuotasInput.value) || 0 : 0;
  const capital = capitalInput ? parseFloat(capitalInput.value) || 0 : 0;
  const gestion = gestionInput ? parseFloat(gestionInput.value) || 0 : 0;
  
  wizardRefinanciacion.datos.num_cuotas = numCuotas;
  wizardRefinanciacion.datos.capital = capital;
  wizardRefinanciacion.datos.gestion_admin = gestion;
  
  if (numCuotas > 0) {
    const valorCuota = (capital + gestion) / numCuotas;
    wizardRefinanciacion.datos.valor_cuota = valorCuota;
    
    const display = document.getElementById('valorCuotaDisplay');
    if (display) {
      display.textContent = formatCurrency(valorCuota);
    }
  }
}

function avanzarPasoRefinanciacion() {
  const { paso, datos } = wizardRefinanciacion;
  
  if (paso === 1) {
    if (datos.saldoFinal <= 0) {
      showToast("El saldo final debe ser mayor a cero", "warning");
      return;
    }
    wizardRefinanciacion.paso = 2;
    renderWizardRefinanciacion();
    
  } else if (paso === 2) {
    // Validaciones
    const motivo = document.getElementById('motivoRef')?.value.trim();
    
    if (!datos.fecha_inicio) {
      showToast("Ingresa la fecha de inicio", "warning");
      return;
    }
    
    if (!datos.fecha_primer_pago) {
      showToast("Ingresa la fecha del primer pago", "warning");
      return;
    }
    
    if (datos.num_cuotas < 1) {
      showToast("Ingresa el número de cuotas (mínimo 1)", "warning");
      return;
    }
    
    if (datos.capital <= 0) {
      showToast("El capital debe ser mayor a cero", "warning");
      return;
    }
    
    if (!motivo) {
      showToast("Ingresa el motivo de la refinanciación", "warning");
      return;
    }
    
    wizardRefinanciacion.datos.motivo = motivo;
    wizardRefinanciacion.paso = 3;
    renderWizardRefinanciacion();
  }
}

function retrocederPasoRefinanciacion() {
  if (wizardRefinanciacion.paso > 1) {
    wizardRefinanciacion.paso--;
    renderWizardRefinanciacion();
  }
}

async function ejecutarRefinanciacion() {
  const btnConfirmar = document.getElementById('btnConfirmarRef');
  if (btnConfirmar) {
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Procesando...';
  }
  
  try {
    const { obligacionOriginal, datos } = wizardRefinanciacion;
    
    // 1. Crear nueva obligación
    const descripcion = `Refinanciación de obligación #${obligacionOriginal.id}. ${datos.motivo}`;
    
    const nuevaObligacion = {
      cliente_id: obligacionOriginal.cliente_id,
      tipo: obligacionOriginal.tipo,
      fecha_inicio: datos.fecha_inicio,
      capital: datos.capital,
      gestion_admin: datos.gestion_admin || 0,
      frecuencia_dias: datos.frecuencia_dias,
      num_cuotas: datos.num_cuotas,
      fecha_primer_pago: datos.fecha_primer_pago,
      estado: 'vigente_al_dia',
      descripcion: descripcion,
      obligacion_padre_id: obligacionOriginal.id
    };
    
    const resultObligacion = await crearObligacion(nuevaObligacion);
    
    if (!resultObligacion.success) {
      throw new Error(resultObligacion.error);
    }
    
    const nuevaOblId = resultObligacion.data.id;
    
    // 2. Crear cuotas de la nueva obligación
    const cuotasNuevas = [];
    let fechaVencimiento = new Date(datos.fecha_primer_pago);
    
    for (let i = 1; i <= datos.num_cuotas; i++) {
      cuotasNuevas.push({
        obligacion_id: nuevaOblId,
        numero: i,
        fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
        valor_cuota: datos.valor_cuota,
        estado: 'pendiente',
        saldo_pendiente: datos.valor_cuota
      });
      
      fechaVencimiento.setDate(fechaVencimiento.getDate() + datos.frecuencia_dias);
    }
    
    const resultCuotas = await crearCuotas(cuotasNuevas);
    
    if (!resultCuotas.success) {
      throw new Error("Error al crear cuotas: " + resultCuotas.error);
    }
    
    // 3. Actualizar obligación original a 'refinanciada'
    await actualizarObligacion(obligacionOriginal.id, {
      estado: 'refinanciada'
    });
    
    // 4. Marcar cuotas pendientes como 'refinanciada'
    const cuotasPendientesIds = obligacionOriginal.cuotas
      ?.filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
      .map(c => c.id) || [];
    
    if (cuotasPendientesIds.length > 0) {
      await actualizarCuotasEnBloque(cuotasPendientesIds, {
        estado: 'refinanciada'
      });
    }
    
    // 5. Registrar auditoría
    await registrarAuditoria({
      admin_user: currentUser?.username || "admin",
      accion: "refinanciar",
      entidad: "obligacion",
      entidad_id: obligacionOriginal.id,
      detalle_json: {
        obligacion_original_id: obligacionOriginal.id,
        nueva_obligacion_id: nuevaOblId,
        saldo_base: datos.saldoBase,
        incluir_penalidad: datos.incluirPenalidad,
        penalidad: datos.penalidad,
        condonacion: datos.condonacion,
        saldo_final_refinanciado: datos.saldoFinal,
        capital_nuevo: datos.capital,
        gestion_admin: datos.gestion_admin,
        num_cuotas: datos.num_cuotas,
        valor_cuota: datos.valor_cuota,
        motivo: datos.motivo,
        cuotas_afectadas: cuotasPendientesIds.length
      }
    });
    
    // 6. Mostrar éxito
    hideModal();
    showToast("✅ Refinanciación exitosa", "success");
    
    // 7. Recargar vista
    setTimeout(() => {
      loadRefinanciacion();
    }, 1000);
    
  } catch (error) {
    Logger.error("Error al ejecutar refinanciación:", error);
    showToast(`Error: ${error.message}`, "error");
    
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = '✅ Confirmar Refinanciación';
    }
  }
}

// ========================================
// MÓDULO DE DESCUENTOS - IMPLEMENTACIÓN COMPLETA  
// ========================================

// Estado global del módulo
let descuentosState = {
  descuentos: [],
  filtros: {
    cliente_id: null,
    obligacion_id: null,
    aplica_a: "",
    fecha_desde: "",
    fecha_hasta: ""
  }
};

// ========== DESCUENTOS: PANTALLA PRINCIPAL ==========
async function loadDescuentos() {
  const container = document.getElementById("viewDescuentos");
  showLoading(container, "Cargando descuentos...");
  
  try {
    // Cargar descuentos
    const descuentos = await obtenerDescuentos();
    descuentosState.descuentos = descuentos;
    
    renderDescuentosView();
    
  } catch (error) {
    Logger.error("Error al cargar descuentos:", error);
    container.innerHTML = `
      <div class="desc-container">
        <div class="desc-info-banner warning">
          <strong>⚠️ Error:</strong> No se pudieron cargar los descuentos. ${error.message}
        </div>
      </div>
    `;
  }
}

function renderDescuentosView() {
  const container = document.getElementById("viewDescuentos");
  const descuentos = descuentosState.descuentos;
  const { aplica_a, fecha_desde, fecha_hasta } = descuentosState.filtros;
  
  // Aplicar filtros
  let descuentosFiltrados = descuentos.filter(d => {
    if (aplica_a && d.aplica_a !== aplica_a) return false;
    
    if (fecha_desde) {
      const fechaDescuento = new Date(d.created_at);
      const fechaFiltro = new Date(fecha_desde);
      if (fechaDescuento < fechaFiltro) return false;
    }
    
    if (fecha_hasta) {
      const fechaDescuento = new Date(d.created_at);
      const fechaFiltro = new Date(fecha_hasta);
      fechaFiltro.setHours(23, 59, 59, 999);
      if (fechaDescuento > fechaFiltro) return false;
    }
    
    return true;
  });
  
  container.innerHTML = `
    <div class="desc-container">
      <!-- Header -->
      <div class="desc-header">
        <div class="desc-header-content">
          <h2 class="desc-header-title">Descuentos y Ajustes</h2>
          <p class="desc-header-subtitle">Gestiona descuentos aplicados a cuotas, totales y penalidades</p>
        </div>
        <div class="desc-header-actions">
          <button type="button" class="btn btn-primary" onclick="mostrarFormularioDescuento()">
            <span>🏷️</span>
            <span>Aplicar Descuento</span>
          </button>
        </div>
      </div>
      
      <!-- Filters -->
      <div class="desc-filters">
        <div class="desc-filters-header">
          <h3 class="desc-filters-title">
            <span>🔍</span>
            <span>Filtros</span>
          </h3>
        </div>
        <div class="desc-filters-grid">
          <div class="desc-filter-group">
            <label class="desc-filter-label">Tipo de Aplicación</label>
            <select class="desc-filter-select" id="filtroAplicaA" onchange="filtrarDescuentos('aplica_a', this.value)">
              <option value="">Todos los tipos</option>
              <option value="cuota" ${aplica_a === 'cuota' ? 'selected' : ''}>Descuento a Cuota</option>
              <option value="total" ${aplica_a === 'total' ? 'selected' : ''}>Descuento Total</option>
              <option value="penalidad" ${aplica_a === 'penalidad' ? 'selected' : ''}>Descuento a Penalidad</option>
            </select>
          </div>
          
          <div class="desc-filter-group">
            <label class="desc-filter-label">Fecha Desde</label>
            <input 
              type="date" 
              class="desc-filter-input" 
              id="filtroFechaDesde"
              value="${fecha_desde}"
              onchange="filtrarDescuentos('fecha_desde', this.value)"
            >
          </div>
          
          <div class="desc-filter-group">
            <label class="desc-filter-label">Fecha Hasta</label>
            <input 
              type="date" 
              class="desc-filter-input" 
              id="filtroFechaHasta"
              value="${fecha_hasta}"
              onchange="filtrarDescuentos('fecha_hasta', this.value)"
            >
          </div>
        </div>
      </div>
      
      <!-- Data Section -->
      <div class="desc-data-section">
        ${descuentosFiltrados.length === 0 ? `
          <div class="desc-empty">
            <div class="desc-empty-icon">🏷️</div>
            <p class="desc-empty-title">No hay descuentos registrados</p>
            <p class="desc-empty-text">
              ${aplica_a || fecha_desde || fecha_hasta ? 
                'No se encontraron resultados con los filtros aplicados.' : 
                'Comienza aplicando un descuento a una obligación.'}
            </p>
          </div>
        ` : `
          <!-- Desktop: Table View -->
          <div class="desc-table-wrapper">
            <table class="desc-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Obligación</th>
                  <th>Cuota</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Aplica a</th>
                  <th>Motivo</th>
                  <th>Admin</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${descuentosFiltrados.map(d => {
                  const clienteNombre = d.obligaciones?.clientes?.nombre || "[Sin cliente]";
                  const clienteDoc = d.obligaciones?.clientes?.documento || "";
                  
                  return `
                    <tr>
                      <td>${formatDateTime(d.created_at)}</td>
                      <td>
                        <div>${clienteNombre}</div>
                        <small style="color: var(--gray-600);">${clienteDoc}</small>
                      </td>
                      <td>#${d.obligacion_id}</td>
                      <td>${d.cuota_id ? `Cuota ${d.cuotas?.numero || d.cuota_id}` : '-'}</td>
                      <td>
                        <span class="desc-badge desc-badge-tipo-${d.tipo}">
                          ${d.tipo === 'fijo' ? 'Fijo' : 'Porcentaje'}
                        </span>
                      </td>
                      <td><strong>${d.tipo === 'fijo' ? formatCurrency(d.valor) : d.valor + '%'}</strong></td>
                      <td>
                        <span class="desc-badge desc-badge-aplica-${d.aplica_a}">
                          ${d.aplica_a === 'cuota' ? 'Cuota' : d.aplica_a === 'total' ? 'Total' : 'Penalidad'}
                        </span>
                      </td>
                      <td>
                        <div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.motivo || ''}">
                          ${d.motivo || '-'}
                        </div>
                      </td>
                      <td>${d.admin_user || '-'}</td>
                      <td>
                        <button 
                          type="button"
                          class="desc-btn-action desc-btn-secondary" 
                          onclick="verDetalleDescuento(${d.id})"
                          title="Ver detalle">
                          👁️
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
          
          <!-- Mobile: Cards View -->
          <div class="desc-cards">
            ${descuentosFiltrados.map(d => {
              const clienteNombre = d.obligaciones?.clientes?.nombre || "[Sin cliente]";
              const clienteDoc = d.obligaciones?.clientes?.documento || "";
              
              return `
                <div class="desc-card">
                  <div class="desc-card-header">
                    <div class="desc-card-header-left">
                      <div class="desc-card-id">
                        <span>📅</span>
                        <span>${formatDateTime(d.created_at)}</span>
                      </div>
                      <h4 class="desc-card-date">Obligación #${d.obligacion_id}</h4>
                    </div>
                    <div class="desc-card-badges">
                      <span class="desc-badge desc-badge-tipo-${d.tipo}">
                        ${d.tipo === 'fijo' ? 'Fijo' : 'Porcentaje'}
                      </span>
                      <span class="desc-badge desc-badge-aplica-${d.aplica_a}">
                        ${d.aplica_a === 'cuota' ? 'Cuota' : d.aplica_a === 'total' ? 'Total' : 'Penalidad'}
                      </span>
                    </div>
                  </div>
                  
                  <div class="desc-card-body">
                    <div class="desc-card-section">
                      <h5 class="desc-card-section-title">Cliente</h5>
                      <div class="desc-card-client">
                        <div class="desc-card-client-icon">👤</div>
                        <div class="desc-card-client-info">
                          <p class="desc-card-client-name">${clienteNombre}</p>
                          <p class="desc-card-client-doc">${clienteDoc}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div class="desc-card-details">
                      ${d.cuota_id ? `
                        <div class="desc-card-detail">
                          <span class="desc-card-detail-label">Cuota</span>
                          <span class="desc-card-detail-value">Cuota ${d.cuotas?.numero || d.cuota_id}</span>
                        </div>
                      ` : ''}
                      <div class="desc-card-detail">
                        <span class="desc-card-detail-label">Tipo</span>
                        <span class="desc-card-detail-value">${d.tipo === 'fijo' ? 'Monto Fijo' : 'Porcentaje'}</span>
                      </div>
                    </div>
                    
                    <div class="desc-card-value-highlight">
                      <p class="desc-card-value-amount">${d.tipo === 'fijo' ? formatCurrency(d.valor) : d.valor + '%'}</p>
                      <p class="desc-card-value-label">Valor del Descuento</p>
                    </div>
                    
                    ${d.motivo ? `
                      <div class="desc-card-section">
                        <h5 class="desc-card-section-title">Motivo</h5>
                        <div class="desc-card-motivo">${d.motivo}</div>
                      </div>
                    ` : ''}
                  </div>
                  
                  <div class="desc-card-footer">
                    <div class="desc-card-admin">
                      <span>👨‍💼</span>
                      <span>${d.admin_user || 'Administrador'}</span>
                    </div>
                    <div class="desc-card-actions">
                      <button 
                        type="button"
                        class="desc-btn-action" 
                        onclick="verDetalleDescuento(${d.id})">
                        <span>👁️</span>
                        <span>Ver Detalle</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    </div>
  `;
}

function filtrarDescuentos(campo, valor) {
  descuentosState.filtros[campo] = valor;
  renderDescuentosView();
}

async function verDetalleDescuento(descuentoId) {
  try {
    const descuento = descuentosState.descuentos.find(d => d.id === descuentoId);
    
    if (!descuento) {
      showToast("Descuento no encontrado", "error");
      return;
    }
    
    const clienteNombre = descuento.obligaciones?.clientes?.nombre || "[Sin nombre]";
    const clienteDoc = descuento.obligaciones?.clientes?.documento || "";
    
    showModal(
      `Detalle de Descuento #${descuento.id}`,
      `
        <div class="detail-card">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Fecha de Aplicación</span>
              <span class="info-value">${formatDateTime(descuento.created_at)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Cliente</span>
              <span class="info-value">${clienteNombre} (${clienteDoc})</span>
            </div>
            <div class="info-item">
              <span class="info-label">Obligación</span>
              <span class="info-value">#${descuento.obligacion_id}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Cuota</span>
              <span class="info-value">${descuento.cuota_id ? `Cuota ${descuento.cuotas?.numero || descuento.cuota_id}` : 'N/A (descuento total)'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Tipo</span>
              <span class="info-value">
                <span class="badge ${descuento.tipo === 'fijo' ? 'badge-info' : 'badge-primary'}">
                  ${descuento.tipo === 'fijo' ? 'Fijo' : 'Porcentaje'}
                </span>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">Valor</span>
              <span class="info-value"><strong>${descuento.tipo === 'fijo' ? formatCurrency(descuento.valor) : descuento.valor + '%'}</strong></span>
            </div>
            <div class="info-item">
              <span class="info-label">Aplica a</span>
              <span class="info-value">
                <span class="badge badge-neutral">
                  ${descuento.aplica_a === 'cuota' ? 'Cuota específica' : descuento.aplica_a === 'total' ? 'Total distribuido' : 'Penalidad'}
                </span>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">Administrador</span>
              <span class="info-value">${descuento.admin_user || '-'}</span>
            </div>
          </div>
          
          <div style="margin-top: 1.5rem;">
            <h4>Motivo</h4>
            <p style="padding: 0.75rem; background: var(--gray-50); border-radius: 6px; margin: 0.5rem 0 0 0;">
              ${descuento.motivo || "[Sin motivo especificado]"}
            </p>
          </div>
        </div>
      `,
      `
        <button class="btn btn-secondary" onclick="hideModal()">Cerrar</button>
      `
    );
    
  } catch (error) {
    Logger.error("Error al ver detalle descuento:", error);
    showToast("Error al cargar detalle", "error");
  }
}

// ========== WIZARD DE DESCUENTO ==========
let wizardDescuento = {
  paso: 1,
  cliente: null,
  obligacion: null,
  cuota: null,
  datos: {
    aplica_a: "",
    tipo: "fijo",
    valor: 0,
    motivo: ""
  }
};

function mostrarFormularioDescuento() {
  wizardDescuento = {
    paso: 1,
    cliente: null,
    obligacion: null,
    cuota: null,
    datos: {
      aplica_a: "",
      tipo: "fijo",
      valor: 0,
      motivo: ""
    }
  };
  
  renderWizardDescuento();
}

function renderWizardDescuento() {
  const { paso, cliente, obligacion, cuota, datos } = wizardDescuento;
  
  let contenido = "";
  let footer = "";
  
  if (paso === 1) {
    // PASO 1: Seleccionar Cliente
    contenido = `
      <div class="desc-wizard-step">
        <div class="desc-wizard-header">
          <h3 class="desc-wizard-title">
            <span>👤</span>
            <span>Paso 1: Seleccionar Cliente</span>
          </h3>
          <p class="desc-wizard-subtitle">Busca al cliente al que aplicarás el descuento</p>
        </div>
        
        ${cliente ? `
          <div class="desc-selected-card">
            <div class="desc-selected-header">
              <div class="desc-selected-info">
                <div class="desc-selected-label">Cliente seleccionado</div>
                <div class="desc-selected-name">${cliente.nombre}</div>
                <div class="desc-selected-meta">
                  ${cliente.tipo_documento}: ${cliente.documento}
                </div>
              </div>
              <button type="button" class="desc-btn-change" onclick="limpiarSeleccionClienteDesc()">
                <span>🔄</span>
                <span>Cambiar</span>
              </button>
            </div>
          </div>
        ` : ''}
        
        <div class="desc-search-group">
          <label class="desc-search-label">Buscar cliente</label>
          <input 
            type="text" 
            class="desc-search-input" 
            id="buscarClienteDesc" 
            placeholder="Buscar por nombre, documento o teléfono..."
            oninput="buscarClientesParaDescuento(this.value)"
          >
        </div>
        
        <div id="resultadosBusquedaClienteDesc"></div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="avanzarPasoDescuento()" ${!cliente ? 'disabled' : ''}>
        Siguiente →
      </button>
    `;
    
  } else if (paso === 2) {
    // PASO 2: Seleccionar Obligación
    contenido = `
      <div class="desc-wizard-step">
        <div class="desc-wizard-header">
          <h3 class="desc-wizard-title">
            <span>📋</span>
            <span>Paso 2: Seleccionar Obligación</span>
          </h3>
          <p class="desc-wizard-subtitle">Elige la obligación del cliente</p>
        </div>
        
        <div class="desc-info-banner">
          <strong>Cliente:</strong> ${cliente.nombre}
        </div>
        
        <div id="listaObligacionesDesc">
          <div style="padding: var(--space-4);">
            <div class="desc-skeleton"></div>
          </div>
        </div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="retrocederPasoDescuento()">← Atrás</button>
      <button type="button" class="btn btn-primary" onclick="avanzarPasoDescuento()" ${!obligacion ? 'disabled' : ''}>
        Siguiente →
      </button>
    `;
    
    // Cargar obligaciones después de renderizar
    setTimeout(() => cargarObligacionesParaDescuento(), 100);
    
  } else if (paso === 3) {
    // PASO 3: Seleccionar tipo de aplicación
    contenido = `
      <div class="desc-wizard-step">
        <div class="desc-wizard-header">
          <h3 class="desc-wizard-title">
            <span>🎯</span>
            <span>Paso 3: ¿A qué deseas aplicar el descuento?</span>
          </h3>
          <p class="desc-wizard-subtitle">Selecciona el alcance del descuento</p>
        </div>
        
        <div class="desc-info-banner">
          <strong>Cliente:</strong> ${cliente.nombre} | <strong>Obligación:</strong> #${obligacion.id}
        </div>
        
        <div class="desc-tipo-grid">
          <div 
            class="desc-tipo-card ${datos.aplica_a === 'cuota' ? 'selected' : ''}" 
            onclick="seleccionarAplicaA('cuota')">
            <div class="desc-tipo-icon">📄</div>
            <strong>Cuota Específica</strong>
            <p>Aplica a una cuota en particular</p>
            <div class="desc-tipo-check">✓</div>
          </div>
          
          <div 
            class="desc-tipo-card ${datos.aplica_a === 'total' ? 'selected' : ''}" 
            onclick="seleccionarAplicaA('total')">
            <div class="desc-tipo-icon">📋</div>
            <strong>Total Distribuido</strong>
            <p>Distribuye en cuotas pendientes</p>
            <div class="desc-tipo-check">✓</div>
          </div>
          
          <div 
            class="desc-tipo-card ${datos.aplica_a === 'penalidad' ? 'selected' : ''}" 
            onclick="seleccionarAplicaA('penalidad')">
            <div class="desc-tipo-icon">⚠️</div>
            <strong>Penalidad</strong>
            <p>Reduce penalidad calculada</p>
            <div class="desc-tipo-check">✓</div>
          </div>
        </div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="retrocederPasoDescuento()">← Atrás</button>
      <button type="button" class="btn btn-primary" onclick="avanzarPasoDescuento()" ${!datos.aplica_a ? 'disabled' : ''}>
        Siguiente →
      </button>
    `;
    
  } else if (paso === 4) {
    // PASO 4: Seleccionar cuota (si aplica)
    if (datos.aplica_a === 'cuota') {
      contenido = `
        <div class="desc-wizard-step">
          <div class="desc-wizard-header">
            <h3 class="desc-wizard-title">
              <span>📄</span>
              <span>Paso 4: Seleccionar Cuota</span>
            </h3>
            <p class="desc-wizard-subtitle">Elige la cuota a la que aplicarás el descuento</p>
          </div>
          
          <div id="listaCuotasDesc">
            <div style="padding: var(--space-4);">
              <div class="desc-skeleton"></div>
            </div>
          </div>
        </div>
      `;
      
      footer = `
        <button type="button" class="btn btn-secondary" onclick="retrocederPasoDescuento()">← Atrás</button>
        <button type="button" class="btn btn-primary" onclick="avanzarPasoDescuento()" ${!cuota ? 'disabled' : ''}>
          Siguiente →
        </button>
      `;
      
      setTimeout(() => cargarCuotasParaDescuento(), 100);
    } else {
      // Saltar al paso 5
      avanzarPasoDescuento();
      return;
    }
    
  } else if (paso === 5) {
    // PASO 5: Definir descuento
    const saldoBase = cuota ? 
      parseFloat(cuota.saldo_pendiente ?? cuota.valor_cuota) :
      (obligacion.cuotas || [])
        .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
        .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0);
    
    contenido = `
      <div class="desc-wizard-step">
        <div class="desc-wizard-header">
          <h3 class="desc-wizard-title">
            <span>💰</span>
            <span>Paso 5: Definir Descuento</span>
          </h3>
          <p class="desc-wizard-subtitle">Configura el tipo y valor del descuento</p>
        </div>
        
        <div class="desc-summary-cards">
          <div class="desc-summary-card">
            <div class="desc-summary-label">Monto Base</div>
            <div class="desc-summary-value">${formatCurrency(saldoBase)}</div>
          </div>
          <div class="desc-summary-card highlight" id="descuentoCalculadoCard">
            <div class="desc-summary-label">Descuento</div>
            <div class="desc-summary-value" id="descuentoCalculadoValue">-</div>
          </div>
          <div class="desc-summary-card">
            <div class="desc-summary-label">Resultado Final</div>
            <div class="desc-summary-value" id="resultadoFinalValue">-</div>
          </div>
        </div>
        
        <div class="desc-form-grid grid-2">
          <div class="desc-form-group">
            <label class="desc-form-label">Tipo de Descuento</label>
            <select class="desc-form-select" id="tipoDescuento" onchange="calcularPreviewDescuento()">
              <option value="fijo">Monto Fijo ($)</option>
              <option value="porcentaje">Porcentaje (%)</option>
            </select>
          </div>
          
          <div class="desc-form-group">
            <label class="desc-form-label">Valor</label>
            <input 
              type="number" 
              class="desc-form-input" 
              id="valorDescuento"
              min="0"
              ${datos.tipo === 'fijo' ? `max="${saldoBase}"` : 'max="100"'}
              step="${datos.tipo === 'fijo' ? '1000' : '1'}"
              oninput="calcularPreviewDescuento()"
              placeholder="${datos.tipo === 'fijo' ? 'Ej: 50000' : 'Ej: 10'}"
            >
          </div>
        </div>
        
        <div class="desc-form-group">
          <label class="desc-form-label">Motivo (obligatorio)</label>
          <textarea 
            class="desc-form-textarea" 
            id="motivoDescuento"
            rows="3"
            placeholder="Describe el motivo del descuento..."
          ></textarea>
        </div>
      </div>
    `;
    
    footer = `
      <button type="button" class="btn btn-secondary" onclick="retrocederPasoDescuento()">← Atrás</button>
      <button type="button" class="btn btn-primary" onclick="confirmarAplicarDescuento()" id="btnAplicarDescuento">
        ✅ Aplicar Descuento
      </button>
    `;
    
    setTimeout(() => {
      // Configurar listeners
      calcularPreviewDescuento();
    }, 100);
  }
  
  showModal(
    `Aplicar Descuento - Paso ${paso}/${datos.aplica_a === 'cuota' ? '5' : '4'}`,
    contenido,
    footer
  );
}

// Funciones auxiliares del wizard
async function buscarClientesParaDescuento(termino) {
  const container = document.getElementById('resultadosBusquedaClienteDesc');
  
  if (!termino || termino.length < 2) {
    container.innerHTML = '';
    return;
  }
  
  try {
    const clientes = await buscarClientes(termino);
    
    if (clientes.length === 0) {
      container.innerHTML = `
        <div class="desc-empty">
          <div class="desc-empty-icon">🔍</div>
          <p class="desc-empty-text">No se encontraron clientes</p>
        </div>
      `;
      return;
    }
    
    // Guardar clientes en el estado para evitar problemas con onclick inline
    window._clientesDescuentoTemp = clientes;
    
    container.innerHTML = `
      <div class="desc-items-list">
        ${clientes.map((c, index) => `
          <div class="desc-item" onclick="seleccionarClienteDescPorIndex(${index})">
            <div class="desc-item-header">
              <span class="desc-item-title">${c.nombre}</span>
            </div>
            <div class="desc-item-meta">
              <span>${c.tipo_documento}: ${c.documento}</span>
              ${c.telefono ? `<span>📞 ${c.telefono}</span>` : ''}
            </div>
          </div>
        `).join("")}
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al buscar clientes:", error);
    container.innerHTML = `
      <div class="desc-info-banner warning">
        <strong>⚠️ Error:</strong> No se pudieron buscar los clientes.
      </div>
    `;
  }
}

function seleccionarClienteDescPorIndex(index) {
  if (!window._clientesDescuentoTemp || !window._clientesDescuentoTemp[index]) {
    console.error('Cliente no encontrado en índice:', index);
    return;
  }
  
  const cliente = window._clientesDescuentoTemp[index];
  wizardDescuento.cliente = {
    id: cliente.id,
    nombre: cliente.nombre,
    documento: cliente.documento,
    tipo_documento: cliente.tipo_documento
  };
  
  console.log('Cliente seleccionado:', wizardDescuento.cliente);
  renderWizardDescuento();
}

function seleccionarClienteDesc(id, nombre, documento, tipo_documento) {
  wizardDescuento.cliente = { 
    id: parseInt(id), 
    nombre, 
    documento, 
    tipo_documento 
  };
  console.log('Cliente seleccionado (método legacy):', wizardDescuento.cliente);
  renderWizardDescuento();
}

function limpiarSeleccionClienteDesc() {
  wizardDescuento.cliente = null;
  renderWizardDescuento();
}

async function cargarObligacionesParaDescuento() {
  const container = document.getElementById('listaObligacionesDesc');
  
  if (!container) {
    console.error('Container listaObligacionesDesc not found');
    return;
  }
  
  if (!wizardDescuento.cliente || !wizardDescuento.cliente.id) {
    console.error('No hay cliente seleccionado o falta el ID');
    container.innerHTML = `
      <div class="desc-info-banner warning">
        <strong>⚠️ Error:</strong> No se ha seleccionado un cliente válido
      </div>
    `;
    return;
  }
  
  try {
    console.log('Cargando obligaciones para cliente:', wizardDescuento.cliente.id);
    const obligaciones = await obtenerObligacionesCliente(wizardDescuento.cliente.id);
    console.log('Obligaciones obtenidas:', obligaciones);
    
    const obligacionesVigentes = obligaciones.filter(o => 
      o.estado === 'vigente_al_dia' || o.estado === 'vigente_en_mora'
    );
    
    if (obligacionesVigentes.length === 0) {
      container.innerHTML = `
        <div class="desc-empty">
          <div class="desc-empty-icon">📋</div>
          <p class="desc-empty-title">Sin obligaciones vigentes</p>
          <p class="desc-empty-text">Este cliente no tiene obligaciones activas.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="desc-items-list">
        ${obligacionesVigentes.map(o => {
          const saldoPendiente = (o.cuotas || [])
            .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
            .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0);
          
          return `
            <div class="desc-item ${wizardDescuento.obligacion?.id === o.id ? 'selected' : ''}" onclick="seleccionarObligacionDesc(${o.id})">
              <div class="desc-item-header">
                <span class="desc-item-title">
                  <strong>#${o.id}</strong> - ${o.tipo === 'prestamo' ? '💰 Préstamo' : '📱 Producto'}
                </span>
                <span class="desc-badge desc-badge-aplica-${o.estado.includes('mora') ? 'penalidad' : 'cuota'}">
                  ${o.estado.replace(/_/g, " ")}
                </span>
              </div>
              <div class="desc-item-meta">
                <span>Capital: ${formatCurrency(o.capital)}</span>
                <span>Saldo: ${formatCurrency(saldoPendiente)}</span>
                <span>Cuotas: ${o.cuotas?.filter(c => c.estado === 'pagada').length}/${o.cuotas?.length}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    
  } catch (error) {
    console.error("Error detallado al cargar obligaciones:", error);
    Logger.error("Error al cargar obligaciones:", error);
    container.innerHTML = `
      <div class="desc-info-banner warning">
        <strong>⚠️ Error:</strong> ${error.message || 'Error desconocido'}
      </div>
    `;
  }
}

async function seleccionarObligacionDesc(obligacionId) {
  try {
    const obligacion = await obtenerObligacionPorId(obligacionId);
    wizardDescuento.obligacion = obligacion;
    renderWizardDescuento();
  } catch (error) {
    Logger.error("Error al seleccionar obligación:", error);
    showToast("Error al cargar obligación", "error");
  }
}

function seleccionarAplicaA(tipo) {
  wizardDescuento.datos.aplica_a = tipo;
  renderWizardDescuento();
}

async function cargarCuotasParaDescuento() {
  const container = document.getElementById('listaCuotasDesc');
  const { obligacion } = wizardDescuento;
  
  try {
    const cuotasPendientes = (obligacion.cuotas || [])
      .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada');
    
    if (cuotasPendientes.length === 0) {
      container.innerHTML = `
        <div class="desc-empty">
          <div class="desc-empty-icon">✅</div>
          <p class="desc-empty-title">Todas las cuotas están pagadas</p>
          <p class="desc-empty-text">No hay cuotas pendientes para aplicar descuento.</p>
        </div>
      `;
      return;
    }
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    container.innerHTML = `
      <div class="desc-cuotas-table-wrapper">
        <table class="desc-cuotas-table">
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th>Vencimiento</th>
              <th>Valor</th>
              <th>Saldo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${cuotasPendientes.map(c => {
              const venc = new Date(c.fecha_vencimiento);
              venc.setHours(0, 0, 0, 0);
              const diasMora = venc < hoy ? Math.floor((hoy - venc) / (1000 * 60 * 60 * 24)) : 0;
              
              return `
                <tr 
                  class="${wizardDescuento.cuota?.id === c.id ? 'selected-row' : ''}" 
                  onclick="seleccionarCuotaDesc(${c.id})">
                  <td>
                    <input 
                      type="radio" 
                      name="cuotaSeleccionada" 
                      ${wizardDescuento.cuota?.id === c.id ? 'checked' : ''}
                      onchange="seleccionarCuotaDesc(${c.id})"
                    >
                  </td>
                  <td><strong>${c.numero}</strong></td>
                  <td>${formatDate(c.fecha_vencimiento)}</td>
                  <td>${formatCurrency(c.valor_cuota)}</td>
                  <td>${formatCurrency(c.saldo_pendiente ?? c.valor_cuota)}</td>
                  <td>
                    <span class="desc-badge ${c.estado === 'vencida' || diasMora > 0 ? 'desc-badge-aplica-penalidad' : 'desc-badge-aplica-cuota'}">
                      ${c.estado}${diasMora > 0 ? ` (${diasMora}d)` : ''}
                    </span>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al cargar cuotas:", error);
    container.innerHTML = `
      <div class="desc-info-banner warning">
        <strong>⚠️ Error:</strong> No se pudieron cargar las cuotas.
      </div>
    `;
  }
}

function seleccionarCuotaDesc(cuotaId) {
  const cuota = wizardDescuento.obligacion.cuotas.find(c => c.id === cuotaId);
  wizardDescuento.cuota = cuota;
  renderWizardDescuento();
}

function calcularPreviewDescuento() {
  const tipoSelect = document.getElementById('tipoDescuento');
  const valorInput = document.getElementById('valorDescuento');
  
  if (!tipoSelect || !valorInput) return;
  
  const tipo = tipoSelect.value;
  const valor = parseFloat(valorInput.value) || 0;
  
  wizardDescuento.datos.tipo = tipo;
  wizardDescuento.datos.valor = valor;
  
  // Calcular base
  const saldoBase = wizardDescuento.cuota ? 
    parseFloat(wizardDescuento.cuota.saldo_pendiente ?? wizardDescuento.cuota.valor_cuota) :
    (wizardDescuento.obligacion.cuotas || [])
      .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
      .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0);
  
  // Calcular descuento
  let descuento = 0;
  if (tipo === 'fijo') {
    descuento = Math.min(valor, saldoBase);
  } else if (tipo === 'porcentaje') {
    descuento = saldoBase * (valor / 100);
  }
  
  const resultado = Math.max(0, saldoBase - descuento);
  
  // Actualizar UI
  const descuentoDisplay = document.getElementById('descuentoCalculadoValue');
  const resultadoDisplay = document.getElementById('resultadoFinalValue');
  
  if (descuentoDisplay) {
    descuentoDisplay.textContent = formatCurrency(descuento);
  }
  
  if (resultadoDisplay) {
    resultadoDisplay.textContent = formatCurrency(resultado);
  }
}

function avanzarPasoDescuento() {
  const { paso, cliente, obligacion, datos } = wizardDescuento;
  
  if (paso === 1 && !cliente) {
    showToast("Selecciona un cliente", "warning");
    return;
  }
  
  if (paso === 2 && !obligacion) {
    showToast("Selecciona una obligación", "warning");
    return;
  }
  
  if (paso === 3 && !datos.aplica_a) {
    showToast("Selecciona a qué deseas aplicar el descuento", "warning");
    return;
  }
  
  if (paso === 4 && datos.aplica_a === 'cuota' && !wizardDescuento.cuota) {
    showToast("Selecciona una cuota", "warning");
    return;
  }
  
  wizardDescuento.paso++;
  
  // Si aplica_a !== 'cuota', saltar paso 4
  if (wizardDescuento.paso === 4 && datos.aplica_a !== 'cuota') {
    wizardDescuento.paso = 5;
  }
  
  renderWizardDescuento();
}

function retrocederPasoDescuento() {
  if (wizardDescuento.paso > 1) {
    wizardDescuento.paso--;
    
    // Si aplica_a !== 'cuota' y estamos en paso 5, volver a paso 3
    if (wizardDescuento.paso === 4 && wizardDescuento.datos.aplica_a !== 'cuota') {
      wizardDescuento.paso = 3;
    }
    
    renderWizardDescuento();
  }
}

async function confirmarAplicarDescuento() {
  const btnAplicar = document.getElementById('btnAplicarDescuento');
  
  const motivoInput = document.getElementById('motivoDescuento');
  const motivo = motivoInput?.value.trim();
  
  if (!motivo) {
    showToast("Ingresa el motivo del descuento", "warning");
    return;
  }
  
  if (wizardDescuento.datos.valor <= 0) {
    showToast("El valor del descuento debe ser mayor a cero", "warning");
    return;
  }
  
  if (btnAplicar) {
    btnAplicar.disabled = true;
    btnAplicar.textContent = 'Aplicando...';
  }
  
  try {
    const descuentoData = {
      obligacion_id: wizardDescuento.obligacion.id,
      cuota_id: wizardDescuento.cuota?.id || null,
      tipo: wizardDescuento.datos.tipo,
      valor: wizardDescuento.datos.valor,
      aplica_a: wizardDescuento.datos.aplica_a,
      motivo: motivo,
      admin_user: currentUser?.username || "admin"
    };
    
    const resultado = await aplicarDescuentoConEfectos(descuentoData);
    
    if (!resultado.success) {
      throw new Error(resultado.error);
    }
    
    hideModal();
    showToast("✅ Descuento aplicado exitosamente", "success");
    
    setTimeout(() => {
      loadDescuentos();
    }, 1000);
    
  } catch (error) {
    Logger.error("Error al aplicar descuento:", error);
    showToast(`Error: ${error.message}`, "error");
    
    if (btnAplicar) {
      btnAplicar.disabled = false;
      btnAplicar.textContent = '✅ Aplicar Descuento';
    }
  }
}

// ========================================
// MÓDULO DE DOCUMENTOS - IMPLEMENTACIÓN COMPLETA
// ========================================

// Estado global del módulo
let documentosState = {
  cliente: null,
  obligacion: null,
  documentos: []
};

// ========== DOCUMENTOS: PANTALLA PRINCIPAL ==========
async function loadDocumentos() {
  const container = document.getElementById("viewDocumentos");
  
  container.innerHTML = `
    <div class="docs-container">
      <!-- Header -->
      <div class="docs-header">
        <div class="docs-header-content">
          <h2 class="docs-header-title">Gestión de Documentos</h2>
          <p class="docs-header-subtitle">Administra contratos, pagarés y documentos de obligaciones</p>
        </div>
        <div class="docs-header-actions">
          <button type="button" class="btn btn-primary" onclick="mostrarSubirDocumento()" ${!documentosState.obligacion ? 'disabled' : ''}>
            <span>📤</span>
            <span>Subir Documento</span>
          </button>
        </div>
      </div>
      
      <!-- Wizard de Selección -->
      <div class="docs-wizard">
        <div class="docs-wizard-header">
          <h3 class="docs-wizard-title">
            <span>🔍</span>
            <span>Selección de Cliente y Obligación</span>
          </h3>
          <p class="docs-wizard-subtitle">Busca el cliente y selecciona la obligación para ver o subir documentos</p>
        </div>
        
        <div class="docs-wizard-body">
          ${documentosState.cliente ? `
            <div class="docs-selected-client">
              <div class="docs-selected-header">
                <div class="docs-selected-info">
                  <div class="docs-selected-label">Cliente Seleccionado</div>
                  <div class="docs-selected-name">${documentosState.cliente.nombre}</div>
                  <div class="docs-selected-meta">
                    <span>${documentosState.cliente.tipo_documento}:</span>
                    <strong>${documentosState.cliente.documento}</strong>
                  </div>
                </div>
                <button type="button" class="docs-btn-change" onclick="limpiarSeleccionDocumentos()">
                  <span>🔄</span>
                  <span>Cambiar</span>
                </button>
              </div>
            </div>
          ` : ''}
          
          <div class="docs-search-group">
            <label class="docs-search-label">Buscar Cliente</label>
            <input 
              type="text" 
              class="docs-search-input" 
              id="buscarClienteDocs" 
              placeholder="Buscar por nombre, documento o teléfono..."
              oninput="buscarClientesParaDocumentos(this.value)"
            >
          </div>
          
          <div id="resultadosBusquedaClienteDocs"></div>
          
          ${documentosState.cliente ? `
            <div id="obligacionesClienteDocs">
              <div style="padding: var(--space-4);">
                <div class="docs-skeleton"></div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
      
      ${documentosState.obligacion ? `
        <div class="docs-list-container">
          <div class="docs-list-header">
            <h3 class="docs-list-title">
              Documentos de Obligación #${documentosState.obligacion.id}
            </h3>
            <button type="button" class="btn btn-primary" onclick="mostrarSubirDocumento()">
              <span>📤</span>
              <span>Subir</span>
            </button>
          </div>
          <div class="docs-list-body" id="listaDocumentosObligacion">
            <div style="padding: var(--space-4);">
              <div class="docs-skeleton"></div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
  
  if (documentosState.cliente) {
    setTimeout(() => cargarObligacionesParaDocumentos(), 100);
  }
  
  if (documentosState.obligacion) {
    setTimeout(() => cargarDocumentosObligacion(), 100);
  }
}

async function buscarClientesParaDocumentos(termino) {
  const container = document.getElementById('resultadosBusquedaClienteDocs');
  
  if (!termino || termino.length < 2) {
    container.innerHTML = '';
    return;
  }
  
  try {
    const clientes = await buscarClientes(termino);
    
    if (clientes.length === 0) {
      container.innerHTML = `
        <div class="docs-empty">
          <div class="docs-empty-icon">🔍</div>
          <p class="docs-empty-title">Sin resultados</p>
          <p class="docs-empty-text">No se encontraron clientes con ese criterio de búsqueda</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="docs-items-list">
        ${clientes.map(c => `
          <div class="docs-item" onclick="seleccionarClienteDocs(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', '${c.documento}', '${c.tipo_documento}')">
            <div class="docs-item-header">
              <span class="docs-item-title">${c.nombre}</span>
            </div>
            <div class="docs-item-meta">
              <span class="docs-item-meta-item">
                <span>📄</span>
                <span>${c.tipo_documento}: ${c.documento}</span>
              </span>
              ${c.telefono ? `
                <span class="docs-item-meta-item">
                  <span>📞</span>
                  <span>${c.telefono}</span>
                </span>
              ` : ''}
            </div>
          </div>
        `).join("")}
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al buscar clientes:", error);
    container.innerHTML = `<div class="docs-info-banner danger">Error al buscar clientes. Intenta de nuevo.</div>`;
  }
}

function seleccionarClienteDocs(id, nombre, documento, tipo_documento) {
  documentosState.cliente = { id, nombre, documento, tipo_documento };
  documentosState.obligacion = null;
  documentosState.documentos = [];
  loadDocumentos();
}

function limpiarSeleccionDocumentos() {
  documentosState.cliente = null;
  documentosState.obligacion = null;
  documentosState.documentos = [];
  loadDocumentos();
}

async function cargarObligacionesParaDocumentos() {
  const container = document.getElementById('obligacionesClienteDocs');
  
  try {
    const obligaciones = await obtenerObligacionesCliente(documentosState.cliente.id);
    
    if (obligaciones.length === 0) {
      container.innerHTML = `
        <div class="docs-empty">
          <div class="docs-empty-icon">📋</div>
          <p class="docs-empty-title">Sin Obligaciones</p>
          <p class="docs-empty-text">Este cliente no tiene obligaciones registradas en el sistema</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <h4 style="margin: 0 0 var(--space-4) 0; font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--corp-gray-700);">Selecciona una obligación:</h4>
      <div class="docs-items-list">
        ${obligaciones.map(o => {
          const saldoPendiente = (o.cuotas || [])
            .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
            .reduce((sum, c) => sum + parseFloat(c.saldo_pendiente ?? c.valor_cuota), 0);
          
          const estadoClass = 
            o.estado === 'cancelada' ? 'neutral' :
            o.estado === 'refinanciada' ? 'warning' :
            o.estado.includes('mora') ? 'danger' : 'success';
          
          return `
            <div class="docs-item ${documentosState.obligacion?.id === o.id ? 'selected' : ''}" onclick="seleccionarObligacionDocs(${o.id})">
              <div class="docs-item-header">
                <span class="docs-item-title">
                  <strong>#${o.id}</strong> ${o.tipo === 'prestamo' ? '💰 Préstamo' : '📱 Producto'}
                </span>
                <span class="docs-item-badge ${estadoClass}">
                  ${o.estado.replace(/_/g, " ")}
                </span>
              </div>
              <div class="docs-item-meta">
                <span class="docs-item-meta-item">
                  <span>💵</span>
                  <span>Capital: ${formatCurrency(o.capital)}</span>
                </span>
                ${o.estado !== 'cancelada' && o.estado !== 'refinanciada' ? `
                  <span class="docs-item-meta-item">
                    <span>💰</span>
                    <span>Saldo: ${formatCurrency(saldoPendiente)}</span>
                  </span>
                ` : ''}
                <span class="docs-item-meta-item">
                  <span>📅</span>
                  <span>${formatDate(o.fecha_inicio)}</span>
                </span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al cargar obligaciones:", error);
    container.innerHTML = `<div class="docs-info-banner danger">❌ Error al cargar las obligaciones. Por favor, intenta de nuevo.</div>`;
  }
}

async function seleccionarObligacionDocs(obligacionId) {
  try {
    const obligacion = await obtenerObligacionPorId(obligacionId);
    documentosState.obligacion = obligacion;
    loadDocumentos();
  } catch (error) {
    Logger.error("Error al seleccionar obligación:", error);
    showToast("Error al cargar obligación", "error");
  }
}

async function cargarDocumentosObligacion() {
  const container = document.getElementById('listaDocumentosObligacion');
  
  try {
    const documentos = await obtenerDocumentosObligacion(documentosState.obligacion.id);
    documentosState.documentos = documentos;
    
    if (documentos.length === 0) {
      container.innerHTML = `
        <div class="docs-empty">
          <div class="docs-empty-icon">📄</div>
          <p class="docs-empty-title">Sin Documentos</p>
          <p class="docs-empty-text">Esta obligación no tiene documentos cargados. Haz clic en "Subir Documento" para agregar uno.</p>
          <button type="button" class="btn btn-primary" onclick="mostrarSubirDocumento()">
            📤 Subir Primer Documento
          </button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <!-- Vista Tabla (Desktop) -->
      <div class="docs-table-wrapper">
        <table class="docs-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Versión</th>
              <th>Fecha</th>
              <th>Notas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${documentos.map(doc => `
              <tr>
                <td>
                  <span class="docs-item-badge info">
                    ${getTipoDocumentoLabel(doc.tipo)}
                  </span>
                </td>
                <td><strong>v${doc.version || 1}</strong></td>
                <td>${formatDateTime(doc.created_at)}</td>
                <td>
                  <div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                       title="${doc.notas || '-'}">
                    ${doc.notas || '-'}
                  </div>
                </td>
                <td>
                  <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                    <button 
                      type="button"
                      class="docs-btn-action docs-btn-view" 
                      onclick="verDocumento(${doc.id})"
                      title="Ver/Descargar">
                      👁️ Ver
                    </button>
                    <button 
                      type="button"
                      class="docs-btn-action docs-btn-copy" 
                      onclick="copiarEnlaceDocumento(${doc.id})"
                      title="Copiar enlace">
                      📋
                    </button>
                    <button 
                      type="button"
                      class="docs-btn-action docs-btn-delete" 
                      onclick="confirmarEliminarDocumento(${doc.id})"
                      title="Eliminar">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      
      <!-- Vista Cards (Móvil) -->
      <div class="docs-cards">
        ${documentos.map(doc => `
          <div class="docs-card">
            <div class="docs-card-header">
              <div class="docs-card-type">
                ${getTipoDocumentoLabel(doc.tipo)}
              </div>
              <div class="docs-card-version">v${doc.version || 1}</div>
            </div>
            
            <div class="docs-card-info">
              <div class="docs-card-info-item">
                <span class="docs-card-info-label">📅 Fecha:</span>
                <span class="docs-card-info-value">${formatDateTime(doc.created_at)}</span>
              </div>
              ${doc.notas ? `
                <div class="docs-card-info-item">
                  <span class="docs-card-info-label">📝 Notas:</span>
                  <span class="docs-card-info-value">${doc.notas}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="docs-card-actions">
              <button 
                type="button"
                class="btn btn-secondary" 
                onclick="verDocumento(${doc.id})"
                title="Ver/Descargar">
                👁️ Ver
              </button>
              <button 
                type="button"
                class="btn btn-secondary" 
                onclick="copiarEnlaceDocumento(${doc.id})"
                title="Copiar enlace">
                📋 Copiar
              </button>
              <button 
                type="button"
                class="btn btn-danger" 
                onclick="confirmarEliminarDocumento(${doc.id})"
                title="Eliminar">
                🗑️
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    
  } catch (error) {
    Logger.error("Error al cargar documentos:", error);
    container.innerHTML = `<div class="docs-info-banner danger">❌ Error al cargar documentos. Por favor, intenta de nuevo.</div>`;
  }
}

function getTipoDocumentoLabel(tipo) {
  const labels = {
    contrato: '📄 Contrato',
    pagare: '✍️ Pagaré',
    anexo: '📎 Anexo',
    soporte: '🧾 Soporte',
    otro: '📋 Otro'
  };
  return labels[tipo] || tipo;
}

// ========== SUBIR DOCUMENTO ==========
function mostrarSubirDocumento() {
  if (!documentosState.cliente || !documentosState.obligacion) {
    showToast("⚠️ Primero selecciona un cliente y una obligación", "warning");
    return;
  }
  
  showModal(
    "📤 Subir Documento",
    `
      <div style="display: flex; flex-direction: column; gap: var(--space-5);">
        <div class="docs-info-banner info">
          <div style="display: flex; flex-direction: column; gap: var(--space-2);">
            <div><strong>👤 Cliente:</strong> ${documentosState.cliente.nombre}</div>
            <div><strong>📋 Obligación:</strong> #${documentosState.obligacion.id} - ${documentosState.obligacion.tipo === 'prestamo' ? '💰 Préstamo' : '📱 Producto'}</div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label form-label-required">Tipo de Documento</label>
          <select class="form-select" id="tipoDocumento" required>
            <option value="">Selecciona el tipo...</option>
            <option value="contrato">📄 Contrato</option>
            <option value="pagare">✍️ Pagaré</option>
            <option value="anexo">📎 Anexo</option>
            <option value="soporte">🧾 Soporte</option>
            <option value="otro">📋 Otro</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label form-label-required">Archivo</label>
          <input 
            type="file" 
            class="form-input" 
            id="archivoDocumento"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onchange="mostrarPreviewArchivo(this)"
            required
          >
          <small class="form-hint">📌 Formatos: PDF, JPG, PNG, WEBP | Tamaño máximo: 10MB</small>
        </div>
        
        <div id="previewArchivo" style="display: none;">
          <div class="docs-upload-preview">
            <span class="docs-upload-icon" id="previewIcon"></span>
            <div class="docs-upload-info">
              <div class="docs-upload-name" id="previewNombre"></div>
              <div class="docs-upload-meta" id="previewInfo"></div>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Notas (opcional)</label>
          <textarea 
            class="form-textarea" 
            id="notasDocumento"
            rows="3"
            placeholder="Información adicional sobre el documento..."
          ></textarea>
        </div>
        
        <div class="docs-info-banner warning">
          <strong>💡 Versionado automático:</strong> Si ya existe un documento del mismo tipo, se creará una nueva versión automáticamente.
        </div>
      </div>
    `,
    `
      <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="ejecutarSubirDocumento()" id="btnSubirDoc">
        <span>⬆️</span>
        <span>Subir Documento</span>
      </button>
    `
  );
}

function mostrarPreviewArchivo(input) {
  const previewContainer = document.getElementById('previewArchivo');
  const previewIcon = document.getElementById('previewIcon');
  const previewNombre = document.getElementById('previewNombre');
  const previewInfo = document.getElementById('previewInfo');
  
  if (!input.files || !input.files[0]) {
    previewContainer.style.display = 'none';
    return;
  }
  
  const file = input.files[0];
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  
  // Icono según tipo
  let icon = '📄';
  if (file.type.includes('pdf')) {
    icon = '📕';
  } else if (file.type.includes('image')) {
    icon = '🖼️';
  }
  
  previewIcon.textContent = icon;
  previewNombre.textContent = file.name;
  previewInfo.textContent = `${sizeMB} MB - ${file.type}`;
  previewContainer.style.display = 'block';
  
  // Validar tamaño
  if (file.size > 10 * 1024 * 1024) {
    showToast("El archivo excede el tamaño máximo de 10MB", "warning");
    input.value = '';
    previewContainer.style.display = 'none';
  }
}

async function ejecutarSubirDocumento() {
  const btnSubir = document.getElementById('btnSubirDoc');
  
  const tipoSelect = document.getElementById('tipoDocumento');
  const archivoInput = document.getElementById('archivoDocumento');
  const notasInput = document.getElementById('notasDocumento');
  
  const tipo = tipoSelect?.value;
  const archivo = archivoInput?.files?.[0];
  const notas = notasInput?.value.trim() || "";
  
  // Validaciones
  if (!tipo) {
    showToast("Selecciona el tipo de documento", "warning");
    return;
  }
  
  if (!archivo) {
    showToast("Selecciona un archivo", "warning");
    return;
  }
  
  if (btnSubir) {
    btnSubir.disabled = true;
    btnSubir.textContent = 'Subiendo...';
  }
  
  try {
    // Calcular versión
    const documentosExistentes = documentosState.documentos.filter(d => d.tipo === tipo);
    const version = documentosExistentes.length > 0 ? 
      Math.max(...documentosExistentes.map(d => d.version || 1)) + 1 : 1;
    
    // 1. Subir archivo a Storage
    const metadata = {
      cliente_documento: documentosState.cliente.documento,
      obligacion_id: documentosState.obligacion.id,
      tipo: tipo,
      version: version
    };
    
    const resultadoStorage = await subirDocumentoStorage(archivo, metadata);
    
    if (!resultadoStorage.success) {
      throw new Error(resultadoStorage.error);
    }
    
    // 2. Registrar en BD
    const documentoData = {
      obligacion_id: documentosState.obligacion.id,
      tipo: tipo,
      archivo_url: resultadoStorage.path, // Guardar path, no URL pública
      archivo_path: resultadoStorage.path,
      bucket: resultadoStorage.bucket,
      version: version,
      notas: notas
    };
    
    const resultadoBD = await registrarDocumentoCompleto(documentoData);
    
    if (!resultadoBD.success) {
      throw new Error(resultadoBD.error);
    }
    
    // 3. Registrar auditoría
    await registrarAuditoria({
      admin_user: currentUser?.username || "admin",
      accion: "subir_documento",
      entidad: "documento",
      entidad_id: resultadoBD.data.id,
      detalle_json: {
        documento_id: resultadoBD.data.id,
        obligacion_id: documentosState.obligacion.id,
        cliente_id: documentosState.cliente.id,
        tipo: tipo,
        version: version,
        archivo_path: resultadoStorage.path,
        bucket: resultadoStorage.bucket,
        tamano: resultadoStorage.tamano,
        tipo_mime: resultadoStorage.tipoMime
      }
    });
    
    hideModal();
    showToast("✅ Documento subido exitosamente", "success");
    
    // Recargar lista
    setTimeout(() => {
      cargarDocumentosObligacion();
    }, 500);
    
  } catch (error) {
    Logger.error("Error al subir documento:", error);
    showToast(`Error: ${error.message}`, "error");
    
    if (btnSubir) {
      btnSubir.disabled = false;
      btnSubir.textContent = '⬆️ Subir Documento';
    }
  }
}

// ========== VER/DESCARGAR DOCUMENTO ==========
async function verDocumento(documentoId) {
  try {
    const documento = documentosState.documentos.find(d => d.id === documentoId);
    
    if (!documento) {
      showToast("Documento no encontrado", "error");
      return;
    }
    
    // Si tiene path y bucket, usar URL firmada (bucket privado)
    if (documento.archivo_path && documento.bucket) {
      const resultado = await obtenerUrlFirmadaDocumento(documento.archivo_path, 3600);
      
      if (resultado.success) {
        window.open(resultado.url, '_blank');
      } else {
        showToast("Error al generar enlace de descarga", "error");
      }
    } else if (documento.archivo_url) {
      // Fallback: URL directa (si es bucket público)
      window.open(documento.archivo_url, '_blank');
    } else {
      showToast("No se pudo acceder al documento", "error");
    }
    
  } catch (error) {
    Logger.error("Error al ver documento:", error);
    showToast("Error al abrir documento", "error");
  }
}

async function copiarEnlaceDocumento(documentoId) {
  try {
    const documento = documentosState.documentos.find(d => d.id === documentoId);
    
    if (!documento) {
      showToast("Documento no encontrado", "error");
      return;
    }
    
    let urlParaCopiar = "";
    
    if (documento.archivo_path && documento.bucket) {
      const resultado = await obtenerUrlFirmadaDocumento(documento.archivo_path, 86400); // 24 horas
      
      if (resultado.success) {
        urlParaCopiar = resultado.url;
      } else {
        showToast("Error al generar enlace", "error");
        return;
      }
    } else if (documento.archivo_url) {
      urlParaCopiar = documento.archivo_url;
    } else {
      showToast("No se pudo generar enlace", "error");
      return;
    }
    
    // Copiar al portapapeles
    await navigator.clipboard.writeText(urlParaCopiar);
    showToast("📋 Enlace copiado al portapapeles", "success");
    
  } catch (error) {
    Logger.error("Error al copiar enlace:", error);
    showToast("Error al copiar enlace", "error");
  }
}

// ========== ELIMINAR DOCUMENTO ==========
async function confirmarEliminarDocumento(documentoId) {
  const documento = documentosState.documentos.find(d => d.id === documentoId);
  
  if (!documento) {
    showToast("Documento no encontrado", "error");
    return;
  }
  
  const confirmado = confirm(
    `¿Confirmas que deseas eliminar este documento?\n\n` +
    `Tipo: ${getTipoDocumentoLabel(documento.tipo)}\n` +
    `Versión: v${documento.version}\n` +
    `Fecha: ${formatDate(documento.created_at)}\n\n` +
    `Esta acción NO se puede deshacer.`
  );
  
  if (!confirmado) return;
  
  try {
    const resultado = await eliminarDocumento(documentoId);
    
    if (!resultado.success) {
      throw new Error(resultado.error);
    }
    
    // Registrar auditoría
    await registrarAuditoria({
      admin_user: currentUser?.username || "admin",
      accion: "eliminar_documento",
      entidad: "documento",
      entidad_id: documentoId,
      detalle_json: {
        documento_id: documentoId,
        obligacion_id: documento.obligacion_id,
        tipo: documento.tipo,
        version: documento.version
      }
    });
    
    showToast("🗑️ Documento eliminado", "success");
    
    // Recargar lista
    setTimeout(() => {
      cargarDocumentosObligacion();
    }, 500);
    
  } catch (error) {
    Logger.error("Error al eliminar documento:", error);
    showToast(`Error: ${error.message}`, "error");
  }
}

function subirDocumento() {
  mostrarSubirDocumento();
}

// ========== AUDITORÍA ==========

/**
 * Corrige masivamente los registros de auditoría de comprobantes
 */
async function corregirComprobantesMasivo() {
  try {
    showToast("Actualizando registros de auditoría...", "info");
    
    const resultado = await corregirAuditoriaComprobantes();
    
    if (resultado.success) {
      showToast(`✓ Se actualizaron ${resultado.actualizados} registros de auditoría`, "success");
      // Recargar auditoría para mostrar cambios
      await loadAuditoria();
    } else {
      showToast(`Error: ${resultado.error}`, "error");
    }
  } catch (error) {
    console.error("Error al corregir comprobantes:", error);
    showToast("Error al actualizar registros", "error");
  }
}

async function loadAuditoria() {
  const container = document.getElementById("viewAuditoria");
  showLoading(container, "Cargando auditoría...");
  
  try {
    const auditoria = await obtenerAuditoria();
    
    // Calcular estadísticas
    const stats = {
      total: auditoria.length,
      crear: auditoria.filter(a => a.accion === 'crear').length,
      actualizar: auditoria.filter(a => a.accion === 'actualizar').length,
      eliminar: auditoria.filter(a => a.accion === 'eliminar').length
    };
    
    container.innerHTML = `
      <div class="audit-container">
        <!-- Header -->
        <div class="audit-header">
          <div class="audit-header-content">
            <h2 class="audit-header-title">📋 Auditoría y Bitácora</h2>
            <p class="audit-header-subtitle">Registro completo de todas las acciones realizadas en el sistema</p>
          </div>
          <button 
            class="btn btn-sm btn-secondary" 
            onclick="corregirComprobantesMasivo()"
            style="height: fit-content;"
            title="Actualizar registros de comprobantes en auditoría">
            🔄 Actualizar Comprobantes
          </button>
        </div>

        <!-- Estadísticas -->
        <div class="audit-stats">
          <div class="audit-stat-card">
            <div class="audit-stat-label">Total</div>
            <div class="audit-stat-value">${stats.total}</div>
          </div>
          <div class="audit-stat-card">
            <div class="audit-stat-label">Creaciones</div>
            <div class="audit-stat-value">${stats.crear}</div>
          </div>
          <div class="audit-stat-card">
            <div class="audit-stat-label">Actualizaciones</div>
            <div class="audit-stat-value">${stats.actualizar}</div>
          </div>
          <div class="audit-stat-card">
            <div class="audit-stat-label">Eliminaciones</div>
            <div class="audit-stat-value">${stats.eliminar}</div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="audit-filters">
          <div class="audit-filters-header">
            <h3 class="audit-filters-title">
              <span>🔍</span>
              Filtros
            </h3>
          </div>
          
          <div class="audit-filters-grid">
            <div class="audit-filter-group">
              <label class="audit-filter-label">Buscar</label>
              <input 
                type="text" 
                class="audit-filter-input" 
                id="auditSearchInput"
                placeholder="Usuario, acción o entidad..."
              >
            </div>
            
            <div class="audit-filter-group">
              <label class="audit-filter-label">Acción</label>
              <select class="audit-filter-select" id="auditActionFilter">
                <option value="">Todas las acciones</option>
                <option value="crear">Crear</option>
                <option value="actualizar">Actualizar</option>
                <option value="eliminar">Eliminar</option>
                <option value="registrar_pago">Registrar Pago</option>
                <option value="refinanciar">Refinanciar</option>
              </select>
            </div>
            
            <div class="audit-filter-group">
              <label class="audit-filter-label">Entidad</label>
              <select class="audit-filter-select" id="auditEntityFilter">
                <option value="">Todas las entidades</option>
                <option value="obligacion">Obligación</option>
                <option value="pago">Pago</option>
                <option value="cuota">Cuota</option>
                <option value="cliente">Cliente</option>
                <option value="descuento">Descuento</option>
                <option value="refinanciacion">Refinanciación</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div id="auditTimelineContainer">
          ${auditoria.length === 0 ? `
            <div class="audit-empty">
              <div class="audit-empty-icon">📋</div>
              <h3 class="audit-empty-title">No hay registros de auditoría</h3>
              <p class="audit-empty-text">
                Los registros de auditoría aparecerán aquí cuando se realicen acciones en el sistema.
              </p>
            </div>
          ` : `
            <div class="audit-timeline" id="auditTimeline">
              ${auditoria.map(a => {
                const actionClass = a.accion.replace(/_/g, '-');
                return `
                  <div class="audit-timeline-item action-${actionClass}" data-action="${a.accion}" data-entity="${a.entidad}" data-user="${a.admin_user}">
                    <div class="audit-timeline-marker"></div>
                    <div class="audit-timeline-content">
                      <div class="audit-timeline-header">
                        <div class="audit-timeline-top">
                          <div class="audit-timeline-title">
                            <div class="audit-timeline-user">${a.admin_user}</div>
                            <div class="audit-timeline-action">
                              ${formatAccionText(a.accion)} ${a.entidad}
                            </div>
                          </div>
                          <span class="audit-timeline-badge action-${actionClass}">
                            ${formatAccion(a.accion)}
                          </span>
                        </div>
                        <div class="audit-timeline-date">
                          <span>🕒</span>
                          ${formatDateTime(a.created_at)}
                        </div>
                      </div>
                      
                      ${a.entidad_id ? `
                        <div class="audit-timeline-meta">
                          <div class="audit-timeline-meta-item">
                            <span>🆔</span>
                            <strong>ID:</strong> ${a.entidad_id}
                          </div>
                          ${a.detalle_json ? `
                            <div class="audit-timeline-meta-item">
                              <span>📄</span>
                              <strong>Detalles disponibles</strong>
                            </div>
                          ` : ''}
                        </div>
                      ` : ''}
                      
                      ${a.detalle_json ? `
                        <button type="button" class="audit-timeline-expand" onclick="toggleAuditDetails(this, ${a.id})">
                          <span>👁️</span>
                          Ver detalles
                        </button>
                        <div class="audit-timeline-details" id="auditDetails${a.id}" style="display: none;">
                          <div class="audit-timeline-details-title">Detalles de la acción:</div>
                          <div class="audit-timeline-details-grid">
                            ${formatDetalleJson(a.detalle_json)}
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    // Event listeners para filtros
    if (auditoria.length > 0) {
      setupAuditFilters(auditoria);
    }
  } catch (error) {
    Logger.error("Error al cargar auditoría:", error);
    container.innerHTML = `
      <div class="audit-container">
        <div class="alert alert-danger">
          <strong>Error al cargar auditoría:</strong> ${error.message}
        </div>
      </div>
    `;
  }
}

/**
 * Formatea el texto de la acción para mostrar
 */
function formatAccionText(accion) {
  const actions = {
    'crear': 'creó',
    'actualizar': 'actualizó',
    'eliminar': 'eliminó',
    'registrar_pago': 'registró pago en',
    'refinanciar': 'refinanció'
  };
  return actions[accion] || accion;
}

/**
 * Formatea la acción para el badge
 */
function formatAccion(accion) {
  const actions = {
    'crear': 'Crear',
    'actualizar': 'Actualizar',
    'eliminar': 'Eliminar',
    'registrar_pago': 'Pago',
    'refinanciar': 'Refinanciar'
  };
  return actions[accion] || accion.toUpperCase();
}

/**
 * Formatea el detalle JSON para mostrar
 */
function formatDetalleJson(detalleJson) {
  if (!detalleJson) return '';
  
  try {
    const detalle = typeof detalleJson === 'string' ? JSON.parse(detalleJson) : detalleJson;
    
    return Object.entries(detalle)
      .filter(([key, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `
        <div class="audit-timeline-details-item">
          <span class="audit-timeline-details-label">${key}:</span>
          <span class="audit-timeline-details-value">${formatDetailValue(value)}</span>
        </div>
      `).join('');
  } catch (error) {
    return `<div class="audit-timeline-details-item">Detalles no disponibles</div>`;
  }
}

/**
 * Formatea el valor del detalle
 */
function formatDetailValue(value) {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') {
    // Si parece un monto, formatearlo
    if (value > 100) return formatCurrency(value);
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * Toggle detalles de auditoría
 */
function toggleAuditDetails(button, auditId) {
  const details = document.getElementById(`auditDetails${auditId}`);
  if (details) {
    const isVisible = details.style.display !== 'none';
    details.style.display = isVisible ? 'none' : 'block';
    button.innerHTML = isVisible 
      ? '<span>👁️</span> Ver detalles' 
      : '<span>👁️</span> Ocultar detalles';
  }
}

/**
 * Configura los filtros de auditoría
 */
function setupAuditFilters(auditoria) {
  const searchInput = document.getElementById('auditSearchInput');
  const actionFilter = document.getElementById('auditActionFilter');
  const entityFilter = document.getElementById('auditEntityFilter');

  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedAction = actionFilter.value;
    const selectedEntity = entityFilter.value;

    const items = document.querySelectorAll('.audit-timeline-item');
    let visibleCount = 0;

    items.forEach(item => {
      const user = item.dataset.user.toLowerCase();
      const action = item.dataset.action;
      const entity = item.dataset.entity;
      const text = item.textContent.toLowerCase();

      const matchesSearch = !searchTerm || text.includes(searchTerm) || user.includes(searchTerm);
      const matchesAction = !selectedAction || action === selectedAction;
      const matchesEntity = !selectedEntity || entity === selectedEntity;

      const visible = matchesSearch && matchesAction && matchesEntity;
      item.style.display = visible ? 'block' : 'none';
      if (visible) visibleCount++;
    });

    // Mostrar mensaje si no hay resultados
    const timeline = document.getElementById('auditTimeline');
    let emptyMessage = document.getElementById('auditFilterEmpty');
    
    if (visibleCount === 0 && !emptyMessage) {
      emptyMessage = document.createElement('div');
      emptyMessage.id = 'auditFilterEmpty';
      emptyMessage.className = 'audit-empty';
      emptyMessage.innerHTML = `
        <div class="audit-empty-icon">🔍</div>
        <h3 class="audit-empty-title">No se encontraron resultados</h3>
        <p class="audit-empty-text">
          Intenta ajustar los filtros para ver más registros.
        </p>
      `;
      timeline.parentElement.appendChild(emptyMessage);
    } else if (visibleCount > 0 && emptyMessage) {
      emptyMessage.remove();
    }
  }

  searchInput.addEventListener('input', applyFilters);
  actionFilter.addEventListener('change', applyFilters);
  entityFilter.addEventListener('change', applyFilters);
}

// ========================================
// ELIMINACIÓN DE OBLIGACIONES CON CONFIRMACIÓN
// ========================================

/**
 * Muestra modal de confirmación para eliminar obligación
 * Requiere escribir ELIMINAR para confirmar
 */
async function confirmarEliminarObligacion(obligacionId) {
  // Verificar sesión
  if (!currentUser || !currentUser.username) {
    showToast("Sesión inválida. No se puede eliminar.", "error");
    return;
  }

  // Buscar obligación en caché para mostrar info rápida
  const obligacion = obligacionesData.find(o => o.id === obligacionId);
  if (!obligacion) {
    showToast("Obligación no encontrada", "error");
    return;
  }

  const cliente = obligacion.clientes || {};
  const nombreCliente = cliente.nombre || "[Cliente desconocido]";

  // Obtener snapshot completo con conteos
  const snapshotResult = await obtenerSnapshotObligacionParaEliminacion(obligacionId);
  if (!snapshotResult.success) {
    showToast(`Error al cargar datos: ${snapshotResult.error}`, "error");
    return;
  }

  const { counts } = snapshotResult;

  // Modal de confirmación
  const modalBody = `
    <div class="danger-box">
      <h3 style="margin-top: 0; color: var(--danger);">⚠️ ADVERTENCIA: Acción Irreversible</h3>
      <p><strong>Esta acción NO se puede deshacer.</strong></p>
    </div>

    <div class="info-section" style="margin: 1.5rem 0;">
      <h4>Obligación a eliminar:</h4>
      <ul style="list-style: none; padding-left: 0;">
        <li><strong>ID:</strong> #${obligacion.id}</li>
        <li><strong>Cliente:</strong> ${nombreCliente}</li>
        <li><strong>Tipo:</strong> ${obligacion.tipo === 'prestamo' ? 'Préstamo' : 'Producto'}</li>
        <li><strong>Capital:</strong> ${formatCurrency(obligacion.capital)}</li>
        <li><strong>Estado:</strong> ${obligacion.estado.replace(/_/g, ' ')}</li>
      </ul>
    </div>

    <div class="danger-box">
      <h4>Se eliminarán en cascada:</h4>
      <ul>
        <li>📋 <strong>${counts.cuotas_total}</strong> cuotas (${counts.cuotas_pagadas} pagadas)</li>
        <li>💰 <strong>${counts.pagos_total}</strong> pagos registrados</li>
        <li>📄 <strong>${counts.documentos_total}</strong> documentos</li>
        ${counts.productos_detalle_total > 0 ? `<li>📱 <strong>${counts.productos_detalle_total}</strong> productos detalle</li>` : ''}
      </ul>
      <p style="margin-top: 1rem; color: var(--danger); font-weight: bold;">
        Todos estos registros se perderán permanentemente.
      </p>
    </div>

    <div class="form-group" style="margin-top: 2rem;">
      <label class="form-label">Para confirmar, escribe: <strong>ELIMINAR</strong></label>
      <input 
        type="text" 
        class="form-input" 
        id="inputConfirmEliminarObligacion"
        placeholder="Escribe ELIMINAR para confirmar"
        autocomplete="off"
      >
      <p style="font-size: 0.875rem; color: var(--gray-600); margin-top: 0.5rem;">
        Obligación ID a eliminar: <strong>#${obligacionId}</strong>
      </p>
    </div>
  `;

  const modalFooter = `
    <button class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
    <button class="btn btn-danger" id="btnConfirmEliminarObligacion" disabled>
      🗑️ Eliminar Definitivamente
    </button>
  `;

  showModal("Eliminar Obligación", modalBody, modalFooter);

  // Habilitar botón solo cuando el input coincide
  setTimeout(() => {
    const input = document.getElementById("inputConfirmEliminarObligacion");
    const btnConfirm = document.getElementById("btnConfirmEliminarObligacion");

    input.addEventListener("input", () => {
      if (input.value === "ELIMINAR") {
        btnConfirm.disabled = false;
      } else {
        btnConfirm.disabled = true;
      }
    });

    btnConfirm.addEventListener("click", () => {
      ejecutarEliminarObligacion(obligacionId);
    });
  }, 100);
}

/**
 * Ejecuta la eliminación de la obligación
 */
async function ejecutarEliminarObligacion(obligacionId) {
  const btnConfirm = document.getElementById("btnConfirmEliminarObligacion");
  const btnCancel = document.querySelector(".modal-footer .btn-secondary");

  // Deshabilitar botones y mostrar loading
  btnConfirm.disabled = true;
  btnConfirm.innerHTML = '<span class="btn-loading"></span> Eliminando...';
  if (btnCancel) btnCancel.disabled = true;

  try {
    const resultado = await eliminarObligacionConAuditoria(obligacionId, currentUser.username);

    if (resultado.success) {
      hideModal();
      showToast(`Obligación #${obligacionId} eliminada correctamente`, "success");
      
      // Remover de caché local
      obligacionesData = obligacionesData.filter(o => o.id !== obligacionId);
      
      // Recargar vista
      await loadObligaciones();

      // Limpiar selección del módulo de pagos si apuntaba a esta obligación
      if (typeof selectedObligacionPagos !== 'undefined' && selectedObligacionPagos?.id === obligacionId) {
        if (typeof limpiarSeleccionPagos === 'function') {
          limpiarSeleccionPagos();
        }
      }
    } else {
      showToast(`Error al eliminar: ${resultado.error}`, "error");
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '🗑️ Eliminar Definitivamente';
      if (btnCancel) btnCancel.disabled = false;
    }
  } catch (error) {
    Logger.error("Error inesperado al eliminar obligación:", error);
    showToast("Error inesperado al eliminar obligación", "error");
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = '🗑️ Eliminar Definitivamente';
    if (btnCancel) btnCancel.disabled = false;
  }
}

// ========== INICIALIZACIÓN ==========
window.addEventListener("DOMContentLoaded", () => {
  Logger.info("🚀 Inversiones MG - Panel Admin iniciado");
  
  if (!checkSession()) {
    Logger.debug("No hay sesión activa - Mostrando pantalla de login");
  } else {
    setupNavigation();
  }
});
