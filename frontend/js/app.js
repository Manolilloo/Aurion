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
    res: 'max',
    fmt: 'mp4',
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
    saveCover: true,
    res: 'max',
    fmt: 'mp4',
    threads: '32',
    simul: '5',
    bg: '',
    title: 'Esperando consulta...',
    tags: 'SISTEMA LISTO',
    accent1: '#ff3366',
    accent2: '#ffaa00',
    queue: []
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

  const driveEl = document.getElementById('disk-drive-name');
  const freeEl = document.getElementById('disk-free-txt');
  const fillEl = document.getElementById('disk-bar-fill');

  if (driveEl) driveEl.innerText = `${data.drive} DISCO`;
  if (freeEl) freeEl.innerText = `${data.free_gb} GB Libres / ${data.total_gb} GB`;
  if (fillEl) fillEl.style.width = `${data.percent_used}%`;
}

// 3. GLIDERS DESLIZANTES
function updateChipGlider(group, targetBtn) {
  if (!group || !targetBtn) return;
  const glider = group.querySelector('.chip-glider');
  if (!glider) return;

  // Cálculo geométrico exacto basado en el contenedor, sin offsets arbitrarios
  const leftOffset = targetBtn.offsetLeft;
  const width = targetBtn.offsetWidth;

  glider.style.width = `${width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;
}

// Función global para recalcular todas las pastillas sin desfases
function refreshAllGliders() {
  document.querySelectorAll('.chip-group').forEach(group => {
    const activeBtn = group.querySelector('.chip-btn.active');
    if (activeBtn) updateChipGlider(group, activeBtn);
  });
}

function applyChipsState(state) {
  ['res', 'fmt', 'threads', 'simul'].forEach(key => {
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

// 4. STEPPERS NUMÉRICOS (TEMPORADA Y EPISODIO) DE 1 EN 1 ESTRICTO
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

// 5. CAMBIO DE MODO Y GUARDADO
function saveCurrentState() {
  const state = modeStates[currentMode];
  const sInput = document.getElementById('search-input');
  const pInput = document.getElementById('cfg-prefix');
  const dInput = document.getElementById('cfg-dir');
  const sCover = document.getElementById('cfg-save-cover');

  if (sInput) state.query = sInput.value;
  if (pInput) state.prefix = pInput.value;
  if (dInput) state.dir = dInput.value;
  if (sCover) state.saveCover = sCover.checked;

  // NO leemos mPoster.style.backgroundImage del DOM aquí para evitar contaminación cruzada entre modos.
  // El fondo (state.bg) y el título (state.title) se guardan únicamente cuando seleccionas un anime o película real.

  pyCall('save_config', {
    active_mode: currentMode,
    [currentMode]: {
      dir: state.dir,
      season: state.season,
      start_ep: state.startEp,
      save_cover: state.saveCover,
      res: state.res,
      fmt: state.fmt,
      threads: state.threads,
      simul: state.simul
    }
  });
}

function renderFullQueue(mode) {
  const container = document.getElementById('queue-list');
  if (!container) return;
  container.innerHTML = '';

  const list = modeStates[mode].queue;
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

function loadState(mode) {
  const state = modeStates[mode];
  const sInput = document.getElementById('search-input');
  const pInput = document.getElementById('cfg-prefix');
  const dInput = document.getElementById('cfg-dir');
  const sCover = document.getElementById('cfg-save-cover');
  const pTitle = document.getElementById('poster-title');
  const pTags = document.getElementById('poster-tags');
  const mPoster = document.getElementById('main-poster');
  const aL1 = document.getElementById('ambient-layer-1');
  const aL2 = document.getElementById('ambient-layer-2');
  const welcome = document.getElementById('welcome-card');
  const workspace = document.getElementById('workspace-card');

  if (sInput) sInput.value = state.query || '';
  if (pInput) pInput.value = state.prefix || '';
  if (dInput) dInput.value = state.dir;

  setStepperValue('cfg-season', state.season || 1, 0);
  setStepperValue('cfg-start-ep', state.startEp || 1, 0);

  if (sCover) sCover.checked = state.saveCover !== false;
  const sSingle = document.getElementById('cfg-single-season');
  if (sSingle) {
    sSingle.checked = !!state.singleSeason;
    document.body.classList.toggle('is-single-season', !!state.singleSeason);
  }

  // Verificación estricta: sólo tiene portada si bg existe, no es vacío ni 'none'
  const hasCover = typeof state.bg === 'string' && state.bg.trim() !== '' && state.bg !== 'none' && state.title && state.title !== 'Esperando consulta...';

  // SIEMPRE DIRECTO AL ESPACIO DE TRABAJO (SIN PANTALLA DE BIENVENIDA)
  expandCenterWorkspace();

  if (hasCover) {
    if (pTitle) pTitle.innerText = state.title;
    if (pTags) pTags.innerHTML = state.tags || 'SISTEMA LISTO';
    if (mPoster) mPoster.style.backgroundImage = state.bg;
    if (aL1) aL1.style.backgroundImage = state.bg;
    if (aL2) aL2.style.backgroundImage = state.bg;
  } else {
    if (pTitle) pTitle.innerText = 'Esperando consulta...';
    if (pTags) pTags.innerHTML = 'SISTEMA LISTO';
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
  // updatePrefixTags();
}

function setAppMode(mode, save = true) {
  if (save) saveCurrentState();

  currentMode = mode;
  const isMovie = mode === 'movie';
  
  if (typeof playSynth === 'function' && save) playSynth('chord');

  const animeOpt = document.getElementById('mode-anime');
  const movieOpt = document.getElementById('mode-movie');
  const sInput = document.getElementById('search-input');

  if (isMovie) {
    document.body.classList.add('mode-movie');
    if (animeOpt) animeOpt.classList.remove('active');
    if (movieOpt) movieOpt.classList.add('active');
    if (sInput) sInput.placeholder = 'Buscar película...';
  } else {
    document.body.classList.remove('mode-movie');
    if (movieOpt) movieOpt.classList.remove('active');
    if (animeOpt) animeOpt.classList.add('active');
    if (sInput) sInput.placeholder = 'Invoca un anime...';
  }

  loadState(mode);
  renderSitesDock(mode);

  if (save) pyCall('toggle_mode', mode);
}

// ACTUALIZADOR INTELIGENTE DE TOKENS DE NOMENCLATURA EN VIVO
function refreshNamingDisplay() {
  const state = modeStates[currentMode];
  const tTitle = document.getElementById('token-title');
  const tSeason = document.getElementById('token-season');
  const tEp = document.getElementById('token-ep');
  const tQuality = document.getElementById('token-quality');
  const tExt = document.getElementById('token-ext');
  const tMode = document.getElementById('naming-mode-indicator');
  const pInput = document.getElementById('cfg-prefix');

  const rawTitle = state.title && state.title !== 'Esperando consulta...' ? state.title : 'Aurion';
  const cleanTitle = `[${rawTitle}]`;

  if (tTitle) {
    tTitle.innerText = cleanTitle;
    tTitle.title = cleanTitle;
  }

  if (currentMode === 'anime') {
    const sNum = String(state.season || 1).padStart(2, '0');
    const epNum = String(state.startEp || 1).padStart(2, '0');
    if (tSeason) {
      tSeason.style.display = 'inline-block';
      tSeason.innerText = `S${sNum}`;
    }
    if (tEp) {
      tEp.style.display = 'inline-block';
      tEp.innerText = `E${epNum}`;
    }
    if (tMode) tMode.innerText = 'SERIE/ANIME';
  } else {
    if (tSeason) tSeason.style.display = 'none';
    if (tEp) tEp.style.display = 'none';
    if (tMode) tMode.innerText = 'PELÍCULA';
  }

  // Calidad y Contenedor actuales
  if (tQuality) tQuality.innerText = state.res === 'max' ? 'MAX-RES' : state.res;
  if (tExt) tExt.innerText = `.${state.fmt || 'mp4'}`;

  // Si el usuario no ha puesto algo completamente manual, generar prefijo óptimo
  if (pInput && (!pInput.value || pInput.value.startsWith('[Aurion]') || pInput.value.startsWith(`[${state.title}`))) {
    if (currentMode === 'anime') {
      const sNum = String(state.season || 1).padStart(2, '0');
      const epNum = String(state.startEp || 1).padStart(2, '0');
      pInput.value = `${cleanTitle} S${sNum}E${epNum} - `;
    } else {
      pInput.value = `${cleanTitle} (${state.res || '1080p'}) - `;
    }
    state.prefix = pInput.value;
  }
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

// Al seleccionar desde el buscador central principal
const originalSelectSuggestion = window.selectSuggestion;
window.selectSuggestion = function(item) {
  if (typeof originalSelectSuggestion === 'function') {
    originalSelectSuggestion(item);
  }
  // Guardar explícitamente la portada solo en el modo actual
  if (item && item.image) {
    modeStates[currentMode].bg = `url('${item.image}')`;
    modeStates[currentMode].title = item.title;
    modeStates[currentMode].tags = item.meta || 'SISTEMA LISTO';
  }
};

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

// 6. PIPELINE DE COLA Y PESO TOTAL
function updateTotalQueueSize() {
  const currentQueue = modeStates[currentMode].queue;
  let totalBytes = 0;
  let hasKnownSizes = false;

  currentQueue.forEach(item => {
    if (item.bytes && item.bytes > 0) {
      totalBytes += item.bytes;
      hasKnownSizes = true;
    }
  });

  const badgeEl = document.getElementById('val-total-size');
  if (!badgeEl) return;

  if (!hasKnownSizes) {
    badgeEl.innerText = `${currentQueue.length} ${currentQueue.length === 1 ? 'ítem' : 'ítems'}`;
  } else {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    badgeEl.innerText = `${mb} MB`;
  }
}

function renderQueueCard(task) {
  const container = document.getElementById('queue-list');
  if (!container) return;

  // Si aún está el mensaje gris de espera, retirarlo de inmediato
  const emptyPlaceholder = container.querySelector('div[style*="text-align: center"]');
  if (emptyPlaceholder) {
    emptyPlaceholder.remove();
  }

  const card = document.createElement('div');
  card.className = 'queue-card';
  card.id = task.id;

  card.innerHTML = `
    <div class="queue-card-top">
      <div class="queue-card-title">${task.title}</div>
      <button class="queue-card-del" title="Eliminar">✕</button>
    </div>
    <div class="queue-progress-bar" id="bar-${task.id}">
      <div class="queue-progress-fill" style="width: ${task.progress}%"></div>
    </div>
    <div class="queue-card-meta">
      <span class="queue-card-status">${task.status}</span>
      <span class="queue-card-speed">${task.sizeStr ? task.sizeStr + ' • ' : ''}${task.speed}</span>
    </div>
  `;

  card.querySelector('.queue-card-del').addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');

    // Notificar inmediatamente a Python para que aborte la descarga física
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

// 7. AUTO-MATCHING CON BBDD Y RECEPCIÓN DE EXTENSIÓN
// Limpiador agresivo de metadatos de páginas web
function extractSearchQuery(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^(Ver|Watch|Descargar|Download)\s+/i, '')
    .replace(/\s*(Episodio|Episode|Capitulo|Capítulo|Cap)\s*[\d\.\-]+.*/i, '')
    .replace(/\s*(Sub\s*Español|Castellano|Latino|Dual|Audio|HD|FHD|1080p|720p|Online).*/i, '')
    .replace(/[-–—|•].*$/, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .trim();
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

// Auto-matching inteligente contra AniList / IMDb
async function autoMatchWithDatabase(rawTitle) {
  const cleanName = extractSearchQuery(rawTitle);
  if (!cleanName || cleanName.length < 2) return null;

  try {
    const results = await pyCall('search_media', currentMode, cleanName);
    if (results && results.length > 0) {
      // Ordenar los resultados por coincidencia real de palabras contra el título extraído
      let bestMatch = results[0];
      let highestScore = -1;

      results.forEach(item => {
        const score = calculateWordMatchScore(cleanName, item.title);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = item;
        }
      });

      if (modeStates[currentMode].title === 'Esperando consulta...' || modeStates[currentMode].title !== bestMatch.title) {
        updatePoster(bestMatch.image, bestMatch.title, bestMatch.meta);
        setUnifiedTitle(bestMatch.title);

        if (bestMatch.image && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
          const pal = await pyCall('get_dominant_colors', bestMatch.image);
          if (pal && pal.accent1) applyDynamicPalette(pal.accent1, pal.accent2);
        } else if (bestMatch.color) {
          applyDynamicPalette(bestMatch.color, '#8a2be2');
        }
      }
      return bestMatch.title;
    }
  } catch (e) {
    console.log('[AutoMatch] Error en consulta automática:', e);
  }
  return cleanName;
}

// ========================================================
// SISTEMA DE CONFIRMACIÓN HUD INTERACTIVO // ORQUESTACIÓN
// ========================================================

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
  if (currentMode !== targetMode) {
    setAppMode(targetMode, true);
  }

  expandCenterWorkspace();
  updatePoster(chosenItem.image, chosenItem.title, chosenItem.meta);
  
  // Guardar en el estado para que persista
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

  if (targetMode === 'anime') {
    setStepperValue('cfg-start-ep', episodeNum || 1, 0);
  }
  setUnifiedTitle(chosenItem.title);

  const state = modeStates[targetMode];
  let fileName = chosenItem.title;
  if (targetMode === 'anime') {
    const epVal = episodeNum || state.startEp || 1;
    fileName = `${chosenItem.title} - Ep ${epVal}`;
    // Mantenemos el episodio exacto, SIN sumarle 1
    setStepperValue('cfg-start-ep', epVal, 0);
  } else {
    fileName = `${chosenItem.title}`;
  }

  const streamUrl = pendingTransmission.raw.stream_url || pendingTransmission.raw.page_url;
  const task = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    title: fileName,
    url: streamUrl,
    pageUrl: pendingTransmission.raw.page_url,
    status: 'En cola',
    sizeStr: '',
    bytes: 0,
    progress: 0,
    speed: '0 KB/s'
  };

  state.queue.push(task);
  renderQueueCard(task);
  updateTotalQueueSize();

  closeMatchModal();
}

// EXTRACTOR CANÓNICO DEFINITIVO (PULIDO QUIRÚRGICO DE CAP/EP)
function extractSearchQuery(rawTitle, rawUrl = '') {
  let text = '';

  // 1. Intentar sacar slug de la URL
  if (rawUrl && typeof rawUrl === 'string') {
    try {
      const urlObj = new URL(rawUrl);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      let slug = segments[segments.length - 1] || segments[0] || '';
      
      // Eliminar prefijos y sufijos típicos de servidores y capítulos (-10, -cap-10, ver-)
      slug = slug.replace(/^ver[-_]/i, '')
                 .replace(/[-_](cap|episodio|episode)[-_]?\d+.*$/i, '')
                 .replace(/[-_]\d+$/, '');

      if (slug && slug.length > 3 && !slug.includes('.')) {
        text = slug.replace(/[-_]/g, ' ');
      }
    } catch (e) {}
  }

  // 2. Si no hay slug o es muy corto, usar el título de la página
  if (!text || text.length < 3) {
    text = rawTitle || '';
  }

  // 3. Limpieza profunda: eliminar "cap", "episodio", números aislados y coletillas
  text = text
    .replace(/^(Ver|Watch|Descargar|Download)\s+/i, '')
    .replace(/\b(sub\s*español|castellano|latino|dual|audio|hd|fhd|1080p|720p|online)\b.*/gi, '')
    .replace(/\b(capitulo|capítulo|episodio|episode|cap)\b[\s\-_]*\d*.*/gi, '') // Quita "cap", "cap 10", "cap-10" o "cap" suelto
    .replace(/[-–—|•].*$/, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function extractEpisodeNumber(rawText) {
  // Solo detectamos el episodio (ej: Cap 10, Ep 3, 3x02 -> ep 2)
  const seMatch = rawText.match(/[xXeE_\-](\d{1,4})/i);
  if (seMatch) return parseInt(seMatch[1], 10);

  const match = rawText.match(/(?:episodio|episode|capitulo|capítulo|cap)[^\d]*(\d{1,4})/i) ||
                rawText.match(/[_\-\/](\d{1,4})(?:[_\-\.]|$)/);
  return match ? parseInt(match[1], 10) : 1;
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
  const cleanName = extractSearchQuery(data.page_title, data.page_url);

  const activeTitle = modeStates[currentMode].title;
  if (activeTitle !== 'Esperando consulta...' && calculateWordMatchScore(cleanName, activeTitle) > 0.4) {
    expandCenterWorkspace();
    const state = modeStates[currentMode];
    const epVal = detectedEp || state.startEp || 1;
    const fileName = currentMode === 'anime' ? `${activeTitle} - Ep ${epVal}` : `${activeTitle}`;

    if (currentMode === 'anime') {
      setStepperValue('cfg-start-ep', epVal, 0);
      setUnifiedTitle(activeTitle);
    }

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: fileName,
      url: streamUrl,
      pageUrl: data.page_url,
      status: 'En cola',
      sizeStr: '',
      bytes: 0,
      progress: 0,
      speed: '0 KB/s'
    };

    state.queue.push(task);
    renderQueueCard(task);
    updateTotalQueueSize();
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
  // Bloquear arrastre involuntario al pulsar sobre los controles superiores
  document.querySelectorAll('.sites-dock, .matrix-switch, .window-controls-box').forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  // Inicializar Dock de Sitios
  renderSitesDock('anime');

  // Switch Anime / Cine
  const btnSwitch = document.getElementById('btn-switch-mode');
  if (btnSwitch) {
    btnSwitch.addEventListener('click', () => {
      const newMode = currentMode === 'anime' ? 'movie' : 'anime';
      setAppMode(newMode, true);
    });
  }

  // Explorador de carpetas
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

  // Chips tácticos
  document.querySelectorAll('.chip-group').forEach(group => {
    const cfgKey = group.getAttribute('data-cfg');
    group.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof playSynth === 'function') playSynth('origami');
        group.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        updateChipGlider(group, btn);

        const val = btn.getAttribute('data-val');
        modeStates[currentMode][cfgKey] = val;

        const badge = document.getElementById(`val-${cfgKey}`);
        if (badge) badge.innerText = val;

        saveCurrentState();
      });
    });
  });

  // Steppers de temporada y episodio (incrementos de 1 en 1 sin dobles sumas)
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

  // Clic en toda la tarjeta de TEMPORADA ÚNICA
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

  // Clic en toda la tarjeta de GUARDAR PORTADA
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

  // Prefijo manual
  const cfgPrefix = document.getElementById('cfg-prefix');
  if (cfgPrefix) {
    cfgPrefix.addEventListener('input', () => {
      modeStates[currentMode].prefix = cfgPrefix.value;
    });
  }

  // Búsqueda interactiva con navegación completa por teclado (Flechas, Enter, Esc)
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

    // Control de teclado: flechas, enter y escape
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

  // Vaciar cola del modo activo
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

  // CONTROLADOR ÚNICO DE ESTADO DINÁMICO (DEMO TÉCNICA 09)
  const btnMaster = document.getElementById('btn-master');
  const magTxt = document.getElementById('mag-txt');
  let isMasterRunning = false;

  if (btnMaster && magTxt) {
    btnMaster.addEventListener('click', () => {
      if (isMasterRunning) return;
      isMasterRunning = true;

      const currentQueue = modeStates[currentMode].queue;
      const originalText = 'INICIAR EXTRACCIÓN';

      // 1. Sondeo dinámico: encoger a esfera giratoria con neón
      if (typeof playSynth === 'function') playSynth('click');
      btnMaster.classList.add('loading');

      setTimeout(() => {
        btnMaster.classList.remove('loading');

        // SI NO HAY NADA: Poner Cola Vacía y regresar del tirón
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

        // SI HAY DESCARGAS:
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
        pendingTasks.forEach(task => {
          const bar = document.getElementById(`bar-${task.id}`);
          if (bar) bar.classList.add('active');
        });

        const currentManualDir = document.getElementById('cfg-dir')?.value || modeStates[currentMode].dir;
        const currentManualPrefix = document.getElementById('cfg-prefix')?.value || modeStates[currentMode].prefix;

        // Leer chips activos directamente del DOM para garantizar sincronización 100% real
        const activeRes = document.querySelector('.chip-group[data-cfg="res"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].res;
        const activeFmt = document.querySelector('.chip-group[data-cfg="fmt"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].fmt;
        const activeThreads = document.querySelector('.chip-group[data-cfg="threads"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].threads;
        const activeSimul = document.querySelector('.chip-group[data-cfg="simul"] .chip-btn.active')?.getAttribute('data-val') || modeStates[currentMode].simul;

        pyCall('start_downloads', {
          tasks: pendingTasks,
          config: {
            ...modeStates[currentMode],
            dir: currentManualDir,
            prefix: currentManualPrefix,
            is_single_season: !!modeStates[currentMode].singleSeason,
            season_num: modeStates[currentMode].season || 1,
            res: activeRes,
            fmt: activeFmt,
            threads: activeThreads,
            simul: activeSimul
          }
        });

        isMasterRunning = false;
      }, 450);
    });
  }

  // Sincronización inicial con Python
  pyCall('get_initial_state')?.then(config => {
    if (config) {
      if (config.anime) Object.assign(modeStates.anime, config.anime);
      if (config.movie) Object.assign(modeStates.movie, config.movie);
      setAppMode('anime', false);    }
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

  // CONTROLES DE VENTANA
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
    
    // Al maximizar se retira la clase de arrastre; al restaurar se vuelve a poner
    const topBar = document.getElementById('top-nav-bar');
    if (topBar) {
      if (isMax) {
        topBar.classList.remove('pywebview-drag-region');
      } else {
        topBar.classList.add('pywebview-drag-region');
      }
    }

    if (btnMax) btnMax.innerText = isMax ? '❐' : '□';

    // Recalcular gliders de inmediato y tras la transición visual
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

  // LISTENERS DEL MODAL INTERACTIVO
  document.getElementById('modal-btn-dismiss')?.addEventListener('click', closeMatchModal);

  document.getElementById('modal-btn-confirm')?.addEventListener('click', () => {
    if (pendingTransmission) {
      commitTransmission(pendingTransmission.proposed, modalTargetMode, pendingTransmission.ep);
    }
  });

  const manualSection = document.getElementById('modal-manual-section');
  document.getElementById('modal-btn-show-search')?.addEventListener('click', () => {
    if (manualSection) manualSection.classList.toggle('open');
  });

  // Switch del modal con glider animado
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
    // Reejecutar búsqueda si hay texto escrito
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

  // Buscador interactivo corregido dentro del modal
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
              // Confirmar la elección manual directa
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

  // --- MENÚ DESPLEGABLE SITIOS (SOLO POR CLIC) ---
  const sitesDock = document.getElementById('sites-dock');
  const sitesTrigger = document.querySelector('.sites-trigger');

  if (sitesDock && sitesTrigger) {
    // Abrir / Cerrar al pulsar en SITIOS
    sitesTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sitesDock.classList.toggle('is-open');
      sitesTrigger.textContent = isOpen ? 'SITIOS ▼' : 'SITIOS ▶';
    });

    // Cerrar si haces clic fuera
    document.addEventListener('click', (e) => {
      if (!sitesDock.contains(e.target) && sitesDock.classList.contains('is-open')) {
        sitesDock.classList.remove('is-open');
        sitesTrigger.textContent = 'SITIOS ▶';
      }
    });

    // Cerrar automáticamente si cambias entre Anime y Cine
    document.getElementById('btn-switch-mode')?.addEventListener('click', () => {
      sitesDock.classList.remove('is-open');
      sitesTrigger.textContent = 'SITIOS ▶';
    });
  }

  // RESET RÁPIDO DE PREFIJO A FORMATO ÓPTIMO
  document.getElementById('btn-reset-prefix')?.addEventListener('click', () => {
    const pInput = document.getElementById('cfg-prefix');
    if (pInput) pInput.value = '';
    refreshNamingDisplay();
  });

// REFRESCO AL EDITAR MANUALMENTE EL PREFIJO
  document.getElementById('cfg-prefix')?.addEventListener('input', (e) => {
    modeStates[currentMode].prefix = e.target.value;
    const tTitle = document.getElementById('token-title');
    if (tTitle && e.target.value.trim()) {
      tTitle.innerText = e.target.value.trim();
    }
  });

  // BOTÓN ? ALTERNA ENTRE EL PANEL PRINCIPAL Y LA BIENVENIDA / TUTORIAL
  const btnHelp = document.getElementById('win-help');
  btnHelp?.addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    const isWorkspaceVisible = document.body.classList.contains('workspace-open');
    if (isWorkspaceVisible) {
      showWelcomeScreen();
    } else {
      expandCenterWorkspace();
    }
  });
  // ========================================================
  // ATAJOS GLOBALES DE TECLADO INTELIGENTES (TAB & ESPACIO)
  // ========================================================
  window.addEventListener('keydown', (e) => {
    // Si el usuario está escribiendo en cualquier input o editable, dejarlo actuar normal
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isEditing = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable;
    
    // Tampoco interferir si el modal de confirmación HUD está abierto
    const isModalOpen = document.getElementById('match-modal-backdrop')?.classList.contains('active');

    if (isEditing || isModalOpen) return;

    // 1. TECLA TAB: Alternar entre Anime y Cine
    if (e.key === 'Tab') {
      e.preventDefault(); // Evitar el salto de foco nativo del navegador
      const newMode = currentMode === 'anime' ? 'movie' : 'anime';
      setAppMode(newMode, true);
      return;
    }

    // 2. TECLA ESPACIO: Iniciar Extracción
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault(); // Evitar que la ventana haga scroll hacia abajo
      const masterBtn = document.getElementById('btn-master');
      if (masterBtn && !masterBtn.classList.contains('loading')) {
        masterBtn.click();
      }
    }
  });
});

window.addEventListener('resize', () => {
  refreshAllGliders();
  setTimeout(refreshAllGliders, 200);
});

// Receptor de progreso desde Python en tiempo real
window.updateDownloadProgress = function(taskId, progress, speed, status) {
  const card = document.getElementById(taskId);
  if (!card) return;

  const bar = document.getElementById(`bar-${taskId}`);
  const fill = bar?.querySelector('.queue-progress-fill');
  const statusEl = card.querySelector('.queue-card-status');
  const speedEl = card.querySelector('.queue-card-speed');

  if (bar && !bar.classList.contains('active')) bar.classList.add('active');
  if (fill) fill.style.width = `${progress}%`;
  if (statusEl) statusEl.innerText = status;
  if (speedEl) speedEl.innerText = speed;

  if (status === 'Completado') {
    statusEl.style.color = 'var(--color-accent-1)';
    const masterBtn = document.getElementById('btn-master');
    const magTxt = document.getElementById('mag-txt');
    if (magTxt) magTxt.innerText = 'EXTRACCIÓN COMPLETADA';
  }
};