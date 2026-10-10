// ========================================================
// AURION // GESTOR DE ESTADO DUAL Y CONTROL MULTIMEDIA
// ========================================================

let currentMode = 'anime';
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

const modeStates = {
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
  
  if (group.offsetParent === null || targetBtn.offsetWidth <= 0) return;

  const glider = group.querySelector('.chip-glider');
  if (!glider) return;

  const leftOffset = targetBtn.offsetLeft;
  const width = targetBtn.offsetWidth;

  glider.style.width = `${width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;
}

function refreshAllGliders() {
  document.querySelectorAll('.chip-group').forEach(group => {
    if (!group.offsetParent || group.offsetWidth <= 0) return;
    const activeBtn = group.querySelector('.chip-btn.active');
    if (activeBtn && activeBtn.offsetWidth > 0) {
      updateChipGlider(group, activeBtn);
    }
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
}

function renderQueueCard(task) {
  const container = document.getElementById('queue-list');
  if (!container) return;

  const emptyPlaceholder = container.querySelector('div[style*="text-align: center"]');
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const isCompleted = task.status === 'Completado' || (task.progress >= 100);
  const sizeBytes = task.bytes || 0;
  const sizeStr = sizeBytes > 0 ? formatBytes(sizeBytes) : '-- MB';
  const resStr = task.resolution || 'N/D';
  const percent = task.progress !== undefined ? task.progress : 0;

  const card = document.createElement('div');
  card.className = `pipeline-card ${isCompleted ? 'completed' : ''}`;
  card.id = task.id;

  card.innerHTML = `
    <div class="pipeline-card-top">
      <span class="pipeline-card-title" title="${task.title}">${task.title}</span>
      <button class="pipeline-card-btn-del" title="Eliminar">✕</button>
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
  if (hasCover) {
    if (pTitle) pTitle.innerText = state.title;
    if (pTags) pTags.innerHTML = state.tags || 'SISTEMA LISTO';
    if (mPoster) mPoster.style.backgroundImage = state.bg;
    if (aL1) aL1.style.backgroundImage = state.bg;
    if (aL2) aL2.style.backgroundImage = state.bg;
  } else {
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

  currentMode = mode;
  if (typeof playSynth === 'function' && save) playSynth('chord');

  const animeOpt = document.getElementById('mode-anime');
  const movieOpt = document.getElementById('mode-movie');
  const ytOpt = document.getElementById('mode-youtube');
  const sInput = document.getElementById('search-input');
  const cockpitGrid = document.getElementById('cockpit-grid');
  const ytStage = document.getElementById('yt-stage');

  document.body.classList.remove('mode-anime', 'mode-movie', 'mode-youtube');
  document.body.classList.add(`mode-${mode}`);

  if (animeOpt) animeOpt.classList.toggle('active', mode === 'anime');
  if (movieOpt) movieOpt.classList.toggle('active', mode === 'movie');
  if (ytOpt) ytOpt.classList.toggle('active', mode === 'youtube');

  if (mode === 'youtube') {
    if (cockpitGrid) cockpitGrid.style.display = 'none';
    if (ytStage) ytStage.style.display = 'flex';

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
    if (selected && selected.thumbnail) {
      const bgVal = `url('${selected.thumbnail}')`;
      const aL1 = document.getElementById('ambient-layer-1');
      const aL2 = document.getElementById('ambient-layer-2');
      if (aL1) aL1.style.backgroundImage = bgVal;
      if (aL2) aL2.style.backgroundImage = bgVal;
    }

    const ytAccent1 = modeStates.youtube.accent1 || '#ff0055';
    const ytAccent2 = modeStates.youtube.accent2 || '#ff5500';
    applyDynamicPalette(ytAccent1, ytAccent2);

    setTimeout(() => {
      const fChips = document.getElementById('yt-format-chips');
      const rChips = document.getElementById('yt-res-chips');
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
    const dInput = document.getElementById('cfg-dir');
    if (dInput) dInput.value = modeStates[mode].dir || '';
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

function calculateWordMatchScore(query, candidateTitle) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  const qWords = normalize(query);
  const cWords = normalize(candidateTitle);

  if (qWords.length === 0 || cWords.length === 0) return 0;

  let common = 0;
  qWords.forEach(w => {
    if (cWords.includes(w)) common++;
  });

  return common / Math.max(qWords.length, cWords.length);
}

let pendingTransmission = null;
let modalTargetMode = 'anime';

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

// La pantalla de bienvenida antigua queda completamente eliminada

function showMatchModal(proposedItem, rawData, detectedEp) {
  const backdrop = document.getElementById('match-modal-backdrop');
  const thumb = document.getElementById('modal-prop-thumb');
  const titleEl = document.getElementById('modal-prop-title');
  const metaEl = document.getElementById('modal-prop-meta');
  const manualSection = document.getElementById('modal-manual-section');

  if (manualSection) manualSection.classList.remove('open');

  pendingTransmission = {
    proposed: proposedItem,
    raw: rawData,
    ep: detectedEp
  };

  titleEl.innerText = proposedItem.title;
  metaEl.innerText = proposedItem.meta || 'Coincidencia estimada';
  thumb.style.backgroundImage = proposedItem.image ? `url('${proposedItem.image}')` : 'none';

  if (typeof playSynth === 'function') playSynth('chord');
  if (backdrop) backdrop.classList.add('active');
}

function closeMatchModal() {
  const backdrop = document.getElementById('match-modal-backdrop');
  if (backdrop) backdrop.classList.remove('active');
  pendingTransmission = null;
}

function commitTransmission(chosenItem, targetMode, episodeNum) {
  try {
    if (currentMode !== targetMode) {
      setAppMode(targetMode, true);
    }

    const rawData = (pendingTransmission && pendingTransmission.raw) ? pendingTransmission.raw : {};
    const fullText = (rawData.page_title || '') + ' ' + (rawData.page_url || '') + ' ' + (chosenItem.title || '');
    const detectedSeason = extractSeasonNumber(fullText);

    if (targetMode === 'anime') {
      setStepperValue('cfg-season', detectedSeason, 0);
      updateSingleSeasonState(detectedSeason);
    }

    expandCenterWorkspace();
    updatePoster(chosenItem.image, chosenItem.title, chosenItem.meta);
    
    modeStates[targetMode].title = chosenItem.title;
    modeStates[targetMode].tags = chosenItem.meta || 'SISTEMA LISTO';
    modeStates[targetMode].bg = chosenItem.image ? `url('${chosenItem.image}')` : 'none';

    if (chosenItem.image && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
      pyCall('get_dominant_colors', chosenItem.image).then(pal => {
        if (pal && pal.accent1) applyDynamicPalette(pal.accent1, pal.accent2);
      });
    } else if (chosenItem.color) {
      applyDynamicPalette(chosenItem.color, '#8a2be2');
    }

    const state = modeStates[targetMode];
    let fileName = chosenItem.title;
    if (targetMode === 'anime') {
      let epVal = episodeNum || state.startEp || 1;

      const existingEps = state.queue.map(t => {
        const m = t.title.match(/ - Ep (\d+)/i);
        return m ? parseInt(m[1], 10) : null;
      }).filter(n => n !== null);

      if (existingEps.includes(epVal)) {
        epVal = Math.max(...existingEps) + 1;
      }

      fileName = `${chosenItem.title} - Ep ${epVal}`;
      setStepperValue('cfg-start-ep', epVal + 1, 0);
    } else {
      fileName = `${chosenItem.title}`;
    }

    const streamUrl = rawData.stream_url || rawData.page_url || '';
    const incomingRes = (rawData.resolution && rawData.resolution !== 'Auto') ? rawData.resolution : 'N/D';
    const incomingBytes = (rawData.bytes && rawData.bytes > 0) ? rawData.bytes : 0;

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: fileName,
      url: streamUrl,
      pageUrl: rawData.page_url || '',
      status: 'En cola',
      resolution: incomingRes,
      bytes: incomingBytes,
      progress: 0,
      speed: '0 KB/s'
    };

    state.queue.push(task);
    renderQueueCard(task);
    updateTotalQueueSize();

    if (streamUrl) {
      pyCall('probe_stream_metadata', task.id, streamUrl, rawData.page_url || '');
    }
  } catch (err) {
    console.error('[commitTransmission] Error al registrar transmisión:', err);
  } finally {
    closeMatchModal();
  }
}

function extractSearchQuery(rawTitle, rawUrl = '') {
  let text = '';
  if (rawUrl && typeof rawUrl === 'string') {
    try {
      const urlObj = new URL(rawUrl);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      let slug = segments[segments.length - 1] || segments[0] || '';
      slug = slug.replace(/^ver[-_]/i, '')
                 .replace(/[-_](cap|episodio|episode)[-_]?\d+.*$/i, '')
                 .replace(/[-_]\d+$/, '');
      if (slug && slug.length > 3 && !slug.includes('.')) {
        text = slug.replace(/[-_]/g, ' ');
      }
    } catch (e) {}
  }

  if (!text || text.length < 3) {
    text = rawTitle || '';
  }

  return text
    .replace(/^(Ver|Watch|Descargar|Download)\s+/i, '')
    .replace(/\b(sub\s*español|castellano|latino|dual|audio|hd|fhd|1080p|720p|online)\b.*/gi, '')
    .replace(/\b(capitulo|capítulo|episodio|episode|cap)\b[\s\-_]*\d*.*/gi, '')
    .replace(/[-–—|•].*$/, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEpisodeNumber(rawText) {
  if (!rawText) return 1;

  const capMatch = rawText.match(/(?:episodio|episode|capitulo|capítulo|cap|ep)[\s\.\-_]*(\d{1,4})/i);
  if (capMatch) return parseInt(capMatch[1], 10);

  const seMatch = rawText.match(/\d{1,2}[xX](\d{1,4})/i);
  if (seMatch) return parseInt(seMatch[1], 10);

  const endMatch = rawText.match(/[-_\/](\d{1,4})(?:\/|\?|$|\.html)/i);
  if (endMatch) return parseInt(endMatch[1], 10);

  return 1;
}

window.onLinkReceived = async function(data) {
  const streamUrl = data.stream_url || (data.streams && data.streams[0]) || data.page_url;
  if (!streamUrl) return;

  if (currentMode === 'youtube') {
    setAppMode('anime', true);
  }

  const currentQueue = modeStates[currentMode].queue;
  if (currentQueue.some(item => item.url === streamUrl || item.pageUrl === data.page_url)) {
    return;
  }

  const fullText = (data.page_title || '') + ' ' + (data.page_url || '');
  const detectedEp = extractEpisodeNumber(fullText);
  const detectedSeason = extractSeasonNumber(fullText);
  const cleanName = extractSearchQuery(data.page_title, data.page_url);

  if (currentMode === 'anime') {
    setStepperValue('cfg-season', detectedSeason, 0);
    updateSingleSeasonState(detectedSeason);
  }

  const activeTitle = modeStates[currentMode].title;
  const state = modeStates[currentMode];

  const hasActiveAnime = activeTitle && activeTitle !== 'Esperando consulta...';
  const matchScore = hasActiveAnime ? calculateWordMatchScore(cleanName, activeTitle) : 0;
  
  const isSameSeries = hasActiveAnime && (
    matchScore >= 0.25 || 
    activeTitle.toLowerCase().includes(cleanName.toLowerCase()) || 
    cleanName.toLowerCase().includes(activeTitle.toLowerCase().split(' ')[0])
  );

  if (isSameSeries) {
    expandCenterWorkspace();
    let epVal = detectedEp || state.startEp || 1;

    if (currentMode === 'anime') {
      const existingEps = state.queue.map(t => {
        const m = t.title.match(/ - Ep (\d+)/i);
        return m ? parseInt(m[1], 10) : null;
      }).filter(n => n !== null);

      if (existingEps.includes(epVal)) {
        epVal = Math.max(...existingEps) + 1;
      }

      setStepperValue('cfg-start-ep', epVal + 1, 0);
    }

    const fileName = currentMode === 'anime' ? `${activeTitle} - Ep ${epVal}` : `${activeTitle}`;
    const incomingRes = (data.resolution && data.resolution !== 'Auto') ? data.resolution : 'N/D';
    const incomingBytes = (data.bytes && data.bytes > 0) ? data.bytes : 0;

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: fileName,
      url: streamUrl,
      pageUrl: data.page_url,
      status: 'En cola',
      resolution: incomingRes,
      bytes: incomingBytes,
      progress: 0,
      speed: '0 KB/s'
    };

    state.queue.push(task);
    renderQueueCard(task);
    updateTotalQueueSize();
    pyCall('probe_stream_metadata', task.id, streamUrl, data.page_url);
    return;
  }

  let bestProposal = { title: cleanName, image: '', meta: 'Sin carátula disponible' };
  try {
    const list = await pyCall('search_media', currentMode, cleanName);
    if (list && list.length > 0) {
      let maxScore = -1;
      list.forEach(item => {
        const sc = calculateWordMatchScore(cleanName, item.title);
        if (sc > maxScore) {
          maxScore = sc;
          bestProposal = item;
        }
      });
    }
  } catch (e) {}

  modalTargetMode = currentMode;
  showMatchModal(bestProposal, data, detectedEp);
};

// ========================================================
// INICIALIZACIÓN Y EVENTOS DOM
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sites-dock, .matrix-switch, .window-controls-box').forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  renderSitesDock('anime');

  const btnSwitch = document.getElementById('btn-switch-mode');
  if (btnSwitch) {
    btnSwitch.addEventListener('click', (e) => {
      const targetOpt = e.target.closest('.matrix-opt');
      if (targetOpt) {
        if (targetOpt.id === 'mode-anime') setAppMode('anime', true);
        else if (targetOpt.id === 'mode-movie') setAppMode('movie', true);
        else if (targetOpt.id === 'mode-youtube') setAppMode('youtube', true);
        return;
      }
      const order = ['anime', 'movie', 'youtube'];
      const nextIdx = (order.indexOf(currentMode) + 1) % order.length;
      setAppMode(order[nextIdx], true);
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

  document.querySelectorAll('.stepper-box').forEach(box => {
    const targetId = box.getAttribute('data-id');

    box.querySelector('.step-inc')?.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      setStepperValue(targetId, 0, 1);
    });

    box.querySelector('.step-dec')?.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      setStepperValue(targetId, 0, -1);
    });

    box.addEventListener('wheel', (e) => {
      e.preventDefault();
      setStepperValue(targetId, 0, e.deltaY < 0 ? 1 : -1);
    });
  });

  const seasonInput = document.getElementById('cfg-season');
  if (seasonInput) {
    seasonInput.addEventListener('input', () => {
      const val = parseInt(seasonInput.value, 10) || 1;
      updateSingleSeasonState(val);
    });
  }

  const cardSingleSeason = document.getElementById('card-single-season') || document.getElementById('cfg-single-season')?.closest('.toggle-card');
  const cfgSingleSeason = document.getElementById('cfg-single-season');

  if (cardSingleSeason && cfgSingleSeason) {
    cardSingleSeason.addEventListener('click', (e) => {
      if (e.target !== cfgSingleSeason) {
        cfgSingleSeason.checked = !cfgSingleSeason.checked;
      }
      if (typeof playSynth === 'function') playSynth('origami');
      const isSingle = cfgSingleSeason.checked;
      modeStates[currentMode].singleSeason = isSingle;

      document.body.classList.toggle('is-single-season', isSingle);

      const state = modeStates[currentMode];
      if (state.title && state.title !== 'Esperando consulta...') {
        setUnifiedTitle(state.title);
      }
      saveCurrentState();
    });
  }

  const cardSaveCover = document.getElementById('cfg-save-cover')?.closest('.toggle-card');
  const cfgSaveCover = document.getElementById('cfg-save-cover');

  if (cardSaveCover && cfgSaveCover) {
    cardSaveCover.addEventListener('click', (e) => {
      if (e.target !== cfgSaveCover) {
        cfgSaveCover.checked = !cfgSaveCover.checked;
      }
      if (typeof playSynth === 'function') playSynth('click');
      modeStates[currentMode].saveCover = cfgSaveCover.checked;
      saveCurrentState();
    });
  }

  const cardOpenFolder = document.getElementById('cfg-open-folder')?.closest('.toggle-card');
  const cfgOpenFolder = document.getElementById('cfg-open-folder');

  if (cardOpenFolder && cfgOpenFolder) {
    cardOpenFolder.addEventListener('click', (e) => {
      if (e.target !== cfgOpenFolder) {
        cfgOpenFolder.checked = !cfgOpenFolder.checked;
      }
      if (typeof playSynth === 'function') playSynth('click');
      modeStates[currentMode].openFolder = cfgOpenFolder.checked;
      saveCurrentState();
    });
  }

  const searchInput = document.getElementById('search-input');
  const suggestionsBox = document.getElementById('search-suggestions');
  let searchDebounceTimer;
  let activeSuggIndex = -1;

  function updateSelectedSuggestion(items) {
    items.forEach((item, idx) => {
      if (idx === activeSuggIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', () => {
      if (window.__isTourDemoSearching) return;
      clearTimeout(searchDebounceTimer);
      const query = searchInput.value.trim();
      activeSuggIndex = -1;

      if (query.length < 2) {
        suggestionsBox.classList.remove('active');
        suggestionsBox.innerHTML = '';
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        suggestionsBox.innerHTML = '';
        const list = await pyCall('search_media', currentMode, query);
        if (list && list.length > 0) {
          list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'sugg-item';
            div.innerHTML = `
              <div class="sugg-thumb" style="background-image: url('${item.image}');"></div>
              <div class="sugg-info">
                <div class="sugg-title">${item.title}</div>
                <div class="sugg-meta">${item.meta}</div>
              </div>
            `;
            div.addEventListener('click', async () => {
              searchInput.value = item.title;
              suggestionsBox.classList.remove('active');
              suggestionsBox.innerHTML = '';
              activeSuggIndex = -1;
              expandCenterWorkspace();
              updatePoster(item.image, item.title, item.meta);
              setUnifiedTitle(item.title);

              if (item.image && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
                const palette = await pyCall('get_dominant_colors', item.image);
                if (palette && palette.accent1) {
                  applyDynamicPalette(palette.accent1, palette.accent2);
                  return;
                }
              }

              if (item.color) {
                applyDynamicPalette(item.color, '#8a2be2');
              } else if (currentMode === 'movie') {
                applyDynamicPalette('#ff3366', '#ffaa00');
              } else {
                applyDynamicPalette('#00ffaa', '#8a2be2');
              }
            });
            suggestionsBox.appendChild(div);
          });
          suggestionsBox.classList.add('active');
        } else {
          suggestionsBox.classList.remove('active');
        }
      }, 220);
    });

    searchInput.addEventListener('keydown', (e) => {
      const items = suggestionsBox.querySelectorAll('.sugg-item');
      if (!suggestionsBox.classList.contains('active') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggIndex = (activeSuggIndex + 1) % items.length;
        updateSelectedSuggestion(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggIndex = (activeSuggIndex - 1 + items.length) % items.length;
        updateSelectedSuggestion(items);
      } else if (e.key === 'Enter') {
        if (activeSuggIndex >= 0 && items[activeSuggIndex]) {
          e.preventDefault();
          items[activeSuggIndex].click();
        }
      } else if (e.key === 'Escape') {
        suggestionsBox.classList.remove('active');
        activeSuggIndex = -1;
      }
    });

    window.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        suggestionsBox.classList.remove('active');
        activeSuggIndex = -1;
      }
    });
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

      isMasterRunning = true;
      if (typeof playSynth === 'function') playSynth('chord');
      setMasterDownloadState(true);

      const currentManualDir = document.getElementById('cfg-dir')?.value || modeStates[currentMode].dir;

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

    const initMode = config.active_mode || 'anime';
    setAppMode(initMode, false);

    const dInput = document.getElementById('cfg-dir');
    if (dInput) dInput.value = modeStates[initMode].dir || '';

    const ytInput = document.getElementById('yt-cfg-dir');
    if (ytInput) ytInput.value = modeStates.youtube.dir || '';
  }

  pyCall('get_initial_state')?.then(applyLoadedConfig);

  window.addEventListener('pywebviewready', function() {
    pyCall('get_initial_state')?.then(applyLoadedConfig);
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

  document.getElementById('modal-btn-dismiss')?.addEventListener('click', closeMatchModal);

  document.getElementById('modal-btn-confirm')?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    if (pendingTransmission && pendingTransmission.proposed) {
      commitTransmission(pendingTransmission.proposed, modalTargetMode, pendingTransmission.ep);
    } else {
      closeMatchModal();
    }
  });

  const manualSection = document.getElementById('modal-manual-section');
  document.getElementById('modal-btn-show-search')?.addEventListener('click', () => {
    if (manualSection) manualSection.classList.toggle('open');
  });

  const mAnime = document.getElementById('modal-mode-anime');
  const mMovie = document.getElementById('modal-mode-movie');
  const mContainer = document.getElementById('modal-switch-container');

  function setModalMode(mode) {
    modalTargetMode = mode;
    if (mContainer) {
      mContainer.classList.remove('mode-anime', 'mode-movie');
      mContainer.classList.add(`mode-${mode}`);
    }
    if (mode === 'movie') {
      mAnime?.classList.remove('active');
      mMovie?.classList.add('active');
    } else {
      mMovie?.classList.remove('active');
      mAnime?.classList.add('active');
    }
    if (mSearch && mSearch.value.trim().length >= 2) {
      mSearch.dispatchEvent(new Event('input'));
    }
  }

  mAnime?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    setModalMode('anime');
  });
  mMovie?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    setModalMode('movie');
  });

  const mSearch = document.getElementById('modal-search-input');
  const mSugg = document.getElementById('modal-suggestions');
  let mTimer;
  let activeModalSuggIndex = -1;

  function updateModalSelectedSuggestion(items) {
    items.forEach((item, idx) => {
      if (idx === activeModalSuggIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  if (mSearch && mSugg) {
    mSearch.addEventListener('input', () => {
      clearTimeout(mTimer);
      activeModalSuggIndex = -1;
      const q = mSearch.value.trim();
      if (q.length < 2) {
        mSugg.classList.remove('active');
        mSugg.innerHTML = '';
        return;
      }
      mTimer = setTimeout(async () => {
        mSugg.innerHTML = '';
        const list = await pyCall('search_media', modalTargetMode, q);
        if (list && list.length > 0) {
          list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'sugg-item';
            div.innerHTML = `
              <div class="sugg-thumb" style="background-image: url('${item.image}');"></div>
              <div class="sugg-info">
                <div class="sugg-title">${item.title}</div>
                <div class="sugg-meta">${item.meta}</div>
              </div>
            `;
            div.addEventListener('click', () => {
              commitTransmission(item, modalTargetMode, pendingTransmission?.ep || 1);
            });
            mSugg.appendChild(div);
          });
          mSugg.classList.add('active');
        } else {
          mSugg.classList.remove('active');
        }
      }, 150);
    });

    mSearch.addEventListener('keydown', (e) => {
      const items = mSugg.querySelectorAll('.sugg-item');
      if (!mSugg.classList.contains('active') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeModalSuggIndex = (activeModalSuggIndex + 1) % items.length;
        updateModalSelectedSuggestion(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeModalSuggIndex = (activeModalSuggIndex - 1 + items.length) % items.length;
        updateModalSelectedSuggestion(items);
      } else if (e.key === 'Enter') {
        if (activeModalSuggIndex >= 0 && items[activeModalSuggIndex]) {
          e.preventDefault();
          items[activeModalSuggIndex].click();
        }
      } else if (e.key === 'Escape') {
        mSugg.classList.remove('active');
        activeModalSuggIndex = -1;
      }
    });
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

  const tourSteps = [
    {
      id: 'extension',
      target: '#btn-extension-helper',
      title: '1. Extensión del Navegador',
      desc: 'Es fundamental configurarla para capturar vídeos y enlaces con 1 solo clic.',
      isExtensionStep: true,
      placement: 'bottom-center'
    },
    {
      id: 'modes',
      target: '#btn-switch-mode',
      title: '2. Selector de Modos',
      desc: 'Alterna entre ANIME, CINE y YOUTUBE con opciones y colores adaptados (Atajo: TAB).',
      placement: 'bottom-center'
    },
    {
      id: 'sites',
      target: '#sites-dock',
      title: '3. Sitios Recomendados',
      desc: 'Accesos directos a portales óptimos para ver y capturar contenido sin publicidad molesta.',
      placement: 'bottom-left'
    },
    {
      id: 'pipeline',
      target: '.glass-box:first-child',
      title: '4. Pipeline Activo',
      desc: 'Tu centro de descargas: monitorea la resolución, el peso real en megabytes y el progreso en vivo.',
      placement: 'center-modal'
    },
    {
      id: 'dest_dir',
      target: '#block-dest-dir',
      title: '5. Destino Local',
      desc: 'Elige la carpeta o disco de tu PC donde se guardarán todos los archivos extraídos.',
      placement: 'left-center'
    },
    {
      id: 'season_group',
      target: '#block-season-group',
      title: '6. Temporada y Temporada Única',
      desc: 'Ajusta el número de temporada o activa Temporada Única para series de una sola entrega.',
      placement: 'left-center'
    },
    {
      id: 'toggles_group',
      target: '#block-toggles-group',
      title: '7. Portada y Apertura Automática',
      desc: 'Guarda folder.jpg en alta resolución para Plex/Kodi y abre la carpeta al terminar la descarga.',
      placement: 'left-center'
    },
    {
      id: 'container_fmt',
      target: '#block-container-fmt',
      title: '8. Formato Contenedor',
      desc: 'Selecciona si deseas empaquetar el vídeo en formato .MKV o .MP4.',
      placement: 'left-center'
    },
    {
      id: 'threads_simul',
      target: '#block-threads-simul',
      title: '9. Hilos y Paralelas',
      desc: 'Acelera la descarga configurando múltiples conexiones simultáneas en paralelo.',
      placement: 'left-center'
    },
    {
      id: 'telemetry',
      target: '#block-telemetry',
      title: '10. Espacio en Disco',
      desc: 'Telemetría continua del espacio disponible en tu disco para evitar quedarte sin almacenamiento.',
      placement: 'left-center'
    },
    {
      id: 'workspace_center',
      target: '.search-container, .parallax-wrap, #main-poster',
      title: '11. Búsqueda y Carátula Parallax',
      desc: 'Busca con autocompletado en AniList/IMDb. Al seleccionar un título, la portada y paleta se sincronizan.',
      placement: 'left-docked'
    },
    {
      id: 'master_extraction',
      target: '#mag-wrap',
      title: '12. Botón Maestro de Extracción',
      desc: 'Inicia la descarga con un clic o pulsando Espacio. Se divide elásticamente para permitir cancelar.',
      placement: 'master-docked-left' // Pegado abajo del todo y a la izquierda del botón maestro
    },
    {
      id: 'top_right',
      target: '.nav-right-cluster',
      title: '13. Controles y Asistencia',
      desc: 'Vuelve a abrir este tour cuando quieras o revisa si hay actualizaciones automáticas.',
      placement: 'bottom-right'
    }
  ];

  const tourBackdrop = document.getElementById('tour-backdrop');
  const tourCard = document.getElementById('tour-card');
  const tourBadge = document.getElementById('tour-step-badge');
  const tourTitle = document.getElementById('tour-card-title');
  const tourDesc = document.getElementById('tour-card-desc');
  const tourActions = document.getElementById('tour-card-actions');
  const btnStartTour = document.getElementById('btn-start-tour');
  const virtualCursor = document.getElementById('tour-virtual-cursor');

  function stopAllTourDemos() {
    tourDemoIntervals.forEach(i => clearInterval(i));
    tourDemoIntervals = [];

    window.__isTourDemoActive = false;
    window.__isTourDemoSearching = false;

    // Limpiar inmediatamente TODAS las clases de atenuación para que no bloqueen los eventos del siguiente paso
    document.querySelectorAll('.tour-sub-dimmed, .tour-blurred-zone, .tour-highlighted-element, .tour-demo-anim, .tour-toggle-demo-1, .tour-toggle-demo-2, .tour-stepper-demo').forEach(el => {
      el.classList.remove('tour-sub-dimmed', 'tour-blurred-zone', 'tour-highlighted-element', 'tour-demo-anim', 'tour-toggle-demo-1', 'tour-toggle-demo-2', 'tour-stepper-demo');
    });

    const sInput = document.getElementById('search-input');
    if (sInput) {
      sInput.readOnly = false;
      sInput.value = '';
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

    // Restaurar los valores reales del usuario en el panel derecho
    const state = modeStates[currentMode];
    if (state) {
      const cfgSave = document.getElementById('cfg-save-cover');
      const cfgOpen = document.getElementById('cfg-open-folder');
      const cfgDir = document.getElementById('cfg-dir');
      if (cfgSave) cfgSave.checked = state.saveCover !== false;
      if (cfgOpen) cfgOpen.checked = state.openFolder !== false;
      if (cfgDir) cfgDir.value = state.dir || '';
      setStepperValue('cfg-season', state.season || 1, 0);
      applyChipsState(state);
    }
  }

  function clearTourHighlights() {
    stopAllTourDemos();
    document.body.classList.remove('tour-running-active');
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

      if (isWorkspaceCenter) {
        // Spotlight amplio que cubre a la vez buscador y póster central sin sombras agresivas
        const centerStage = document.getElementById('center-stage');
        if (centerStage) {
          const stageRect = centerStage.getBoundingClientRect();
          centerX = stageRect.left + stageRect.width / 2;
          centerY = stageRect.top + stageRect.height / 2;
          dynamicRadius = Math.max(540, stageRect.height * 0.65);
        }
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

    if (placement === 'master-docked-left') {
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
        left = Math.max(20, rect.left - cardWidth - 24);
      } else if (placement === 'bottom-right') {
        top = rect.bottom + 16;
        left = Math.max(20, rect.right - cardWidth);
      } else if (placement === 'bottom-left') {
        top = rect.bottom + 16;
        left = Math.max(20, rect.left);
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
          if (!input || currentTourStep !== 4) return;
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
        const demoQuery = 'One Piece';
        let charIdx = 0;

        // Portada oficial One Piece en alta definición precargada
        const onePieceImg = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/nx21-t4mDgIxGQycS.jpg';
        const imgPreload = new Image();
        imgPreload.src = onePieceImg;

        const typeInterval = setInterval(() => {
          if (charIdx <= demoQuery.length) {
            sInput.value = demoQuery.substring(0, charIdx);
            charIdx++;
          } else {
            clearInterval(typeInterval);
            if (suggestions) {
              // Lista con múltiples sugerencias reales enriquecidas
              suggestions.innerHTML = `
                <div class="sugg-item selected" id="sugg-op-main">
                  <div class="sugg-thumb" style="background-image: url('${onePieceImg}');"></div>
                  <div class="sugg-info">
                    <div class="sugg-title">One Piece</div>
                    <div class="sugg-meta">EN EMISIÓN • ★ 8.8</div>
                  </div>
                </div>
                <div class="sugg-item" style="opacity: 0.65;">
                  <div class="sugg-thumb" style="background-image: url('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163270-YgPq1T2G254w.jpg');"></div>
                  <div class="sugg-info">
                    <div class="sugg-title">One Piece: Fan Letter</div>
                    <div class="sugg-meta">ESPECIAL • ★ 9.1</div>
                  </div>
                </div>
                <div class="sugg-item" style="opacity: 0.55;">
                  <div class="sugg-thumb" style="background-image: url('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx141159-Qk05H1WjPz9P.jpg');"></div>
                  <div class="sugg-info">
                    <div class="sugg-title">One Piece Film Red</div>
                    <div class="sugg-meta">PELÍCULA • ★ 7.8</div>
                  </div>
                </div>
              `;
              suggestions.classList.add('active');

              // Selección automática tras mostrar la lista desplegable
              setTimeout(() => {
                const selectedItem = document.getElementById('sugg-op-main');
                if (selectedItem) selectedItem.style.background = 'rgba(255, 214, 10, 0.18)';

                setTimeout(() => {
                  suggestions.classList.remove('active');
                  suggestions.innerHTML = '';
                  if (tourLauncher) tourLauncher.style.display = 'none';
                  if (posterInfo) posterInfo.style.display = 'block';

                  // Aplicación real directa al póster central para evitar cuadro negro
                  mainPoster.style.backgroundImage = `url('${onePieceImg}')`;
                  const aL1 = document.getElementById('ambient-layer-1');
                  const aL2 = document.getElementById('ambient-layer-2');
                  if (aL1) aL1.style.backgroundImage = `url('${onePieceImg}')`;
                  if (aL2) aL2.style.backgroundImage = `url('${onePieceImg}')`;

                  updatePoster(onePieceImg, 'One Piece', 'EN EMISIÓN • ★ 8.8');
                  setUnifiedTitle('One Piece');
                  
                  // Paleta vibrante característica de One Piece (Rojo / Dorado Cálido)
                  applyDynamicPalette('rgb(255, 60, 60)', 'rgb(255, 175, 0)');

                  // Demostración Parallax tridimensional activa
                  let deg = 0;
                  const parallaxInterval = setInterval(() => {
                    deg = (deg + 2.5) % 360;
                    const tiltX = Math.sin(deg * Math.PI / 180) * 7;
                    const tiltY = Math.cos(deg * Math.PI / 180) * 7;
                    mainPoster.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.03)`;
                  }, 30);
                  tourDemoIntervals.push(parallaxInterval);
                }, 500);
              }, 700);
            }
          }
        }, 65);
        tourDemoIntervals.push(typeInterval);
      }
    } else if (stepId === 'master_extraction') {
      const splitCluster = document.getElementById('split-cluster-master');
      if (splitCluster) {
        let splitState = false;
        const splitInterval = setInterval(() => {
          splitState = !splitState;
          splitCluster.classList.toggle('is-split', splitState);
          const mTxt = document.getElementById('mag-txt');
          if (mTxt) mTxt.innerText = splitState ? 'DESCARGANDO...' : 'INICIAR EXTRACCIÓN';
        }, 1200);
        tourDemoIntervals.push(splitInterval);
      }
    }
  }

  function renderTourStep(stepIdx) {
    clearTourHighlights();
    const step = tourSteps[stepIdx];
    if (!step) {
      endTour(true);
      return;
    }

    currentTourStep = stepIdx;
    if (tourBadge) tourBadge.textContent = `PASO ${stepIdx + 1} DE ${tourSteps.length}`;
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
        btnNext.textContent = stepIdx === tourSteps.length - 1 ? '¡Finalizar Tour! 🎉' : 'Siguiente ➔';
        btnNext.addEventListener('click', () => {
          stopAllTourDemos();
          if (stepIdx === tourSteps.length - 1) {
            endTour(true);
          } else {
            renderTourStep(stepIdx + 1);
          }
        });
        tourActions.appendChild(btnNext);
      }
    }

    tourBackdrop?.classList.add('active');
    tourCard?.classList.add('active');
  }

  function startTour(fromCenter = false) {
    isTourStartedFromCenter = fromCenter;
    
    // Captura snapshot del estado real antes de iniciar el tour
    tourSnapshot = {
      title: modeStates[currentMode]?.title || 'Esperando consulta...',
      tags: modeStates[currentMode]?.tags || 'SISTEMA LISTO',
      bg: modeStates[currentMode]?.bg || '',
      accent1: modeStates[currentMode]?.accent1 || '#ffd60a',
      accent2: modeStates[currentMode]?.accent2 || '#ffb703',
      dir: modeStates[currentMode]?.dir || '',
      season: modeStates[currentMode]?.season || 1
    };

    expandCenterWorkspace();

    const launcherCenter = document.getElementById('tour-launcher-center');
    const stateBg = modeStates[currentMode]?.bg;
    const hasRealCover = typeof stateBg === 'string' && stateBg !== '' && stateBg !== 'none';

    if (launcherCenter) {
      launcherCenter.style.display = hasRealCover ? 'none' : 'flex';
    }

    const finishCard = document.getElementById('tour-finished-card');
    if (finishCard) finishCard.style.display = 'none';

    renderTourStep(0);
  }

  function endTour(isFinished = false) {
    clearTourHighlights();
    tourBackdrop?.classList.remove('active');
    tourCard?.classList.remove('active');
    document.body.classList.remove('tour-extension-locked');
    isTourOpenFromGuided = false;

    // Restauración fiel del 100% del estado previo al tour
    if (tourSnapshot) {
      modeStates[currentMode].title = tourSnapshot.title;
      modeStates[currentMode].tags = tourSnapshot.tags;
      modeStates[currentMode].bg = tourSnapshot.bg;
      modeStates[currentMode].dir = tourSnapshot.dir;
      modeStates[currentMode].season = tourSnapshot.season;

      const mPoster = document.getElementById('main-poster');
      const aL1 = document.getElementById('ambient-layer-1');
      const aL2 = document.getElementById('ambient-layer-2');
      const posterInfo = document.getElementById('poster-info-bar');
      const launcherCenter = document.getElementById('tour-launcher-center');
      const finishCard = document.getElementById('tour-finished-card');

      if (mPoster) {
        mPoster.style.backgroundImage = tourSnapshot.bg;
        mPoster.style.transform = '';
      }
      if (aL1) aL1.style.backgroundImage = tourSnapshot.bg;
      if (aL2) aL2.style.backgroundImage = tourSnapshot.bg;

      const hasRealCover = typeof tourSnapshot.bg === 'string' && tourSnapshot.bg !== '' && tourSnapshot.bg !== 'none';

      if (hasRealCover) {
        if (posterInfo) posterInfo.style.display = 'block';
        if (launcherCenter) launcherCenter.style.display = 'none';
      } else {
        if (posterInfo) posterInfo.style.display = 'none';
        if (launcherCenter) {
          launcherCenter.classList.remove('is-hidden');
          launcherCenter.style.display = 'flex';
        }
      }

      applyDynamicPalette(tourSnapshot.accent1, tourSnapshot.accent2);

      if (isFinished && isTourStartedFromCenter && !hasRealCover) {
        if (launcherCenter) launcherCenter.style.display = 'none';
        if (finishCard) finishCard.style.display = 'flex';
      } else if (finishCard) {
        finishCard.style.display = 'none';
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
    startTour(false); // Iniciado desde arriba a la derecha (no resetea)
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
    // Si el asistente de extensión está abierto en modo guiado, BLOQUEAR TAB y ESPACIO por completo
    if (document.body.classList.contains('tour-extension-locked')) {
      if (e.key === 'Tab' || e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    const isModalOpen = document.getElementById('match-modal-backdrop')?.classList.contains('active');
    if (isModalOpen) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      const order = ['anime', 'movie', 'youtube'];
      const nextIdx = (order.indexOf(currentMode) + 1) % order.length;
      setAppMode(order[nextIdx], true);
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

  // ========================================================
  // INICIALIZACIÓN MÓDULO YOUTUBE
  // ========================================================
  const ytSearchInput = document.getElementById('yt-search-input');
  const ytHeroWrapper = document.getElementById('yt-hero-wrapper');
  const ytResultsDock = document.getElementById('yt-results-dock');
  const ytResultsList = document.getElementById('yt-results-list');
  const ytClearBtn = document.getElementById('yt-clear-btn');
  let ytDebounce = null;

  function renderYtResults(items) {
    if (!ytResultsList) return;
    ytResultsList.innerHTML = '';

    if (!items || items.length === 0) {
      ytResultsList.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b; font-size:12px; font-weight:800;">NO SE ENCONTRARON RESULTADOS</div>';
      return;
    }

    items.forEach(video => {
      const card = document.createElement('div');
      card.className = 'yt-video-card';
      if (modeStates.youtube.selectedVideo && modeStates.youtube.selectedVideo.id === video.id) {
        card.classList.add('selected');
      }

      card.innerHTML = `
        <div class="yt-thumb-box">
          <img class="yt-thumb-img" src="${video.thumbnail}" alt="Thumbnail" loading="lazy">
          <span class="yt-duration-badge">${video.duration}</span>
        </div>
        <div class="yt-video-details">
          <span class="yt-video-title" title="${video.title}">${video.title}</span>
          <span class="yt-video-channel">${video.uploader}</span>
        </div>
      `;

      card.addEventListener('click', async () => {
        if (typeof playSynth === 'function') playSynth('click');
        document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
        card.classList.add('selected');

        const pBox = document.getElementById('yt-dl-progress-box');
        const pBar = document.getElementById('yt-dl-bar');
        const pStatus = document.getElementById('yt-dl-status');
        const pSpeed = document.getElementById('yt-dl-speed');
        if (pBox) pBox.style.display = 'none';
        if (pBar) pBar.style.width = '0%';
        if (pStatus) pStatus.innerText = 'Iniciando...';
        if (pSpeed) pSpeed.innerText = '0% • 0 KB/s';

        if (typeof window.setYtDownloadState === 'function') {
          window.setYtDownloadState(false);
        }

        modeStates.youtube.selectedVideo = video;
        document.body.classList.add('yt-has-selection');
        saveCurrentState();

        setTimeout(() => {
          refreshAllGliders();
        }, 150);

        const pImg = document.getElementById('yt-preview-img');
        const pEmpty = document.getElementById('yt-preview-empty');
        const pTitle = document.getElementById('yt-prev-title');
        const pChannel = document.getElementById('yt-prev-channel');
        const btnDownload = document.getElementById('yt-btn-download');

        if (pImg) {
          pImg.src = video.thumbnail;
          pImg.style.display = 'block';
        }
        if (pEmpty) pEmpty.style.display = 'none';
        if (pTitle) pTitle.innerText = video.title;
        if (pChannel) pChannel.innerText = video.uploader;

        if (btnDownload) {
          btnDownload.disabled = false;
          btnDownload.removeAttribute('disabled');
          btnDownload.style.pointerEvents = 'auto';
          btnDownload.style.opacity = '1';
        }

        const bgVal = video.thumbnail ? `url('${video.thumbnail}')` : 'none';
        const aL1 = document.getElementById('ambient-layer-1');
        const aL2 = document.getElementById('ambient-layer-2');
        if (aL1) aL1.style.backgroundImage = bgVal;
        if (aL2) aL2.style.backgroundImage = bgVal;

        if (video.thumbnail && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
          const pal = await pyCall('get_dominant_colors', video.thumbnail);
          if (pal && pal.accent1) {
            const acc1 = pal.accent1;
            const acc2 = pal.accent2 || '#ff5500';
            modeStates.youtube.accent1 = acc1;
            modeStates.youtube.accent2 = acc2;
            applyDynamicPalette(acc1, acc2);
          }
        }
      });

      ytResultsList.appendChild(card);
    });
  }

  async function triggerYoutubeSearch() {
    if (!ytSearchInput) return;
    const val = ytSearchInput.value.trim();
    if (ytClearBtn) ytClearBtn.style.display = val.length > 0 ? 'block' : 'none';

    if (val.length < 2) {
      if (ytHeroWrapper) ytHeroWrapper.classList.remove('is-searched');
      if (ytResultsDock) {
        ytResultsDock.classList.remove('active');
        ytResultsDock.style.display = 'none';
      }
      document.body.classList.remove('yt-has-selection');
      return;
    }

    if (ytHeroWrapper) ytHeroWrapper.classList.add('is-searched');
    if (ytResultsDock) {
      ytResultsDock.style.display = 'flex';
      setTimeout(() => ytResultsDock.classList.add('active'), 50);
    }

    ytResultsList.innerHTML = `
      <div class="yt-loading-box">
        <div class="yt-orbital-spinner"></div>
        <span class="yt-loading-txt">LOCALIZANDO TRANSMISIONES...</span>
      </div>
    `;

    const results = await pyCall('search_youtube', val);
    modeStates.youtube.results = results || [];
    renderYtResults(results);
  }

  let activeYtNavIndex = -1;

  function updateYtKeyboardSelection(cards) {
    cards.forEach((c, idx) => {
      if (idx === activeYtNavIndex) {
        c.classList.add('kb-focused');
        c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        c.classList.remove('kb-focused');
      }
    });
  }

  if (ytSearchInput) {
    ytSearchInput.addEventListener('input', () => {
      activeYtNavIndex = -1;
      clearTimeout(ytDebounce);
      ytDebounce = setTimeout(triggerYoutubeSearch, 400);
    });

    ytSearchInput.addEventListener('keydown', (e) => {
      const cards = document.querySelectorAll('.yt-video-card');

      if (e.key === 'ArrowDown') {
        if (cards.length > 0) {
          e.preventDefault();
          activeYtNavIndex = (activeYtNavIndex + 1) % cards.length;
          updateYtKeyboardSelection(cards);
        }
      } else if (e.key === 'ArrowUp') {
        if (cards.length > 0) {
          e.preventDefault();
          activeYtNavIndex = (activeYtNavIndex - 1 + cards.length) % cards.length;
          updateYtKeyboardSelection(cards);
        }
      } else if (e.key === 'Enter') {
        if (activeYtNavIndex >= 0 && cards[activeYtNavIndex]) {
          e.preventDefault();
          cards[activeYtNavIndex].click();
        } else {
          clearTimeout(ytDebounce);
          triggerYoutubeSearch();
        }
      } else if (e.key === 'Escape') {
        ytClearBtn?.click();
      }
    });
  }

  ytClearBtn?.addEventListener('click', () => {
    if (ytSearchInput) {
      ytSearchInput.value = '';
      activeYtNavIndex = -1;
      if (ytHeroWrapper) ytHeroWrapper.classList.remove('is-searched');
      if (ytResultsDock) {
        ytResultsDock.classList.remove('active');
        ytResultsDock.style.display = 'none';
      }
      document.body.classList.remove('yt-has-selection');
      ytClearBtn.style.display = 'none';
      ytSearchInput.focus();
    }
  });

  const ytBtnClosePanel = document.getElementById('yt-btn-close-panel');
  ytBtnClosePanel?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof playSynth === 'function') playSynth('click');
    document.body.classList.remove('yt-has-selection');
    document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
  });

  const ytFormatChips = document.getElementById('yt-format-chips');
  const ytResGroup = document.getElementById('yt-res-group');
  const ytBtnTxt = document.getElementById('yt-btn-txt');

  ytFormatChips?.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ytFormatChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateChipGlider(ytFormatChips, btn);

      const isAudio = btn.getAttribute('data-format') === 'audio';
      modeStates.youtube.format = isAudio ? 'audio' : 'video';
      if (ytResGroup) {
        ytResGroup.style.display = isAudio ? 'none' : 'block';
        if (!isAudio) {
          requestAnimationFrame(() => {
            const rChips = document.getElementById('yt-res-chips');
            const activeRes = rChips?.querySelector('.chip-btn.active') || rChips?.querySelector(`[data-res="${modeStates.youtube.res}"]`);
            if (activeRes && rChips) {
              activeRes.classList.add('active');
              updateChipGlider(rChips, activeRes);
            }
          });
        }
      }
      if (ytBtnTxt) ytBtnTxt.innerText = isAudio ? 'DESCARGAR AUDIO (MP3)' : 'DESCARGAR VÍDEO';
      saveCurrentState();
    });
  });

  const ytResChips = document.getElementById('yt-res-chips');

  function triggerJellyGlider(group, targetBtn, direction = 0) {
    if (!group || !targetBtn) return;
    const glider = group.querySelector('.chip-glider');
    group.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');

    const leftOffset = targetBtn.offsetLeft;
    const width = targetBtn.offsetWidth;

    if (glider) {
      glider.classList.remove('is-dragging', 'jelly-stretch-right', 'jelly-stretch-left');
      glider.style.setProperty('--glider-x', `${leftOffset}px`);
      glider.style.width = `${width}px`;
      glider.style.transform = `translateX(${leftOffset}px)`;

      if (direction !== 0) {
        glider.classList.add(direction > 0 ? 'jelly-stretch-right' : 'jelly-stretch-left');
        setTimeout(() => {
          glider.classList.remove('jelly-stretch-right', 'jelly-stretch-left');
          glider.style.transform = `translateX(${leftOffset}px)`;
        }, 220);
      }
    }

    modeStates.youtube.res = targetBtn.getAttribute('data-res');
    saveCurrentState();
  }

  if (ytResChips) {
    let isDragging = false;
    let dragThreshold = false;
    let startX = 0;
    let lastActiveBtn = ytResChips.querySelector('.chip-btn.active');

    ytResChips.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (dragThreshold) return;
        const currentActive = ytResChips.querySelector('.chip-btn.active');
        const dir = currentActive ? (btn.offsetLeft - currentActive.offsetLeft) : 0;
        if (typeof playSynth === 'function') playSynth('origami');
        triggerJellyGlider(ytResChips, btn, dir);
      });
    });

    ytResChips.addEventListener('pointerdown', (e) => {
      isDragging = true;
      dragThreshold = false;
      startX = e.clientX;
      ytResChips.classList.add('is-grabbing');
      try { ytResChips.setPointerCapture(e.pointerId); } catch(err) {}

      const glider = ytResChips.querySelector('.chip-glider');
      if (glider) glider.classList.add('is-dragging');
    });

    ytResChips.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      if (Math.abs(e.clientX - startX) > 4) {
        dragThreshold = true;
      }

      const glider = ytResChips.querySelector('.chip-glider');
      const rect = ytResChips.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      const buttons = Array.from(ytResChips.querySelectorAll('.chip-btn'));
      const closestBtn = buttons.reduce((closest, btn) => {
        const bRect = btn.getBoundingClientRect();
        const center = (bRect.left - rect.left) + bRect.width / 2;
        const dist = Math.abs(relativeX - center);
        return dist < closest.dist ? { btn, dist } : closest;
      }, { btn: buttons[0], dist: Infinity }).btn;

      if (glider && closestBtn) {
        const targetX = Math.max(2, Math.min(rect.width - closestBtn.offsetWidth - 2, relativeX - closestBtn.offsetWidth / 2));
        glider.style.transform = `translateX(${targetX}px)`;
        glider.style.width = `${closestBtn.offsetWidth}px`;
      }

      if (closestBtn && closestBtn !== lastActiveBtn) {
        buttons.forEach(b => b.classList.remove('active'));
        closestBtn.classList.add('active');
        if (typeof playSynth === 'function') playSynth('click');
        lastActiveBtn = closestBtn;
      }
    });

    const endGliderDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      ytResChips.classList.remove('is-grabbing');

      try { ytResChips.releasePointerCapture(e.pointerId); } catch(err) {}

      const glider = ytResChips.querySelector('.chip-glider');
      if (glider) glider.classList.remove('is-dragging');

      const target = lastActiveBtn || ytResChips.querySelector('.chip-btn.active') || ytResChips.querySelector('.chip-btn');
      if (target) {
        const currentActive = ytResChips.querySelector('.chip-btn.active');
        const dir = currentActive ? (target.offsetLeft - currentActive.offsetLeft) : 1;
        triggerJellyGlider(ytResChips, target, dir || 1);
      }
      setTimeout(() => { dragThreshold = false; }, 50);
    };

    ytResChips.addEventListener('pointerup', endGliderDrag);
    ytResChips.addEventListener('pointercancel', endGliderDrag);
  }

  const ytBtnBrowse = document.getElementById('yt-btn-browse');
  const ytCfgDir = document.getElementById('yt-cfg-dir');
  ytBtnBrowse?.addEventListener('click', async () => {
    const selected = await pyCall('select_folder', ytCfgDir.value);
    if (selected) {
      ytCfgDir.value = selected;
      modeStates.youtube.dir = selected;
      updateDiskTelemetry(selected);
      saveCurrentState();
    }
  });

  ytCfgDir?.addEventListener('change', () => {
    modeStates.youtube.dir = ytCfgDir.value;
    updateDiskTelemetry(ytCfgDir.value);
    saveCurrentState();
  });
  ytCfgDir?.addEventListener('input', () => {
    modeStates.youtube.dir = ytCfgDir.value;
    saveCurrentState();
  });

  const ytCardOpen = document.getElementById('yt-card-open-folder');
  const ytCfgOpen = document.getElementById('yt-cfg-open-folder');
  if (ytCardOpen && ytCfgOpen) {
    ytCardOpen.addEventListener('click', (e) => {
      if (e.target !== ytCfgOpen) ytCfgOpen.checked = !ytCfgOpen.checked;
      if (typeof playSynth === 'function') playSynth('click');
      modeStates.youtube.openFolder = ytCfgOpen.checked;
    });
  }

  const ytBtnDownload = document.getElementById('yt-btn-download');
  ytBtnDownload?.addEventListener('click', (e) => {
    e.preventDefault();
    const video = modeStates.youtube.selectedVideo;
    if (!video) return;

    if (typeof playSynth === 'function') playSynth('chord');

    const pBox = document.getElementById('yt-dl-progress-box');
    const pBar = document.getElementById('yt-dl-bar');
    const pStatus = document.getElementById('yt-dl-status');
    const pSpeed = document.getElementById('yt-dl-speed');

    if (pBox) pBox.style.display = 'flex';
    if (pBar) pBar.style.width = '0%';
    if (pStatus) pStatus.innerText = 'Descargando...';
    if (pSpeed) pSpeed.innerText = '0%';

    const isAudioOnly = modeStates.youtube.format === 'audio';
    const quality = modeStates.youtube.res || '1080';
    const targetDir = ytCfgDir?.value || modeStates.youtube.dir;
    const shouldOpen = ytCfgOpen ? ytCfgOpen.checked : true;

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: video.title + (isAudioOnly ? ' [MP3]' : ''),
      url: video.url,
      pageUrl: video.url,
      status: 'En cola',
      resolution: isAudioOnly ? 'MP3' : `${quality}p`,
      bytes: 0,
      progress: 0,
      speed: '0 KB/s'
    };

    setYtDownloadState(true);

    pyCall('start_downloads', {
      tasks: [task],
      config: {
        dir: targetDir,
        is_youtube: true,
        is_audio_only: isAudioOnly,
        quality: quality,
        title: video.title,
        open_folder: shouldOpen
      }
    });
  });

  const ytBtnCancel = document.getElementById('yt-btn-cancel');
  ytBtnCancel?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('origami');
    const pBox = document.getElementById('yt-dl-progress-box');
    const pStatus = document.getElementById('yt-dl-status');

    pyCall('cancel_download_task', 'youtube_active');

    if (pStatus) pStatus.innerText = 'Cancelado';
    if (pBox) pBox.style.display = 'none';

    setYtDownloadState(false);
  });
});

window.addEventListener('resize', () => {
  refreshAllGliders();
  setTimeout(refreshAllGliders, 200);
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

  if (card && (status === 'Completado' || progress >= 100)) {
    card.classList.add('completed');
    
    const currentQueue = modeStates[currentMode].queue || [];
    const hasActiveTasks = currentQueue.some(t => t.status !== 'Completado' && t.status !== 'Cancelado');
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

  const descText = document.getElementById('update-desc');
  if (descText && info.body) {
    const summary = info.body.split('\n')[0].replace(/^#+\s*/, '').trim();
    if (summary) descText.textContent = summary;
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

document.addEventListener('DOMContentLoaded', () => {
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
  const btnExtHelper = document.getElementById('btn-extension-helper');
  const extModalOverlay = document.getElementById('ext-modal-overlay');
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
      if (extActionsBox) {
        extActionsBox.classList.remove('is-hidden');
      }
    } else {
      if (extActionsBox) {
        extActionsBox.classList.add('is-hidden');
      }
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

  // Comprueba qué navegadores están realmente instalados y apaga los inexistentes
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

  if (btnExtHelper && extModalOverlay) {
    btnExtHelper.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      isStep1Done = false;
      isStep2Done = false;
      isStep3Done = false;
      checkStepsCompletion();
      activateStep(1);
      extModalOverlay.classList.add('active');
      checkAndApplyBrowserAvailability();
    });

    // Control dinámico de selección de navegador con reset de pasos
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

        // Si el usuario cambia de navegador tras haber abierto uno, resetear al Paso 1
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

    // Paso 2: Confirmar interruptor de desarrollador (bloqueado si el Paso 1 no está hecho)
    btnActionStep2?.addEventListener('click', () => {
      if (!isStep1Done) return;
      if (typeof playSynth === 'function') playSynth('click');
      btnActionStep2.classList.add('is-completed');
      btnActionStep2.innerHTML = '✔ Modo activado';
      isStep2Done = true;
      activateStep(3);
    });

    // Paso 3: Abrir carpeta para arrastrar (bloqueado si Paso 1 y Paso 2 no están hechos)
    btnActionStep3?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isStep1Done || !isStep2Done) return;
      if (typeof playSynth === 'function') playSynth('chord');
      try { pyCall('open_extension_folder'); } catch (err) { console.error(err); }
      isStep3Done = true;
      if (step3SwapBox) {
        step3SwapBox.classList.add('folder-opened');
      }
      checkStepsCompletion();
    });

    // Botón dedicado para volver a abrir la carpeta en cualquier momento
    btnReopenFolder?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof playSynth === 'function') playSynth('click');
      try { pyCall('open_extension_folder'); } catch (err) { console.error(err); }
      btnReopenFolder.classList.remove('pulse-receive');
      void btnReopenFolder.offsetWidth;
      btnReopenFolder.classList.add('pulse-receive');
    });

    const closeExtModal = () => {
      if (typeof playSynth === 'function') playSynth('click');
      extModalOverlay.classList.remove('active');
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

        // Restaurar estado visual del launcher central
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

    extModalOverlay.addEventListener('click', (e) => {
      if (e.target === extModalOverlay) closeExtModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && extModalOverlay.classList.contains('active')) {
        closeExtModal();
      }
    });
  }
});