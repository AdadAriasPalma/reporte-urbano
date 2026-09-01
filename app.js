
/**
 * ============================================================
 * Reporte Urbano - Aplicación Principal (PWA)
 * ============================================================
 * 
 * Módulo principal que orquesta la UI, validaciones,
 * previsualización de imágenes y persistencia en IndexedDB.
 * 
 * Usa ES Modules (type='module' en HTML) y Promesas nativas.
 * Sin frameworks, sin librerías externas.
 */

'use strict';

// Importar funciones de la base de datos
import {
    openDatabase,
    saveReportDB,
    getAllReportsDB,
    deleteReportDB,
    countReports,
    isIndexedDBAvailable
} from './db.js';

/**
 * ============================================================
 * ESTADO DE LA APLICACIÓN
 * ============================================================
 */

// Referencias a elementos del DOM (se inicializan en initDOMReferences)
let elements = {};

// Estado del formulario
let formState = {
    fotoBase64: null,
    fotoFile: null
};

/**
 * ============================================================
 * INICIALIZACIÓN
 * ============================================================
 */

/**
 * Inicializa la aplicación cuando el DOM está listo.
 * Configura referencias, event listeners y carga inicial.
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Iniciando Reporte Urbano...');
    
    // Verificar soporte de IndexedDB
    if (!isIndexedDBAvailable()) {
        showGlobalError('Tu navegador no soporta IndexedDB. La app no funcionará correctamente.');
        return;
    }

    try {
        // Inicializar referencias al DOM
        initDOMReferences();
        
        // Configurar event listeners
        setupEventListeners();
        
        // Abrir BD para verificar que funciona
        await openDatabase();
        console.log('[App] Base de datos lista');
        
        // Cargar reportes existentes
        await cargarYRenderizarReportes();
        
        // Configurar detección de conexión online/offline
        setupOnlineOfflineDetection();
        
        console.log('[App] Inicialización completada');
    } catch (error) {
        console.error('[App] Error en inicialización:', error);
        showGlobalError('Error al inicializar la aplicación: ' + error.message);
    }
});

/**
 * Inicializa las referencias a elementos del DOM para evitar
 * búsquedas repetidas y mejorar rendimiento.
 */
function initDOMReferences() {
    elements = {
        // Formulario
        form: document.getElementById('report-form'),
        titulo: document.getElementById('titulo'),
        descripcion: document.getElementById('descripcion'),
        foto: document.getElementById('foto'),
        
        // Previsualización
        photoPreviewContainer: document.getElementById('preview-container'),
        photoPreview: document.getElementById('preview-image'),
        btnRemovePhoto: document.getElementById('btn-remove-photo'),
        
        // Botón submit
        btnSubmit: document.getElementById('btn-submit'),
        btnText: document.querySelector('.btn-text'),
        btnLoader: document.querySelector('.btn-loader'),
        
        // Lista de reportes
        reportsList: document.getElementById('reportes-lista'),
        reportsCount: document.getElementById('reports-count'),
        emptyState: document.getElementById('empty-state'),
        
        // Footer
        offlineIndicator: document.getElementById('offline-indicator')
    };
}

/**
 * Configura todos los event listeners de la aplicación.
 * Usa delegación donde es apropiado para eficiencia.
 */
function setupEventListeners() {
    // Previsualización de imagen al seleccionar archivo
    elements.foto.addEventListener('change', handleFotoChange);
    
    // Eliminar foto previsualizada
    elements.btnRemovePhoto.addEventListener('click', handleRemovePhoto);
    
    // Envío del formulario
    elements.form.addEventListener('submit', handleFormSubmit);
    
    // Validación en tiempo real al escribir
    elements.titulo.addEventListener('input', () => clearError('titulo'));
    elements.descripcion.addEventListener('input', () => clearError('descripcion'));
    elements.foto.addEventListener('change', () => clearError('foto'));
    
    // Delegación de eventos para botones de eliminar en la lista
    elements.reportsList.addEventListener('click', (event) => {
        const btnDelete = event.target.closest('.btn-delete');
        if (btnDelete) {
            const reporteId = parseInt(btnDelete.dataset.reporteId, 10);
            if (!isNaN(reporteId)) {
                handleDeleteReporte(reporteId);
            }
        }
    });
    
    // Prevenir envío con Enter en campos de texto (solo textarea permite Enter)
    elements.titulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            elements.descripcion.focus();
        }
    });
}

/**
 * Configura la detección de estado online/offline.
 */
function setupOnlineOfflineDetection() {
    const updateOnlineStatus = () => {
        const isOnline = navigator.onLine;
        elements.offlineIndicator.hidden = isOnline;
        if (!isOnline) {
            console.log('[App] Modo offline detectado');
        }
    };
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Estado inicial
    updateOnlineStatus();
}

/**
 * ============================================================
 * MANEJO DE FOTOGRAFÍA
 * ============================================================
 */

/**
 * Maneja el cambio en el input de archivo (selección de foto).
 * Convierte la imagen a Base64 y muestra previsualización.
 * 
 * @param {Event} event - Evento change del input file
 */
function handleFotoChange(event) {
    const file = event.target.files[0];
    
    if (!file) {
        // Usuario canceló la selección
        resetPhotoPreview();
        return;
    }
    
    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
        showError('foto', 'El archivo debe ser una imagen (JPG, PNG, WebP, etc.)');
        resetFileInput();
        return;
    }
    
    // Validar tamaño (máx 5MB para rendimiento en IndexedDB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
        showError('foto', 'La imagen es muy grande. Máximo 5 MB.');
        resetFileInput();
        return;
    }
    
    // Limpiar errores previos
    clearError('foto');
    
    // Leer archivo como Base64 usando FileReader (Promise-based)
    readFileAsBase64(file)
        .then((base64) => {
            formState.fotoBase64 = base64;
            formState.fotoFile = file;
            
            // Mostrar previsualización
            elements.photoPreview.src = 'data:image/jpeg;base64,' + base64;
            elements.photoPreviewContainer.hidden = false;
            
            // Scroll suave a la previsualización en móviles
            elements.photoPreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        })
        .catch((error) => {
            console.error('[App] Error al leer archivo:', error);
            showError('foto', 'No se pudo leer la imagen. Intenta con otra.');
            resetFileInput();
        });
}

/**
 * Lee un File como Base64 usando FileReader envuelto en Promise.
 * 
 * @param {File} file - Archivo a leer
 * @returns {Promise<string>} Promise que resuelve con el string Base64
 */
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
            // reader.result es un data URL (data:image/jpeg;base64,...)
            // Extraer solo la parte Base64 para almacenamiento eficiente
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        
        reader.onerror = () => {
            reject(reader.error || new Error('Error al leer archivo'));
        };
        
        reader.readAsDataURL(file);
    });
}

/**
 * Maneja el clic en el botón de eliminar foto.
 */
function handleRemovePhoto() {
    resetPhotoPreview();
    resetFileInput();
    elements.titulo.focus();
}

/**
 * Resetea la previsualización de foto.
 */
function resetPhotoPreview() {
    formState.fotoBase64 = null;
    formState.fotoFile = null;
    elements.photoPreview.src = '';
    elements.photoPreviewContainer.hidden = true;
}

/**
 * Resetea el input de archivo.
 */
function resetFileInput() {
    elements.foto.value = '';
}

/**
 * ============================================================
 * VALIDACIÓN Y ENVÍO DE FORMULARIO
 * ============================================================
 */

/**
 * Valida el formulario antes de enviar.
 * 
 * @returns {boolean} true si es válido
 */
function validarFormulario() {
    let esValido = true;
    
    // Validar título
    const titulo = elements.titulo.value.trim();
    if (!titulo) {
        showError('titulo', 'El título es obligatorio');
        esValido = false;
    } else if (titulo.length > 100) {
        showError('titulo', 'El título no puede exceder 100 caracteres');
        esValido = false;
    }
    
    // Validar descripción
    const descripcion = elements.descripcion.value.trim();
    if (!descripcion) {
        showError('descripcion', 'La descripción es obligatoria');
        esValido = false;
    } else if (descripcion.length > 500) {
        showError('descripcion', 'La descripción no puede exceder 500 caracteres');
        esValido = false;
    }
    
    // Validar foto (opcional, pero si hay archivo validar)
    const fotoFile = elements.foto.files[0];
    if (fotoFile) {
        if (!fotoFile.type.startsWith('image/')) {
            showError('foto', 'El archivo debe ser una imagen');
            esValido = false;
        } else if (fotoFile.size > 5 * 1024 * 1024) {
            showError('foto', 'La imagen es muy grande. Máximo 5 MB.');
            esValido = false;
        }
    }
    
    return esValido;
}

/**
 * Maneja el envío del formulario (guardar reporte).
 * 
 * @param {SubmitEvent} event - Evento submit del formulario
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    // Validar
    if (!validarFormulario()) {
        // Enfocar primer campo con error
        const firstError = elements.form.querySelector('.error-message:not(:empty)');
        if (firstError) {
            const inputId = firstError.id.replace('error-', '');
            const input = document.getElementById(inputId);
            if (input) input.focus();
        }
        return;
    }
    
    // Deshabilitar botón durante guardado
    setSubmitLoading(true);
    
    try {
        // Preparar datos del reporte
        const reporte = {
            titulo: elements.titulo.value.trim(),
            descripcion: elements.descripcion.value.trim(),
            fotoBase64: formState.fotoBase64,
            fecha: new Date().toISOString(),
            sincronizado: false
        };
        
        // Guardar en IndexedDB
        const id = await saveReportDB(reporte);
        
        // Éxito - resetear formulario
        resetFormulario();
        
        // Recargar lista de reportes
        await cargarYRenderizarReportes();
        
        // Feedback visual de éxito (toast simple)
        showToast('Reporte guardado correctamente (ID: ' + id + ')');
        
    } catch (error) {
        console.error('[App] Error al guardar reporte:', error);
        showToast('Error al guardar: ' + error.message, true);
    } finally {
        setSubmitLoading(false);
    }
}

/**
 * Resetea el formulario a su estado inicial.
 */
function resetFormulario() {
    elements.form.reset();
    resetPhotoPreview();
    // Limpiar cualquier mensaje de error residual
    ['titulo', 'descripcion', 'foto'].forEach(clearError);
}

/**
 * Cambia el estado visual del botón submit (cargando/normal).
 * 
 * @param {boolean} loading - true para estado de carga
 */
function setSubmitLoading(loading) {
    elements.btnSubmit.disabled = loading;
    elements.btnText.hidden = loading;
    elements.btnLoader.hidden = !loading;
}

/**
 * ============================================================
 * RENDERIZADO DE LISTA DE REPORTES
 * ============================================================
 */

/**
 * Carga los reportes de IndexedDB y los renderiza en el DOM.
 * Usa createElement y textContent para evitar XSS.
 */
async function cargarYRenderizarReportes() {
    try {
        const reportes = await getAllReportsDB();
        renderizarReportes(reportes);
        actualizarContador(reportes.length);
    } catch (error) {
        console.error('[App] Error al cargar reportes:', error);
        elements.reportsList.innerHTML = '';
        const errorMsg = document.createElement('p');
        errorMsg.className = 'empty-state';
        errorMsg.textContent = 'Error al cargar los reportes';
        elements.reportsList.appendChild(errorMsg);
        actualizarContador(0);
    }
}

/**
 * Renderiza la lista de reportes en el contenedor.
 * Crea elementos DOM de forma segura (sin innerHTML).
 * 
 * @param {Array<Object>} reportes - Array de objetos reporte
 */
function renderizarReportes(reportes) {
    // Limpiar contenedor
    elements.reportsList.innerHTML = '';
    
    if (reportes.length === 0) {
        elements.emptyState.hidden = false;
        return;
    }
    
    elements.emptyState.hidden = true;
    
    // Crear fragmento para inserción eficiente
    const fragment = document.createDocumentFragment();
    
    reportes.forEach((reporte) => {
        const card = crearTarjetaReporte(reporte);
        fragment.appendChild(card);
    });
    
    elements.reportsList.appendChild(fragment);
}

/**
 * Crea una tarjeta (card) de reporte usando createElement y textContent.
 * Prevención de XSS: nunca se usa innerHTML con datos de usuario.
 * 
 * @param {Object} reporte - Objeto reporte con id, titulo, descripcion, fotoBase64, fecha
 * @returns {HTMLElement} Elemento article con la tarjeta
 */
function crearTarjetaReporte(reporte) {
    // Article principal
    const article = document.createElement('article');
    article.className = 'report-card';
    article.setAttribute('role', 'listitem');
    article.dataset.reporteId = reporte.id;
    
    // Header: título + fecha
    const header = document.createElement('div');
    header.className = 'report-card-header';
    
    const titulo = document.createElement('h3');
    titulo.className = 'report-card-title';
    titulo.textContent = reporte.titulo; // textContent = seguro contra XSS
    
    const fecha = document.createElement('time');
    fecha.className = 'report-card-date';
    fecha.dateTime = reporte.fecha;
    fecha.textContent = formatearFecha(reporte.fecha);
    
    header.appendChild(titulo);
    header.appendChild(fecha);
    
    // Descripción
    const descripcion = document.createElement('p');
    descripcion.className = 'report-card-description';
    descripcion.textContent = reporte.descripcion; // textContent = seguro
    
    // Agregar header y descripción al article
    article.appendChild(header);
    article.appendChild(descripcion);
    
    // Foto (si existe)
    if (reporte.fotoBase64) {
        const photoContainer = document.createElement('div');
        photoContainer.className = 'report-card-photo';
        
        const img = document.createElement('img');
        // Reconstruir data URL desde Base64 almacenado
        // Detectar tipo MIME aproximado (asumimos JPEG por defecto)
        img.src = 'data:image/jpeg;base64,' + reporte.fotoBase64;
        img.alt = 'Fotografía del reporte: ' + reporte.titulo;
        img.loading = 'lazy'; // Carga diferida para rendimiento
        
        photoContainer.appendChild(img);
        article.appendChild(photoContainer);
    }
    
    // Acciones (botón eliminar)
    const actions = document.createElement('div');
    actions.className = 'report-card-actions';
    
    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-delete';
    btnDelete.dataset.reporteId = reporte.id;
    btnDelete.textContent = 'Eliminar';
    btnDelete.setAttribute('aria-label', 'Eliminar reporte: ' + reporte.titulo);
    
    actions.appendChild(btnDelete);
    article.appendChild(actions);
    
    return article;
}

/**
 * Formatea una fecha ISO 8601 a formato legible en español.
 * 
 * @param {string} fechaISO - Fecha en formato ISO 8601
 * @returns {string} Fecha formateada (ej: '15/01/2024 14:30')
 */
function formatearFecha(fechaISO) {
    const fecha = new Date(fechaISO);
    
    // Verificar fecha válida
    if (isNaN(fecha.getTime())) {
        return 'Fecha inválida';
    }
    
    const opciones = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    
    return fecha.toLocaleString('es-ES', opciones);
}

/**
 * Actualiza el contador de reportes en la UI.
 * 
 * @param {number} count - Número de reportes
 */
function actualizarContador(count) {
    elements.reportsCount.textContent = count === 1 ? '1 reporte' : count + ' reportes';
}

/**
 * Maneja la eliminación de un reporte con confirmación.
 * 
 * @param {number} reporteId - ID del reporte a eliminar
 */
async function handleDeleteReporte(reporteId) {
    // Confirmación nativa (simple, accesible)
    const confirmado = confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.');
    
    if (!confirmado) return;
    
    try {
        await deleteReportDB(reporteId);
        await cargarYRenderizarReportes();
        showToast('Reporte eliminado');
    } catch (error) {
        console.error('[App] Error al eliminar:', error);
        showToast('Error al eliminar: ' + error.message, true);
    }
}

/**
 * ============================================================
 * UTILIDADES DE UI / FEEDBACK
 * ============================================================
 */

/**
 * Muestra un mensaje de error en el campo especificado.
 * 
 * @param {string} fieldName - Nombre del campo (titulo, descripcion, foto)
 * @param {string} message - Mensaje de error
 */
function showError(fieldName, message) {
    const errorElement = elements['error' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1)];
    if (errorElement) {
        errorElement.textContent = message;
    }
    
    // Agregar clase visual al input
    const input = elements[fieldName];
    if (input) {
        input.style.borderColor = 'var(--color-error)';
    }
}

/**
 * Limpia el mensaje de error de un campo.
 * 
 * @param {string} fieldName - Nombre del campo
 */
function clearError(fieldName) {
    const errorElement = elements['error' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1)];
    if (errorElement) {
        errorElement.textContent = '';
    }
    
    const input = elements[fieldName];
    if (input) {
        input.style.borderColor = '';
    }
}

/**
 * Muestra un toast (notificación temporal) en pantalla.
 * Implementación simple sin librerías.
 * 
 * @param {string} message - Mensaje a mostrar
 * @param {boolean} isError - Si es error (rojo) o éxito (verde)
 */
function showToast(message, isError = false) {
    // Eliminar toast existente si hay
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    // Estilos inline para toast (evitar CSS extra para algo simple)
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        borderRadius: '8px',
        background: isError ? 'var(--color-error)' : 'var(--color-success)',
        color: '#fff',
        fontSize: '0.9rem',
        fontWeight: '500',
        boxShadow: 'var(--shadow-lg)',
        zIndex: '1000',
        opacity: '0',
        transition: 'opacity 0.3s ease, transform 0.3s ease'
    });
    
    document.body.appendChild(toast);
    
    // Animar entrada
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    // Auto-eliminar después de 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Muestra un error global crítico (bloqueante).
 * 
 * @param {string} message - Mensaje de error
 */
function showGlobalError(message) {
    const div = document.createElement('div');
    div.style.cssText = '
        position: fixed;
        top: 0; left: 0; right: 0;
        background: var(--color-error);
        color: white;
        padding: 16px;
        text-align: center;
        z-index: 9999;
        font-weight: 500;
    ';
    div.textContent = message;
    document.body.prepend(div);
}

/**
 * ============================================================
 * SERVICE WORKER (Registro para PWA)
 * ============================================================
 */

// Registrar Service Worker si está disponible
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('[SW] Registrado:', registration.scope);
            })
            .catch((error) => {
                console.warn('[SW] Error en registro:', error);
            });
    });
}

