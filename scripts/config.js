// Configuración general de Inversiones MG
const CONFIG = {
  // WhatsApp para pagos
  WHATSAPP_PHONE: "573000000000", // Reemplazar con número real (formato: 57 + número)
  
  // Penalidades
  PENALIDAD_DIARIA: 5000, // COP por día de atraso
  
  // Día de gracia
  GRACIA_CADA_DIAS: 90, // 3 meses aproximadamente
  
  // Formatos
  MONEDA: "COP",
  LOCALE: "es-CO",
  
  // Configuración de sesión admin
  SESSION_KEY: "inversionesmg_admin_session",
  SESSION_DURATION: 8 * 60 * 60 * 1000, // 8 horas en milisegundos
  
  // Sistema de logging
  DEBUG_MODE: false, // Modo producción: solo errores críticos
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  },
  LOG_LEVEL: 0 // Solo errores en producción (cambiar a 2 o 3 para desarrollo)
};

// Sistema de logging profesional para producción
const Logger = {
  _shouldLog(level) {
    // En producción (DEBUG_MODE: false) solo se registran errores críticos
    // En desarrollo (DEBUG_MODE: true) se respeta LOG_LEVEL
    if (!CONFIG.DEBUG_MODE) {
      return level === CONFIG.LOG_LEVELS.ERROR;
    }
    return level <= CONFIG.LOG_LEVEL;
  },
  
  error(message, ...args) {
    // Los errores SIEMPRE se registran (críticos para producción)
    console.error(`❌ [ERROR] ${message}`, ...args);
  },
  
  warn(message, ...args) {
    if (this._shouldLog(CONFIG.LOG_LEVELS.WARN)) {
      console.warn(`⚠️ [WARN] ${message}`, ...args);
    }
  },
  
  info(message, ...args) {
    if (this._shouldLog(CONFIG.LOG_LEVELS.INFO)) {
      console.info(`ℹ️ [INFO] ${message}`, ...args);
    }
  },
  
  debug(message, ...args) {
    if (this._shouldLog(CONFIG.LOG_LEVELS.DEBUG)) {
      console.log(`🔍 [DEBUG] ${message}`, ...args);
    }
  },
  
  success(message, ...args) {
    if (this._shouldLog(CONFIG.LOG_LEVELS.INFO)) {
      console.log(`✅ [SUCCESS] ${message}`, ...args);
    }
  }
};

// Formatear moneda colombiana
function formatCurrency(value) {
  return new Intl.NumberFormat(CONFIG.LOCALE, {
    style: "currency",
    currency: CONFIG.MONEDA,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Formatear fecha
function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  return new Intl.DateTimeFormat(CONFIG.LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

// Formatear fecha con hora
function formatDateTime(date) {
  if (!date) return "-";
  const d = new Date(date);
  return new Intl.DateTimeFormat(CONFIG.LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Calcular días de diferencia
function getDaysDifference(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2 - d1;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Validar documento colombiano
function validarDocumento(documento) {
  // Solo números, entre 6 y 10 dígitos
  const regex = /^\d{6,10}$/;
  return regex.test(documento);
}

// Validar teléfono colombiano
function validarTelefono(telefono) {
  // 10 dígitos, empieza con 3
  const regex = /^3\d{9}$/;
  return regex.test(telefono.replace(/\s/g, ""));
}

// Validar email
function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}
