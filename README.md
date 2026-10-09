# ⚡ Aurion // Dual-State Multimedia Downloader

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-00ffaa?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows%2011%20%7C%2010-blue?style=for-the-badge" alt="Platform" />
  <img src="https://img.shields.io/badge/python-3.12-yellow?style=for-the-badge" alt="Python" />
  <img src="https://img.shields.io/badge/license-MIT-purple?style=for-the-badge" alt="License" />
</p>

**Aurion** es una suite de escritorio nativa para Windows enfocada en la captura automatizada, aceleración de red y ensamblado eficiente de transmisiones multimedia en alta definición (Anime, Cine y YouTube). 

Combina una interfaz reactiva acelerada por GPU con una extensión para navegadores Chromium capaz de auditar e interceptar manifiestos HLS en tiempo real antes de procesar cualquier descarga.

---

## 📸 Demostración Visual

<table align="center" width="100%">
  <tr>
    <td align="center" width="50%">
      <b>🎬 Modo Anime & Cine</b><br/><br/>
      <img src="assets/preview-anime.png" alt="Modo Anime y Cine" style="border-radius: 6px;" />
      <p><i>Gestión dual con correlación inteligente de temporadas y episodios.</i></p>
    </td>
    <td align="center" width="50%">
      <b>📺 Módulo YouTube Integrado</b><br/><br/>
      <img src="assets/preview-youtube.png" alt="Módulo YouTube" style="border-radius: 6px;" />
      <p><i>Búsqueda en directo y extracción selectiva (Vídeo HD/4K o Audio MP3 a 320 kbps).</i></p>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <b>🌐 Extensión Chromium (HLS Link Sniffer)</b><br/><br/>
      <img src="assets/preview-extension.png" alt="Extensión de Navegador" width="65%" style="border-radius: 6px;" />
      <p><i>Sonda predictiva: intercepción de streams <code>.m3u8</code> y cálculo en tiempo real de bitrate y peso.</i></p>
    </td>
  </tr>
</table>

---

## 🚀 Características Principales

* **Arquitectura Dual-State:** Separación de lógica entre series correlativas (temporadas/episodios) y largometrajes independientes.
* **Módulo YouTube Reactivo:** Búsqueda en directo integrada, selección de perfiles de calidad y transcodificación rápida.
* **Motor HLS Multi-hilo:** Descarga concurrente de fragmentos mediante aceleración por `aria2c` y ensamblado final en `FFmpeg`.
* **Interfaz HUD Liquid Glass:** Ventana moderna sin marcos nativos del sistema operativo, renderizada mediante Edge WebView2 (`pywebview`).
* **Comunicación Asíncrona:** Sincronización en tiempo real entre la extensión del navegador y el daemon local de descargas.

---

## 🛠️ Stack Tecnológico

* **Núcleo de Sistema:** Python 3.12, `pywebview`, `yt-dlp`.
* **Procesamiento de Flujos:** `FFmpeg`, `aria2c`.
* **Frontend:** Vanilla JavaScript (ES6+), CSS3 Modern Glassmorphism.
* **Integración Web:** Manifest V3, WebRequest API, Content Scripts.
* **Empaquetado y Distribución:** Inno Setup Compiler.

---

## 📥 Instalación

1. Descarga el instalador oficial **`AurionSetup.exe`** desde el apartado de **[Releases](../../releases)**.
2. Ejecuta el asistente para desplegar los binarios internos y crear los accesos directos en el sistema.

---

## 🌐 Configuración de la Extensión

1. Abre `chrome://extensions/` en Google Chrome, Brave o Edge.
2. Activa el conmutador de **Modo de desarrollador** en la esquina superior derecha.
3. Haz clic en **Cargar descomprimida** y selecciona la carpeta `/extension` de este repositorio.

---

## ⚠️ Descargo de Responsabilidad

Este software ha sido desarrollado con fines exclusivamente educativos y de investigación sobre protocolos de red, interfaces reactivas y manipulación de flujos de datos multimedia. El usuario asume toda la responsabilidad sobre el uso del programa y los contenidos gestionados a través de él.

---

## 📄 Licencia

Distribuido bajo los términos de la Licencia MIT. Consulta el archivo `LICENSE` para más información.