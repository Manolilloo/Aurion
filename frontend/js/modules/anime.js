/**
 * Aurion - Módulo Anime & Cine (Cabina Cockpit)
 * Maneja búsqueda de catálogo, selección de temporada, steppers y panel de ingeniería multimedia.
 */

window.AnimeModule = (function () {
  let isInitialized = false;

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    bindSteppers();
    bindToggles();
    bindSearch();
  }

  // 1. GESTIÓN DE STEPPERS (Temporada y Episodio inicial)
  function bindSteppers() {
    document.querySelectorAll('.stepper-box').forEach(box => {
      const targetId = box.getAttribute('data-id');

      box.querySelector('.step-inc')?.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        if (typeof window.setStepperValue === 'function') window.setStepperValue(targetId, 0, 1);
      });

      box.querySelector('.step-dec')?.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        if (typeof window.setStepperValue === 'function') window.setStepperValue(targetId, 0, -1);
      });

      box.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (typeof window.setStepperValue === 'function') {
          window.setStepperValue(targetId, 0, e.deltaY < 0 ? 1 : -1);
        }
      });
    });

    const seasonInput = document.getElementById('cfg-season');
    if (seasonInput) {
      seasonInput.addEventListener('input', () => {
        const val = parseInt(seasonInput.value, 10) || 1;
        if (typeof window.updateSingleSeasonState === 'function') {
          window.updateSingleSeasonState(val);
        }
      });
    }
  }

  // 2. TOGGLES (Temporada única, Guardar portada, Abrir carpeta)
  function bindToggles() {
    // Temporada única
    const cardSingleSeason = document.getElementById('card-single-season') || document.getElementById('cfg-single-season')?.closest('.toggle-card');
    const cfgSingleSeason = document.getElementById('cfg-single-season');

    if (cardSingleSeason && cfgSingleSeason) {
      cardSingleSeason.addEventListener('click', (e) => {
        if (e.target !== cfgSingleSeason) {
          cfgSingleSeason.checked = !cfgSingleSeason.checked;
        }
        if (typeof window.playSynth === 'function') window.playSynth('origami');
        const isSingle = cfgSingleSeason.checked;
        if (window.modeStates && window.modeStates[window.currentMode]) {
          window.modeStates[window.currentMode].singleSeason = isSingle;
        }

        document.body.classList.toggle('is-single-season', isSingle);

        const state = window.modeStates ? window.modeStates[window.currentMode] : null;
        if (state && state.title && state.title !== 'Esperando consulta...' && typeof window.setUnifiedTitle === 'function') {
          window.setUnifiedTitle(state.title);
        }
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
      });
    }

    // Guardar carátula
    const cardSaveCover = document.getElementById('cfg-save-cover')?.closest('.toggle-card');
    const cfgSaveCover = document.getElementById('cfg-save-cover');

    if (cardSaveCover && cfgSaveCover) {
      cardSaveCover.addEventListener('click', (e) => {
        if (e.target !== cfgSaveCover) {
          cfgSaveCover.checked = !cfgSaveCover.checked;
        }
        if (typeof window.playSynth === 'function') window.playSynth('click');
        if (window.modeStates && window.modeStates[window.currentMode]) {
          window.modeStates[window.currentMode].saveCover = cfgSaveCover.checked;
        }
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
      });
    }

    // Abrir carpeta al finalizar
    const cardOpenFolder = document.getElementById('cfg-open-folder')?.closest('.toggle-card');
    const cfgOpenFolder = document.getElementById('cfg-open-folder');

    if (cardOpenFolder && cfgOpenFolder) {
      cardOpenFolder.addEventListener('click', (e) => {
        if (e.target !== cfgOpenFolder) {
          cfgOpenFolder.checked = !cfgOpenFolder.checked;
        }
        if (typeof window.playSynth === 'function') window.playSynth('click');
        if (window.modeStates && window.modeStates[window.currentMode]) {
          window.modeStates[window.currentMode].openFolder = cfgOpenFolder.checked;
        }
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
      });
    }
  }

  // 3. BUSCADOR CON SUGERENCIAS PREDICTIVAS
  function bindSearch() {
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
          const list = await window.pyCall('search_media', window.currentMode, query);
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

                // COMPROBACIÓN INTELIGENTE DE PIPELINE (TÍTULO NUEVO VS MANUAL)
                const state = window.modeStates ? window.modeStates[window.currentMode] : null;
                if (state && state.title && state.title !== 'Esperando consulta...' && state.title !== item.title) {
                  // Limpiar tareas previas de la cola si el anime seleccionado es diferente
                  state.queue.forEach(t => {
                    if (t.status !== 'Completado') {
                      window.pyCall?.('cancel_download_task', t.id);
                    }
                  });
                  state.queue = [];
                  if (typeof window.renderFullQueue === 'function') {
                    window.renderFullQueue(window.currentMode);
                  }
                }

                if (typeof window.expandCenterWorkspace === 'function') window.expandCenterWorkspace();
                if (typeof window.updatePoster === 'function') window.updatePoster(item.image, item.title, item.meta);
                if (typeof window.setUnifiedTitle === 'function') window.setUnifiedTitle(item.title);

                if (item.image && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
                  const palette = await window.pyCall('get_dominant_colors', item.image);
                  if (palette && palette.accent1) {
                    if (typeof window.applyDynamicPalette === 'function') window.applyDynamicPalette(palette.accent1, palette.accent2);
                    return;
                  }
                }

                if (item.color) {
                  if (typeof window.applyDynamicPalette === 'function') window.applyDynamicPalette(item.color, '#8a2be2');
                } else if (window.currentMode === 'movie') {
                  if (typeof window.applyDynamicPalette === 'function') window.applyDynamicPalette('#ff3366', '#ffaa00');
                } else {
                  if (typeof window.applyDynamicPalette === 'function') window.applyDynamicPalette('#00ffaa', '#8a2be2');
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
  }

  return {
    init,
  };
})();