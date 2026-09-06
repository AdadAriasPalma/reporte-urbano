// =============================================================================
// REPORTE URBANO PWA - app.js (Módulo Controlador y Persistencia)
// =============================================================================

// --- 1. CONFIGURACIÓN Y OPERACIONES DE INDEXEDDB ---
const DB_NAME = 'ReportesUrbanoDB';
const DB_VERSION = 1;
const STORE_NAME = 'reportes_pendientes';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveReportDB(reporte) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(reporte);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllReportsDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteReportDB(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- 2. SELECCIÓN DEFENSIVA DE ELEMENTOS DEL DOM ---
let currentCoordinates = null;
let currentImageBase64 = null;

const form = document.getElementById('report-form');
const photoInput = document.getElementById('foto');
const imagePreview = document.getElementById('preview-image') || document.getElementById('image-preview');
const previewContainer = document.getElementById('preview-container');
const btnRemovePhoto = document.getElementById('btn-remove-photo');
const btnGps = document.getElementById('btn-gps');
const gpsStatus = document.getElementById('gps-status');
const reportsList = document.getElementById('reportes-lista') || document.getElementById('reports-list');
const emptyState = document.getElementById('empty-state');
const reportsCount = document.getElementById('reports-count');
const statusBadge = document.getElementById('connection-status');
const offlineIndicator = document.getElementById('offline-indicator');
const btnSync = document.getElementById('btn-sync');

// --- 3. CONVERSIÓN DE FOTO A BASE64 Y PREVISUALIZACIÓN ---
if (photoInput) {
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      currentImageBase64 = event.target.result;
      if (imagePreview) imagePreview.src = currentImageBase64;
      if (previewContainer) {
        previewContainer.hidden = false;
        previewContainer.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  });
}

// Botón para quitar fotografía previa
if (btnRemovePhoto) {
  btnRemovePhoto.addEventListener('click', () => {
    currentImageBase64 = null;
    if (photoInput) photoInput.value = '';
    if (imagePreview) imagePreview.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
    if (previewContainer) previewContainer.hidden = true;
  });
}

// --- 4. GEOLOCALIZACIÓN DEFENSIVA (SI EXISTE EL BOTÓN) ---
if (btnGps) {
  btnGps.addEventListener('click', () => {
    if (!navigator.geolocation) {
      if (gpsStatus) gpsStatus.textContent = 'Geolocalización no soportada.';
      return;
    }

    if (gpsStatus) gpsStatus.textContent = 'Obteniendo coordenadas...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        if (gpsStatus) {
          gpsStatus.textContent = `Ubicación: ${currentCoordinates.lat.toFixed(4)}, ${currentCoordinates.lng.toFixed(4)}`;
          gpsStatus.style.color = '#059669';
        }
      },
      () => {
        if (gpsStatus) {
          gpsStatus.textContent = 'No se pudo obtener la ubicación exacta.';
          gpsStatus.style.color = '#dc2626';
        }
      },
      { timeout: 5000 }
    );
  });
}

// --- 5. RENDERIZADO REACTIVO DE REPORTES ---
async function renderReports() {
  if (!reportsList) return;

  const reportes = await getAllReportsDB();
  reportsList.innerHTML = '';

  if (reportsCount) {
    reportsCount.textContent = `${reportes.length} reporte${reportes.length === 1 ? '' : 's'}`;
  }

  if (reportes.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  reportes.forEach((rep) => {
    const card = document.createElement('div');
    card.style.cssText = 'border: 1px solid #334155; padding: 0.75rem; border-radius: 8px; margin-bottom: 0.75rem; display: flex; gap: 0.75rem; align-items: center; background: #1e293b; color: #f8fafc;';

    const coordsText = rep.ubicacion?.lat 
      ? `${rep.ubicacion.lat.toFixed(3)}, ${rep.ubicacion.lng.toFixed(3)}` 
      : 'Sin GPS';

    const imgTag = rep.foto 
      ? `<img src="${rep.foto}" alt="Evidencia" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">`
      : '';

    card.innerHTML = `
      ${imgTag}
      <div style="flex: 1; min-width: 0;">
        <h4 style="font-size: 0.95rem; margin: 0 0 0.2rem 0; color: #f1f5f9; word-break: break-word;">${rep.titulo}</h4>
        <p style="font-size: 0.8rem; color: #94a3b8; margin: 0 0 0.2rem 0; word-break: break-word;">${rep.descripcion}</p>
        <small style="font-size: 0.75rem; color: #64748b;">GPS: ${coordsText} | ${new Date(rep.fecha).toLocaleTimeString()}</small>
      </div>
      <button onclick="eliminarReporte(${rep.id})" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 0.35rem 0.65rem; cursor: pointer; font-size: 0.75rem; font-weight: 600;">Borrar</button>
    `;
    reportsList.appendChild(card);
  });
}

window.eliminarReporte = async (id) => {
  await deleteReportDB(id);
  renderReports();
};

// --- 6. ENVÍO DEL FORMULARIO ---
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const tituloInput = document.getElementById('titulo');
    const descInput = document.getElementById('descripcion');

    const tituloVal = tituloInput?.value.trim() || '';
    const descVal = descInput?.value.trim() || '';

    if (!tituloVal || !descVal) {
      alert('Por favor completa todos los campos requeridos.');
      return;
    }

    const payload = {
      titulo: tituloVal,
      descripcion: descVal,
      foto: currentImageBase64 || '',
      ubicacion: currentCoordinates || { lat: null, lng: null },
      fecha: new Date().toISOString()
    };

    await saveReportDB(payload);
    await renderReports();

    form.reset();
    if (previewContainer) {
      previewContainer.hidden = true;
      previewContainer.classList.add('hidden');
    }
    if (gpsStatus) {
      gpsStatus.textContent = 'Ubicación no capturada';
      gpsStatus.style.color = '#6b7280';
    }
    currentImageBase64 = null;
    currentCoordinates = null;
  });
}

// --- 7. ESTADO DE RED Y SINCRONIZACIÓN ---
function updateOnlineStatus() {
  const isOnline = navigator.onLine;

  if (statusBadge) {
    statusBadge.textContent = isOnline ? 'En línea' : 'Modo Offline';
    statusBadge.className = `status-badge ${isOnline ? 'online' : 'offline'}`;
  }

  if (offlineIndicator) {
    offlineIndicator.hidden = isOnline;
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

if (btnSync) {
  btnSync.addEventListener('click', async () => {
    if (!navigator.onLine) {
      alert('No tienes conexión para sincronizar.');
      return;
    }

    const reportes = await getAllReportsDB();
    if (reportes.length === 0) {
      alert('No hay reportes pendientes.');
      return;
    }

    btnSync.textContent = 'Sincronizando...';
    btnSync.disabled = true;

    try {
      for (const rep of reportes) {
        await deleteReportDB(rep.id);
      }
      alert(`Se sincronizaron ${reportes.length} reporte(s).`);
      await renderReports();
    } catch {
      alert('Error al sincronizar.');
    } finally {
      btnSync.textContent = 'Sincronizar';
      btnSync.disabled = false;
    }
  });
}

// --- 8. SERVICE WORKER Y ARRANQUE ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.addEventListener('DOMContentLoaded', () => {
  renderReports();
});