# ⚡ Aurion // Dual-State Multimedia Downloader

![Version](https://img.shields.io/badge/version-1.0.0-00ffaa?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows%2011%20%7C%2010-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-purple?style=for-the-badge)

**Aurion** es una suite de escritorio nativa para Windows enfocada en la captura automatizada, aceleración de red y ensamblado eficiente de transmisiones multimedia en alta definición (Anime, Cine y YouTube).

Dispone de una arquitectura reactiva que se complementa con una extensión para navegadores Chromium capaz de interceptar y auditar manifiestos HLS en tiempo real antes de procesar la descarga.

---

## 🚀 Características Principales

* **Arquitectura Dual-State:** Gestión aislada para series (cálculo correlativo de temporadas y episodios) y películas sin interferencias de metadatos.
* **Módulo YouTube:** Búsqueda reactiva, descarga selectiva de vídeo multiresolución o extracción directa a MP3 (320 kbps).
* **Motor HLS & Multi-hilo:** Soporte de fragmentos concurrentes y aceleración con `aria2c` y `FFmpeg`.
* **Sonda Predictiva:** Estimación de bitrate, resolución máxima y peso del archivo desde el navegador antes de iniciar tareas.
* **Interfaz HUD Liquid Glass:** Ventana moderna acelerada por GPU mediante WebKit/WebView2.

---

## 🛠️ Stack Tecnológico

* **Núcleo:** Python 3.12 (`pywebview`, `yt-dlp`).
* **Binarios Multimedia:** `FFmpeg`, `aria2c`.
* **Interfaz de Usuario:** Vanilla ES6+, CSS3 Modern Glassmorphism.
* **Extensión de Navegador:** Manifest V3, WebRequest API, Content Scripts.
* **Empaquetador:** Inno Setup Compiler.

---

## 📥 Instalación

1. Descarga el instalador oficial **`AurionSetup.exe`** desde la sección de **Releases** de este repositorio.
2. Ejecuta el asistente de instalación para desplegar la aplicación y sus accesos directos.

---

## 🌐 Extensión para el Navegador

Para comunicar el navegador con Aurion:

1. Abre `chrome://extensions/` en Google Chrome, Brave o Edge.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Pulsa sobre **Cargar descomprimida** y selecciona la carpeta `/extension` de este repositorio.

---

## ⚠️ Descargo de Responsabilidad

Este software ha sido desarrollado con fines exclusivamente educativos y de investigación sobre protocolos de red, interfaces reactivas y manipulación de flujos de datos. El usuario asume toda la responsabilidad sobre el uso del programa y los contenidos gestionados a través de él.

---

## 📄 Licencia

Distribuido bajo los términos de la Licencia MIT. Consulta el archivo `LICENSE` para más información.