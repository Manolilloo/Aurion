// ========================================================
// AURION // GESTOR DE ESTADO DUAL Y CONTROL MULTIMEDIA
// ========================================================

let currentMode = 'anime';

const portalData = {
  anime: [
    { id: 'FLV', title: 'AnimeFLV', url: 'https://www3.animeflv.net/' },
    { id: 'JK', title: 'JKAnime', url: 'https://jkanime.net/' },
    { id: 'AON', title: 'AnimeOnlineNinja', url: 'https://ww3.animeonline.ninja/' }
  ],
  movie: [
    { id: 'PP', title: 'PelisPlus', url: 'https://pelisplushd.bz/' },
    { id: 'C3', title: 'Cuevana3', url: 'https://icuevana3.video/' },
    { id: 'HDF', title: 'HDFull', url: 'https://dominioshdfull.com/' }
  ]
};

const modeStates = {
  anime: {
    query: '',
    prefix: '',
    dir: 'J:\\ANIME\\animes',
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
    btn.innerText = p.id;
    btn.title = p.title;
    btn.addEventListener('click', () => {
      if (typeof playSynth === 'function') playSynth('click');
      openPortalUrl(p.url);
    });
    container.appendChild(btn);
  });
}

window.addEventListener('pywebviewready', function() {
  pyCall('get_initial_state').then(config => {
    if(config && config.active_mode) {
      setAppMode(config.active_mode, false); 
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
  state.title = document.getElementById('poster-title').innerText;
  state.tags = document.getElementById('poster-tags').innerText;
  state.bg = document.getElementById('main-poster').style.backgroundImage;
  state.accent1 = document.documentElement.style.getPropertyValue('--color-accent-1') || state.accent1;
  state.accent2 = document.documentElement.style.getPropertyValue('--color-accent-2') || state.accent2;
}

function loadState(mode) {
  const state = modeStates[mode];
  document.getElementById('search-input').value = state.query;
  document.getElementById('cfg-prefix').value = state.prefix;
  document.getElementById('cfg-dir').value = state.dir;
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

  applyDynamicPalette(state.accent1, state.accent2);
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
  cfgPrefix.value = `[${title}] `;
  modeStates[currentMode].prefix = cfgPrefix.value;
}

// CÁLCULO DE CONTRASTE DINÁMICO (W3C Luminancia)
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

  [document.documentElement, document.body].forEach(el => {
    el.style.setProperty('--color-accent-1', c1);
    el.style.setProperty('--color-accent-2', c2);
    el.style.setProperty('--color-glow', c1);
    el.style.setProperty('--color-border', c1);
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

// CERRAR MODALES EXTERNOS
window.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    suggestionsBox.classList.remove('active');
  }
  document.querySelectorAll('.origami-group').forEach(el => {
    el.classList.remove('open');
    el.style.zIndex = '1';
  });
});

// ORIGAMI CONTROLLERS
document.querySelectorAll('.ori-trigger').forEach(trigger => {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if(typeof playSynth === 'function') playSynth('origami');
    
    const targetId = trigger.getAttribute('data-target');
    const groups = document.querySelectorAll('.origami-group');
    
    groups.forEach(el => {
      if(el.id === targetId) {
        const isOpen = el.classList.contains('open');
        el.classList.toggle('open');
        el.style.zIndex = isOpen ? '1' : '100'; 
      } else {
        el.classList.remove('open');
        el.style.zIndex = '1';
      }
    });
  });
});

document.querySelectorAll('.ori-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    if(typeof playSynth === 'function') playSynth('click');
    
    const group = item.closest('.origami-group');
    const triggerText = group.querySelector('.ori-trigger span:first-child');
    
    triggerText.innerText = item.innerText;
    group.classList.remove('open');
    group.style.zIndex = '1';
  });
});

document.addEventListener('DOMContentLoaded', () => {
  renderSitesDock('anime');
});