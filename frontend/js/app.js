let currentMode = window.currentMode = 'anime';
const downloadQueue = [];

const portalData = {
  anime: [
    { id: 'FLV', title: 'AnimeFLV', url: 'https://animeflv.or.at/', icon: 'assets/icons/animeflv.png' },
    { id: 'JK', title: 'JKAnime', url: 'https://jkanime.net/', icon: 'assets/icons/jkanime.png' },
    { id: 'AON', title: 'AnimeOnlineNinja', url: 'https://ww3.animeonline.ninja/', icon: 'assets/icons/animeonlineninja.png' }
  ],
  movie: [
    { id: 'PP', title: 'PelisPlus', url: 'https://pelisplushd.bz/', icon: 'assets/icons/pelisplus.png' },
    { id: 'C3', title: 'Cuevana3', url: 'https://icuevana3.video/', icon: 'assets/icons/cuevana.png' },
    { id: 'HDF', title: 'HDFull', url: 'https://dominioshdfull.com/', icon: 'assets/icons/hdfull.png' }
  ]
};

const modeStates = window.modeStates = {
  anime: {
    query: '',
    prefix: '',
    dir: '',
    season: 1,
    startEp: 1,
    singleSeason: false,
    saveCover: true,
    openFolder: true,
    fmt: 'mkv',
    threads: '32',
    simul: '20',
    bg: '',
    title: 'Esperando consulta...',
    tags: 'SISTEMA LISTO',
    accent1: '#00ffaa',
    accent2: '#8a2be2',
    queue: []
  },
  movie: {
    query: '',
    prefix: '',
    dir: '',
    season: 1,
    startEp: 1,
    singleSeason: false,
    saveCover: true,
    openFolder: true,
    fmt: 'mkv',
    threads: '32',
    simul: '5',
    bg: '',
    title: 'Esperando consulta...',
    tags: 'SISTEMA LISTO',
    accent1: '#ff3366',
    accent2: '#ffaa00',
    queue: []
  },
  youtube: {
    query: '',
    dir: '',
    format: 'video',
    res: '1080',
    openFolder: true,
    selectedVideo: null,
    results: []
  }
};


function pyCall(func, ...args) {
  try {
    if (window.pywebview && window.pywebview.api && window.pywebview.api[func]) {
      return window.pywebview.api[func](...args);
    }
  } catch (e) {
    console.error(`[pyCall] Error llamando a ${func}:`, e);
  }
  return null;
}

// Justo aquí debajo, fuera de la función:
window.pyCall = pyCall;

window.openExtensionModal = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (typeof playSynth === 'function') playSynth('click');
  if (typeof window.initAndOpenExtensionHelper === 'function') {
    window.initAndOpenExtensionHelper();
  } else {
    const modal = document.getElementById('ext-modal-overlay');
    if (modal) modal.classList.add('active');
  }
};

window.updateChipGlider = updateChipGlider;
window.refreshAllGliders = refreshAllGliders;
window.saveCurrentState = saveCurrentState;
window.applyDynamicPalette = applyDynamicPalette;
window.setAppMode = setAppMode;
window.extractSeasonNumber = extractSeasonNumber;
window.renderQueueCard = renderQueueCard;
window.updateTotalQueueSize = updateTotalQueueSize;

function openPortalUrl(url) {
  if (window.pywebview && window.pywebview.api && window.pywebview.api.open_external_browser) {
    pyCall('open_external_browser', url);
  } else {
    window.open(url, '_blank');
  }
}

// 1. RENDERIZADO DE LOS LOGOS DE SITIOS
function renderSitesDock(mode) {
  const container = document.getElementById('sites-items-box');
  if (!container) return;
  container.innerHTML = '';

  const portals = portalData[mode] || portalData['anime'];
  portals.forEach(p => {
    const btn = document.createElement('div');
    btn.className = 'site-bubble';
    btn.title = p.title;

    if (p.icon) {
      const img = document.createElement('img');
      img.src = p.icon;
      img.alt = p.id;
      img.className = 'site-bubble-img';
      img.onerror = () => {
        img.remove();
        btn.innerText = p.id;
      };
      btn.appendChild(img);
    } else {
      btn.innerText = p.id;
    }

    btn.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      openPortalUrl(p.url);
    });
    container.appendChild(btn);
  });
}

// 2. TELEMETRÍA DE ALMACENAMIENTO EN DISCO
async function updateDiskTelemetry(path) {
  if (!path) return;
  const data = await pyCall('get_disk_space', path);
  if (!data) return;

  // Telemetría cabina Anime/Cine
  const driveEl = document.getElementById('disk-drive-name');
  const freeEl = document.getElementById('disk-free-txt');
  const fillEl = document.getElementById('disk-bar-fill');

  if (driveEl) driveEl.innerText = `${data.drive} DISCO`;
  if (freeEl) freeEl.innerText = `${data.free_gb} GB Libres / ${data.total_gb} GB`;
  if (fillEl) fillEl.style.width = `${data.percent_used}%`;

  // Telemetría panel lateral YouTube
  const ytDriveEl = document.getElementById('yt-disk-drive-name');
  const ytFreeEl = document.getElementById('yt-disk-free-txt');
  const ytFillEl = document.getElementById('yt-disk-bar-fill');

  if (ytDriveEl) ytDriveEl.innerText = `${data.drive} DISCO`;
  if (ytFreeEl) ytFreeEl.innerText = `${data.free_gb} GB Libres / ${data.total_gb} GB`;
  if (ytFillEl) ytFillEl.style.width = `${data.percent_used}%`;
}

// 3. GLIDERS DESLIZANTES PROTEGIDOS
function updateChipGlider(group, targetBtn) {
  if (!group || !targetBtn) return;
  const glider = group.querySelector('.chip-glider');
  if (!glider) return;

  const width = targetBtn.offsetWidth;
  const leftOffset = targetBtn.offsetLeft;

  if (width <= 0) return;

  glider.style.width = `${width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;
}

function refreshAllGliders() {
  document.querySelectorAll('.chip-group').forEach(group => {
    if (!group.offsetParent || group.offsetWidth <= 0) return;
    const activeBtn = group.querySelector('.chip-btn.active');
    if (activeBtn) {
      updateChipGlider(group, activeBtn);
    }
  });
}

// Observador para recalcular la posición ante cualquier cambio de layout
if (window.ResizeObserver) {
  const gliderResizeObserver = new ResizeObserver(() => {
    refreshAllGliders();
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.chip-group').forEach(el => gliderResizeObserver.observe(el));
  });
}

function applyChipsState(state) {
  ['fmt', 'threads', 'simul'].forEach(key => {
    const val = state[key];
    const group = document.querySelector(`.chip-group[data-cfg="${key}"]`);
    if (group && val) {
      let activeBtn = null;
      group.querySelectorAll('.chip-btn').forEach(btn => {
        const isMatch = btn.getAttribute('data-val') === val;
        btn.classList.toggle('active', isMatch);
        if (isMatch) activeBtn = btn;
      });
      const badge = document.getElementById(`val-${key}`);
      if (badge) badge.innerText = val;

      requestAnimationFrame(() => {
        updateChipGlider(group, activeBtn);
      });
    }
  });
}

// 4. STEPPERS NUMÉRICOS
function setStepperValue(id, val, delta) {
  const targetVal = delta === 0 ? val : (parseInt(document.getElementById(id)?.value, 10) || val) + delta;
  const newVal = Math.max(1, targetVal);

  const inputEl = document.getElementById(id);
  if (inputEl) inputEl.value = newVal;

  const dispEl = document.getElementById(`disp-${id}`);
  if (dispEl) {
    dispEl.innerText = newVal;
    dispEl.classList.remove('anim-up', 'anim-down');
    requestAnimationFrame(() => {
      dispEl.classList.add(delta >= 0 ? 'anim-up' : 'anim-down');
    });
  }

  if (id === 'cfg-season') {
    modeStates[currentMode].season = newVal;
    updateSingleSeasonState(newVal);
  }
  if (id === 'cfg-start-ep') modeStates[currentMode].startEp = newVal;

  const state = modeStates[currentMode];
  if (currentMode === 'anime' && state.title && state.title !== 'Esperando consulta...') {
    setUnifiedTitle(state.title);
  }

  return newVal;
}

// 5. EXTRACTOR Y CONTROL DE TEMPORADA
function extractSeasonNumber(rawText) {
  if (!rawText) return 1;

  const ordMatch = rawText.match(/(\d{1,2})(?:st|nd|rd|th)\s*(?:season|temp|temporada)/i);
  if (ordMatch) return parseInt(ordMatch[1], 10);

  const prefixMatch = rawText.match(/(?:season|temporada|temp|s|t)[\s\.\-_]*(\d{1,2})(?:[^\d]|$)/i);
  if (prefixMatch) return parseInt(prefixMatch[1], 10);

  const seMatch = rawText.match(/(\d{1,2})x\d{1,4}/i);
  if (seMatch) return parseInt(seMatch[1], 10);

  if (/\b(part|parte|season|temporada)?\s*IV\b/i.test(rawText)) return 4;
  if (/\b(part|parte|season|temporada)?\s*III\b/i.test(rawText)) return 3;
  if (/\b(part|parte|season|temporada)?\s*II\b/i.test(rawText)) return 2;
  if (/\b(part|parte|season|temporada)?\s*V\b/i.test(rawText)) return 5;

  return 1;
}

function updateSingleSeasonState(seasonNum) {
  const cfgSingle = document.getElementById('cfg-single-season');
  const cardSingle = document.getElementById('card-single-season') || cfgSingle?.closest('.toggle-card');

  if (seasonNum > 1) {
    modeStates[currentMode].singleSeason = false;
    if (cfgSingle) {
      cfgSingle.checked = false;
      cfgSingle.disabled = true;
    }
    if (cardSingle) {
      cardSingle.style.opacity = '0.4';
      cardSingle.style.pointerEvents = 'none';
      cardSingle.title = 'Bloqueado: solo disponible en Temporada 1';
    }
    document.body.classList.remove('is-single-season');
  } else {
    if (cfgSingle) {
      cfgSingle.disabled = false;
    }
    if (cardSingle) {
      cardSingle.style.opacity = '1';
      cardSingle.style.pointerEvents = 'auto';
      cardSingle.title = '';
    }
  }
}

// 6. PERSISTENCIA
function saveCurrentState() {
  if (currentMode === 'youtube') {
    const ytDirInput = document.getElementById('yt-cfg-dir');
    const ytCfgOpen = document.getElementById('yt-cfg-open-folder');
    if (ytDirInput) modeStates.youtube.dir = ytDirInput.value;
    if (ytCfgOpen) modeStates.youtube.openFolder = ytCfgOpen.checked;

    pyCall('save_config', {
      active_mode: 'youtube',
      youtube: {
        dir: modeStates.youtube.dir,
        format: modeStates.youtube.format || 'video',
        res: modeStates.youtube.res || '1080',
        open_folder: modeStates.youtube.openFolder
      }
    });
    return;
  }

  const state = modeStates[currentMode];
  const sInput = document.getElementById('search-input');
  const pInput = document.getElementById('cfg-prefix');
  const dInput = document.getElementById('cfg-dir');
  const sCover = document.getElementById('cfg-save-cover');

  if (sInput) state.query = sInput.value;
  if (pInput) state.prefix = pInput.value || '';
  if (dInput) state.dir = dInput.value;
  if (sCover) state.saveCover = sCover.checked;

  pyCall('save_config', {
    active_mode: currentMode,
    [currentMode]: {
      dir: state.dir,
      season: state.season,
      start_ep: state.startEp,
      save_cover: state.saveCover,
      open_folder: state.openFolder,
      fmt: state.fmt,
      threads: state.threads,
      simul: state.simul,
      active_title: (state.title && state.title !== 'Esperando consulta...') ? state.title : '',
      active_tags: state.tags || '',
      active_bg: state.bg || '',
      accent1: state.accent1 || (currentMode === 'movie' ? '#bf5af2' : '#00ffaa'),
      accent2: state.accent2 || (currentMode === 'movie' ? '#5e5ce6' : '#00b4d8')
    }
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '-- MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return (mb / 1024).toFixed(2).replace('.', ',') + ' GB';
  }
  return (mb.toFixed(1)).replace('.', ',') + ' MB';
}

function updateTotalQueueSize() {
  const currentQueue = modeStates[currentMode].queue || [];
  let totalBytes = 0;

  currentQueue.forEach(item => {
    if (item.bytes && item.bytes > 0) {
      totalBytes += item.bytes;
    }
  });

  const badgeEl = document.getElementById('val-total-size');
  if (!badgeEl) return;

  if (totalBytes > 0) {
    badgeEl.innerText = formatBytes(totalBytes);
  } else {
    badgeEl.innerText = `${currentQueue.length} ${currentQueue.length === 1 ? 'ítem' : 'ítems'}`;
  }
}

function syncCockpitPipelineVisibility(mode = currentMode) {
  if (mode === 'youtube') return;
  const cockpit = document.getElementById('cockpit-grid');
  if (!cockpit) return;

  const currentQueue = modeStates[mode]?.queue || [];
  const isIdle = currentQueue.length === 0;

  cockpit.classList.toggle('pipeline-idle', isIdle);
  cockpit.classList.toggle('pipeline-active', !isIdle);

  // Recalcular gliders al instante y al finalizar la transición elástica de la columna
  requestAnimationFrame(() => {
    refreshAllGliders();
  });
  setTimeout(refreshAllGliders, 50);
  setTimeout(refreshAllGliders, 250);
  setTimeout(refreshAllGliders, 480);
}
window.syncCockpitPipelineVisibility = syncCockpitPipelineVisibility;

function renderFullQueue(mode) {
  const container = document.getElementById('queue-list');
  if (!container) return;
  container.innerHTML = '';

  const singleSeasonBadge = document.getElementById('badge-single-season');
  if (singleSeasonBadge) {
    singleSeasonBadge.style.display = mode === 'movie' ? 'none' : 'inline-block';
  }

  const list = modeStates[mode].queue || [];
  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--color-text-dim); font-size: 12px; margin-top: 40px;">
        A la espera de transmisiones...
      </div>
    `;
  } else {
    list.forEach(task => renderQueueCard(task));
  }
  updateTotalQueueSize();
  syncCockpitPipelineVisibility(mode);
}

function renderQueueCard(task) {
  const container = document.getElementById('queue-list');
  if (!container) return;

  const emptyPlaceholder = container.querySelector('div[style*="text-align: center"]');
  if (emptyPlaceholder) emptyPlaceholder.remove();

  // Asegura que en cuanto entra una tarjeta, el pipeline emerja y el botón maestro poppee
  syncCockpitPipelineVisibility(currentMode);

  const isCompleted = task.status === 'Completado' || (task.progress >= 100);
  const sizeBytes = task.bytes || 0;
  const sizeStr = sizeBytes > 0 ? formatBytes(sizeBytes) : '-- MB';
  const resStr = task.resolution || 'N/D';
  const percent = task.progress !== undefined ? task.progress : 0;

  const isError = task.status === 'Error' || task.status === 'Fallo al descargar';

  const card = document.createElement('div');
  card.className = `pipeline-card ${isCompleted ? 'completed' : ''} ${isError ? 'is-error' : ''}`;
  card.id = task.id;

  card.innerHTML = `
    <div class="pipeline-card-top">
      <span class="pipeline-card-title" title="${task.title}">${task.title}</span>
      <div class="pipeline-card-actions">
        <button class="pipeline-card-btn-retry" id="btn-retry-${task.id}" title="Reintentar descarga" style="display: ${isError ? 'inline-flex' : 'none'};">🔄</button>
        <button class="pipeline-card-btn-del" title="Eliminar">✕</button>
      </div>
    </div>
    <div class="pipeline-card-meta">
      <div class="pipeline-tags-cluster">
        <span class="pipeline-card-size" id="task-size-${task.id}">${sizeStr}</span>
        <span class="pipeline-card-res" id="task-res-${task.id}">${resStr}</span>
      </div>
      <span class="pipeline-card-status" id="task-status-${task.id}">${task.status}</span>
    </div>
    <div class="pipeline-progress-track">
      <div class="pipeline-progress-fill" id="task-progress-${task.id}" style="width: ${percent}%;"></div>
    </div>
  `;

  // Listener del botón de reintento
  const retryBtn = card.querySelector(`#btn-retry-${task.id}`);
  if (retryBtn) {
    retryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof playSynth === 'function') playSynth('click');
      retryBtn.classList.add('spinning');
      
      task.status = 'Iniciando...';
      task.progress = 0;
      card.classList.remove('is-error');
      retryBtn.style.display = 'none';

      const statusEl = document.getElementById(`task-status-${task.id}`);
      if (statusEl) statusEl.innerText = 'Reintentando...';

      const currentManualDir = (document.getElementById('cfg-dir')?.value || modeStates[currentMode].dir || '').trim();
      const rawFmt = document.querySelector('.chip-group[data-cfg="fmt"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].fmt;
      const rawThreads = document.querySelector('.chip-group[data-cfg="threads"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].threads;
      const rawSimul = document.querySelector('.chip-group[data-cfg="simul"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].simul;
      const activeSeasonNum = parseInt(document.getElementById('cfg-season')?.value, 10) || modeStates[currentMode].season || 1;

      pyCall('start_downloads', {
        tasks: [task],
        config: {
          ...modeStates[currentMode],
          active_mode: currentMode,
          title: modeStates[currentMode].title,
          cover_url: '',
          save_cover: false,
          dir: currentManualDir,
          is_single_season: !!modeStates[currentMode].singleSeason,
          season_num: activeSeasonNum,
          open_folder: false,
          fmt: String(rawFmt).replace('.', '').toLowerCase().trim(),
          threads: parseInt(rawThreads, 10) || 32,
          simul: 1
        }
      });
    });
  }

  card.querySelector('.pipeline-card-btn-del').addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    pyCall('cancel_download_task', task.id);

    const currentQueue = modeStates[currentMode].queue;
    const idx = currentQueue.findIndex(t => t.id === task.id);
    if (idx > -1) currentQueue.splice(idx, 1);
    card.remove();

    if (currentQueue.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--color-text-dim); font-size: 12px; margin-top: 40px;">
          A la espera de transmisiones...
        </div>
      `;
    }
    updateTotalQueueSize();
    syncCockpitPipelineVisibility(currentMode);
  });

  container.appendChild(card);
}

function loadState(mode) {
  const state = modeStates[mode];
  const sInput = document.getElementById('search-input');
  const pInput = document.getElementById('cfg-prefix');
  const dInput = document.getElementById('cfg-dir');
  const sCover = document.getElementById('cfg-save-cover');
  const sOpen = document.getElementById('cfg-open-folder');
  const pTitle = document.getElementById('poster-title');
  const pTags = document.getElementById('poster-tags');
  const mPoster = document.getElementById('main-poster');
  const aL1 = document.getElementById('ambient-layer-1');
  const aL2 = document.getElementById('ambient-layer-2');

  if (sInput) sInput.value = state.query || '';
  if (pInput) pInput.value = state.prefix || '';
  if (dInput) dInput.value = state.dir || '';

  setStepperValue('cfg-season', state.season || 1, 0);
  setStepperValue('cfg-start-ep', state.startEp || 1, 0);

  if (sCover) sCover.checked = state.saveCover !== false;
  if (sOpen) sOpen.checked = state.openFolder !== false;

  const sSingle = document.getElementById('cfg-single-season');
  if (sSingle) {
    sSingle.checked = !!state.singleSeason;
    document.body.classList.toggle('is-single-season', !!state.singleSeason);
  }

  expandCenterWorkspace();

  const hasCover = typeof state.bg === 'string' && state.bg.trim() !== '' && state.bg !== 'none' && state.title && state.title !== 'Esperando consulta...';
  const launcherCenter = document.getElementById('tour-launcher-center');
  const posterInfo = document.getElementById('poster-info-bar');

  if (hasCover) {
    // Si ya hay carátula persistente, ocultamos por completo la tarjeta de "Iniciar tour"
    if (launcherCenter) {
      launcherCenter.classList.add('is-hidden');
      launcherCenter.style.display = 'none';
    }
    if (posterInfo) posterInfo.style.display = 'block';

    if (pTitle) pTitle.innerText = state.title;
    if (pTags) pTags.innerHTML = state.tags || 'SISTEMA LISTO';
    if (mPoster) mPoster.style.backgroundImage = state.bg;
    if (aL1) aL1.style.backgroundImage = state.bg;
    if (aL2) aL2.style.backgroundImage = state.bg;
  } else {
    // Solo si la app está completamente vacía se muestra la invitación central
    if (launcherCenter) {
      launcherCenter.classList.remove('is-hidden');
      launcherCenter.style.display = 'flex';
    }
    if (posterInfo) posterInfo.style.display = 'none';

    if (pTitle) {
      pTitle.innerHTML = `
        ¿NUEVO POR AQUÍ?
        <div class="poster-help-hint" id="poster-help-trigger">
          <span>PULSA</span>
          <div class="liquid-help-btn mini-hint-btn">
            <span class="liquid-help-glow"></span>
            <span class="liquid-help-txt">?</span>
          </div>
          <span>PARA ABRIR LA GUÍA</span>
        </div>
      `;
    }
    if (pTags) pTags.innerHTML = 'AURION READY';
    if (mPoster) {
      mPoster.style.backgroundImage = '';
      mPoster.style.removeProperty('background-image');
    }
    if (aL1) aL1.style.backgroundImage = '';
    if (aL2) aL2.style.backgroundImage = '';
  }

  applyChipsState(state);
  applyDynamicPalette(state.accent1, state.accent2);
  renderFullQueue(mode);
  updateDiskTelemetry(state.dir);

  const currentModeTasks = state.queue || [];
  const hasRunningTasks = currentModeTasks.some(t => t.status !== 'Completado' && t.status !== 'Cancelado' && t.status !== 'Error');
  if (typeof window.setMasterDownloadState === 'function') {
    window.setMasterDownloadState(hasRunningTasks);
  }
}

function setAppMode(mode, save = true) {
  if (save && currentMode !== 'youtube') saveCurrentState();

  currentMode = window.currentMode = mode;
  if (typeof playSynth === 'function' && save) playSynth('chord');

  const animeOpt = document.getElementById('mode-anime');
  const movieOpt = document.getElementById('mode-movie');
  const ytOpt = document.getElementById('mode-youtube');
  const sInput = document.getElementById('search-input');
  const cockpitGrid = document.getElementById('cockpit-grid');
  const ytStage = document.getElementById('yt-stage');

  document.body.classList.remove('mode-anime', 'mode-movie', 'mode-youtube');
  document.body.classList.add(`mode-${mode}`);

  // Marcar activa la opción correspondiente en el switch y desplazar el thumb
  document.querySelectorAll('#btn-switch-mode .matrix-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.mode === mode || opt.id === `mode-${mode}`);
  });

  const settings = window.SettingsModule?.getSettings();
  const visibleSections = (settings?.sectionsOrder || ['anime', 'movie', 'youtube'])
    .filter(k => settings?.sectionsVisibility?.[k] !== false);

  const thumb = document.querySelector('#btn-switch-mode .matrix-thumb');
  if (thumb && visibleSections.length > 0) {
    const idx = visibleSections.indexOf(mode);
    if (idx > -1) {
      thumb.style.transform = `translateX(${idx * 100}%)`;
    }
  }

  if (mode === 'youtube') {
    if (cockpitGrid) cockpitGrid.style.display = 'none';
    if (ytStage) ytStage.style.display = 'flex';

    // Disparar aviso gigante EXCLUSIVAMENTE si es usuario con cero datos
    setTimeout(() => {
      if (typeof window.triggerYtTourWelcomeIfVirginUser === 'function') {
        window.triggerYtTourWelcomeIfVirginUser();
      }
    }, 200);

    document.body.classList.add('workspace-open');
    const welcomeCard = document.getElementById('welcome-card');
    if (welcomeCard) welcomeCard.style.display = 'none';
    const welcomeGuides = document.getElementById('welcome-guides');
    if (welcomeGuides) welcomeGuides.style.display = 'none';
    const ytBackdrop = document.getElementById('yt-tutorial-backdrop');
    if (ytBackdrop) ytBackdrop.classList.remove('active');
    const ytCard = document.getElementById('yt-welcome-card');
    if (ytCard) ytCard.style.display = 'none';

    document.body.classList.remove('yt-has-selection');
    document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
    modeStates.youtube.selectedVideo = null;

    const pImg = document.getElementById('yt-preview-img');
    const pEmpty = document.getElementById('yt-preview-empty');
    const pTitle = document.getElementById('yt-prev-title');
    const pChannel = document.getElementById('yt-prev-channel');
    const btnDownload = document.getElementById('yt-btn-download');

    if (pImg) { pImg.src = ''; pImg.style.display = 'none'; }
    if (pEmpty) pEmpty.style.display = 'flex';
    if (pTitle) pTitle.innerText = 'Ningún vídeo activo';
    if (pChannel) pChannel.innerText = 'Canal --';
    if (btnDownload) btnDownload.disabled = true;

    const ytDirInput = document.getElementById('yt-cfg-dir');
    if (ytDirInput) {
      ytDirInput.value = modeStates.youtube.dir || '';
      if (modeStates.youtube.dir) {
        updateDiskTelemetry(modeStates.youtube.dir);
      }
    }

    const selected = modeStates.youtube.selectedVideo;
    const aL1 = document.getElementById('ambient-layer-1');
    const aL2 = document.getElementById('ambient-layer-2');

    if (selected && selected.thumbnail) {
      const bgVal = `url('${selected.thumbnail}')`;
      if (aL1) aL1.style.backgroundImage = bgVal;
      if (aL2) aL2.style.backgroundImage = bgVal;
    } else {
      // Limpiar inmediatamente el fondo residual de anime o cine
      if (aL1) aL1.style.backgroundImage = 'none';
      if (aL2) aL2.style.backgroundImage = 'none';
    }

    const ytAccent1 = modeStates.youtube.accent1 || '#ff0055';
    const ytAccent2 = modeStates.youtube.accent2 || '#ff5500';
    applyDynamicPalette(ytAccent1, ytAccent2);

    setTimeout(() => {
      const fChips = document.getElementById('yt-format-chips');
      const rChips = document.getElementById('yt-res-chips');
      const sChips = document.getElementById('yt-search-mode-switch');
      if (sChips) {
        const activeSearchMode = sChips.querySelector('.chip-btn.active') || sChips.querySelector('.chip-btn');
        if (activeSearchMode) updateChipGlider(sChips, activeSearchMode);
      }
      if (fChips) {
        const activeFmt = fChips.querySelector('.chip-btn.active') || fChips.querySelector('.chip-btn');
        if (activeFmt) {
          activeFmt.classList.add('active');
          updateChipGlider(fChips, activeFmt);
        }
      }
      if (rChips) {
        const activeRes = rChips.querySelector('.chip-btn.active') || rChips.querySelector('.chip-btn');
        if (activeRes) {
          activeRes.classList.add('active');
          updateChipGlider(rChips, activeRes);
        }
      }
    }, 60);
  } else {
    if (ytStage) ytStage.style.display = 'none';
    if (cockpitGrid) cockpitGrid.style.display = 'flex';
    if (sInput) sInput.placeholder = mode === 'movie' ? 'Buscar película...' : 'Invoca un anime...';
    loadState(mode);
    syncCockpitPipelineVisibility(mode);
    const dInput = document.getElementById('cfg-dir');
    if (dInput) dInput.value = modeStates[mode].dir || '';

    // Disparar hooks de módulos según el modo
    if (mode === 'movie') {
      window.CinemaModule?.onModeActivated();
    } else {
      window.CinemaModule?.onModeDeactivated();
    }
  }

  renderSitesDock(mode === 'youtube' ? 'anime' : mode);
  if (save) pyCall('toggle_mode', mode);
}

function setUnifiedTitle(title) {
  const pInput = document.getElementById('cfg-prefix');
  const state = modeStates[currentMode];
  state.title = title;

  if (currentMode === 'anime') {
    const e = state.startEp || 1;
    const prefix = `${title} - Ep ${e}`;
    if (pInput) pInput.value = prefix;
    state.prefix = prefix;
  } else {
    const prefix = `${title}`;
    if (pInput) pInput.value = prefix;
    state.prefix = prefix;
  }
}

function getContrastColor(rgbStr) {
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return '#000000';
  const [r, g, b] = match.map(Number);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 135) ? '#000000' : '#ffffff';
}

function applyDynamicPalette(c1, c2) {
  if (!c1 || !c2) return;
  const textColor = getContrastColor(c1);

  let softGlow = c1;
  const match = c1.match(/\d+/g);
  if (match && match.length >= 3) {
    softGlow = `rgba(${match[0]}, ${match[1]}, ${match[2]}, 0.28)`;
  }

  [document.documentElement, document.body].forEach(el => {
    el.style.setProperty('--color-accent-1', c1);
    el.style.setProperty('--color-accent-2', c2);
    el.style.setProperty('--color-glow', softGlow);
    el.style.setProperty('--color-border', 'rgba(255, 255, 255, 0.08)');
    el.style.setProperty('--color-btn-text', textColor);
  });

  if (modeStates[currentMode]) {
    modeStates[currentMode].accent1 = c1;
    modeStates[currentMode].accent2 = c2;
  }
  if (currentMode !== 'youtube') {
    saveCurrentState();
  }
}

function updatePoster(imgUrl, title, meta) {
  const hasRealImage = typeof imgUrl === 'string' && imgUrl.trim() !== '' && imgUrl !== 'none';
  const bgVal = hasRealImage ? `url('${imgUrl}')` : 'none';
  const aL1 = document.getElementById('ambient-layer-1');
  const aL2 = document.getElementById('ambient-layer-2');
  const mPoster = document.getElementById('main-poster');
  const pTitle = document.getElementById('poster-title');
  const pTags = document.getElementById('poster-tags');

  if (aL1) aL1.style.backgroundImage = bgVal;
  if (aL2) aL2.style.backgroundImage = bgVal;
  if (mPoster) mPoster.style.backgroundImage = bgVal;
  if (pTitle) pTitle.innerText = title;
  if (pTags) pTags.innerHTML = meta;

  // Blindaje: la tarjeta de bienvenida central NO se oculta jamás salvo que haya carátula real
  const launcherCenter = document.getElementById('tour-launcher-center');
  const posterInfo = document.getElementById('poster-info-bar');
  if (hasRealImage) {
    if (launcherCenter) {
      launcherCenter.classList.add('is-hidden');
      launcherCenter.style.display = 'none';
    }
    if (posterInfo) posterInfo.style.display = 'block';
  } else {
    if (launcherCenter) {
      launcherCenter.classList.remove('is-hidden');
      launcherCenter.style.display = 'flex';
    }
    if (posterInfo) posterInfo.style.display = 'none';
  }

  modeStates[currentMode].title = title;
  modeStates[currentMode].tags = meta;
  modeStates[currentMode].bg = bgVal;

  if (typeof playSynth === 'function') playSynth('click');
  saveCurrentState();
}

function expandCenterWorkspace() {
  document.body.classList.add('workspace-open');

  const welcome = document.getElementById('welcome-card');
  const workspace = document.getElementById('workspace-card');
  const backdrop = document.getElementById('welcome-backdrop');
  const guides = document.getElementById('welcome-guides');

  if (welcome) {
    welcome.classList.add('is-hidden');
    welcome.style.display = 'none';
  }
  if (backdrop) backdrop.classList.add('is-hidden');
  if (guides) guides.classList.add('is-hidden');
  document.querySelectorAll('.hud-pointer').forEach(p => p.style.display = 'none');

  if (workspace) {
    workspace.classList.add('is-active');
    workspace.style.display = 'flex';
  }
}

// Receptor global invocado por PyWebView cuando la extensión manda datos al puerto 6800
window.onLinkReceived = function(data) {
  if (window.ExtensionBridgeModule && typeof window.ExtensionBridgeModule.handleLinkReceived === 'function') {
    window.ExtensionBridgeModule.handleLinkReceived(data);
  }
};

// ========================================================
// INICIALIZACIÓN Y EVENTOS DOM
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sites-dock, .matrix-switch, .window-controls-box, #win-settings').forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  // Enganche directo del botón de Ajustes
  document.getElementById('win-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.SettingsModule?.openModal) {
      window.SettingsModule.openModal();
    } else {
      const modal = document.getElementById('settings-modal-overlay');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
    }
  });

  renderSitesDock('anime');

  // Actualizador dinámico del conmutador superior según visibilidad y orden modular
  window.updateMatrixSwitchUI = function(order, visibility) {
    const btnSwitch = document.getElementById('btn-switch-mode');
    const thumb = btnSwitch?.querySelector('.matrix-thumb');
    const hotkeyPill = document.querySelector('.matrix-switch-cluster .hotkey-pill');
    if (!btnSwitch) return;

    const labels = {
      anime: 'ANIME',
      movie: 'CINE',
      youtube: 'YOUTUBE'
    };

    const activeOrder = order.filter(key => visibility[key] !== false);

    // Si solo hay 1 sección activa, ocultamos el pill de TAB
    if (hotkeyPill) {
      hotkeyPill.style.display = activeOrder.length > 1 ? 'inline-block' : 'none';
    }

    // Reconstruir los botones de opciones manteniendo el thumb
    btnSwitch.innerHTML = '<div class="matrix-thumb"></div>';
    activeOrder.forEach(key => {
      const opt = document.createElement('div');
      opt.className = `matrix-opt ${currentMode === key ? 'active' : ''}`;
      opt.id = `mode-${key}`;
      opt.dataset.mode = key;
      opt.textContent = labels[key] || key.toUpperCase();
      btnSwitch.appendChild(opt);
    });

    // Ajustar ancho del contenedor y del thumb
    const count = activeOrder.length;
    const baseWidth = count === 3 ? 285 : (count === 2 ? 220 : 130);
    btnSwitch.style.width = `${baseWidth}px`;

    const newThumb = btnSwitch.querySelector('.matrix-thumb');
    if (newThumb) {
      newThumb.style.width = `calc((100% - 6px) / ${count})`;
      const activeIdx = activeOrder.indexOf(currentMode);
      const safeIdx = activeIdx > -1 ? activeIdx : 0;
      newThumb.style.transform = `translateX(${safeIdx * 100}%)`;
    }
  };

  const btnSwitch = document.getElementById('btn-switch-mode');
  if (btnSwitch) {
    btnSwitch.addEventListener('click', (e) => {
      const targetOpt = e.target.closest('.matrix-opt');
      const settings = window.SettingsModule?.getSettings();
      const currentOrder = (settings?.sectionsOrder || ['anime', 'movie', 'youtube'])
        .filter(k => settings?.sectionsVisibility?.[k] !== false);

      if (targetOpt && targetOpt.dataset.mode) {
        setAppMode(targetOpt.dataset.mode, true);
        return;
      }

      if (currentOrder.length > 1) {
        const curIdx = currentOrder.indexOf(currentMode);
        const nextIdx = (curIdx + 1) % currentOrder.length;
        setAppMode(currentOrder[nextIdx], true);
      }
    });
  }

  const btnBrowse = document.getElementById('btn-browse-dir');
  const cfgDirInput = document.getElementById('cfg-dir');
  if (btnBrowse && cfgDirInput) {
    btnBrowse.addEventListener('click', async () => {
      if (typeof playSynth === 'function') playSynth('click');
      const selected = await pyCall('select_folder', cfgDirInput.value);
      if (selected) {
        cfgDirInput.value = selected;
        modeStates[currentMode].dir = selected;
        updateDiskTelemetry(selected);
        saveCurrentState();
      }
    });

    cfgDirInput.addEventListener('change', () => {
      modeStates[currentMode].dir = cfgDirInput.value;
      updateDiskTelemetry(cfgDirInput.value);
      saveCurrentState();
    });
    cfgDirInput.addEventListener('input', () => {
      if (window.__isTourDemoActive) return; // Evita saturar PyWebView durante las demos del tour
      modeStates[currentMode].dir = cfgDirInput.value;
      saveCurrentState();
    });
  }

  document.querySelectorAll('.chip-group').forEach(group => {
    const cfgKey = group.getAttribute('data-cfg');
    group.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof playSynth === 'function') playSynth('origami');
        group.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        updateChipGlider(group, btn);

        let val = btn.getAttribute('data-val') || '';
        if (cfgKey === 'fmt') {
          val = val.replace('.', '').toLowerCase();
        }

        modeStates[currentMode][cfgKey] = val;

        const badge = document.getElementById(`val-${cfgKey}`);
        if (badge) badge.innerText = btn.getAttribute('data-val');

        saveCurrentState();
      });
    });
  });

  // Inicialización de módulos
  if (typeof window.AnimeModule?.init === 'function') {
    window.AnimeModule.init();
  }
  if (typeof window.CinemaModule?.init === 'function') {
    window.CinemaModule.init();
  }
  if (typeof window.SettingsModule?.init === 'function') {
    window.SettingsModule.init();
  }

  const btnClear = document.getElementById('btn-clear');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      modeStates[currentMode].queue.length = 0;
      const container = document.getElementById('queue-list');
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; color: var(--color-text-dim); font-size: 12px; margin-top: 40px;">
            A la espera de transmisiones...
          </div>
        `;
      }
      updateTotalQueueSize();
      syncCockpitPipelineVisibility(currentMode);
    });
  }

  const btnMaster = document.getElementById('btn-master');
  const magTxt = document.getElementById('mag-txt');
  const splitMaster = document.getElementById('split-cluster-master');
  const btnCancelMaster = document.getElementById('btn-cancel-master');
  let isMasterRunning = false;

  window.setMasterDownloadState = function(isDownloading) {
    const sMaster = document.getElementById('split-cluster-master');
    const bMaster = document.getElementById('btn-master');
    const mTxt = document.getElementById('mag-txt');

    if (isDownloading) {
      sMaster?.classList.add('is-split');
      if (mTxt) mTxt.innerText = 'DESCARGANDO...';
      if (bMaster) bMaster.style.pointerEvents = 'none';
    } else {
      sMaster?.classList.remove('is-split');
      if (mTxt) mTxt.innerText = 'INICIAR EXTRACCIÓN';
      if (bMaster) {
        bMaster.style.pointerEvents = 'auto';
        bMaster.classList.remove('loading', 'is-empty');
      }
    }
  };

  window.setYtDownloadState = function(isDownloading) {
    const ytCluster = document.getElementById('yt-split-cluster');
    const ytBtn = document.getElementById('yt-btn-download');
    const ytTxt = document.getElementById('yt-btn-txt');

    if (isDownloading) {
      ytCluster?.classList.add('is-split');
      if (ytTxt) ytTxt.innerText = 'DESCARGANDO...';
      if (ytBtn) ytBtn.style.pointerEvents = 'none';
    } else {
      ytCluster?.classList.remove('is-split');
      if (ytTxt) ytTxt.innerText = 'DESCARGAR VÍDEO';
      if (ytBtn) ytBtn.style.pointerEvents = 'auto';
    }
  };

  btnCancelMaster?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('origami');
    const currentQueue = modeStates[currentMode].queue || [];

    currentQueue.forEach(t => {
      if (t.status !== 'Completado') {
        pyCall('cancel_download_task', t.id);
        t.status = 'Cancelado';
        const statusEl = document.getElementById(`task-status-${t.id}`);
        if (statusEl) statusEl.innerText = 'Cancelado';
      }
    });

    setMasterDownloadState(false);
  });

  if (btnMaster && magTxt) {
    btnMaster.addEventListener('click', () => {
      if (isMasterRunning) return;

      const currentQueue = modeStates[currentMode].queue;
      const originalText = 'INICIAR EXTRACCIÓN';

      if (currentQueue.length === 0) {
        if (typeof playSynth === 'function') playSynth('click');
        btnMaster.classList.add('is-empty');
        magTxt.innerText = 'COLA VACÍA';
        setTimeout(() => {
          btnMaster.classList.remove('is-empty');
          magTxt.innerText = originalText;
        }, 1200);
        return;
      }

      const pendingTasks = currentQueue.filter(t => t.status !== 'Completado');
      if (pendingTasks.length === 0) {
        magTxt.innerText = 'COLA PROCESADA';
        setTimeout(() => {
          magTxt.innerText = originalText;
        }, 1500);
        return;
      }

      const currentManualDir = (document.getElementById('cfg-dir')?.value || modeStates[currentMode].dir || '').trim();

      if (!currentManualDir) {
        if (typeof playSynth === 'function') playSynth('click');
        const dirInput = document.getElementById('cfg-dir');
        btnMaster.classList.add('is-empty');
        magTxt.innerText = 'SELECCIONA RUTA';
        if (dirInput) {
          dirInput.focus();
          dirInput.style.borderColor = '#ff3366';
          dirInput.style.boxShadow = '0 0 16px rgba(255, 51, 102, 0.4)';
          setTimeout(() => {
            dirInput.style.borderColor = '';
            dirInput.style.boxShadow = '';
          }, 2000);
        }
        setTimeout(() => {
          btnMaster.classList.remove('is-empty');
          magTxt.innerText = originalText;
        }, 1400);

        document.getElementById('btn-browse-dir')?.click();
        return;
      }

      isMasterRunning = true;
      if (typeof playSynth === 'function') playSynth('chord');
      setMasterDownloadState(true);

      let cleanCoverUrl = '';
      const bgRaw = modeStates[currentMode].bg || '';
      const bgMatch = bgRaw.match(/url\(['"]?(.*?)['"]?\)/);
      if (bgMatch && bgMatch[1]) {
        cleanCoverUrl = bgMatch[1];
      }

      const rawFmt = document.querySelector('.chip-group[data-cfg="fmt"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].fmt;
      const rawThreads = document.querySelector('.chip-group[data-cfg="threads"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].threads;
      const rawSimul = document.querySelector('.chip-group[data-cfg="simul"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].simul;

      const cleanFmt = String(rawFmt).replace('.', '').toLowerCase().trim();
      const activeSeasonNum = parseInt(document.getElementById('cfg-season')?.value, 10) || modeStates[currentMode].season || 1;

      pyCall('start_downloads', {
        tasks: pendingTasks,
        config: {
          ...modeStates[currentMode],
          active_mode: currentMode,
          title: modeStates[currentMode].title,
          cover_url: cleanCoverUrl,
          save_cover: !!modeStates[currentMode].saveCover,
          dir: currentManualDir,
          is_single_season: !!modeStates[currentMode].singleSeason,
          season_num: activeSeasonNum,
          open_folder: !!modeStates[currentMode].openFolder,
          fmt: cleanFmt,
          threads: parseInt(rawThreads, 10) || 32,
          simul: parseInt(rawSimul, 10) || 5
        }
      });

      isMasterRunning = false;
    });
  }

  function applyLoadedConfig(config) {
    if (!config) return;

    if (config.anime) {
      Object.assign(modeStates.anime, config.anime);
      if (config.anime.active_title) modeStates.anime.title = config.anime.active_title;
      if (config.anime.active_tags) modeStates.anime.tags = config.anime.active_tags;
      if (config.anime.active_bg) modeStates.anime.bg = config.anime.active_bg;
      if (config.anime.accent1 && config.anime.accent2) {
        modeStates.anime.accent1 = config.anime.accent1;
        modeStates.anime.accent2 = config.anime.accent2;
      }
    }

    if (config.movie) {
      Object.assign(modeStates.movie, config.movie);
      if (config.movie.active_title) modeStates.movie.title = config.movie.active_title;
      if (config.movie.active_tags) modeStates.movie.tags = config.movie.active_tags;
      if (config.movie.active_bg) modeStates.movie.bg = config.movie.active_bg;
      if (config.movie.accent1 && config.movie.accent2) {
        modeStates.movie.accent1 = config.movie.accent1;
        modeStates.movie.accent2 = config.movie.accent2;
      }
    }

    if (config.youtube && config.youtube.dir) {
      modeStates.youtube.dir = config.youtube.dir;
    }
    modeStates.youtube.selectedVideo = null;
    modeStates.youtube.results = [];

    // Carga y sincronización de Ajustes desde config.json
    if (config.settings && window.SettingsModule?.loadSettings) {
      window.SettingsModule.loadSettings(config.settings);
    }

    const initMode = config.active_mode || 'anime';
    setAppMode(initMode, false);

    const dInput = document.getElementById('cfg-dir');
    if (dInput) dInput.value = modeStates[initMode].dir || '';

    const ytInput = document.getElementById('yt-cfg-dir');
    if (ytInput) ytInput.value = modeStates.youtube.dir || '';
  }

  pyCall('get_initial_state')?.then((cfg) => {
    applyLoadedConfig(cfg);
    setTimeout(refreshAllGliders, 60);
    setTimeout(refreshAllGliders, 200);
  });

  window.addEventListener('pywebviewready', function() {
    pyCall('get_initial_state')?.then((cfg) => {
      applyLoadedConfig(cfg);
      setTimeout(refreshAllGliders, 80);
      setTimeout(refreshAllGliders, 300);
    });
    // Comprobación real de actualizaciones en producción
    setTimeout(() => {
      pyCall('check_for_updates');
    }, 2000);
  });

  updateDiskTelemetry(modeStates.anime.dir);

  const btnMin = document.getElementById('win-min');
  const btnMax = document.getElementById('win-max');
  const btnClose = document.getElementById('win-close');
  const topNav = document.querySelector('.top-nav');

  btnMin?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    pyCall('minimize_window');
  });

  btnMax?.addEventListener('click', async () => {
    if (typeof playSynth === 'function') playSynth('click');
    const isMax = await pyCall('toggle_maximize_window');
    document.body.classList.toggle('is-maximized', !!isMax);
    
    const topBar = document.getElementById('top-nav-bar');
    if (topBar) {
      if (isMax) {
        topBar.classList.remove('pywebview-drag-region');
      } else {
        topBar.classList.add('pywebview-drag-region');
      }
    }

    if (btnMax) btnMax.innerText = isMax ? '❐' : '□';
    setTimeout(refreshAllGliders, 50);
    setTimeout(refreshAllGliders, 320);
  });

  btnClose?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    pyCall('close_app');
  });

  if (topNav) {
    topNav.addEventListener('dblclick', (e) => {
      if (e.target.closest('.sites-dock, .matrix-switch, .window-controls-box, .nav-right-cluster')) return;
      btnMax?.click();
    });
  }

  // Inicialización del puente con la extensión del navegador
  if (typeof window.ExtensionBridgeModule?.init === 'function') {
    window.ExtensionBridgeModule.init();
  }

  const sitesDock = document.getElementById('sites-dock');
  const sitesTrigger = document.querySelector('.sites-trigger');

  if (sitesDock && sitesTrigger) {
    sitesTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sitesDock.classList.toggle('is-open');
      sitesTrigger.textContent = isOpen ? 'SITIOS ▼' : 'SITIOS ▶';
    });

    document.addEventListener('click', (e) => {
      if (!sitesDock.contains(e.target) && sitesDock.classList.contains('is-open')) {
        sitesDock.classList.remove('is-open');
        sitesTrigger.textContent = 'SITIOS ▶';
      }
    });

    document.getElementById('btn-switch-mode')?.addEventListener('click', () => {
      sitesDock.classList.remove('is-open');
      sitesTrigger.textContent = 'SITIOS ▶';
    });
  }

  // ========================================================
  // GUÍA TURÍSTICO CINEMÁTICO POR BLOQUES
  // ========================================================
  let currentTourStep = 0;
  let isTourOpenFromGuided = false;
  let isTourStartedFromCenter = false;
  let tourDemoIntervals = [];
  let tourSnapshot = null;

  let activeTourSteps = animeTourSteps;

  const tourBackdrop = document.getElementById('tour-backdrop');
  const tourCard = document.getElementById('tour-card');
  const tourBadge = document.getElementById('tour-step-badge');
  const tourTitle = document.getElementById('tour-card-title');
  const tourDesc = document.getElementById('tour-card-desc');
  const tourActions = document.getElementById('tour-card-actions');
  const btnStartTour = document.getElementById('btn-start-tour');
  const virtualCursor = document.getElementById('tour-virtual-cursor');

  function stopAllTourDemos() {
    tourDemoIntervals.forEach(i => {
      clearInterval(i);
      clearTimeout(i);
    });
    tourDemoIntervals = [];

    window.__isTourDemoActive = false;
    window.__isTourDemoSearching = false;

    // Reactivar eventos de ratón en el botón maestro inmediatamente
    const bMasterEl = document.getElementById('btn-master');
    if (bMasterEl) bMasterEl.style.pointerEvents = 'auto';

    // Limpieza de las descargas simuladas del tour
    document.querySelectorAll('.pipeline-card[id^="tour-mock-task-"]').forEach(el => el.remove());
    if (window.__tourMockRunning) {
      window.__tourMockRunning = false;
      renderFullQueue(currentMode);
      const curQ = modeStates[currentMode]?.queue || [];
      const hasRunning = curQ.some(t => t.status !== 'Completado' && t.status !== 'Cancelado' && t.status !== 'Error');
      setMasterDownloadState(hasRunning);
    }

    // Detener y resetear la inclinación Parallax del póster
    const mainPoster = document.getElementById('main-poster');
    if (mainPoster) {
      mainPoster.style.transform = '';
    }

    // Limpiar inmediatamente TODAS las clases de atenuación para que no bloqueen los eventos del siguiente paso
    document.querySelectorAll('.tour-sub-dimmed, .tour-blurred-zone, .tour-highlighted-element, .tour-demo-anim, .tour-toggle-demo-1, .tour-toggle-demo-2, .tour-stepper-demo').forEach(el => {
      el.classList.remove('tour-sub-dimmed', 'tour-blurred-zone', 'tour-highlighted-element', 'tour-demo-anim', 'tour-toggle-demo-1', 'tour-toggle-demo-2', 'tour-stepper-demo');
    });

    const sInput = document.getElementById('search-input');
    if (sInput) {
      sInput.readOnly = false;
    }
    const suggestions = document.getElementById('search-suggestions');
    if (suggestions) {
      suggestions.classList.remove('active');
      suggestions.innerHTML = '';
    }

    const splitCluster = document.getElementById('split-cluster-master');
    if (splitCluster) {
      splitCluster.classList.remove('is-split');
      const mTxt = document.getElementById('mag-txt');
      if (mTxt) mTxt.innerText = 'INICIAR EXTRACCIÓN';
    }

    const sitesDock = document.getElementById('sites-dock');
    if (sitesDock) {
      sitesDock.classList.remove('is-open');
      const trigger = document.querySelector('.sites-trigger');
      if (trigger) trigger.textContent = 'SITIOS ▶';
    }

    const switchThumb = document.querySelector('#btn-switch-mode .matrix-thumb');
    const switchOpts = document.querySelectorAll('#btn-switch-mode .matrix-opt');
    if (switchThumb) switchThumb.style.transform = '';
    switchOpts.forEach(opt => opt.classList.toggle('active', opt.id === `mode-${currentMode}`));

    // Restaurar inmediatamente el valor real que el usuario tenía escrito
    const cfgDir = document.getElementById('cfg-dir');
    if (cfgDir) {
      cfgDir.value = (tourSnapshot && tourSnapshot.dir !== undefined) ? tourSnapshot.dir : (modeStates.anime.dir || '');
    }
    const state = modeStates[currentMode];
    if (state && !document.body.classList.contains('tour-running-active')) {
      const cfgSave = document.getElementById('cfg-save-cover');
      const cfgOpen = document.getElementById('cfg-open-folder');
      if (cfgSave) cfgSave.checked = state.saveCover !== false;
      if (cfgOpen) cfgOpen.checked = state.openFolder !== false;
      setStepperValue('cfg-season', state.season || 1, 0);
      applyChipsState(state);
    }
  }

  function clearTourHighlights() {
    stopAllTourDemos();
    if (typeof stopAllYtTourDemos === 'function') stopAllYtTourDemos();
    document.body.classList.remove('tour-running-active', 'tour-extension-locked');
    document.querySelectorAll('.tour-highlighted-element, .tour-blurred-zone, .tour-sub-dimmed').forEach(el => {
      el.classList.remove('tour-highlighted-element', 'tour-blurred-zone', 'tour-sub-dimmed');
    });
    if (tourBackdrop) {
      tourBackdrop.classList.remove('active');
      tourBackdrop.style.pointerEvents = 'none';
    }
    if (tourCard) {
      tourCard.classList.remove('active');
      tourCard.style.pointerEvents = 'none';
    }
  }

  function applySelectiveBlur(activeEls) {
    document.body.classList.add('tour-running-active');
    const allPanels = document.querySelectorAll('.glass-box, .center-stage, .top-nav');

    const firstTarget = activeEls[0];
    const settingsArea = document.querySelector('.settings-area');
    const isTargetInsideSettings = settingsArea && firstTarget && settingsArea.contains(firstTarget);
    const isWorkspaceCenter = currentTourStep === 10;

    if (firstTarget && tourBackdrop) {
      const rect = firstTarget.getBoundingClientRect();
      let centerX = rect.left + rect.width / 2;
      let centerY = rect.top + rect.height / 2;
      let dynamicRadius = Math.max(380, Math.max(rect.width, rect.height) * 0.78);

      if (currentTourStep === 9) {
        // Paso 10: Spotlight amplio que cubre a la vez buscador y póster central
        const centerStage = document.getElementById('center-stage');
        if (centerStage) {
          const stageRect = centerStage.getBoundingClientRect();
          centerX = stageRect.left + stageRect.width / 2;
          centerY = stageRect.top + stageRect.height / 2;
          dynamicRadius = Math.max(540, stageRect.height * 0.65);
        }
      } else if (currentTourStep === 10) {
        // Paso 11: Triple enfoque (Pipeline + Centro + Botón maestro)
        centerX = window.innerWidth * 0.38;
        centerY = window.innerHeight * 0.52;
        dynamicRadius = Math.max(720, window.innerWidth * 0.55);
      } else if (isTargetInsideSettings) {
        dynamicRadius = Math.max(220, Math.max(rect.width, rect.height) * 0.75);
      }

      tourBackdrop.style.setProperty('--spot-x', `${centerX}px`);
      tourBackdrop.style.setProperty('--spot-y', `${centerY}px`);
      tourBackdrop.style.setProperty('--spot-r', `${dynamicRadius}px`);
    }

    allPanels.forEach(panel => {
      let isInsideActive = false;
      activeEls.forEach(target => {
        if (panel === target || panel.contains(target) || target.contains(panel)) {
          isInsideActive = true;
        }
      });
      // Si el objetivo está dentro de la consola derecha, la caja padre no se desenfoca para poder ver el bloque nítido
      if (isTargetInsideSettings && panel.contains(firstTarget)) {
        panel.classList.remove('tour-blurred-zone');
      } else if (!isInsideActive) {
        panel.classList.add('tour-blurred-zone');
      } else {
        panel.classList.remove('tour-blurred-zone');
      }
    });

    // Enfoque estricto en el bloque de Ingeniería Multimedia: desenfoca y atenúa todos los demás bloques
    if (settingsArea) {
      Array.from(settingsArea.children).forEach(child => {
        const isChildActive = activeEls.some(t => child === t || child.contains(t));
        if (isTargetInsideSettings) {
          if (!isChildActive) {
            child.classList.add('tour-sub-dimmed');
            child.classList.remove('tour-highlighted-element');
          } else {
            child.classList.remove('tour-sub-dimmed');
            child.classList.add('tour-highlighted-element');
          }
        } else {
          child.classList.remove('tour-sub-dimmed');
        }
      });
    }
  }

  function positionTourCard(targetEl, placement) {
    if (!tourCard) return;
    const cardWidth = Math.min(390, window.innerWidth * 0.9);
    const cardHeight = 210;

    let top = 100;
    let left = 100;

    if (placement === 'search-docked-left') {
      top = Math.max(120, window.innerHeight / 2 - cardHeight / 2);
      left = 40; // Se queda pegado a la izquierda, dejando el póster central 100% visible
    } else if (placement === 'master-docked-left') {
      // Ubica la ventana abajo del todo, alineada en vertical con el botón y a su izquierda
      const magWrap = document.getElementById('mag-wrap');
      if (magWrap) {
        const magRect = magWrap.getBoundingClientRect();
        top = Math.max(20, magRect.bottom - cardHeight);
        left = Math.max(30, magRect.left - cardWidth - 28);
      } else {
        top = window.innerHeight - cardHeight - 30;
        left = 40;
      }
    } else if (placement === 'bottom-docked') {
      top = window.innerHeight - cardHeight - 24;
      left = window.innerWidth / 2 - cardWidth / 2;
    } else if (placement === 'left-docked') {
      top = 160;
      left = 40;
    } else if (placement === 'center-modal') {
      top = window.innerHeight / 2 - cardHeight / 2;
      left = window.innerWidth / 2 - cardWidth / 2;
    } else if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      if (placement === 'left-center') {
        top = Math.max(80, rect.top + rect.height / 2 - cardHeight / 2);
        left = Math.max(20, rect.left - cardWidth - 44);
      } else if (placement === 'bottom-right') {
        top = rect.bottom + 16;
        left = Math.max(20, rect.right - cardWidth);
      } else if (placement === 'bottom-left') {
        top = rect.bottom + 16;
        left = Math.max(20, rect.left);
      } else if (placement === 'bottom-center') {
        top = rect.bottom + 18;
        left = rect.left + rect.width / 2 - cardWidth / 2;
      } else {
        top = rect.bottom + 16;
        left = rect.left + rect.width / 2 - cardWidth / 2;
      }
    }

    if (top + cardHeight > window.innerHeight - 20) {
      top = Math.max(20, window.innerHeight - cardHeight - 30);
    }
    if (left < 20) left = 20;
    if (left + cardWidth > window.innerWidth - 20) {
      left = window.innerWidth - cardWidth - 20;
    }

    tourCard.style.top = `${top}px`;
    tourCard.style.left = `${left}px`;
  }

  function startStepInteractiveDemo(stepId) {
    if (stepId === 'modes') {
      const switchThumb = document.querySelector('#btn-switch-mode .matrix-thumb');
      const switchOpts = document.querySelectorAll('#btn-switch-mode .matrix-opt');
      if (switchThumb) {
        let modeIdx = 0;
        const interval = setInterval(() => {
          modeIdx = (modeIdx + 1) % 3;
          switchThumb.style.setProperty('transform', `translateX(${modeIdx * 100}%)`, 'important');
          switchOpts.forEach((opt, idx) => {
            opt.classList.toggle('active', idx === modeIdx);
          });
        }, 900);
        tourDemoIntervals.push(interval);
      }
    } else if (stepId === 'sites') {
      const dock = document.getElementById('sites-dock');
      const trigger = document.querySelector('.sites-trigger');
      if (dock && trigger) {
        let state = false;
        const interval = setInterval(() => {
          state = !state;
          dock.classList.toggle('is-open', state);
          trigger.textContent = state ? 'SITIOS ▼' : 'SITIOS ▶';
        }, 1400);
        tourDemoIntervals.push(interval);
      }
    } else if (stepId === 'dest_dir') {
      const input = document.getElementById('cfg-dir');
      const btnBrowse = document.getElementById('btn-browse-dir');
      if (input) {
        window.__isTourDemoActive = true;
        const demoPath = 'D:\\Anime\\Aurion Downloads';
        let charIdx = 0;
        let isDeleting = false;
        input.value = '';

        const interval = setInterval(() => {
          // El paso 4 corresponde al índice 3 de tourSteps
          if (!input || currentTourStep !== 3) return;
          if (!isDeleting) {
            charIdx += 2;
            input.value = demoPath.substring(0, Math.min(demoPath.length, charIdx));
            if (charIdx >= demoPath.length + 6) isDeleting = true;
          } else {
            charIdx -= 2;
            input.value = demoPath.substring(0, Math.max(0, charIdx));
            if (charIdx <= 0) isDeleting = false;
          }
        }, 70);
        tourDemoIntervals.push(interval);
        btnBrowse?.classList.add('tour-demo-anim');
      }
    } else if (stepId === 'season_group') {
      let count = 1;
      let inc = true;
      const toggle = document.getElementById('cfg-single-season');
      const interval = setInterval(() => {
        if (inc) {
          count++;
          if (count >= 4) inc = false;
        } else {
          count--;
          if (count <= 1) inc = true;
        }
        setStepperValue('cfg-season', count, 0);
        if (toggle && count === 1) {
          toggle.checked = !toggle.checked;
          document.body.classList.toggle('is-single-season', toggle.checked);
        }
      }, 650);
      tourDemoIntervals.push(interval);
    } else if (stepId === 'toggles_group') {
      const i1 = setInterval(() => {
        const c1 = document.getElementById('cfg-save-cover');
        if (c1) c1.checked = !c1.checked;
      }, 700);
      const i2 = setInterval(() => {
        const c2 = document.getElementById('cfg-open-folder');
        if (c2) c2.checked = !c2.checked;
      }, 950);
      tourDemoIntervals.push(i1, i2);
    } else if (stepId === 'container_fmt') {
      const fmtGroup = document.querySelector('.chip-group[data-cfg="fmt"]');
      const btnsFmt = fmtGroup?.querySelectorAll('.chip-btn');
      let iFmt = 0;
      const i1 = setInterval(() => {
        if (btnsFmt && btnsFmt.length) {
          iFmt = (iFmt + 1) % btnsFmt.length;
          btnsFmt[iFmt].click();
        }
      }, 800);
      tourDemoIntervals.push(i1);
    } else if (stepId === 'threads_simul') {
      const thrGroup = document.querySelector('.chip-group[data-cfg="threads"]');
      const simGroup = document.querySelector('.chip-group[data-cfg="simul"]');
      const btnsThr = thrGroup?.querySelectorAll('.chip-btn');
      const btnsSim = simGroup?.querySelectorAll('.chip-btn');
      let iThr = 0;
      let iSim = 0;
      const i1 = setInterval(() => {
        if (btnsThr && btnsThr.length) {
          iThr = (iThr + 1) % btnsThr.length;
          btnsThr[iThr].click();
        }
      }, 850);
      const i2 = setInterval(() => {
        if (btnsSim && btnsSim.length) {
          iSim = (iSim + 1) % btnsSim.length;
          btnsSim[iSim].click();
        }
      }, 1150);
      tourDemoIntervals.push(i1, i2);
    } else if (stepId === 'workspace_center') {
      window.__isTourDemoSearching = true;
      const sInput = document.getElementById('search-input');
      const suggestions = document.getElementById('search-suggestions');
      const mainPoster = document.getElementById('main-poster');
      const tourLauncher = document.getElementById('tour-launcher-center');
      const posterInfo = document.getElementById('poster-info-bar');

      if (sInput && mainPoster) {
        sInput.readOnly = true;
        sInput.value = '';
        const isMovie = (currentMode === 'movie');
        const demoQuery = isMovie ? 'Spider-Man: Brand New Day' : 'One Piece';
        let charIdx = 0;

        const typeInterval = setInterval(() => {
          if (charIdx <= demoQuery.length) {
            sInput.value = demoQuery.substring(0, charIdx);
            charIdx++;
          } else {
            clearInterval(typeInterval);

            (async () => {
              let realList = await pyCall('search_media', currentMode, demoQuery);

              if (!realList || realList.length === 0) {
                if (isMovie) {
                  realList = [
                    {
                      title: 'Spider-Man: Brand New Day',
                      image: 'https://image.tmdb.org/t/p/w780/mKOBBv4n75j32P9H4h8Jk2eN7yq.jpg',
                      meta: 'PELÍCULA • MARVEL • 2026',
                      color: '#e50914'
                    }
                  ];
                } else {
                  realList = [
                    {
                      title: 'One Piece',
                      image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx21-t4mDgIxGQycS.jpg',
                      meta: 'EN EMISIÓN • ★ 8.8',
                      color: '#e45044'
                    }
                  ];
                }
              }

              if (!suggestions) return;

              suggestions.innerHTML = '';
              realList.slice(0, 4).forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = `sugg-item ${idx === 0 ? 'selected' : ''}`;
                div.id = `tour-sugg-${idx}`;
                div.innerHTML = `
                  <div class="sugg-thumb" style="background-image: url('${item.image}');"></div>
                  <div class="sugg-info">
                    <div class="sugg-title">${item.title}</div>
                    <div class="sugg-meta">${item.meta}</div>
                  </div>
                `;
                suggestions.appendChild(div);
              });
              suggestions.classList.add('active');

              setTimeout(async () => {
                const chosen = realList[0];
                if (!chosen) return;

                const firstSugg = document.getElementById('tour-sugg-0');
                if (firstSugg) {
                  firstSugg.style.background = 'rgba(255, 255, 255, 0.16)';
                  firstSugg.style.transform = 'translateX(6px)';
                }
                if (typeof playSynth === 'function') playSynth('click');

                setTimeout(async () => {
                  suggestions.classList.remove('active');
                  suggestions.innerHTML = '';
                  sInput.value = chosen.title;

                  if (tourLauncher) tourLauncher.style.display = 'none';
                  if (posterInfo) posterInfo.style.display = 'block';

                  updatePoster(chosen.image, chosen.title, chosen.meta);
                  setUnifiedTitle(chosen.title);

                  if (chosen.image && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
                    const pal = await pyCall('get_dominant_colors', chosen.image);
                    if (pal && pal.accent1) {
                      applyDynamicPalette(pal.accent1, pal.accent2 || '#ffaa00');
                    } else {
                      applyDynamicPalette(chosen.color || '#ff3366', '#ffaa00');
                    }
                  } else {
                    applyDynamicPalette(chosen.color || '#ff3366', '#ffaa00');
                  }

                  let deg = 0;
                  const parallaxInterval = setInterval(() => {
                    deg = (deg + 2.4) % 360;
                    const tiltX = Math.sin(deg * Math.PI / 180) * 7.5;
                    const tiltY = Math.cos(deg * Math.PI / 180) * 7.5;
                    mainPoster.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.035)`;
                  }, 30);
                  tourDemoIntervals.push(parallaxInterval);
                }, 500);
              }, 700);
            })();
          }
        }, 55);
        tourDemoIntervals.push(typeInterval);
      }
    } else if (stepId === 'master_extraction' || stepId === 'pipeline') {
      window.__tourMockRunning = true;
      const queueList = document.getElementById('queue-list');
      const splitCluster = document.getElementById('split-cluster-master');
      const mTxt = document.getElementById('mag-txt');
      const bMaster = document.getElementById('btn-master');

      if (splitCluster) splitCluster.classList.add('is-split');
      if (mTxt) mTxt.innerText = 'DESCARGANDO...';
      if (bMaster) bMaster.style.pointerEvents = 'none';

      const isMovie = (currentMode === 'movie');
      const mockTasks = isMovie
        ? [
            { id: 'tour-mock-task-1', title: 'Spider-Man: Brand New Day (2026)', res: '1080p Web-DL', size: '4,28 GB', initialProg: 18, speed: '24.6 MB/s' }
          ]
        : [
            { id: 'tour-mock-task-1', title: 'One Piece - Ep 1080', res: '1080p', size: '1,42 GB', initialProg: 12, speed: '14.2 MB/s' },
            { id: 'tour-mock-task-2', title: 'One Piece - Ep 1081', res: '1080p', size: '1,38 GB', initialProg: 6, speed: '11.8 MB/s' },
            { id: 'tour-mock-task-3', title: 'One Piece - Ep 1082', res: '1080p', size: '1,45 GB', initialProg: 0, speed: 'Conectando...' }
          ];

      if (!document.getElementById('tour-mock-task-1') && queueList) {
        queueList.innerHTML = '';
        mockTasks.forEach((task, idx) => {
          setTimeout(() => {
            if (!window.__tourMockRunning || !queueList) return;
            const card = document.createElement('div');
            card.className = 'pipeline-card';
            card.id = task.id;
            card.style.animation = 'macSlideIn 0.3s ease';
            card.innerHTML = `
              <div class="pipeline-card-top">
                <span class="pipeline-card-title" title="${task.title}">${task.title}</span>
                <button class="pipeline-card-btn-del" style="pointer-events:none;">✕</button>
              </div>
              <div class="pipeline-card-meta">
                <div class="pipeline-tags-cluster">
                  <span class="pipeline-card-size">${task.size}</span>
                  <span class="pipeline-card-res">${task.res}</span>
                </div>
                <span class="pipeline-card-status" id="mock-status-${task.id}">${task.speed}</span>
              </div>
              <div class="pipeline-progress-track">
                <div class="pipeline-progress-fill" id="mock-prog-${task.id}" style="width: ${task.initialProg}%;"></div>
              </div>
            `;
            queueList.appendChild(card);
            if (typeof playSynth === 'function') playSynth('click');
          }, idx * 280);
        });
      }

      let simTick = 0;
      const progressLoop = setInterval(() => {
        simTick += 1.8;
        const p1 = (18 + simTick * 1.4) % 100;
        const f1 = document.getElementById('mock-prog-tour-mock-task-1');
        const s1 = document.getElementById('mock-status-tour-mock-task-1');

        if (f1) f1.style.width = `${p1.toFixed(1)}%`;
        if (s1) s1.innerText = p1 >= 98 ? 'Completando película...' : (isMovie ? '26.4 MB/s' : '16.4 MB/s');

        if (!isMovie) {
          const p2 = (8 + simTick * 1.1) % 100;
          const p3 = (simTick * 0.8) % 100;
          const f2 = document.getElementById('mock-prog-tour-mock-task-2');
          const f3 = document.getElementById('mock-prog-tour-mock-task-3');
          const s2 = document.getElementById('mock-status-tour-mock-task-2');
          const s3 = document.getElementById('mock-status-tour-mock-task-3');

          if (f2) f2.style.width = `${p2.toFixed(1)}%`;
          if (f3) f3.style.width = `${p3.toFixed(1)}%`;
          if (s2) s2.innerText = p2 >= 98 ? 'Completando...' : '12.8 MB/s';
          if (s3) s3.innerText = p3 >= 98 ? 'Completando...' : (p3 > 5 ? '8.9 MB/s' : 'Iniciando...');
        }
      }, 70);
      tourDemoIntervals.push(progressLoop);
    }
  }

  function renderTourStep(stepIdx) {
    clearTourHighlights();
    const step = activeTourSteps[stepIdx];
    if (!step) {
      endTour(true);
      return;
    }

    currentTourStep = stepIdx;
    if (tourBadge) tourBadge.textContent = `PASO ${stepIdx + 1} DE ${activeTourSteps.length}`;
    if (tourTitle) tourTitle.textContent = step.title;
    if (tourDesc) tourDesc.textContent = step.desc;

    let targetEls = [];
    try {
      targetEls = document.querySelectorAll(step.target);
      targetEls.forEach(el => el.classList.add('tour-highlighted-element'));
      applySelectiveBlur(targetEls);
    } catch (e) {
      console.warn('[Tour] Fallo localizando objetivo:', e);
    }

    const firstTarget = targetEls[0] || document.body;
    try {
      positionTourCard(firstTarget, step.placement);
    } catch (e) {
      console.warn('[Tour] Fallo posicionando tarjeta:', e);
    }

    try {
      startStepInteractiveDemo(step.id);
    } catch (e) {
      console.warn('[Tour] Fallo en demo interactiva:', e);
    }

    if (tourActions) {
      tourActions.innerHTML = '';

      const isExtConfigured = localStorage.getItem('aurion_extension_configured') === 'true';

      if (step.isExtensionStep && !isExtConfigured) {
        const btnConfigure = document.createElement('button');
        btnConfigure.className = 'btn-tour-primary';
        btnConfigure.textContent = 'Configurar extensión 🧩';
        btnConfigure.addEventListener('click', () => {
          isTourOpenFromGuided = true;
          document.body.classList.add('tour-extension-locked');
          tourCard?.classList.remove('active');
          tourBackdrop?.classList.remove('active');
          clearTourHighlights();
          document.getElementById('btn-extension-helper')?.click();
        });

        const btnLater = document.createElement('button');
        btnLater.className = 'btn-tour-secondary';
        btnLater.textContent = 'Más tarde ➔';
        btnLater.addEventListener('click', () => {
          renderTourStep(stepIdx + 1);
        });

        tourActions.appendChild(btnLater);
        tourActions.appendChild(btnConfigure);
      } else {
        if (stepIdx > 0) {
          const btnPrev = document.createElement('button');
          btnPrev.className = 'btn-tour-secondary';
          btnPrev.textContent = 'Anterior';
          btnPrev.addEventListener('click', () => {
            stopAllTourDemos();
            renderTourStep(stepIdx - 1);
          });
          tourActions.appendChild(btnPrev);
        }

        const btnNext = document.createElement('button');
        btnNext.className = 'btn-tour-primary';
        btnNext.style.pointerEvents = 'auto';
        btnNext.style.cursor = 'pointer';
        const isLastStep = (stepIdx >= activeTourSteps.length - 1);
        btnNext.textContent = isLastStep ? '¡Finalizar Tour! 🎉' : 'Siguiente ➔';

        btnNext.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          stopAllTourDemos();
          if (stepIdx >= activeTourSteps.length - 1) {
            endTour(true);
          } else {
            renderTourStep(stepIdx + 1);
          }
        });
        tourActions.appendChild(btnNext);
      }
    }

    if (tourBackdrop) {
      tourBackdrop.classList.add('active');
      tourBackdrop.style.pointerEvents = 'auto';
    }
    if (tourCard) {
      tourCard.classList.add('active');
      tourCard.style.pointerEvents = 'auto';
      tourCard.style.zIndex = '9999999';
    }
  }

  function startTour(fromCenter = false) {
    isTourStartedFromCenter = fromCenter;

    // Seleccionar los pasos según si estamos en Cine o Anime
    activeTourSteps = (currentMode === 'movie') ? (window.cinemaTourSteps || cinemaTourSteps) : (window.animeTourSteps || animeTourSteps);

    // Asegurar que si venimos de YouTube, la interfaz de Anime/Cine esté visible
    if (currentMode === 'youtube') {
      setAppMode('anime', false);
    }
    const cockpit = document.getElementById('cockpit-grid');
    const ytStage = document.getElementById('yt-stage');
    if (cockpit) cockpit.style.display = 'flex';
    if (ytStage) ytStage.style.display = 'none';
    
    const curState = modeStates[currentMode] || {};
    const sInput = document.getElementById('search-input');
    const pInput = document.getElementById('cfg-prefix');
    const dInput = document.getElementById('cfg-dir');

    // Captura snapshot exhaustivo de todo el estado antes de iniciar el tour
    tourSnapshot = {
      mode: currentMode,
      query: sInput ? sInput.value : (curState.query || ''),
      prefix: pInput ? pInput.value : (curState.prefix || ''),
      title: curState.title || 'Esperando consulta...',
      tags: curState.tags || 'SISTEMA LISTO',
      bg: curState.bg || '',
      accent1: curState.accent1 || '#ffd60a',
      accent2: curState.accent2 || '#ffb703',
      dir: dInput ? dInput.value : (curState.dir || ''),
      season: curState.season || 1,
      startEp: curState.startEp || 1,
      singleSeason: !!curState.singleSeason,
      saveCover: curState.saveCover !== false,
      openFolder: curState.openFolder !== false,
      fmt: curState.fmt || 'mkv',
      threads: curState.threads || '32',
      simul: curState.simul || '20'
    };

    expandCenterWorkspace();

    const launcherCenter = document.getElementById('tour-launcher-center');
    const hasRealCover = typeof tourSnapshot.bg === 'string' && tourSnapshot.bg !== '' && tourSnapshot.bg !== 'none' && tourSnapshot.title !== 'Esperando consulta...';

    if (launcherCenter) {
      launcherCenter.style.display = hasRealCover ? 'none' : 'flex';
    }

    const finishCard = document.getElementById('tour-finished-card');
    if (finishCard) finishCard.style.display = 'none';

    renderTourStep(0);
  }

  function endTour(isFinished = false) {
    clearTourHighlights();
    if (tourBackdrop) {
      tourBackdrop.classList.remove('active');
      tourBackdrop.style.pointerEvents = 'none';
    }
    if (tourCard) {
      tourCard.classList.remove('active');
      tourCard.style.pointerEvents = 'none';
    }
    document.body.classList.remove('tour-extension-locked');
    isTourOpenFromGuided = false;

    // Restauración fiel del 100% del estado previo al tour
    if (tourSnapshot) {
      const mode = tourSnapshot.mode || currentMode;
      const state = modeStates[mode];

      state.title = tourSnapshot.title;
      state.tags = tourSnapshot.tags;
      state.bg = tourSnapshot.bg;
      state.dir = tourSnapshot.dir;
      state.season = tourSnapshot.season;
      state.startEp = tourSnapshot.startEp;
      state.singleSeason = tourSnapshot.singleSeason;
      state.saveCover = tourSnapshot.saveCover;
      state.openFolder = tourSnapshot.openFolder;
      state.fmt = tourSnapshot.fmt;
      state.threads = tourSnapshot.threads;
      state.simul = tourSnapshot.simul;
      state.query = tourSnapshot.query;
      state.prefix = tourSnapshot.prefix;
      state.accent1 = tourSnapshot.accent1;
      state.accent2 = tourSnapshot.accent2;

      // Restaurar inputs de texto
      const sInput = document.getElementById('search-input');
      const pInput = document.getElementById('cfg-prefix');
      const dInput = document.getElementById('cfg-dir');
      if (sInput) {
        sInput.value = tourSnapshot.query;
        sInput.readOnly = false;
      }
      if (pInput) pInput.value = tourSnapshot.prefix;
      if (dInput) dInput.value = tourSnapshot.dir;

      // Restaurar posters y ambient layers
      const mPoster = document.getElementById('main-poster');
      const aL1 = document.getElementById('ambient-layer-1');
      const aL2 = document.getElementById('ambient-layer-2');
      const pTitle = document.getElementById('poster-title');
      const pTags = document.getElementById('poster-tags');
      const posterInfo = document.getElementById('poster-info-bar');
      const launcherCenter = document.getElementById('tour-launcher-center');
      const finishCard = document.getElementById('tour-finished-card');

      if (mPoster) {
        mPoster.style.backgroundImage = tourSnapshot.bg;
        mPoster.style.transform = '';
      }
      if (aL1) aL1.style.backgroundImage = tourSnapshot.bg;
      if (aL2) aL2.style.backgroundImage = tourSnapshot.bg;

      const hasRealCover = typeof tourSnapshot.bg === 'string' && tourSnapshot.bg !== '' && tourSnapshot.bg !== 'none' && tourSnapshot.title !== 'Esperando consulta...';

      if (hasRealCover) {
        if (pTitle) pTitle.innerText = tourSnapshot.title;
        if (pTags) pTags.innerHTML = tourSnapshot.tags;
        if (posterInfo) posterInfo.style.display = 'block';
        if (launcherCenter) {
          launcherCenter.classList.add('is-hidden');
          launcherCenter.style.display = 'none';
        }
      } else {
        if (pTitle) pTitle.innerText = 'Esperando consulta...';
        if (pTags) pTags.innerHTML = 'AURION READY';
        if (posterInfo) posterInfo.style.display = 'none';
        if (launcherCenter) {
          launcherCenter.classList.remove('is-hidden');
          launcherCenter.style.display = 'flex';
        }
      }

      // Restaurar paleta cromática original
      applyDynamicPalette(tourSnapshot.accent1, tourSnapshot.accent2);

      // Restaurar steppers, toggles y chips en el panel derecho
      setStepperValue('cfg-season', tourSnapshot.season, 0);
      setStepperValue('cfg-start-ep', tourSnapshot.startEp, 0);
      updateSingleSeasonState(tourSnapshot.season);

      const cfgSingle = document.getElementById('cfg-single-season');
      if (cfgSingle) {
        cfgSingle.checked = tourSnapshot.singleSeason;
        document.body.classList.toggle('is-single-season', tourSnapshot.singleSeason);
      }
      const cfgSave = document.getElementById('cfg-save-cover');
      if (cfgSave) cfgSave.checked = tourSnapshot.saveCover;
      const cfgOpen = document.getElementById('cfg-open-folder');
      if (cfgOpen) cfgOpen.checked = tourSnapshot.openFolder;

      applyChipsState(state);

      // Si el usuario ya tenía carátula activa antes del tour, se restaura directamente sin mostrar "Eres un pro"
      if (hasRealCover) {
        if (finishCard) finishCard.style.display = 'none';
        if (launcherCenter) launcherCenter.style.display = 'none';
        if (posterInfo) posterInfo.style.display = 'block';
      } else if (isFinished && isTourStartedFromCenter) {
        // Solo para usuarios novatos sin anime previo iniciado desde el botón central
        if (launcherCenter) launcherCenter.style.display = 'none';
        if (finishCard) {
          finishCard.style.display = 'flex';

          // Inyectar botón de Ir al Tour de YouTube si no existe ya
          let btnGoYt = document.getElementById('btn-tour-finish-go-youtube');
          if (!btnGoYt) {
            btnGoYt = document.createElement('button');
            btnGoYt.id = 'btn-tour-finish-go-youtube';
            btnGoYt.className = 'btn-god';
            btnGoYt.style.cssText = 'margin-top: 10px; width: 100%; background: #ff0055; border: none; font-size: 13px; font-weight: 800; color: #fff; cursor: pointer; padding: 12px; border-radius: 8px; box-shadow: 0 4px 18px rgba(255, 0, 85, 0.35);';
            btnGoYt.innerHTML = '<span>Ver Tour de YouTube ➔</span>';
            
            btnGoYt.addEventListener('click', () => {
              if (typeof playSynth === 'function') playSynth('chord');
              finishCard.style.display = 'none';
              setAppMode('youtube', true);
              setTimeout(() => {
                if (typeof openYtTourModal === 'function') {
                  openYtTourModal();
                }
              }, 250);
            });

            // Insertar justo antes del botón de cerrar o al final de la tarjeta
            const closeBtn = document.getElementById('btn-tour-finish-close');
            if (closeBtn && closeBtn.parentNode) {
              closeBtn.parentNode.insertBefore(btnGoYt, closeBtn);
            } else {
              finishCard.appendChild(btnGoYt);
            }
          }
        }
      } else {
        if (finishCard) finishCard.style.display = 'none';
        if (launcherCenter) launcherCenter.style.display = 'flex';
      }
    }
  }

  // Listener para el botón de configurar extensión dentro de la tarjeta final
  document.getElementById('btn-tour-finish-ext')?.addEventListener('click', () => {
    isTourOpenFromGuided = true;
    document.body.classList.add('tour-extension-locked');
    document.getElementById('btn-extension-helper')?.click();
  });

  document.getElementById('btn-tour-finish-close')?.addEventListener('click', () => {
    const finishCard = document.getElementById('tour-finished-card');
    if (finishCard) finishCard.style.display = 'none';
    const btnGoYt = document.getElementById('btn-tour-finish-go-youtube');
    if (btnGoYt) btnGoYt.remove();
    document.getElementById('tour-launcher-center')?.classList.remove('is-hidden');
  });

  btnStartTour?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('chord');
    startTour(true); // Iniciado desde el centro (usuario nuevo)
  });

  document.getElementById('tour-btn-skip')?.addEventListener('click', () => endTour(false));

  const btnHelp = document.getElementById('win-help');
  btnHelp?.classList.add('pulse-attention');

  btnHelp?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    btnHelp.classList.remove('pulse-attention');
    clearTourHighlights(); // Limpia cualquier residuo previo antes de empezar
    if (currentMode === 'youtube') {
      openYtTourModal();
    } else {
      startTour(false);
    }
  });

  const closeYtTutorial = () => {
    const ytCard = document.getElementById('yt-welcome-card');
    const ytBackdrop = document.getElementById('yt-tutorial-backdrop');
    if (ytCard) ytCard.style.display = 'none';
    if (ytBackdrop) ytBackdrop.classList.remove('active');
  };

  document.getElementById('yt-tutorial-close-btn')?.addEventListener('click', closeYtTutorial);
  document.getElementById('yt-tutorial-backdrop')?.addEventListener('click', closeYtTutorial);

  document.addEventListener('click', (e) => {
    if (e.target.closest('#poster-help-trigger')) {
      btnHelp?.click();
    }
  });

  window.addEventListener('keydown', (e) => {

    const isYtTourOpen = document.getElementById('yt-tour-modal-backdrop')?.classList.contains('active');
    if (isYtTourOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeYtTourModal();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextBtn = document.querySelector('#yt-tour-actions-row button:last-child');
        if (nextBtn) nextBtn.click();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const prevBtn = document.querySelector('#yt-tour-actions-row button:first-child');
        if (prevBtn && prevBtn.textContent.includes('Anterior')) prevBtn.click();
        return;
      }
    }
    // Atajos de teclado en el Tour Guiado (Anime y YouTube)
    const isTourActive = document.body.classList.contains('tour-running-active');
    if (isTourActive) {
      const tourCard = document.getElementById('tour-card');
      const isCardVisible = tourCard && tourCard.classList.contains('active');

      if (isCardVisible) {
        // ENTER -> Siguiente paso o Finalizar
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const btnPrimary = tourCard.querySelector('.btn-tour-primary');
          if (btnPrimary) {
            btnPrimary.click();
            return;
          }
        }
        // DELETE / BACKSPACE -> Paso anterior
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          const btnSecondary = tourCard.querySelector('.btn-tour-secondary');
          if (btnSecondary && btnSecondary.textContent.includes('Anterior')) {
            btnSecondary.click();
            return;
          }
        }
        // ESC -> Saltar tour
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('tour-btn-skip')?.click();
          return;
        }
      }
    }

    // Si el asistente de extensión está abierto en modo guiado, BLOQUEAR TAB y ESPACIO por completo
    if (document.body.classList.contains('tour-extension-locked')) {
      if (e.key === 'Tab' || e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    const isSettingsOpen = document.getElementById('settings-modal-overlay')?.classList.contains('active');
    if (isSettingsOpen && e.key === 'Escape') {
      e.preventDefault();
      window.SettingsModule?.closeModal();
      return;
    }

    const isModalOpen = document.getElementById('match-modal-backdrop')?.classList.contains('active');
    if (isModalOpen) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }

      const settings = window.SettingsModule?.getSettings();
      const currentOrder = (settings?.sectionsOrder || ['anime', 'movie', 'youtube'])
        .filter(k => settings?.sectionsVisibility?.[k] !== false);

      if (currentOrder.length <= 1) return; // Si solo hay 1 sección, TAB no hace nada

      const nextIdx = (currentOrder.indexOf(currentMode) + 1) % currentOrder.length;
      setAppMode(currentOrder[nextIdx], true);
      return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isAnyInputFocused = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable;

    if (isAnyInputFocused) return;

    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      const masterBtn = document.getElementById('btn-master');
      if (masterBtn && !masterBtn.classList.contains('loading')) {
        masterBtn.click();
      }
    }
  });

window.updateDownloadProgress = function(taskId, progress, speed, status) {
  if (currentMode === 'youtube') {
    const pBox = document.getElementById('yt-dl-progress-box');
    const pBar = document.getElementById('yt-dl-bar');
    const pStatus = document.getElementById('yt-dl-status');
    const pSpeed = document.getElementById('yt-dl-speed');

    if (pBox) pBox.style.display = 'flex';
    const numProg = Math.min(100, Math.max(0, parseFloat(progress) || 0));
    if (pBar) pBar.style.width = `${numProg}%`;
    if (pStatus) pStatus.innerText = numProg >= 100 ? 'Completado' : (status || 'Descargando...');
    if (pSpeed) pSpeed.innerText = `${numProg.toFixed(1)}% ${speed ? '• ' + speed : ''}`;

    if (numProg >= 100) {
      if (typeof window.setYtDownloadState === 'function') {
        window.setYtDownloadState(false);
      }
      const btnTxt = document.getElementById('yt-btn-txt');
      if (btnTxt) {
        btnTxt.innerText = 'DESCARGA COMPLETADA ✔';
        setTimeout(() => { btnTxt.innerText = 'DESCARGAR VÍDEO'; }, 2500);
      }

      setTimeout(() => {
        if (pBox) {
          pBox.style.display = 'none';
          if (pBar) pBar.style.width = '0%';
        }
      }, 2500);
    }
  }
  ['anime', 'movie'].forEach(m => {
    const t = modeStates[m].queue.find(x => x.id === taskId);
    if (t) {
      t.progress = progress;
      t.speed = speed;
      t.status = progress >= 100 ? 'Completado' : status;
    }
  });

  const card = document.getElementById(taskId);
  const fill = document.getElementById(`task-progress-${taskId}`);
  const statusEl = document.getElementById(`task-status-${taskId}`);

  if (fill) fill.style.width = `${progress}%`;
  if (statusEl) statusEl.innerText = `${status} ${speed ? '• ' + speed : ''}`;

  if (card) {
    const isError = (status === 'Error' || status === 'Fallo al descargar' || status === 'Stream inválido');
    const retryBtn = document.getElementById(`btn-retry-${taskId}`);

    if (isError) {
      card.classList.add('is-error');
      card.classList.remove('completed');
      if (retryBtn) {
        retryBtn.style.display = 'inline-flex';
        retryBtn.classList.remove('spinning');
      }
      if (typeof playSynth === 'function') playSynth('click');
    } else if (status === 'Completado' || progress >= 100) {
      card.classList.add('completed');
      card.classList.remove('is-error');
      if (retryBtn) retryBtn.style.display = 'none';
    }

    const currentQueue = modeStates[currentMode].queue || [];
    const hasActiveTasks = currentQueue.some(t => t.status !== 'Completado' && t.status !== 'Cancelado' && t.status !== 'Error');
    if (!hasActiveTasks && typeof window.setMasterDownloadState === 'function') {
      window.setMasterDownloadState(false);
    }
  }
};

window.updateTaskMetadata = function(taskId, bytes, resolution) {
  ['anime', 'movie'].forEach(m => {
    const t = modeStates[m].queue.find(x => x.id === taskId);
    if (t) {
      // 1. Conservar siempre la resolución previa si la nueva viene vacía o en Auto/N/D
      if (resolution && resolution !== 'Auto' && resolution !== 'N/D') {
        t.resolution = resolution;
      } else if (!t.resolution || t.resolution === 'N/D' || t.resolution === 'Auto') {
        t.resolution = (resolution && resolution !== 'Auto') ? resolution : 'N/D';
      }

      // 2. Conservar el peso si ya venía calculado desde la extensión y Python devuelve 0
      if (bytes && bytes > 0) {
        t.bytes = bytes;
      }

      // Actualizar los badges de la tarjeta con los datos definitivos y protegidos
      const card = document.getElementById(taskId);
      const sizeEl = document.getElementById(`task-size-${taskId}`);
      const resEl = document.getElementById(`task-res-${taskId}`);

      if (sizeEl) sizeEl.innerText = formatBytes(t.bytes);
      if (resEl) resEl.innerText = t.resolution || 'N/D';

      if (card) {
        const sizeBadge = card.querySelector('.pipeline-card-size');
        const resBadge = card.querySelector('.pipeline-card-res');
        if (sizeBadge) sizeBadge.innerText = formatBytes(t.bytes);
        if (resBadge) resBadge.innerText = t.resolution || 'N/D';
      }
    }
  });

  updateTotalQueueSize();
};

window.updateRealSizeOnly = function(taskId, totalBytes) {
  if (!totalBytes || totalBytes <= 0) return;

  ['anime', 'movie'].forEach(m => {
    const t = modeStates[m].queue.find(x => x.id === taskId);
    if (t && (!t.bytes || t.bytes <= 0)) {
      t.bytes = totalBytes;
    }
  });

  const sizeEl = document.getElementById(`task-size-${taskId}`);
  if (sizeEl) {
    sizeEl.innerText = formatBytes(totalBytes);
  }
  updateTotalQueueSize();
};

// ========================================================
// SISTEMA DE ACTUALIZACIÓN FLUIDO (ESTILO DISCORD)
// ========================================================
let cachedUpdateInfo = null;

function computeTrajectoryToBadge(modalCard) {
  const badgeBtn = document.getElementById('btn-update-badge');
  if (!badgeBtn || !modalCard) return;

  const bRect = badgeBtn.getBoundingClientRect();
  const mRect = modalCard.getBoundingClientRect();

  const bCenterX = bRect.left + bRect.width / 2;
  const bCenterY = bRect.top + bRect.height / 2;

  const mCenterX = mRect.left + mRect.width / 2;
  const mCenterY = mRect.top + mRect.height / 2;

  const deltaX = bCenterX - mCenterX;
  const deltaY = bCenterY - mCenterY;

  modalCard.style.setProperty('--badge-tx', `${deltaX}px`);
  modalCard.style.setProperty('--badge-ty', `${deltaY}px`);
}

function openUpdateModalFlyIn() {
  const overlay = document.getElementById('update-modal-overlay');
  if (!overlay) return;
  const card = overlay.querySelector('.update-modal-card');
  if (!card) return;

  computeTrajectoryToBadge(card);

  card.classList.add('flying-to-badge');
  overlay.classList.add('active');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.classList.remove('flying-to-badge');
    });
  });
}

function minimizeUpdateModalToBadge() {
  const overlay = document.getElementById('update-modal-overlay');
  if (!overlay) return;
  const card = overlay.querySelector('.update-modal-card');
  const badgeBtn = document.getElementById('btn-update-badge');
  if (!card) return;

  computeTrajectoryToBadge(card);
  card.classList.add('flying-to-badge');

  setTimeout(() => {
    overlay.classList.remove('active');
    card.classList.remove('flying-to-badge');

    if (badgeBtn) {
      badgeBtn.classList.add('visible');
      badgeBtn.classList.remove('pulse-receive');
      void badgeBtn.offsetWidth;
      badgeBtn.classList.add('pulse-receive');
    }
  }, 380);
}

window.onUpdateAvailable = function(info) {
  if (!info) return;
  cachedUpdateInfo = info;

  const badgeBtn = document.getElementById('btn-update-badge');
  if (badgeBtn) {
    badgeBtn.classList.add('visible');
  }

  const verBadge = document.getElementById('update-badge-version');
  if (verBadge) {
    verBadge.textContent = `v${info.latest || info.version || '1.1.0'}`;
  }

  const descContainer = document.getElementById('update-desc');
  if (descContainer && info.body) {
    const lines = info.body.split('\n');
    let html = '<div class="update-changelog-list">';
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('---')) return;

      if (trimmed.startsWith('#')) {
        const title = trimmed.replace(/^#+\s*/, '');
        html += `<div style="font-weight: 700; color: #a855f7; margin-top: 10px; margin-bottom: 3px; font-size: 12px;">${title}</div>`;
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const item = trimmed.substring(2).replace(/\*\*(.*?)\*\*/g, '<b style="color: #fff;">$1</b>');
        html += `<div style="margin-left: 6px; margin-bottom: 4px; color: rgba(255,255,255,0.75);">• ${item}</div>`;
      } else {
        const clean = trimmed.replace(/\*\*(.*?)\*\*/g, '<b style="color: #fff;">$1</b>');
        html += `<div style="margin-bottom: 4px; color: rgba(255,255,255,0.6);">${clean}</div>`;
      }
    });

    html += '</div>';
    descContainer.innerHTML = html;
  }

  setTimeout(() => {
    openUpdateModalFlyIn();
  }, 400);
};

window.onUpdateProgress = function(pct) {
  const fill = document.getElementById('update-progress-fill');
  const num = document.getElementById('update-pct-text');
  if (fill) fill.style.width = pct + '%';
  if (num) num.textContent = Math.round(pct) + '%';
};

window.onUpdateError = function() {
  const statusTxt = document.getElementById('update-status-text');
  const fill = document.getElementById('update-progress-fill');
  if (statusTxt) {
    statusTxt.textContent = 'Error al descargar parche.';
    statusTxt.style.color = '#ff3366';
  }
  if (fill) fill.style.background = '#ef4444';
  const actions = document.getElementById('update-actions');
  if (actions) actions.style.display = 'flex';
};

  // Listeners del modal de actualizaciones
  const btnNow = document.getElementById('btn-update-now');
  const btnLater = document.getElementById('btn-update-later');
  const badgeBtn = document.getElementById('btn-update-badge');

  if (badgeBtn) {
    badgeBtn.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      openUpdateModalFlyIn();
    });
  }

  if (btnNow) {
    btnNow.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('chord');
      const targetUrl = cachedUpdateInfo?.download_url || cachedUpdateInfo?.url || '';
      const actions = document.getElementById('update-actions');
      const progBox = document.getElementById('update-progress-container');
      const descText = document.getElementById('update-desc');

      if (actions) actions.style.display = 'none';
      if (progBox) progBox.style.display = 'block';
      if (descText) descText.textContent = 'Descargando y aplicando parche silencioso...';

      pyCall('start_auto_update', targetUrl);
    });
  }

  if (btnLater) {
    btnLater.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      minimizeUpdateModalToBadge();
    });
  }

  // --- ASISTENTE DE EXTENSIÓN FLUIDO PASO A PASO ---
  const btnExtClose = document.getElementById('ext-modal-close');
  const btnExtDone = document.getElementById('btn-ext-done');
  const extActionsBox = document.getElementById('ext-modal-actions-box');
  const browserChips = document.querySelectorAll('.ext-browser-chip');
  const mockUrlText = document.getElementById('mock-url-text');

  const cardStep1 = document.getElementById('card-step-1');
  const cardStep2 = document.getElementById('card-step-2');
  const cardStep3 = document.getElementById('card-step-3');

  const btnActionStep1 = document.getElementById('btn-action-step-1');
  const btnActionStep2 = document.getElementById('btn-action-step-2');
  const btnActionStep3 = document.getElementById('btn-action-step-3');
  const btnReopenFolder = document.getElementById('btn-reopen-folder');
  const step3SwapBox = document.querySelector('.ext-step-action-swap');

  let selectedBrowserKey = 'brave';
  let selectedBrowserUrl = 'brave://extensions';

  let isStep1Done = false;
  let isStep2Done = false;
  let isStep3Done = false;

  function checkStepsCompletion() {
    if (isStep1Done && isStep2Done && isStep3Done) {
      if (extActionsBox) extActionsBox.classList.remove('is-hidden');
    } else {
      if (extActionsBox) extActionsBox.classList.add('is-hidden');
    }
  }

  function activateStep(stepNum) {
    [cardStep1, cardStep2, cardStep3].forEach(c => c?.classList.remove('is-active-step'));
    if (stepNum === 1) {
      cardStep1?.classList.remove('is-pending-step');
      cardStep1?.classList.add('is-active-step');
      cardStep2?.classList.add('is-pending-step');
      cardStep3?.classList.add('is-pending-step');
    } else if (stepNum === 2) {
      cardStep1?.classList.remove('is-pending-step');
      cardStep2?.classList.remove('is-pending-step');
      cardStep2?.classList.add('is-active-step');
      cardStep3?.classList.add('is-pending-step');
    } else if (stepNum === 3) {
      cardStep1?.classList.remove('is-pending-step');
      cardStep2?.classList.remove('is-pending-step');
      cardStep3?.classList.remove('is-pending-step');
      cardStep3?.classList.add('is-active-step');
    }
    checkStepsCompletion();
  }

  async function checkAndApplyBrowserAvailability() {
    try {
      const installedMap = await pyCall('get_installed_browsers');
      if (installedMap) {
        let firstAvailableChip = null;

        browserChips.forEach(chip => {
          const bKey = chip.getAttribute('data-browser');
          const isInstalled = !!installedMap[bKey];

          if (!isInstalled) {
            chip.classList.add('is-disabled');
            chip.title = 'Navegador no detectado en este equipo';
          } else {
            chip.classList.remove('is-disabled');
            chip.title = '';
            if (!firstAvailableChip) firstAvailableChip = chip;
          }
        });

        const currentSelected = document.querySelector('.ext-browser-chip.active');
        if (currentSelected && currentSelected.classList.contains('is-disabled') && firstAvailableChip) {
          firstAvailableChip.click();
        }
      }
    } catch (err) {
      console.error('[BrowserDetection] Error comprobando navegadores:', err);
    }
  }

  window.initAndOpenExtensionHelper = function() {
    isStep1Done = false;
    isStep2Done = false;
    isStep3Done = false;
    if (btnActionStep1) {
      btnActionStep1.classList.remove('is-completed');
      btnActionStep1.innerHTML = '<span>Copiar y abrir ventana ➔</span>';
    }
    if (btnActionStep2) {
      btnActionStep2.classList.remove('is-completed');
      btnActionStep2.innerHTML = '<span>Hecho, siguiente paso ➔</span>';
    }
    if (step3SwapBox) {
      step3SwapBox.classList.remove('folder-opened');
    }
    checkStepsCompletion();
    activateStep(1);

    const modal = document.getElementById('ext-modal-overlay');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
    checkAndApplyBrowserAvailability();
  };

  // Selector dinámico de navegador
  browserChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('is-disabled')) return;
      if (typeof playSynth === 'function') playSynth('origami');
      browserChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      selectedBrowserKey = chip.getAttribute('data-browser') || 'brave';
      selectedBrowserUrl = chip.getAttribute('data-url') || 'brave://extensions';

      if (mockUrlText) {
        mockUrlText.style.animation = 'none';
        mockUrlText.textContent = selectedBrowserUrl;
        void mockUrlText.offsetWidth;
        mockUrlText.style.animation = 'mockTypePaste 3.6s steps(18, end) infinite';
      }

      isStep1Done = false;
      isStep2Done = false;
      isStep3Done = false;
      if (btnActionStep1) {
        btnActionStep1.classList.remove('is-completed');
        btnActionStep1.innerHTML = '<span>Copiar y abrir ventana ➔</span>';
      }
      if (btnActionStep2) {
        btnActionStep2.classList.remove('is-completed');
        btnActionStep2.innerHTML = '<span>Hecho, siguiente paso ➔</span>';
      }
      if (step3SwapBox) {
        step3SwapBox.classList.remove('folder-opened');
      }
      activateStep(1);
    });
  });

  // Paso 1: Copiar URL y lanzar el navegador seleccionado
  btnActionStep1?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('chord');
    pyCall('launch_browser_for_extension', selectedBrowserUrl, selectedBrowserKey);
    btnActionStep1.classList.add('is-completed');
    btnActionStep1.innerHTML = '✔ Navegador abierto';
    isStep1Done = true;
    activateStep(2);
  });

  // Paso 2: Confirmar interruptor de desarrollador
  btnActionStep2?.addEventListener('click', () => {
    if (!isStep1Done) return;
    if (typeof playSynth === 'function') playSynth('click');
    btnActionStep2.classList.add('is-completed');
    btnActionStep2.innerHTML = '✔ Modo activado';
    isStep2Done = true;
    activateStep(3);
  });

  // Paso 3: Abrir carpeta para arrastrar (protegido contra doble apertura)
  let isOpeningFolder = false;
  function triggerOpenExtensionFolder(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    if (isOpeningFolder) return;
    isOpeningFolder = true;
    setTimeout(() => { isOpeningFolder = false; }, 800);

    if (typeof playSynth === 'function') playSynth('chord');
    try { pyCall('open_extension_folder'); } catch (err) { console.error(err); }
  }

  if (btnActionStep3) {
    btnActionStep3.onclick = (e) => {
      if (!isStep1Done || !isStep2Done) return;
      triggerOpenExtensionFolder(e);
      isStep3Done = true;
      if (step3SwapBox) {
        step3SwapBox.classList.add('folder-opened');
      }
      checkStepsCompletion();
    };
  }

  // Botón dedicado para volver a abrir la carpeta en cualquier momento
  if (btnReopenFolder) {
    btnReopenFolder.onclick = (e) => {
      triggerOpenExtensionFolder(e);
      btnReopenFolder.classList.remove('pulse-receive');
      void btnReopenFolder.offsetWidth;
      btnReopenFolder.classList.add('pulse-receive');
    };
  }

  const closeExtModal = () => {
    if (typeof playSynth === 'function') playSynth('click');
    const modal = document.getElementById('ext-modal-overlay');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('tour-extension-locked');

    setTimeout(() => {
      if (btnActionStep1) {
        btnActionStep1.classList.remove('is-completed');
        btnActionStep1.innerHTML = '<span>Copiar y abrir ventana ➔</span>';
      }
      if (btnActionStep2) {
        btnActionStep2.classList.remove('is-completed');
        btnActionStep2.innerHTML = '<span>Hecho, siguiente paso ➔</span>';
      }
      if (step3SwapBox) {
        step3SwapBox.classList.remove('folder-opened');
      }
      isStep1Done = false;
      isStep2Done = false;
      isStep3Done = false;
      checkStepsCompletion();
      activateStep(1);

      const launcherCenter = document.getElementById('tour-launcher-center');
      if (launcherCenter && (!modeStates[currentMode].bg || modeStates[currentMode].bg === 'none')) {
        launcherCenter.classList.remove('is-hidden');
        launcherCenter.style.display = 'flex';
      }

      if (isTourOpenFromGuided) {
        isTourOpenFromGuided = false;
        renderTourStep(1);
      }
    }, 200);
  };

  if (btnExtClose) btnExtClose.addEventListener('click', closeExtModal);
  if (btnExtDone) {
    btnExtDone.addEventListener('click', () => {
      localStorage.setItem('aurion_extension_configured', 'true');
      closeExtModal();
    });
  }

  const modalOverlay = document.getElementById('ext-modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeExtModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('ext-modal-overlay');
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      closeExtModal();
    }
  });

  // Inicializar eventos de cierre del modal de YouTube
  if (typeof window.initYtTourEvents === 'function') {
    window.initYtTourEvents();
  }

  // Inicializar módulo de YouTube una vez que el DOM está completamente listo
  if (typeof window.initYoutubeModule === 'function') {
    window.initYoutubeModule();
  }
});