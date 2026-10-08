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
    dir: 'J:\\ANIME\\animes',
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
    dir: 'J:\\ANIME\\animes\\pelisypeliu',
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
    dir: 'Descargas',
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

// 3. GLIDERS DESLIZANTES
function updateChipGlider(group, targetBtn) {
  if (!group || !targetBtn) return;
  const glider = group.querySelector('.chip-glider');
  if (!glider) return;

  const leftOffset = targetBtn.offsetLeft;
  const width = targetBtn.offsetWidth;

  glider.style.width = `${width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;
}

function refreshAllGliders() {
  document.querySelectorAll('.chip-group').forEach(group => {
    const activeBtn = group.querySelector('.chip-btn.active');
    if (activeBtn) updateChipGlider(group, activeBtn);
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
    void dispEl.offsetWidth;
    dispEl.classList.add(delta >= 0 ? 'anim-up' : 'anim-down');
  }

  if (id === 'cfg-season') modeStates[currentMode].season = newVal;
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

  // 1. Ordinales ingleses: '2nd Season', '3rd Season', '4th Season'
  const ordMatch = rawText.match(/(\d{1,2})(?:st|nd|rd|th)\s*(?:season|temp|temporada)/i);
  if (ordMatch) return parseInt(ordMatch[1], 10);

  // 2. Prefijos explícitos: Season 2, Temporada 3, Temp 2, S2, T2
  const prefixMatch = rawText.match(/(?:season|temporada|temp|s|t)[\s\.\-_]*(\d{1,2})(?:[^\d]|$)/i);
  if (prefixMatch) return parseInt(prefixMatch[1], 10);

  // 3. Formato Season x Episode: 2x04, 3x12
  const seMatch = rawText.match(/(\d{1,2})x\d{1,4}/i);
  if (seMatch) return parseInt(seMatch[1], 10);

  // 4. Números romanos comunes en títulos de anime: II, III, IV, V
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
      cardSingle.title = 'No aplicable para temporadas posteriores a la 1';
    }
    document.body.classList.remove('is-single-season');
  } else {
    if (cfgSingle) cfgSingle.disabled = false;
    if (cardSingle) {
      cardSingle.style.opacity = '1';
      cardSingle.style.pointerEvents = 'auto';
      cardSingle.title = '';
    }
  }
}

// 6. PERSISTENCIA
function saveCurrentState() {
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
      simul: state.simul
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
  if (dInput && state.dir) dInput.value = state.dir;

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

    // Restaurar el destino guardado en el input y calcular su espacio libre
    const ytDirInput = document.getElementById('yt-cfg-dir');
    if (ytDirInput && modeStates.youtube.dir) {
      ytDirInput.value = modeStates.youtube.dir;
      updateDiskTelemetry(modeStates.youtube.dir);
    }

    // Restaurar fondo ambiental si ya había un vídeo seleccionado
    const selected = modeStates.youtube.selectedVideo;
    if (selected && selected.thumbnail) {
      const bgVal = `url('${selected.thumbnail}')`;
      const aL1 = document.getElementById('ambient-layer-1');
      const aL2 = document.getElementById('ambient-layer-2');
      if (aL1) aL1.style.backgroundImage = bgVal;
      if (aL2) aL2.style.backgroundImage = bgVal;
    }

    // Restaurar paleta cromática guardada
    const ytAccent1 = modeStates.youtube.accent1 || '#ff0055';
    const ytAccent2 = modeStates.youtube.accent2 || '#ff5500';
    applyDynamicPalette(ytAccent1, ytAccent2);

    // Inicializar visualmente los chips de YouTube al hacerse visible la pestaña
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
}

function updatePoster(imgUrl, title, meta) {
  const bgVal = imgUrl ? `url('${imgUrl}')` : 'none';
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

  modeStates[currentMode].title = title;
  modeStates[currentMode].tags = meta;
  modeStates[currentMode].bg = bgVal;

  if (typeof playSynth === 'function') playSynth('click');
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

function showWelcomeScreen() {
  document.body.classList.remove('workspace-open');

  const welcome = document.getElementById('welcome-card');
  const workspace = document.getElementById('workspace-card');
  const backdrop = document.getElementById('welcome-backdrop');
  const guides = document.getElementById('welcome-guides');

  if (workspace) {
    workspace.classList.remove('is-active');
    workspace.style.display = 'none';
  }

  if (welcome) {
    welcome.classList.remove('is-hidden');
    welcome.style.display = 'flex';
  }
  if (backdrop) backdrop.classList.remove('is-hidden');
  if (guides) guides.classList.remove('is-hidden');
  document.querySelectorAll('.hud-pointer').forEach(p => p.style.display = 'flex');
}

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

      // Autoincrementar si ya existe una tarea con el mismo episodio en la cola
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

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: fileName,
      url: streamUrl,
      pageUrl: rawData.page_url || '',
      status: 'En cola',
      resolution: rawData.resolution || 'N/D',
      bytes: rawData.bytes || 0,
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

  // 1. Patrones explícitos en español e inglés: episodio 3, cap-04, ep_5, etc.
  const capMatch = rawText.match(/(?:episodio|episode|capitulo|capítulo|cap|ep)[\s\.\-_]*(\d{1,4})/i);
  if (capMatch) return parseInt(capMatch[1], 10);

  // 2. Patrón de temporada x episodio: 2x03, 1x08
  const seMatch = rawText.match(/\d{1,2}[xX](\d{1,4})/i);
  if (seMatch) return parseInt(seMatch[1], 10);

  // 3. Patrón al final de la URL o slug: /overflow-cap-2/, /slime-3/
  const endMatch = rawText.match(/[-_\/](\d{1,4})(?:\/|\?|$|\.html)/i);
  if (endMatch) return parseInt(endMatch[1], 10);

  return 1;
}

window.onLinkReceived = async function(data) {
  const streamUrl = data.stream_url || (data.streams && data.streams[0]) || data.page_url;
  if (!streamUrl) return;

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

  // Si ya tenemos una obra activa o la cola ya tiene capítulos, emparejar de forma permisiva
  const hasActiveAnime = activeTitle && activeTitle !== 'Esperando consulta...';
  const matchScore = hasActiveAnime ? calculateWordMatchScore(cleanName, activeTitle) : 0;
  
  // Acepta coincidencia o si el nombre limpio está contenido en el título activo
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

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: fileName,
      url: streamUrl,
      pageUrl: data.page_url,
      status: 'En cola',
      resolution: data.resolution || 'N/D',
      bytes: data.bytes || 0,
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
      // Si pulsa fuera de las etiquetas, rota en ciclo de 3
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
      if (selected && selected !== cfgDirInput.value) {
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
  let isMasterRunning = false;

  if (btnMaster && magTxt) {
    btnMaster.addEventListener('click', () => {
      if (isMasterRunning) return;
      isMasterRunning = true;

      const currentQueue = modeStates[currentMode].queue;
      const originalText = 'INICIAR EXTRACCIÓN';

      if (typeof playSynth === 'function') playSynth('click');
      btnMaster.classList.add('loading');

      setTimeout(() => {
        btnMaster.classList.remove('loading');

        if (currentQueue.length === 0) {
          btnMaster.classList.add('is-empty');
          magTxt.innerText = 'COLA VACÍA';
          if (typeof playSynth === 'function') playSynth('click');

          setTimeout(() => {
            btnMaster.classList.remove('is-empty');
            magTxt.innerText = originalText;
            isMasterRunning = false;
          }, 1200);
          return;
        }

        const pendingTasks = currentQueue.filter(t => t.status !== 'Completado');
        if (pendingTasks.length === 0) {
          magTxt.innerText = 'COLA PROCESADA';
          setTimeout(() => {
            magTxt.innerText = originalText;
            isMasterRunning = false;
          }, 1500);
          return;
        }

        if (typeof playSynth === 'function') playSynth('chord');
        magTxt.innerText = 'DESCARGANDO...';

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
      }, 450);
    });
  }

  pyCall('get_initial_state')?.then(config => {
    if (config) {
      if (config.anime) Object.assign(modeStates.anime, config.anime);
      if (config.movie) Object.assign(modeStates.movie, config.movie);
      setAppMode('anime', false);
    }
  });

  window.addEventListener('pywebviewready', function() {
    pyCall('get_initial_state')?.then(config => {
      if (config) {
        if (config.anime) Object.assign(modeStates.anime, config.anime);
        if (config.movie) Object.assign(modeStates.movie, config.movie);
        setAppMode('anime', false);
      }
    });
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
  const mThumb = document.getElementById('modal-matrix-thumb');

  function setModalMode(mode) {
    modalTargetMode = mode;
    if (mode === 'movie') {
      mAnime?.classList.remove('active');
      mMovie?.classList.add('active');
      if (mThumb) mThumb.style.transform = 'translateX(100%)';
    } else {
      mMovie?.classList.remove('active');
      mAnime?.classList.add('active');
      if (mThumb) mThumb.style.transform = 'translateX(0%)';
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

  if (mSearch && mSugg) {
    mSearch.addEventListener('input', () => {
      clearTimeout(mTimer);
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

  const btnHelp = document.getElementById('win-help');
  
  // Activar animación en el botón hasta su primera interacción
  btnHelp?.classList.add('pulse-attention');

  btnHelp?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    btnHelp.classList.remove('pulse-attention');

    const isWelcomeOpen = !document.getElementById('welcome-card')?.classList.contains('is-hidden') && 
                          document.getElementById('welcome-card')?.style.display !== 'none';

    if (isWelcomeOpen) {
      expandCenterWorkspace();
    } else {
      showWelcomeScreen();
    }
  });

  // Delegar el clic sobre el botón interactivo incrustado en el póster central
  document.addEventListener('click', (e) => {
    if (e.target.closest('#poster-help-trigger')) {
      btnHelp?.click();
    }
  });

  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isEditing = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable;
    const isModalOpen = document.getElementById('match-modal-backdrop')?.classList.contains('active');

    if (isEditing || isModalOpen) return;

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

    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      const masterBtn = document.getElementById('btn-master');
      if (masterBtn && !masterBtn.classList.contains('loading')) {
        masterBtn.click();
      }
    }
  });

  // ========================================================
  // INICIALIZACIÓN MÓDULO YOUTUBE (EVENTOS Y BÚSQUEDA)
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
        document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        modeStates.youtube.selectedVideo = video;

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
        if (btnDownload) btnDownload.disabled = false;

        // Actualizar capas ambientales de fondo con desenfoque
        const bgVal = video.thumbnail ? `url('${video.thumbnail}')` : 'none';
        const aL1 = document.getElementById('ambient-layer-1');
        const aL2 = document.getElementById('ambient-layer-2');
        if (aL1) aL1.style.backgroundImage = bgVal;
        if (aL2) aL2.style.backgroundImage = bgVal;

        // Adaptar paleta cromática a la miniatura del vídeo y guardarla en el estado
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
      return;
    }

    if (ytHeroWrapper) ytHeroWrapper.classList.add('is-searched');
    if (ytResultsDock) {
      ytResultsDock.style.display = 'flex';
      setTimeout(() => ytResultsDock.classList.add('active'), 50);
    }

    ytResultsList.innerHTML = '<div style="text-align:center; padding:40px; color:#ff3366; font-size:12px; font-weight:800; letter-spacing:1.5px;">BUSCANDO VÍDEOS EN DIRECTO...</div>';

    const results = await pyCall('search_youtube', val);
    modeStates.youtube.results = results || [];
    renderYtResults(results);
  }

  if (ytSearchInput) {
    ytSearchInput.addEventListener('input', () => {
      clearTimeout(ytDebounce);
      ytDebounce = setTimeout(triggerYoutubeSearch, 400);
    });

    ytSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(ytDebounce);
        triggerYoutubeSearch();
      }
    });
  }

  ytClearBtn?.addEventListener('click', () => {
    if (ytSearchInput) {
      ytSearchInput.value = '';
      if (ytHeroWrapper) ytHeroWrapper.classList.remove('is-searched');
      if (ytResultsDock) {
        ytResultsDock.classList.remove('active');
        ytResultsDock.style.display = 'none';
      }
      ytClearBtn.style.display = 'none';
      ytSearchInput.focus();
    }
  });

  // Opciones del panel de la derecha (Chips formato MP4/MP3)
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
      if (ytResGroup) ytResGroup.style.display = isAudio ? 'none' : 'block';
      if (ytBtnTxt) ytBtnTxt.innerText = isAudio ? 'DESCARGAR AUDIO (MP3)' : 'DESCARGAR VÍDEO';
    });
  });

  const ytResChips = document.getElementById('yt-res-chips');
  ytResChips?.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ytResChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateChipGlider(ytResChips, btn);
      modeStates.youtube.res = btn.getAttribute('data-res');
    });
  });

  // Selección y persistencia de ruta de descarga en YouTube
  const ytBtnBrowse = document.getElementById('yt-btn-browse');
  const ytCfgDir = document.getElementById('yt-cfg-dir');
  ytBtnBrowse?.addEventListener('click', async () => {
    const selected = await pyCall('select_folder', ytCfgDir.value);
    if (selected && selected !== ytCfgDir.value) {
      ytCfgDir.value = selected;
      modeStates.youtube.dir = selected;
      updateDiskTelemetry(selected);
    }
  });

  ytCfgDir?.addEventListener('change', () => {
    modeStates.youtube.dir = ytCfgDir.value;
  });
  ytCfgDir?.addEventListener('input', () => {
    modeStates.youtube.dir = ytCfgDir.value;
  });

  // Toggle abrir carpeta YouTube
  const ytCardOpen = document.getElementById('yt-card-open-folder');
  const ytCfgOpen = document.getElementById('yt-cfg-open-folder');
  if (ytCardOpen && ytCfgOpen) {
    ytCardOpen.addEventListener('click', (e) => {
      if (e.target !== ytCfgOpen) ytCfgOpen.checked = !ytCfgOpen.checked;
      if (typeof playSynth === 'function') playSynth('click');
      modeStates.youtube.openFolder = ytCfgOpen.checked;
    });
  }

  // Botón de descarga de YouTube
  const ytBtnDownload = document.getElementById('yt-btn-download');
  ytBtnDownload?.addEventListener('click', () => {
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

    const bTxt = document.getElementById('yt-btn-txt');
    if (bTxt) {
      const orig = bTxt.innerText;
      bTxt.innerText = 'DESCARGA ENVIADA ✔';
      setTimeout(() => { bTxt.innerText = orig; }, 1800);
    }
  });
});

window.addEventListener('resize', () => {
  refreshAllGliders();
  setTimeout(refreshAllGliders, 200);
});

// Receptor de progreso desde Python con persistencia entre modos
window.updateDownloadProgress = function(taskId, progress, speed, status) {
  // Si estamos en modo YouTube, actualizar su barra de progreso dedicada
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
      const btnTxt = document.getElementById('yt-btn-txt');
      if (btnTxt) btnTxt.innerText = 'DESCARGA COMPLETADA ✔';
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
    const magTxt = document.getElementById('mag-txt');
    if (magTxt) magTxt.innerText = 'EXTRACCIÓN COMPLETADA';
  }
};

window.updateTaskMetadata = function(taskId, bytes, resolution) {
  const finalBytes = (bytes && bytes > 0) ? bytes : 0;
  const finalRes = (resolution && resolution !== 'Auto') ? resolution : 'N/D';

  ['anime', 'movie'].forEach(m => {
    const t = modeStates[m].queue.find(x => x.id === taskId);
    if (t) {
      if (finalBytes > 0) t.bytes = finalBytes;
      t.resolution = finalRes;
    }
  });

  const sizeEl = document.getElementById(`task-size-${taskId}`);
  const resEl = document.getElementById(`task-res-${taskId}`);

  if (sizeEl) sizeEl.innerText = formatBytes(finalBytes);
  if (resEl) resEl.innerText = finalRes;

  const card = document.getElementById(taskId);
  if (card) {
    const sizeBadge = card.querySelector('.pipeline-card-size');
    const resBadge = card.querySelector('.pipeline-card-res');
    if (sizeBadge) sizeBadge.innerText = formatBytes(finalBytes);
    if (resBadge) resBadge.innerText = finalRes;
  }

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