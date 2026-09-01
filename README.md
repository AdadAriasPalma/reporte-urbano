# Reporte Urbano PWA

Progressive Web App (PWA) para la captura ciudadana de incidencias y fallas en la vía pública, desarrollada con JavaScript Vanilla y almacenamiento local transaccional.

## Características Técnicas
* **Persistencia Local:** Almacenamiento fuera de línea mediante IndexedDB con Promesas nativas (`ReportesUrbanoDB`).
* **Seguridad:** Renderizado seguro de entradas de usuario (`textContent` / `document.createElement`) para mitigación de vulnerabilidades XSS.
* **Multimedia:** Captura de imágenes y conversión a Base64 mediante la FileReader API.
* **Diseño:** CSS3 nativo mobile-first responsivo con Flexbox y Grid, sin frameworks externos.

## Estructura del Proyecto
* `index.html` - Formulario semántico accesible y contenedores de vista.
* `style.css` - Sistema de estilos responsivo y temas de interfaz.
* `db.js` - Módulo de base de datos asíncrono con funciones CRUD nativas.
* `app.js` - Controlador de eventos, validaciones y renderizado del DOM.
* `manifest.json` - Manifiesto web para soporte de instalación PWA.

## Ejecución Local
Para probar la aplicación en un entorno seguro (requerido para Service Workers e IndexedDB):

1. Clona el repositorio:
   ```bash
   git clone [https://github.com/AdadAriasPalma/reporte-urbano.git](https://github.com/AdadAriasPalma/reporte-urbano.git)
   cd reporte-urbano