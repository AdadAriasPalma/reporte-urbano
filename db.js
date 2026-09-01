
/**
 * ============================================================
 * Reporte Urbano - Módulo de Base de Datos (IndexedDB)
 * ============================================================
 * 
 * Maneja todas las operaciones de IndexedDB de forma asíncrona
 * usando Promesas nativas (sin librerías externas).
 * 
 * Base de datos: ReportesUrbanoDB
 * Object Store: reportes_pendientes
 * Índices: fecha (para ordenamiento), sincronizado (para filtrado)
 */

'use strict';

/**
 * Nombre de la base de datos IndexedDB
 * @constant {string}
 */
const DB_NAME = 'ReportesUrbanoDB';

/**
 * Versión de la base de datos (incrementar para migraciones)
 * @constant {number}
 */
const DB_VERSION = 1;

/**
 * Nombre del Object Store para reportes pendientes
 * @constant {string}
 */
const STORE_NAME = 'reportes_pendientes';

/**
 * Referencia a la conexión de base de datos abierta
 * @type {IDBDatabase|null}
 */
let dbInstance = null;

/**
 * Abre la conexión a IndexedDB y crea el esquema si es necesario.
 * Utiliza una Promise para manejar la asincronía de forma nativa.
 * 
 * @returns {Promise<IDBDatabase>} Promise que resuelve con la instancia de la BD
 * @throws {Error} Si no se puede abrir la base de datos
 */
export function openDatabase() {
    return new Promise((resolve, reject) => {
        // Si ya tenemos una conexión abierta, la reutilizamos
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Manejo de errores de apertura
        request.onerror = () => {
            const error = request.error || new Error('No se pudo abrir IndexedDB');
            console.error('[DB] Error al abrir la base de datos:', error);
            reject(error);
        };

        // Éxito al abrir - guardamos la instancia
        request.onsuccess = () => {
            dbInstance = request.result;
            console.log('[DB] Base de datos abierta correctamente:', DB_NAME);
            
            // Manejar cierre inesperado de la BD
            dbInstance.onclose = () => {
                console.warn('[DB] Conexión cerrada inesperadamente');
                dbInstance = null;
            };
            
            // Manejar errores en la conexión
            dbInstance.onerror = (event) => {
                console.error('[DB] Error en la conexión:', event.target.error);
            };
            
            resolve(dbInstance);
        };

        // Migración/creación del esquema (solo se ejecuta si version cambia o primera vez)
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log('[DB] Ejecutando migración/creación de esquema, versión:', event.newVersion);

            // Crear Object Store si no existe
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                // Índice para ordenar por fecha (más recientes primero)
                store.createIndex('fecha', 'fecha', { unique: false });
                
                // Índice para filtrar por estado de sincronización
                store.createIndex('sincronizado', 'sincronizado', { unique: false });
                
                // Índice compuesto para consultas complejas
                store.createIndex('fecha_sincronizado', ['fecha', 'sincronizado'], { unique: false });

                console.log('[DB] Object Store creado:', STORE_NAME);
            }
        };

        // Manejo de bloqueo (otra pestaña tiene la BD abierta con versión antigua)
        request.onblocked = () => {
            console.warn('[DB] Apertura bloqueada - cerrar otras pestañas con la app abierta');
            reject(new Error('Base de datos bloqueada. Cierre otras pestañas de la aplicación.'));
        };
    });
}

/**
 * Cierra la conexión a la base de datos.
 * Útil para limpieza al descargar la app o cambiar versión.
 * 
 * @returns {void}
 */
export function closeDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        console.log('[DB] Conexión cerrada');
    }
}

/**
 * Guarda un nuevo reporte en el Object Store 'reportes_pendientes'.
 * 
 * @param {Object} reporte - Objeto con los datos del reporte
 * @param {string} reporte.titulo - Título del reporte
 * @param {string} reporte.descripcion - Descripción detallada
 * @param {string|null} reporte.fotoBase64 - Fotografía en Base64 (puede ser null)
 * @param {string} reporte.fecha - Timestamp ISO 8601 de creación
 * @param {boolean} reporte.sincronizado - Estado de sincronización (default: false)
 * @returns {Promise<number>} Promise que resuelve con el ID autoincremental asignado
 * @throws {Error} Si falla la transacción
 */
export function saveReportDB(reporte) {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            // Preparar objeto a guardar (sin ID, se auto-genera)
            const reporteParaGuardar = {
                titulo: reporte.titulo,
                descripcion: reporte.descripcion,
                fotoBase64: reporte.fotoBase64 || null,
                fecha: reporte.fecha || new Date().toISOString(),
                sincronizado: reporte.sincronizado === true
            };

            const request = store.add(reporteParaGuardar);

            request.onsuccess = () => {
                const id = request.result;
                console.log('[DB] Reporte guardado con ID:', id);
                resolve(id);
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al guardar reporte');
                console.error('[DB] Error al guardar:', error);
                reject(error);
            };

            transaction.oncomplete = () => {
                console.log('[DB] Transacción de guardado completada');
            };

            transaction.onerror = () => {
                const error = transaction.error || new Error('Error en transacción');
                console.error('[DB] Error de transacción:', error);
            };
        });
    });
}

/**
 * Obtiene todos los reportes guardados, ordenados por fecha descendente (más recientes primero).
 * 
 * @returns {Promise<Array<Object>>} Promise que resuelve con array de reportes
 * @throws {Error} Si falla la lectura
 */
export function getAllReportsDB() {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('fecha'); // Índice por fecha

            // Usar cursor para recorrer en orden descendente (más recientes primero)
            const request = index.openCursor(null, 'prev');
            const reportes = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    reportes.push(cursor.value);
                    cursor.continue();
                } else {
                    // No más elementos, resolver con el array completo
                    console.log('[DB] Reportes obtenidos:', reportes.length);
                    resolve(reportes);
                }
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al leer reportes');
                console.error('[DB] Error al obtener reportes:', error);
                reject(error);
            };
        });
    });
}

/**
 * Obtiene un reporte específico por su ID.
 * 
 * @param {number} id - ID del reporte a buscar
 * @returns {Promise<Object|null>} Promise que resuelve con el reporte o null si no existe
 */
export function getReportById(id) {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                const reporte = request.result || null;
                resolve(reporte);
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al buscar reporte');
                console.error('[DB] Error al obtener reporte por ID:', error);
                reject(error);
            };
        });
    });
}

/**
 * Elimina un reporte por su ID.
 * 
 * @param {number} id - ID del reporte a eliminar
 * @returns {Promise<void>} Promise que resuelve cuando se elimina
 */
export function deleteReportDB(id) {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log('[DB] Reporte eliminado, ID:', id);
                resolve();
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al eliminar reporte');
                console.error('[DB] Error al eliminar:', error);
                reject(error);
            };
        });
    });
}

/**
 * Actualiza el estado de sincronización de un reporte.
 * 
 * @param {number} id - ID del reporte
 * @param {boolean} sincronizado - Nuevo estado de sincronización
 * @returns {Promise<void>}
 */
export function updateSyncStatus(id, sincronizado) {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            // Primero obtener el reporte actual
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const reporte = getRequest.result;
                if (!reporte) {
                    reject(new Error('Reporte con ID ' + id + ' no encontrado'));
                    return;
                }
                
                // Actualizar el campo
                reporte.sincronizado = sincronizado;
                
                // Guardar cambios
                const putRequest = store.put(reporte);
                putRequest.onsuccess = () => {
                    console.log('[DB] Estado de sincronización actualizado, ID:', id);
                    resolve();
                };
                putRequest.onerror = () => {
                    const error = putRequest.error || new Error('Error al actualizar');
                    reject(error);
                };
            };
            
            getRequest.onerror = () => {
                const error = getRequest.error || new Error('Error al leer reporte para actualizar');
                reject(error);
            };
        });
    });
}

/**
 * Obtiene solo los reportes no sincronizados (pendientes de envío al servidor).
 * Útil para procesos de sincronización en background.
 * 
 * @returns {Promise<Array<Object>>} Promise con array de reportes no sincronizados
 */
export function getPendingSyncReports() {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('sincronizado');
            const request = index.getAll(IDBKeyRange.only(false)); // false = no sincronizados

            request.onsuccess = () => {
                const reportes = request.result || [];
                console.log('[DB] Reportes pendientes de sync:', reportes.length);
                resolve(reportes);
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al obtener pendientes');
                console.error('[DB] Error al obtener pendientes de sync:', error);
                reject(error);
            };
        });
    });
}

/**
 * Limpia todos los reportes de la base de datos (uso cuidadoso).
 * 
 * @returns {Promise<void>}
 */
export function clearAllReports() {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('[DB] Todos los reportes eliminados');
                resolve();
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al limpiar base de datos');
                console.error('[DB] Error al limpiar:', error);
                reject(error);
            };
        });
    });
}

/**
 * Obtiene el conteo total de reportes guardados.
 * 
 * @returns {Promise<number>} Promise que resuelve con el número total
 */
export function countReports() {
    return openDatabase().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                const error = request.error || new Error('Error al contar reportes');
                reject(error);
            };
        });
    });
}

/**
 * Verifica si IndexedDB está disponible en el navegador.
 * 
 * @returns {boolean} true si está disponible
 */
export function isIndexedDBAvailable() {
    try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
        return false;
    }
}

// Exportar constantes para uso en otros módulos si se necesita
export { DB_NAME, STORE_NAME, DB_VERSION };

