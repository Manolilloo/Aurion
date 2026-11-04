// ========================================================
// AURION • PASOS DEL TOUR GUIADO: MODO ANIME
// ========================================================
window.animeTourSteps = [
  {
    id: 'sites',
    title: 'Portales de Streaming',
    desc: 'Accede a los portales de emisión pulsando la pestaña SITIOS.',
    target: '.sites-dock',
    placement: 'bottom-left'
  },
  {
    id: 'modes',
    title: 'Selector de Entornos',
    desc: 'Cambia entre ANIME, CINE y YOUTUBE con un clic o con la tecla TAB.',
    target: '#btn-switch-mode',
    placement: 'bottom-center'
  },
  {
    id: 'extension',
    title: 'Asistente de Navegador',
    desc: 'Conecta Aurion a tu navegador para capturar vídeos con un solo clic.',
    target: '#btn-extension-helper',
    placement: 'bottom-right',
    isExtensionStep: true
  },
  {
    id: 'dest_dir',
    title: 'Directorio de Destino',
    desc: 'Define dónde se descargarán los episodios en tu disco local.',
    target: '#block-dest-dir',
    placement: 'left-center'
  },
  {
    id: 'season_group',
    title: 'Gestor de Temporadas',
    desc: 'Ajusta el número de temporada o activa Temporada Única.',
    target: '#block-season-group',
    placement: 'left-center'
  },
  {
    id: 'toggles_group',
    title: 'Carátulas y Notificaciones',
    desc: 'Guarda la portada folder.jpg y abre la carpeta automáticamente.',
    target: '#block-toggles-group',
    placement: 'left-center'
  },
  {
    id: 'container_fmt',
    title: 'Contenedor de Salida',
    desc: 'Elige entre archivo .MKV (ideal para múltiples subtítulos) o .MP4.',
    target: '#block-container-fmt',
    placement: 'left-center'
  },
  {
    id: 'threads_simul',
    title: 'Motor de Concurrencia',
    desc: 'Controla los hilos y las descargas en paralelo para exprimir tu red.',
    target: '#block-threads-simul',
    placement: 'left-center'
  },
  {
    id: 'telemetry',
    title: 'Telemetría de Disco',
    desc: 'Monitoriza el espacio libre y porcentaje de uso de tu almacenamiento.',
    target: '#block-telemetry',
    placement: 'left-center'
  },
  {
    id: 'workspace_center',
    title: 'Radar de Búsqueda y Póster',
    desc: 'Escribe el nombre de la serie para cargar su portada y paleta cromática.',
    target: '#center-stage',
    placement: 'search-docked-left'
  },
  {
    id: 'master_extraction',
    title: 'Consola de Extracción',
    desc: 'Inicia o cancela las descargas con la barra ESPACIO o con este botón.',
    target: '#split-cluster-master',
    placement: 'master-docked-left'
  },
  {
    id: 'pipeline',
    title: 'Pipeline y Monitor Activo',
    desc: 'Controla el progreso, velocidad y peso de las transmisiones en curso.',
    target: '.glass-box:first-child',
    placement: 'bottom-left'
  }
];