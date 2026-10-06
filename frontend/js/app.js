// ========================================================
// AURION // GESTOR DE ESTADO DUAL Y CONTROL MULTIMEDIA
// ========================================================

let currentMode = 'anime';

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
    accent2: '#8a2be2'
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
    accent2: '#ffaa00'
  }
};

function pyCall(func, ...args) {
  if (window.pywebview && window.pywebview.api && window.pywebview.api[func]) {
    return window.pywebview.api[func](...args);
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

// TELEMETRÍA DE ALMACENAMIENTO EN DISCO
async function updateDiskTelemetry(path) {
  const data = await pyCall('get_disk_space', path);
  if (!data) return;

  const driveEl = document.getElementById('disk-drive-name');
  const freeEl = document.getElementById('disk-free-txt');
  const fillEl = document.getElementById('disk-bar-fill');

  if (driveEl) driveEl.innerText = `${data.drive} DISCO`;
  if (freeEl) freeEl.innerText = `${data.free_gb} GB Libres / ${data.total_gb} GB`;
  if (fillEl) fillEl.style.width = `${data.percent_used}%`;
}

// SELECTOR DE CARPETAS NATIVO
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

// CONTROLADOR DE GLIDERS DESLIZANTES
function updateChipGlider(group, targetBtn) {
  const glider = group.querySelector('.chip-glider');
  if (!glider || !targetBtn) return;

  const groupRect = group.getBoundingClientRect();
  const btnRect = targetBtn.getBoundingClientRect();

  const leftOffset = btnRect.left - groupRect.left - 4;
  const width = btnRect.width;

  glider.style.width = `${width}px`;
  glider.style.transform = `translateX(${leftOffset}px)`;
}

// CONTROLADORES DE CHIPS TÁCTICOS
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

// CONTROLADOR DE STEPPERS TÁCTICOS (TEMPORADA Y EPISODIOS)
function setStepperValue(targetId, newVal, direction = 0) {
  const input = document.getElementById(targetId);
  const disp = document.getElementById(`disp-${targetId}`);
  if (!input || !disp) return;

  const box = input.closest('.stepper-box');
  const min = parseInt(box.getAttribute('data-min'), 10) || 1;
  const max = parseInt(box.getAttribute('data-max'), 10) || 9999;

  let val = Math.max(min, Math.min(max, newVal));
  if (parseInt(input.value, 10) === val && direction !== 0) return;

  input.value = val;

  if (direction !== 0) {
    disp.classList.add(direction > 0 ? 'anim-up' : 'anim-down');
    setTimeout(() => {
      disp.innerText = val;
      disp.classList.remove('anim-up', 'anim-down');
    }, 120);
  } else {
    disp.innerText = val;
  }

  if (targetId === 'cfg-season') modeStates[currentMode].season = val;
  if (targetId === 'cfg-start-ep') modeStates[currentMode].startEp = val;

  const currentTitle = modeStates[currentMode].title;
  if (currentMode === 'anime' && currentTitle && currentTitle !== 'Esperando consulta...') {
    const sStr = String(modeStates.anime.season || 1).padStart(2, '0');
    const epStr = String(modeStates.anime.startEp || 1).padStart(2, '0');
    cfgPrefix.value = `[${currentTitle}] S${sStr}E${epStr} - `;
    modeStates.anime.prefix = cfgPrefix.value;
  }

  saveCurrentState();
}

document.querySelectorAll('.stepper-box').forEach(box => {
  const targetId = box.getAttribute('data-id');

  box.querySelector('.step-inc').addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    const cur = parseInt(document.getElementById(targetId).value, 10) || 1;
    setStepperValue(targetId, cur + 1, 1);
  });

  box.querySelector('.step-dec').addEventListener('click', () => {
    if (typeof playSynth === 'function') playSynth('click');
    const cur = parseInt(document.getElementById(targetId).value, 10) || 1;
    setStepperValue(targetId, cur - 1, -1);
  });

  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cur = parseInt(document.getElementById(targetId).value, 10) || 1;
    if (e.deltaY < 0) {
      setStepperValue(targetId, cur + 1, 1);
    } else {
      setStepperValue(targetId, cur - 1, -1);
    }
  });
});

// CONTROLADOR CHECKBOX PORTADA
const cfgSaveCover = document.getElementById('cfg-save-cover');
if (cfgSaveCover) {
  cfgSaveCover.addEventListener('change', () => {
    if (typeof playSynth === 'function') playSynth('click');
    modeStates[currentMode].saveCover = cfgSaveCover.checked;
    saveCurrentState();
  });
}

window.addEventListener('pywebviewready', function() {
  pyCall('get_initial_state').then(config => {
    if (config) {
      if (config.anime) Object.assign(modeStates.anime, config.anime);
      if (config.movie) Object.assign(modeStates.movie, config.movie);
      if (config.active_mode) setAppMode(config.active_mode, false);
    }
  });
});

const btnSwitch = document.getElementById('btn-switch-mode');
if(btnSwitch) {
  btnSwitch.addEventListener('click', () => {
    const newMode = currentMode === 'anime' ? 'movie' : 'anime';
    setAppMode(newMode, true);
  });
}

function saveCurrentState() {
  const state = modeStates[currentMode];
  state.query = document.getElementById('search-input').value;
  state.prefix = document.getElementById('cfg-prefix').value;
  state.dir = document.getElementById('cfg-dir').value;
  state.season = parseInt(document.getElementById('cfg-season').value, 10) || 1;
  state.startEp = parseInt(document.getElementById('cfg-start-ep').value, 10) || 1;
  state.saveCover = document.getElementById('cfg-save-cover').checked;
  state.title = document.getElementById('poster-title').innerText;
  state.tags = document.getElementById('poster-tags').innerText;
  state.bg = document.getElementById('main-poster').style.backgroundImage;
  state.accent1 = document.documentElement.style.getPropertyValue('--color-accent-1') || state.accent1;
  state.accent2 = document.documentElement.style.getPropertyValue('--color-accent-2') || state.accent2;

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

function loadState(mode) {
  const state = modeStates[mode];
  document.getElementById('search-input').value = state.query;
  document.getElementById('cfg-prefix').value = state.prefix;
  document.getElementById('cfg-dir').value = state.dir;

  setStepperValue('cfg-season', state.season || 1, 0);
  setStepperValue('cfg-start-ep', state.startEp || 1, 0);

  const saveCoverEl = document.getElementById('cfg-save-cover');
  if (saveCoverEl) saveCoverEl.checked = state.saveCover !== false;

  document.getElementById('poster-title').innerText = state.title;
  document.getElementById('poster-tags').innerText = state.tags;
  
  if (state.bg && state.bg !== 'none') {
    document.getElementById('main-poster').style.backgroundImage = state.bg;
    document.getElementById('ambient-layer-1').style.backgroundImage = state.bg;
    document.getElementById('ambient-layer-2').style.backgroundImage = state.bg;
  } else {
    document.getElementById('main-poster').style.backgroundImage = 'none';
    document.getElementById('ambient-layer-1').style.backgroundImage = 'none';
    document.getElementById('ambient-layer-2').style.backgroundImage = 'none';
  }

  applyChipsState(state);
  applyDynamicPalette(state.accent1, state.accent2);
  updateDiskTelemetry(state.dir);
}

function setAppMode(mode, save = true) {
  if (save) saveCurrentState();

  currentMode = mode;
  const isMovie = mode === 'movie';
  
  if(typeof playSynth === 'function' && save) playSynth('chord');

  if(isMovie) {
    document.body.classList.add('mode-movie');
    document.getElementById('mode-anime').classList.remove('active');
    document.getElementById('mode-movie').classList.add('active');
    document.getElementById('search-input').placeholder = 'Buscar película...';
  } else {
    document.body.classList.remove('mode-movie');
    document.getElementById('mode-movie').classList.remove('active');
    document.getElementById('mode-anime').classList.add('active');
    document.getElementById('search-input').placeholder = 'Invoca un anime...';
  }

  loadState(mode);
  renderSitesDock(mode);

  if(save) pyCall('toggle_mode', mode);
}

const cfgPrefix = document.getElementById('cfg-prefix');
function setUnifiedTitle(title) {
  const season = parseInt(document.getElementById('cfg-season').value, 10) || 1;
  const startEp = parseInt(document.getElementById('cfg-start-ep').value, 10) || 1;
  
  if (currentMode === 'anime') {
    const sStr = String(season).padStart(2, '0');
    const epStr = String(startEp).padStart(2, '0');
    cfgPrefix.value = `[${title}] S${sStr}E${epStr} - `;
  } else {
    cfgPrefix.value = `[${title}] `;
  }

  modeStates[currentMode].prefix = cfgPrefix.value;
  saveCurrentState();
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

// BÚSQUEDA ADAPTATIVA
const searchInput = document.getElementById('search-input');
const suggestionsBox = document.getElementById('search-suggestions');
let searchDebounceTimer;

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  const query = searchInput.value.trim();

  if (query.length < 2) {
    suggestionsBox.classList.remove('active');
    suggestionsBox.innerHTML = '';
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    fetchSuggestions(query);
  }, 220);
});

async function fetchSuggestions(query) {
  suggestionsBox.innerHTML = '';

  try {
    let list = [];
    if (window.pywebview && window.pywebview.api && window.pywebview.api.search_media) {
      list = await pyCall('search_media', currentMode, query);
    } else {
      return;
    }

    if (list && list.length > 0) {
      list.forEach(item => {
        const elem = createSuggestionElement(
          item.image,
          item.title,
          item.meta,
          item.color
        );
        suggestionsBox.appendChild(elem);
      });
      suggestionsBox.classList.add('active');
    } else {
      suggestionsBox.classList.remove('active');
    }
  } catch (err) {
    suggestionsBox.classList.remove('active');
  }
}

function createSuggestionElement(imgUrl, title, meta, apiColor) {
  const div = document.createElement('div');
  div.className = 'sugg-item';
  div.innerHTML = `
    <div class="sugg-thumb" style="background-image: url('${imgUrl}');"></div>
    <div class="sugg-info">
      <div class="sugg-title">${title}</div>
      <div class="sugg-meta">${meta}</div>
    </div>
  `;

  div.addEventListener('click', async () => {
    searchInput.value = title;
    suggestionsBox.classList.remove('active');
    suggestionsBox.innerHTML = '';
    
    updatePoster(imgUrl, title, meta);
    setUnifiedTitle(title);

    if (imgUrl && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
      const palette = await pyCall('get_dominant_colors', imgUrl);
      if (palette && palette.accent1) {
        applyDynamicPalette(palette.accent1, palette.accent2);
        return;
      }
    }

    if (apiColor) {
      applyDynamicPalette(apiColor, '#8a2be2');
    } else if (currentMode === 'movie') {
      applyDynamicPalette('#ff3366', '#ffaa00');
    } else {
      applyDynamicPalette('#00ffaa', '#8a2be2');
    }
  });

  return div;
}

function updatePoster(imgUrl, title, meta) {
  const bgVal = imgUrl ? `url('${imgUrl}')` : 'none';
  document.getElementById('ambient-layer-1').style.backgroundImage = bgVal;
  document.getElementById('ambient-layer-2').style.backgroundImage = bgVal;
  document.getElementById('main-poster').style.backgroundImage = bgVal;
  document.getElementById('poster-title').innerText = title;
  document.getElementById('poster-tags').innerHTML = meta;

  modeStates[currentMode].title = title;
  modeStates[currentMode].tags = meta;
  modeStates[currentMode].bg = bgVal;

  if(typeof playSynth === 'function') playSynth('click');
}

window.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    suggestionsBox.classList.remove('active');
  }
});

window.addEventListener('resize', () => {
  document.querySelectorAll('.chip-group').forEach(group => {
    const activeBtn = group.querySelector('.chip-btn.active');
    if (activeBtn) updateChipGlider(group, activeBtn);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  renderSitesDock('anime');
});