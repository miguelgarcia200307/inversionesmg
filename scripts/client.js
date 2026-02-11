// Inversiones MG - Lógica de consulta cliente
// Maneja la consulta pública de obligaciones

let currentClient = null;
let currentObligations = [];
let currentObligation = null;

// ========== ELEMENTOS DEL DOM ==========
const consultationSection = document.getElementById("consultationSection");
const resultsSection = document.getElementById("resultsSection");
const detailSection = document.getElementById("detailSection");
const consultationForm = document.getElementById("consultationForm");
const documentInput = document.getElementById("documentInput");
const documentError = document.getElementById("documentError");
const consultBtn = document.getElementById("consultBtn");
const btnBack = document.getElementById("btnBack");
const btnBackToList = document.getElementById("btnBackToList");
const clientInfo = document.getElementById("clientInfo");
const obligationsList = document.getElementById("obligationsList");
const emptyState = document.getElementById("emptyState");
const detailHeader = document.getElementById("detailHeader");
const graceNotice = document.getElementById("graceNotice");
const summaryGrid = document.getElementById("summaryGrid");
const paymentCards = document.getElementById("paymentCards");
const paymentTableBody = document.getElementById("paymentTableBody");
const btnPayWhatsapp = document.getElementById("btnPayWhatsapp");

// ========== UTILIDADES ==========
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const colors = {
    info: "linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)",
    success: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    error: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    warning: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  };
  
  const icons = {
    info: "ℹ️",
    success: "✓",
    error: "✕",
    warning: "⚠"
  };
  
  toast.style.background = colors[type] || colors.info;
  toast.style.color = "white";
  toast.innerHTML = `<span style="margin-right: 8px; font-size: 1.125rem;">${icons[type]}</span><span>${message}</span>`;
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "8px";
  
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function showSection(section) {
  consultationSection.style.display = "none";
  resultsSection.style.display = "none";
  detailSection.style.display = "none";
  
  if (section === "consultation") {
    consultationSection.style.display = "block";
  } else if (section === "results") {
    resultsSection.style.display = "block";
  } else if (section === "detail") {
    detailSection.style.display = "block";
  }
  
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setLoading(isLoading) {
  consultBtn.disabled = isLoading;
  documentInput.disabled = isLoading;
  
  if (isLoading) {
    consultBtn.innerHTML = `
      <span class="btn-consult-content">
        <span class="btn-spinner"></span>
        <span>Consultando...</span>
      </span>
    `;
    consultBtn.style.opacity = "0.9";
  } else {
    consultBtn.innerHTML = `
      <span class="btn-consult-content">
        <span>Consultar ahora</span>
      </span>
    `;
    consultBtn.style.opacity = "1";
    documentInput.disabled = false;
  }
}

// ========== VALIDACIONES ==========
documentInput.addEventListener("input", (e) => {
  // Solo números
  e.target.value = e.target.value.replace(/\D/g, "");
  const errorElement = document.getElementById("documentError");
  errorElement.classList.remove("active");
  e.target.classList.remove("error");
  
  // Validación en tiempo real con feedback visual
  if (e.target.value.length > 0) {
    if (e.target.value.length >= 6 && e.target.value.length <= 10) {
      e.target.style.borderColor = "var(--success)";
    } else {
      e.target.style.borderColor = "var(--warning)";
    }
  } else {
    e.target.style.borderColor = "";
  }
});

// Limpiar estilos al perder foco
documentInput.addEventListener("blur", (e) => {
  if (!e.target.classList.contains("error")) {
    e.target.style.borderColor = "";
  }
});

// Validación de documento mejorada
function validarDocumento(documento) {
  // Debe ser solo números
  if (!/^\d+$/.test(documento)) {
    return false;
  }
  
  // Longitud válida (6-10 dígitos)
  if (documento.length < 6 || documento.length > 10) {
    return false;
  }
  
  return true;
}

// ========== CONSULTA PRINCIPAL ==========
consultationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const documento = documentInput.value.trim();
  
  // Validar documento
  if (!validarDocumento(documento)) {
    documentInput.classList.add("error");
    documentError.textContent = "Por favor ingresa un documento válido (6-10 dígitos)";
    documentError.classList.add("active");
    showToast("Documento inválido", "error");
    return;
  }
  
  setLoading(true);
  
  try {
    // Buscar cliente
    const cliente = await buscarClientePorDocumento(documento);
    
    if (!cliente) {
      documentInput.classList.add("error");
      documentError.textContent = "No encontramos ningún cliente con este documento";
      documentError.classList.add("active");
      showToast("Cliente no encontrado", "error");
      setLoading(false);
      return;
    }
    
    // Validación defensiva del cliente
    if (!cliente.id || !cliente.nombre) {
      Logger.error("Cliente sin datos completos:", cliente);
      showToast("Error: Datos del cliente incompletos", "error");
      setLoading(false);
      return;
    }
    
    currentClient = cliente;
    
    // Obtener obligaciones
    const obligaciones = await obtenerObligacionesCliente(cliente.id);
    
    // Validación defensiva de obligaciones
    if (!Array.isArray(obligaciones)) {
      Logger.error("Obligaciones no es un array:", obligaciones);
      showToast("Error al cargar obligaciones", "error");
      setLoading(false);
      return;
    }
    
    if (obligaciones.length === 0) {
      currentObligations = [];
      mostrarResultados();
      setLoading(false);
      showToast("No se encontraron obligaciones activas", "info");
      return;
    }
    
    // Procesar obligaciones con cuotas - Solo vigentes
    currentObligations = obligaciones.filter(obl => 
      obl && 
      (obl.estado === "vigente_al_dia" || obl.estado === "vigente_en_mora") &&
      Array.isArray(obl.cuotas) &&
      obl.cuotas.length > 0
    );
    
    if (currentObligations.length === 0) {
      showToast("No hay obligaciones vigentes", "info");
    } else {
      showToast(`Se encontraron ${currentObligations.length} obligación(es)`, "success");
    }
    
    mostrarResultados();
    setLoading(false);
    
  } catch (error) {
    Logger.error("Error en consulta:", error);
    
    // Manejo detallado de errores
    let errorMessage = "Error al consultar. Intenta nuevamente.";
    
    if (error.message && error.message.includes("network")) {
      errorMessage = "Error de conexión. Verifica tu internet.";
    } else if (error.message && error.message.includes("timeout")) {
      errorMessage = "La consulta tardó demasiado. Intenta nuevamente.";
    }
    
    showToast(errorMessage, "error");
    setLoading(false);
  }
});

// ========== MOSTRAR RESULTADOS ==========
function mostrarResultados() {
  // Validación defensiva del cliente
  if (!currentClient || !currentClient.nombre || !currentClient.documento) {
    Logger.error("Cliente inválido en mostrarResultados:", currentClient);
    showToast("Error: Datos del cliente no válidos", "error");
    showSection("consultation");
    return;
  }
  
  // Determinar estado general del cliente
  let estadoGeneral = "success";
  let estadoTexto = "Al día";
  
  const tieneObligacionesVencidas = currentObligations.some(obl => {
    if (!obl || !Array.isArray(obl.cuotas)) return false;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return obl.cuotas.some(c => {
      if (!c || !c.fecha_vencimiento) return false;
      const venc = new Date(c.fecha_vencimiento);
      venc.setHours(0, 0, 0, 0);
      return c.estado !== "pagada" && venc < hoy;
    });
  });
  
  if (tieneObligacionesVencidas) {
    estadoGeneral = "danger";
    estadoTexto = "Pagos pendientes";
  } else if (currentObligations.length > 0) {
    estadoGeneral = "warning";
    estadoTexto = "Pagos activos";
  }
  
  // Información del cliente - Rediseño Premium
  clientInfo.innerHTML = `
    <div class="client-info-card">
      <div class="client-info-header">
        <div class="client-info-main">
          <h2 class="client-name">${currentClient.nombre || "Cliente"}</h2>
          <p class="client-document">${currentClient.tipo_documento || "CC"}: ${currentClient.documento}</p>
        </div>
        <div class="client-status-badge status-${estadoGeneral}">
          <span>${estadoTexto === "Al día" ? "✓" : estadoTexto === "Pagos activos" ? "⏱" : "⚠"}</span>
          <span>${estadoTexto}</span>
        </div>
      </div>
    </div>
  `;
  
  // Obligaciones
  if (currentObligations.length === 0) {
    obligationsList.innerHTML = "";
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    obligationsList.innerHTML = currentObligations.map(obl => {
      // Validación defensiva de la obligación
      if (!obl || !obl.cuotas || !Array.isArray(obl.cuotas) || obl.cuotas.length === 0) {
        Logger.warn("Obligación sin cuotas válidas:", obl);
        return "";
      }
      
      const cuotasPagadas = obl.cuotas.filter(c => c && c.estado === "pagada").length;
      const totalCuotas = obl.cuotas.length;
      const progreso = totalCuotas > 0 ? (cuotasPagadas / totalCuotas) * 100 : 0;
      
      // Calcular estado
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      let estado = "Al día";
      let badgeClass = "badge-success";
      let progressClass = "";
      
      const cuotasVencidas = obl.cuotas.filter(c => {
        if (!c || !c.fecha_vencimiento) return false;
        const venc = new Date(c.fecha_vencimiento);
        venc.setHours(0, 0, 0, 0);
        return c.estado !== "pagada" && venc < hoy;
      });
      
      if (cuotasVencidas.length > 0) {
        estado = "En mora";
        badgeClass = "badge-danger";
        progressClass = "danger";
      } else if (cuotasPagadas < totalCuotas * 0.5) {
        progressClass = "warning";
      }
      
      // Próximo pago
      const proximaCuota = obl.cuotas.find(c => c && c.estado === "pendiente");
      const proximoPago = proximaCuota && proximaCuota.fecha_vencimiento
        ? formatDate(proximaCuota.fecha_vencimiento)
        : "Completado";
      
      // Total pendiente
      const totalPendiente = obl.cuotas
        .filter(c => c && c.estado !== "pagada")
        .reduce((sum, c) => sum + (c.saldo_pendiente || c.valor_cuota || 0), 0);
      
      // Valor de cuota con fallback
      const valorCuota = obl.cuotas[0]?.valor_cuota || 0;
      const capital = obl.capital || 0;
      
      return `
        <div class="obligation-card" onclick="verDetalleObligacion(${obl.id})">
          <div class="obligation-card-header">
            <span class="obligation-type-badge">${obl.tipo === "prestamo" ? "💼 Préstamo" : "📦 Producto"}</span>
            <span class="client-status-badge status-${badgeClass === 'badge-success' ? 'success' : badgeClass === 'badge-danger' ? 'danger' : 'warning'}">
              ${estado}
            </span>
          </div>
          
          <div class="obligation-amount">${formatCurrency(capital)}</div>
          
          <div class="obligation-details">
            <div class="obligation-detail-row">
              <span class="obligation-detail-label">💰 Cuota</span>
              <span class="obligation-detail-value">${formatCurrency(valorCuota)}</span>
            </div>
            
            <div class="obligation-detail-row">
              <span class="obligation-detail-label">📅 Próximo pago</span>
              <span class="obligation-detail-value">${proximoPago}</span>
            </div>
            
            <div class="obligation-detail-row">
              <span class="obligation-detail-label">⏳ Pendiente</span>
              <span class="obligation-detail-value">${formatCurrency(totalPendiente)}</span>
            </div>
          </div>
          
          <div class="obligation-progress-section">
            <div class="progress-bar-wrapper">
              <div class="progress-bar-track">
                <div class="progress-bar-fill ${progressClass}" style="width: ${progreso}%"></div>
              </div>
            </div>
            <div class="progress-text">
              <span>${cuotasPagadas} de ${totalCuotas} pagadas</span>
              <span>${Math.round(progreso)}%</span>
            </div>
          </div>
        </div>
      `;
    }).filter(html => html !== "").join("");
  }
  
  showSection("results");
}

// ========== VER DETALLE OBLIGACIÓN ==========
async function verDetalleObligacion(obligacionId) {
  try {
    // Validación de parámetro
    if (!obligacionId) {
      Logger.error("ID de obligación no válido:", obligacionId);
      showToast("Error: Obligación no válida", "error");
      return;
    }
    
    // Obtener obligación completa
    const obligacion = await obtenerObligacionPorId(obligacionId);
    
    if (!obligacion) {
      showToast("Error al cargar detalle", "error");
      return;
    }
    
    // Validaciones defensivas de la obligación
    if (!obligacion.cuotas || !Array.isArray(obligacion.cuotas) || obligacion.cuotas.length === 0) {
      Logger.error("Obligación sin cuotas válidas:", obligacion);
      showToast("Error: Obligación sin cuotas", "error");
      return;
    }
    
    if (!obligacion.clientes) {
      Logger.warn("Obligación sin datos de cliente:", obligacion);
      obligacion.clientes = currentClient || {};
    }
    
    currentObligation = obligacion;
    
    // Calcular datos
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const cuotasPagadas = obligacion.cuotas.filter(c => c && c.estado === "pagada").length;
    const cuotasFaltantes = obligacion.cuotas.length - cuotasPagadas;
    
    const totalPagado = obligacion.cuotas
      .filter(c => c && c.estado === "pagada")
      .reduce((sum, c) => sum + (c.valor_cuota || 0), 0);
    
    const totalPendiente = obligacion.cuotas
      .filter(c => c && c.estado !== "pagada")
      .reduce((sum, c) => sum + (c.saldo_pendiente || c.valor_cuota || 0), 0);
    
    const cuotasVencidas = obligacion.cuotas.filter(c => {
      if (!c || !c.fecha_vencimiento) return false;
      const venc = new Date(c.fecha_vencimiento);
      venc.setHours(0, 0, 0, 0);
      return c.estado !== "pagada" && venc < hoy;
    });
    
    const estado = cuotasVencidas.length > 0 ? "En mora" : "Al día";
    const estadoBadge = cuotasVencidas.length > 0 ? "badge-danger" : "badge-success";
    
    // Próximo vencimiento
    const proximaCuota = obligacion.cuotas
      .filter(c => c && c.estado === "pendiente" && c.fecha_vencimiento)
      .sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento))[0];
    
    // ✅ VALIDACIÓN DEFENSIVA: Obtener nombre del producto de forma segura
    let nombreProducto = "Producto financiado";
    
    if (obligacion.tipo === "prestamo") {
      nombreProducto = "Préstamo en efectivo";
    } else if (obligacion.productos_detalle) {
      // Validar que existan marca y modelo
      const marca = obligacion.productos_detalle.marca || "";
      const modelo = obligacion.productos_detalle.modelo || "";
      const nombre = obligacion.productos_detalle.nombre || "";
      
      if (marca && modelo) {
        nombreProducto = `${marca} ${modelo}`.trim();
      } else if (nombre) {
        nombreProducto = nombre;
      } else if (marca) {
        nombreProducto = marca;
      } else if (modelo) {
        nombreProducto = modelo;
      }
    }
    
    // Header Hero Premium
    detailHeader.innerHTML = `
      <div class="detail-hero">
        <div class="detail-hero-content">
          <span class="detail-type-badge">
            ${obligacion.tipo === "prestamo" ? "💼 Préstamo" : "📦 Producto"}
          </span>
          <h1 class="detail-title">
            ${obligacion.tipo === "prestamo" ? "Préstamo Financiero" : "Producto a Crédito"}
          </h1>
          <div class="detail-product-name">
            ${nombreProducto}
          </div>
          <div class="detail-meta-grid">
            <div class="detail-meta-item">
              <span class="detail-meta-label">💰 Capital</span>
              <span class="detail-meta-value">${formatCurrency(obligacion.capital)}</span>
            </div>
            <div class="detail-meta-item">
              <span class="detail-meta-label">📊 Estado</span>
              <span class="detail-meta-value">${estado}</span>
            </div>
            <div class="detail-meta-item">
              <span class="detail-meta-label">📅 Inicio</span>
              <span class="detail-meta-value">${formatDate(obligacion.fecha_inicio)}</span>
            </div>
            <div class="detail-meta-item">
              <span class="detail-meta-label">📋 Cuotas</span>
              <span class="detail-meta-value">${obligacion.cuotas.length}</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Verificar día de gracia
    mostrarNotificacionGracia(obligacion.clientes);
    
    // Valor de primera cuota con validación
    const valorPrimeraCuota = obligacion.cuotas[0]?.valor_cuota || 0;
    const capitalInicial = obligacion.capital || 0;
    const progresoPercentual = obligacion.cuotas.length > 0 
      ? Math.round((cuotasPagadas / obligacion.cuotas.length) * 100) 
      : 0;
    
    // Métricas Financieras Premium
    summaryGrid.innerHTML = `
      <div class="metric-card">
        <div class="metric-icon">💰</div>
        <div class="metric-label">Capital inicial</div>
        <div class="metric-value">${formatCurrency(capitalInicial)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">💳</div>
        <div class="metric-label">Valor cuota</div>
        <div class="metric-value">${formatCurrency(valorPrimeraCuota)}</div>
      </div>
      <div class="metric-card metric-success">
        <div class="metric-icon">✅</div>
        <div class="metric-label">Total pagado</div>
        <div class="metric-value">${formatCurrency(totalPagado)}</div>
        <div class="metric-subtext">${cuotasPagadas} cuotas completadas</div>
      </div>
      <div class="metric-card ${cuotasVencidas.length > 0 ? "metric-danger" : "metric-warning"}">
        <div class="metric-icon">${cuotasVencidas.length > 0 ? "⚠️" : "⏳"}</div>
        <div class="metric-label">Saldo pendiente</div>
        <div class="metric-value">${formatCurrency(totalPendiente)}</div>
        <div class="metric-subtext">${cuotasFaltantes} cuotas restantes</div>
      </div>
      ${proximaCuota ? `
      <div class="metric-card metric-warning">
        <div class="metric-icon">📅</div>
        <div class="metric-label">Próximo vencimiento</div>
        <div class="metric-value" style="font-size: var(--font-xl);">${formatDate(proximaCuota.fecha_vencimiento)}</div>
      </div>
      ` : ""}
      <div class="metric-card">
        <div class="metric-icon">📊</div>
        <div class="metric-label">Progreso</div>
        <div class="metric-value">${progresoPercentual}%</div>
        <div class="metric-subtext">${cuotasPagadas}/${obligacion.cuotas.length} cuotas</div>
      </div>
    `;
    
    // Plan de pagos
    mostrarPlanPagos(obligacion);
    
    showSection("detail");
  } catch (error) {
    Logger.error("Error al cargar detalle:", error);
    showToast("Error al cargar detalle", "error");
  }
}

// ========== MOSTRAR PLAN DE PAGOS ==========
function mostrarPlanPagos(obligacion) {
  // Validación defensiva
  if (!obligacion || !obligacion.cuotas || !Array.isArray(obligacion.cuotas)) {
    Logger.error("Obligación inválida en mostrarPlanPagos:", obligacion);
    paymentCards.innerHTML = '<div class="empty-state"><p>Error al cargar plan de pagos</p></div>';
    paymentTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Error al cargar plan de pagos</td></tr>';
    return;
  }
  
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  // Actualizar contador de cuotas
  const paymentCountBadge = document.getElementById('paymentCountBadge');
  if (paymentCountBadge) {
    const totalCuotas = obligacion.cuotas.length;
    const cuotasPagadas = obligacion.cuotas.filter(c => c && c.estado === "pagada").length;
    paymentCountBadge.textContent = `${totalCuotas} cuotas (${cuotasPagadas} pagadas)`;
  }
  
  // Vista tarjetas (móvil)
  paymentCards.innerHTML = obligacion.cuotas.map(cuota => {
    // Validación defensiva de cuota
    if (!cuota || !cuota.fecha_vencimiento) {
      Logger.warn("Cuota inválida:", cuota);
      return "";
    }
    
    const venc = new Date(cuota.fecha_vencimiento);
    venc.setHours(0, 0, 0, 0);
    
    let estadoClase = "pending";
    let estadoTexto = "Pendiente";
    let badgeClass = "badge-warning";
    
    if (cuota.estado === "pagada") {
      estadoClase = "paid";
      estadoTexto = "Pagada";
      badgeClass = "badge-success";
    } else if (venc < hoy) {
      estadoClase = "overdue";
      estadoTexto = "Vencida";
      badgeClass = "badge-danger";
    }
    
    const diasMora = venc < hoy && cuota.estado !== "pagada" 
      ? getDaysDifference(venc, hoy)
      : 0;
    
    const { penalidad, aplicaGracia } = calcularPenalidad(cuota, obligacion.clientes, diasMora);
    const valorCuota = cuota.valor_cuota || 0;
    const saldoPendiente = cuota.saldo_pendiente || valorCuota;
    const totalAPagar = saldoPendiente + penalidad;
    const numeroCuota = cuota.numero || "?";
    
    return `
      <div class="payment-card-mobile status-${estadoClase}">
        <div class="payment-card-header">
          <span class="payment-number">Cuota #${numeroCuota}</span>
          <span class="payment-status-badge status-${estadoClase}">${estadoTexto}</span>
        </div>
        <div class="payment-card-body">
          <div class="payment-info">
            <span class="payment-info-label">Vencimiento</span>
            <span class="payment-info-value">${formatDate(cuota.fecha_vencimiento)}</span>
          </div>
          <div class="payment-info">
            <span class="payment-info-label">Valor cuota</span>
            <span class="payment-info-value">${formatCurrency(valorCuota)}</span>
          </div>
          ${diasMora > 0 ? `
          <div class="payment-info">
            <span class="payment-info-label">Días mora</span>
            <span class="payment-info-value" style="color: var(--danger);">${diasMora}</span>
          </div>
          <div class="payment-info">
            <span class="payment-info-label">Penalidad</span>
            <span class="payment-info-value" style="color: var(--danger);">${formatCurrency(penalidad)}</span>
          </div>
          ` : ""}
          <div class="payment-info">
            <span class="payment-info-label">Total a pagar</span>
            <span class="payment-info-value" style="font-weight: 700;">${formatCurrency(totalAPagar)}</span>
          </div>
          ${penalidad > 0 && aplicaGracia ? `
          <div class="payment-penalty-alert">
            <div class="penalty-alert-title">✓ Día de gracia aplicado</div>
            <p class="penalty-alert-text">Se aplicó 1 día de gracia. Penalidad: ${formatCurrency(penalidad)}</p>
          </div>
          ` : ""}
          ${penalidad > 0 && !aplicaGracia ? `
          <div class="payment-penalty-alert">
            <div class="penalty-alert-title">⚠ Mora acumulada</div>
            <p class="penalty-alert-text">${diasMora} días x ${formatCurrency(CONFIG.PENALIDAD_DIARIA)} = ${formatCurrency(penalidad)}</p>
          </div>
          ` : ""}
        </div>
      </div>
    `;
  }).filter(html => html !== "").join("");
  
  // Vista tabla (desktop)
  paymentTableBody.innerHTML = obligacion.cuotas.map(cuota => {
    // Validación defensiva de cuota
    if (!cuota || !cuota.fecha_vencimiento) {
      return "";
    }
    
    const venc = new Date(cuota.fecha_vencimiento);
    venc.setHours(0, 0, 0, 0);
    
    let estadoTexto = "Pendiente";
    let estadoClase = "pending";
    
    if (cuota.estado === "pagada") {
      estadoTexto = "Pagada";
      estadoClase = "paid";
    } else if (venc < hoy) {
      estadoTexto = "Vencida";
      estadoClase = "overdue";
    }
    
    const diasMora = venc < hoy && cuota.estado !== "pagada" 
      ? getDaysDifference(venc, hoy)
      : 0;
    
    const { penalidad } = calcularPenalidad(cuota, obligacion.clientes, diasMora);
    const valorCuota = cuota.valor_cuota || 0;
    const saldoPendiente = cuota.saldo_pendiente || valorCuota;
    const totalAPagar = saldoPendiente + penalidad;
    const numeroCuota = cuota.numero || "?";
    
    const rowClass = cuota.estado === "pagada" ? "row-paid" : venc < hoy ? "row-overdue" : "";
    
    return `
      <tr class="${rowClass}">
        <td>#${numeroCuota}</td>
        <td>${formatDate(cuota.fecha_vencimiento)}</td>
        <td class="table-cell-amount">${formatCurrency(valorCuota)}</td>
        <td><span class="table-badge badge-${estadoClase}">${estadoTexto}</span></td>
        <td>${diasMora > 0 ? diasMora : "-"}</td>
        <td class="table-cell-amount">${diasMora > 0 ? formatCurrency(penalidad) : "-"}</td>
        <td class="table-cell-amount">${formatCurrency(totalAPagar)}</td>
      </tr>
    `;
  }).filter(html => html !== "").join("");
}

// ========== CALCULAR PENALIDAD CON DESCUENTOS ==========
/**
 * Calcula la penalidad de una cuota considerando descuentos aplicados.
 * ACTUALIZADO: Ahora es async y consulta descuentos activos desde BD.
 */
async function calcularPenalidadConDescuentos(cuota, cliente, diasMora, obligacionId) {
  if (diasMora <= 0) {
    return { penalidad: 0, aplicaGracia: false, descuentosPenalidad: 0 };
  }
  
  let penalidad = 0;
  let aplicaGracia = false;
  let diasPenalizados = diasMora;
  
  // Verificar si puede aplicar día de gracia
  if (cliente.ultima_fecha_gracia_usada) {
    const ultimaGracia = new Date(cliente.ultima_fecha_gracia_usada);
    const hoy = new Date();
    const diasDesdeUltimaGracia = getDaysDifference(ultimaGracia, hoy);
    
    if (diasDesdeUltimaGracia >= CONFIG.GRACIA_CADA_DIAS && diasMora === 1) {
      aplicaGracia = true;
      diasPenalizados = 0; // No se cobra el primer día
    }
  } else {
    // Nunca ha usado gracia, puede aplicar en el primer día
    if (diasMora === 1) {
      aplicaGracia = true;
      diasPenalizados = 0;
    }
  }
  
  // Calcular penalidad base
  penalidad = diasPenalizados * CONFIG.PENALIDAD_DIARIA;
  
  // Obtener descuentos aplicables a penalidad
  let descuentosPenalidad = 0;
  
  try {
    const descuentos = await obtenerDescuentosAplicables({
      obligacion_id: obligacionId,
      cuota_id: cuota.id,
      aplica_a: 'penalidad'
    });
    
    // Aplicar descuentos
    descuentos.forEach(desc => {
      if (desc.tipo === 'fijo') {
        descuentosPenalidad += parseFloat(desc.valor);
      } else if (desc.tipo === 'porcentaje' && penalidad > 0) {
        descuentosPenalidad += penalidad * (parseFloat(desc.valor) / 100);
      }
    });
    
    // No permitir penalidad negativa
    penalidad = Math.max(0, penalidad - descuentosPenalidad);
    
  } catch (error) {
    console.warn("Error al obtener descuentos de penalidad:", error);
    // Continuar sin aplicar descuentos si falla la consulta
  }
  
  return { penalidad, aplicaGracia, descuentosPenalidad };
}

// Mantener versión síncrona para compatibilidad (sin descuentos)
function calcularPenalidad(cuota, cliente, diasMora) {
  if (diasMora <= 0) {
    return { penalidad: 0, aplicaGracia: false };
  }
  
  let penalidad = 0;
  let aplicaGracia = false;
  let diasPenalizados = diasMora;
  
  // Verificar si puede aplicar día de gracia
  if (cliente.ultima_fecha_gracia_usada) {
    const ultimaGracia = new Date(cliente.ultima_fecha_gracia_usada);
    const hoy = new Date();
    const diasDesdeUltimaGracia = getDaysDifference(ultimaGracia, hoy);
    
    if (diasDesdeUltimaGracia >= CONFIG.GRACIA_CADA_DIAS && diasMora === 1) {
      aplicaGracia = true;
      diasPenalizados = 0; // No se cobra el primer día
    }
  } else {
    // Nunca ha usado gracia, puede aplicar en el primer día
    if (diasMora === 1) {
      aplicaGracia = true;
      diasPenalizados = 0;
    }
  }
  
  penalidad = diasPenalizados * CONFIG.PENALIDAD_DIARIA;
  
  return { penalidad, aplicaGracia };
}

// ========== NOTIFICACIÓN DE GRACIA ==========
function mostrarNotificacionGracia(cliente) {
  if (!cliente.ultima_fecha_gracia_usada) {
    graceNotice.innerHTML = `
      <span class="grace-icon">🎁</span>
      <div class="grace-content">
        <div class="grace-title">Día de gracia disponible</div>
        <p class="grace-text">
          Tienes 1 día de gracia disponible que puedes usar en caso de atraso.
          Este beneficio se puede usar una vez cada 3 meses.
        </p>
      </div>
    `;
    graceNotice.style.display = "block";
    return;
  }
  
  const ultimaGracia = new Date(cliente.ultima_fecha_gracia_usada);
  const hoy = new Date();
  const diasDesdeUltimaGracia = getDaysDifference(ultimaGracia, hoy);
  
  if (diasDesdeUltimaGracia < CONFIG.GRACIA_CADA_DIAS) {
    const diasFaltantes = CONFIG.GRACIA_CADA_DIAS - diasDesdeUltimaGracia;
    const fechaDisponible = new Date(ultimaGracia);
    fechaDisponible.setDate(fechaDisponible.getDate() + CONFIG.GRACIA_CADA_DIAS);
    
    graceNotice.innerHTML = `
      <span class="grace-icon">⏳</span>
      <div class="grace-content">
        <div class="grace-title">Día de gracia no disponible</div>
        <p class="grace-text">
          Última vez usado: ${formatDate(cliente.ultima_fecha_gracia_usada)}.<br>
          Disponible nuevamente desde: <strong>${formatDate(fechaDisponible)}</strong> (${diasFaltantes} días).
      </p>
    `;
    graceNotice.style.display = "block";
  } else {
    graceNotice.innerHTML = `
      <span class="grace-icon">✓</span>
      <div class="grace-content">
        <div class="grace-title">Día de gracia disponible</div>
        <p class="grace-text">
          Tienes 1 día de gracia disponible. Se aplicará automáticamente en caso de atraso.
        </p>
      </div>
    `;
    graceNotice.style.display = "block";
  }
}

// ========== PAGAR POR WHATSAPP ==========
btnPayWhatsapp.addEventListener("click", () => {
  // Validaciones defensivas
  if (!currentObligation) {
    showToast("Error: No hay obligación seleccionada", "error");
    return;
  }
  
  if (!currentClient) {
    showToast("Error: No hay cliente seleccionado", "error");
    return;
  }
  
  if (!currentObligation.cuotas || !Array.isArray(currentObligation.cuotas)) {
    showToast("Error: No hay cuotas disponibles", "error");
    return;
  }
  
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  // Buscar cuota vencida o próxima
  const cuotaVencida = currentObligation.cuotas.find(c => {
    if (!c || !c.fecha_vencimiento) return false;
    const venc = new Date(c.fecha_vencimiento);
    venc.setHours(0, 0, 0, 0);
    return c.estado !== "pagada" && venc < hoy;
  });
  
  const cuotaPagar = cuotaVencida || currentObligation.cuotas.find(c => c && c.estado === "pendiente");
  
  if (!cuotaPagar) {
    showToast("No hay cuotas pendientes de pago", "info");
    return;
  }
  
  // Validaciones de la cuota
  if (!cuotaPagar.fecha_vencimiento) {
    showToast("Error: Cuota sin fecha de vencimiento", "error");
    return;
  }
  
  const venc = new Date(cuotaPagar.fecha_vencimiento);
  venc.setHours(0, 0, 0, 0);
  const diasMora = venc < hoy ? getDaysDifference(venc, hoy) : 0;
  const { penalidad } = calcularPenalidad(cuotaPagar, currentObligation.clientes, diasMora);
  const valorCuota = cuotaPagar.valor_cuota || 0;
  const saldoPendiente = cuotaPagar.saldo_pendiente || valorCuota;
  const totalAPagar = saldoPendiente + penalidad;
  
  const tipo = currentObligation.tipo === "prestamo" ? "Préstamo" : "Producto";
  const nombreCliente = currentClient.nombre || "Cliente";
  const documentoCliente = currentClient.documento || "Sin documento";
  const numeroCuota = cuotaPagar.numero || "?";
  const obligacionId = currentObligation.id || "?";
  
  const mensaje = `Hola, quiero realizar un pago:

📋 *Cliente:* ${nombreCliente}
🆔 *Documento:* ${documentoCliente}
💼 *Obligación:* ${tipo} #${obligacionId}
🔢 *Cuota:* #${numeroCuota}
📅 *Vencimiento:* ${formatDate(cuotaPagar.fecha_vencimiento)}
💰 *Valor cuota:* ${formatCurrency(valorCuota)}
${diasMora > 0 ? `⚠️ *Mora:* ${diasMora} días` : ""}
${penalidad > 0 ? `💸 *Penalidad:* ${formatCurrency(penalidad)}` : ""}
✅ *Total a pagar:* ${formatCurrency(totalAPagar)}

Espero confirmación. Gracias.`;
  
  const url = `https://wa.me/${CONFIG.WHATSAPP_PHONE}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
  
  showToast("Abriendo WhatsApp...", "success");
});

// ========== NAVEGACIÓN ==========
btnBack.addEventListener("click", () => {
  showSection("consultation");
  documentInput.value = "";
  currentClient = null;
  currentObligations = [];
});

btnBackToList.addEventListener("click", () => {
  showSection("results");
  currentObligation = null;
});

// ========== INICIALIZACIÓN ==========
Logger.info("📱 Inversiones MG - Módulo de Consulta Cliente iniciado");
