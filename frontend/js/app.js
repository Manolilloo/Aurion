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

  const groupRect = group.getBoundingClientRect();
  const btnRect = targetBtn.getBoundingClientRect();

  const leftOffset = btnRect.left - groupRect.left - 4;
  const width = btnRect.width;

  glider.style.width = `${width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;
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

// 4. STEPPERS NUMÉRICOS (TEMPORADA Y EPISODIO)
function setStepperValue(targetId, newVal, direction = 0) {
  const input = document.getElementById(targetId);
  const disp = document.getElementById(`disp-${targetId}`);
  if (!input) return;

  const box = input.closest('.stepper-box');
  const min = box ? parseInt(box.getAttribute('data-min'), 10) || 1 : 1;
  const max = box ? parseInt(box.getAttribute('data-max'), 10) || 9999 : 9999;

  let val = Math.max(min, Math.min(max, newVal));
  input.value = val;

  if (disp) {
    if (direction !== 0) {
      disp.classList.add(direction > 0 ? 'anim-up' : 'anim-down');
      setTimeout(() => {
        disp.innerText = val;
        disp.classList.remove('anim-up', 'anim-down');
      }, 120);
    } else {
      disp.innerText = val;
    }
  }

  if (targetId === 'cfg-season') modeStates[currentMode].season = val;
  if (targetId === 'cfg-start-ep') modeStates[currentMode].startEp = val;

  const currentTitle = modeStates[currentMode].title;
  const prefixInput = document.getElementById('cfg-prefix');
  if (currentMode === 'anime' && prefixInput && currentTitle && currentTitle !== 'Esperando consulta...') {
    const sStr = String(modeStates.anime.season || 1).padStart(2, '0');
    const epStr = String(modeStates.anime.startEp || 1).padStart(2, '0');
    prefixInput.value = `[${currentTitle}] S${sStr}E${epStr} - `;
    modeStates.anime.prefix = prefixInput.value;
  }

  saveCurrentState();
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

  // Verificación estricta: sólo tiene portada si bg existe, no es vacío ni 'none'
  const hasCover = typeof state.bg === 'string' && state.bg.trim() !== '' && state.bg !== 'none' && state.title && state.title !== 'Esperando consulta...';

  if (hasCover) {
    if (pTitle) pTitle.innerText = state.title;
    if (pTags) pTags.innerHTML = state.tags || 'SISTEMA LISTO';
    if (mPoster) mPoster.style.backgroundImage = state.bg;
    if (aL1) aL1.style.backgroundImage = state.bg;
    if (aL2) aL2.style.backgroundImage = state.bg;
    expandCenterWorkspace();
  } else {
    // LIMPIEZA ABSOLUTA DE PORTADA Y FONDOS
    if (pTitle) pTitle.innerText = 'Esperando consulta...';
    if (pTags) pTags.innerHTML = 'SISTEMA LISTO';
    if (mPoster) {
      mPoster.style.backgroundImage = '';
      mPoster.style.removeProperty('background-image');
    }
    if (aL1) {
      aL1.style.backgroundImage = '';
      aL1.style.removeProperty('background-image');
    }
    if (aL2) {
      aL2.style.backgroundImage = '';
      aL2.style.removeProperty('background-image');
    }

    // Regresar al estado de bienvenida en este modo
    if (welcome) {
      welcome.classList.remove('is-hidden');
      welcome.style.display = 'flex';
    }
    if (workspace) {
      workspace.classList.remove('is-active');
      workspace.style.display = 'none';
    }
  }

  applyChipsState(state);
  applyDynamicPalette(state.accent1, state.accent2);
  renderFullQueue(mode);
  updateDiskTelemetry(state.dir);
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

function setUnifiedTitle(title) {
  const pInput = document.getElementById('cfg-prefix');
  const state = modeStates[currentMode];
  state.title = title;
  
  if (currentMode === 'anime') {
    const sStr = String(state.season || 1).padStart(2, '0');
    const epStr = String(state.startEp || 1).padStart(2, '0');
    if (pInput) pInput.value = `[${title}] S${sStr}E${epStr} - `;
    state.prefix = `[${title}] S${sStr}E${epStr} - `;
  } else {
    if (pInput) pInput.value = `[${title}] `;
    state.prefix = `[${title}] `;
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
  const welcome = document.getElementById('welcome-card');
  const workspace = document.getElementById('workspace-card');

  if (welcome) {
    welcome.classList.add('is-hidden');
    welcome.style.display = 'none';
  }
  if (workspace) {
    workspace.classList.add('is-active');
    workspace.style.display = 'flex';
  }
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
    const sStr = String(state.season || 1).padStart(2, '0');
    const epStr = String(episodeNum || state.startEp || 1).padStart(2, '0');
    fileName = `[${chosenItem.title}] S${sStr}E${epStr}`;
    setStepperValue('cfg-start-ep', (episodeNum || 1) + 1, 1);
  } else {
    fileName = `[${chosenItem.title}]`;
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
  const match = rawText.match(/(?:episodio|episode|capitulo|capítulo|cap)[^\d]*(\d+)/i) ||
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

  const detectedEp = extractEpisodeNumber(data.page_title + ' ' + (data.page_url || ''));
  const cleanName = extractSearchQuery(data.page_title, data.page_url);

  const activeTitle = modeStates[currentMode].title;
  if (activeTitle !== 'Esperando consulta...' && calculateWordMatchScore(cleanName, activeTitle) > 0.4) {
    expandCenterWorkspace();
    const state = modeStates[currentMode];
    const sStr = String(state.season || 1).padStart(2, '0');
    const epStr = String(detectedEp || state.startEp || 1).padStart(2, '0');
    const fileName = currentMode === 'anime' ? `[${activeTitle}] S${sStr}E${epStr}` : `[${activeTitle}]`;

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
    if (currentMode === 'anime') {
      setStepperValue('cfg-start-ep', (detectedEp || state.startEp) + 1, 1);
    }
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

  // Steppers de temporada y episodio
  document.querySelectorAll('.stepper-box').forEach(box => {
    const targetId = box.getAttribute('data-id');

    box.querySelector('.step-inc')?.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      const cur = parseInt(document.getElementById(targetId)?.value, 10) || 1;
      setStepperValue(targetId, cur + 1, 1);
    });

    box.querySelector('.step-dec')?.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      const cur = parseInt(document.getElementById(targetId)?.value, 10) || 1;
      setStepperValue(targetId, cur - 1, -1);
    });

    box.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cur = parseInt(document.getElementById(targetId)?.value, 10) || 1;
      if (e.deltaY < 0) {
        setStepperValue(targetId, cur + 1, 1);
      } else {
        setStepperValue(targetId, cur - 1, -1);
      }
    });
  });

  // Toggle Portada
  const cfgSaveCover = document.getElementById('cfg-save-cover');
  if (cfgSaveCover) {
    cfgSaveCover.addEventListener('change', () => {
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

  // Búsqueda interactiva
  const searchInput = document.getElementById('search-input');
  const suggestionsBox = document.getElementById('search-suggestions');
  let searchDebounceTimer;

  if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const query = searchInput.value.trim();

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

    window.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        suggestionsBox.classList.remove('active');
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

  // Botón Maestro sobre la cola del modo activo
  const btnMaster = document.getElementById('btn-master');
  const magTxt = document.getElementById('mag-txt');
  if (btnMaster && magTxt) {
    btnMaster.addEventListener('click', () => {
      const currentQueue = modeStates[currentMode].queue;
      if (currentQueue.length === 0) {
        if (typeof playSynth === 'function') playSynth('click');
        const originalText = magTxt.innerText;
        magTxt.innerText = 'COLA VACÍA';
        btnMaster.style.borderColor = '#ff3366';
        setTimeout(() => {
          magTxt.innerText = originalText;
          btnMaster.style.borderColor = '';
        }, 1500);
        return;
      }

      const pendingTasks = currentQueue.filter(t => t.status !== 'Completado');
      if (pendingTasks.length === 0) {
        if (typeof playSynth === 'function') playSynth('chord');
        const originalText = magTxt.innerText;
        magTxt.innerText = 'TODO COMPLETADO ✔';
        setTimeout(() => {
          magTxt.innerText = originalText;
        }, 1800);
        return;
      }

      if (typeof playSynth === 'function') playSynth('chord');
      btnMaster.classList.add('loading');
      
      pendingTasks.forEach(task => {
        const bar = document.getElementById(`bar-${task.id}`);
        if (bar) bar.classList.add('active');
      });

      pyCall('start_downloads', {
        tasks: pendingTasks,
        config: modeStates[currentMode]
      });
    });
  }

  // Sincronización inicial con Python
  pyCall('get_initial_state')?.then(config => {
    if (config) {
      if (config.anime) Object.assign(modeStates.anime, config.anime);
      if (config.movie) Object.assign(modeStates.movie, config.movie);
      if (config.active_mode) setAppMode(config.active_mode, false);
    }
  });

  window.addEventListener('pywebviewready', function() {
    pyCall('get_initial_state')?.then(config => {
      if (config) {
        if (config.anime) Object.assign(modeStates.anime, config.anime);
        if (config.movie) Object.assign(modeStates.movie, config.movie);
        if (config.active_mode) setAppMode(config.active_mode, false);
      }
    });
  });

  updateDiskTelemetry(modeStates.anime.dir);
  
  // CONTROLES DE LA VENTANA CUSTOM
  document.getElementById('win-min')?.addEventListener('click', () => {
    pyCall('minimize_window');
  });

  document.getElementById('win-max')?.addEventListener('click', () => {
    pyCall('toggle_maximize_window');
  });

  document.getElementById('win-close')?.addEventListener('click', () => {
    pyCall('close_window');
  });
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
});

window.addEventListener('resize', () => {
  document.querySelectorAll('.chip-group').forEach(group => {
    const activeBtn = group.querySelector('.chip-btn.active');
    if (activeBtn) updateChipGlider(group, activeBtn);
  });
});