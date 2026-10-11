// ========================================================
// AURION • PASOS DEL TOUR GUIADO: MODO CINE
// ========================================================
window.cinemaTourSteps = [
  {
    id: 'sites',
    title: 'Portales de Cine',
    desc: 'Accede a los portales de películas pulsando la pestaña SITIOS.',
    target: '.sites-dock',
    placement: 'bottom-left'
  },
  {
    id: 'modes',
    title: 'Selector de Entornos',
    desc: 'Alterna entre ANIME, CINE y YOUTUBE fácilmente o con TAB.',
    target: '#btn-switch-mode',
    placement: 'bottom-center'
  },
  {
    id: 'extension',
    title: 'Asistente de Navegador',
    desc: 'Detecta y envía películas desde tu navegador directamente a Aurion.',
    target: '#btn-extension-helper',
    placement: 'bottom-right',
    isExtensionStep: true
  },
  {
    id: 'dest_dir',
    title: 'Directorio de Películas',
    desc: 'Configura la carpeta local donde se almacenarán tus largometrajes.',
    target: '#block-dest-dir',
    placement: 'left-center'
  },
  {
    id: 'toggles_group',
    title: 'Carátula y Finalización',
    desc: 'Guarda la portada cinematográfica oficial y abre la carpeta al terminar.',
    target: '#block-toggles-group',
    placement: 'left-center'
  },
  {
    id: 'container_fmt',
    title: 'Contenedor de Salida',
    desc: 'Elige entre .MKV (múltiples pistas de audio y subtítulos) o .MP4.',
    target: '#block-container-fmt',
    placement: 'left-center'
  },
  {
    id: 'threads_simul',
    title: 'Motor de Concurrencia',
    desc: 'Ajusta los hilos de red para descargar películas a la máxima velocidad.',
    target: '#block-threads-simul',
    placement: 'left-center'
  },
  {
    id: 'telemetry',
    title: 'Telemetría de Almacenamiento',
    desc: 'Comprueba el espacio disponible para almacenar vídeos de alta definición.',
    target: '#block-telemetry',
    placement: 'left-center'
  },
  {
    id: 'workspace_center',
    title: 'Búsqueda Cinemática',
    desc: 'Invoca títulos para cargar su ficha técnica y póster en alta resolución.',
    target: '#center-stage',
    placement: 'search-docked-left'
  },
  {
    id: 'master_extraction',
    title: 'Botón de Descarga',
    desc: 'Comienza la extracción de la película con un clic o pulsando ESPACIO.',
    target: '#split-cluster-master',
    placement: 'master-docked-left'
  },
  {
    id: 'pipeline',
    title: 'Pipeline de Película',
    desc: 'Monitoriza el progreso de la descarga y el empaquetado del film.',
    target: '.glass-box:first-child',
    placement: 'bottom-left'
  }
];