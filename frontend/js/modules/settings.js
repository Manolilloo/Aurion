// ========================================================
// AURION • MÓDULO DE CONFIGURACIÓN Y AJUSTES (SETTINGS PRO)
// ========================================================

window.SettingsModule = (function() {
  const SETTINGS_KEY = 'aurion_user_settings';

  const defaultSettings = {
    soundEffects: true,
    performanceMode: false,
    checkUpdatesOnStartup: true,
    notifySound: true,
    accentTheme: 'dynamic',
    glowIntensity: 'normal',
    spinningCover: false,
    spinSpeed: 'normal',
    speedLimit: '0',
    fileConflict: 'rename',
    ariaConnections: '16',
    finishAction: 'open_folder',
    sectionsOrder: ['anime', 'movie', 'youtube'],
    sectionsVisibility: { anime: true, movie: true, youtube: true }
  };

  let currentSettings = { ...defaultSettings };

  const themePalettes = {
    gold: { c1: '#ffd60a', c2: '#ffb703' },
    neon: { c1: '#ff007f', c2: '#ff0055' },
    cyan: { c1: '#00f5d4', c2: '#00bbf9' },
    purple: { c1: '#bf5af2', c2: '#5e5ce6' }
  };

  function loadSettings(backendSettings = null) {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        currentSettings = { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      currentSettings = { ...defaultSettings };
    }

    // Si recibimos configuración directa desde config.json (Python)
    if (backendSettings && typeof backendSettings === 'object') {
      if (backendSettings.sections_order) currentSettings.sectionsOrder = [...backendSettings.sections_order];
      if (backendSettings.sections_visibility) currentSettings.sectionsVisibility = { ...backendSettings.sections_visibility };
      if (backendSettings.sound_effects !== undefined) currentSettings.soundEffects = !!backendSettings.sound_effects;
      if (backendSettings.perf_mode !== undefined) currentSettings.performanceMode = !!backendSettings.perf_mode;
      if (backendSettings.check_updates !== undefined) currentSettings.checkUpdatesOnStartup = !!backendSettings.check_updates;
      if (backendSettings.notify_sound !== undefined) currentSettings.notifySound = !!backendSettings.notify_sound;
      if (backendSettings.accent_theme !== undefined) currentSettings.accentTheme = backendSettings.accent_theme;
      if (backendSettings.glow_intensity !== undefined) currentSettings.glowIntensity = backendSettings.glow_intensity;
      if (backendSettings.spinning_cover !== undefined) currentSettings.spinningCover = !!backendSettings.spinning_cover;
      if (backendSettings.spin_speed !== undefined) currentSettings.spinSpeed = backendSettings.spin_speed;
      if (backendSettings.speed_limit !== undefined) currentSettings.speedLimit = String(backendSettings.speed_limit);
      if (backendSettings.file_conflict !== undefined) currentSettings.fileConflict = backendSettings.file_conflict;
      if (backendSettings.aria_connections !== undefined) currentSettings.ariaConnections = String(backendSettings.aria_connections);
      if (backendSettings.finish_action !== undefined) currentSettings.finishAction = backendSettings.finish_action;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
    }

    applySettings(currentSettings);
  }

  function saveSettings(newSettings) {
    currentSettings = { ...currentSettings, ...newSettings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
    applySettings(currentSettings);

    if (typeof window.pyCall === 'function') {
      window.pyCall('save_config', {
        settings: {
          sound_effects: currentSettings.soundEffects,
          perf_mode: currentSettings.performanceMode,
          check_updates: currentSettings.checkUpdatesOnStartup,
          notify_sound: currentSettings.notifySound,
          accent_theme: currentSettings.accentTheme,
          glow_intensity: currentSettings.glowIntensity,
          spinning_cover: currentSettings.spinningCover,
          spin_speed: currentSettings.spinSpeed,
          speed_limit: currentSettings.speedLimit,
          file_conflict: currentSettings.fileConflict,
          aria_connections: currentSettings.ariaConnections,
          finish_action: currentSettings.finishAction,
          sections_order: currentSettings.sectionsOrder,
          sections_visibility: currentSettings.sectionsVisibility
        }
      });
    }
  }

  function applySettings(cfg) {
    // 1. Sonidos
    window.__aurionMuteAudio = !cfg.soundEffects;

    // 2. Rendimiento
    document.body.classList.toggle('perf-mode-active', !!cfg.performanceMode);

    // 3. Brillo ambiental (Glow)
    const opacityMap = { subtle: '0.08', normal: '0.16', intense: '0.32' };
    const targetGlow = opacityMap[cfg.glowIntensity] || '0.16';
    document.documentElement.style.setProperty('--ambient-opacity', targetGlow);
    const amb1 = document.getElementById('ambient-layer-1');
    if (amb1) amb1.style.opacity = targetGlow;

    // 4. Paleta fija o dinámica
    if (cfg.accentTheme !== 'dynamic' && themePalettes[cfg.accentTheme]) {
      const pal = themePalettes[cfg.accentTheme];
      if (typeof window.applyDynamicPalette === 'function') {
        window.applyDynamicPalette(pal.c1, pal.c2);
      }
    } else {
      // Al volver a Automático, restaurar paleta del contenido activo
      const curMode = window.currentMode || 'anime';
      const state = window.modeStates?.[curMode] || {};
      
      // Si hay un póster cargado actualmente en pantalla, extraer sus colores de nuevo
      const mainPoster = document.getElementById('main-poster');
      const bgStyle = mainPoster?.style?.backgroundImage || state.bg || '';
      const matchUrl = bgStyle.match(/url\(['"]?(.*?)['"]?\)/);

      if (matchUrl && matchUrl[1] && window.pyCall) {
        window.pyCall('get_dominant_colors', matchUrl[1]).then(pal => {
          if (pal && pal.accent1) {
            window.applyDynamicPalette(pal.accent1, pal.accent2 || '#ffaa00');
          } else if (state.accent1 && state.accent2) {
            window.applyDynamicPalette(state.accent1, state.accent2);
          }
        });
      } else {
        // Fallback a los colores base del modo activo
        const defaultModeColors = {
          anime: { c1: '#ffd60a', c2: '#ffb703' },
          movie: { c1: '#bf5af2', c2: '#5e5ce6' },
          youtube: { c1: '#ff0055', c2: '#ffaa00' }
        };
        const def = defaultModeColors[curMode] || defaultModeColors.anime;
        const targetC1 = state.accent1 || def.c1;
        const targetC2 = state.accent2 || def.c2;
        if (typeof window.applyDynamicPalette === 'function') {
          window.applyDynamicPalette(targetC1, targetC2);
        }
      }
    }

    // 4.1. Carátula Giratoria Ambiental (Spinning Cover)
    const spinDurations = { slow: '50s', normal: '26s', fast: '12s' };
    const targetDuration = spinDurations[cfg.spinSpeed] || '26s';
    document.documentElement.style.setProperty('--spin-duration', targetDuration);
    document.body.classList.toggle('has-spinning-cover', !!cfg.spinningCover);

    const rowSpinSpeed = document.getElementById('row-spin-speed');
    if (rowSpinSpeed) {
      rowSpinSpeed.style.opacity = cfg.spinningCover ? '1' : '0.4';
      rowSpinSpeed.style.pointerEvents = cfg.spinningCover ? 'auto' : 'none';
    }

    // 5. Sincronizar switches
    const chkSound = document.getElementById('setting-chk-sound');
    const chkPerf = document.getElementById('setting-chk-perf');
    const chkUpdates = document.getElementById('setting-chk-updates');
    const chkNotify = document.getElementById('setting-chk-notify');
    const chkSpin = document.getElementById('setting-chk-spinning-cover');

    if (chkSound) chkSound.checked = !!cfg.soundEffects;
    if (chkPerf) chkPerf.checked = !!cfg.performanceMode;
    if (chkUpdates) chkUpdates.checked = !!cfg.checkUpdatesOnStartup;
    if (chkNotify) chkNotify.checked = !!cfg.notifySound;
    if (chkSpin) chkSpin.checked = !!cfg.spinningCover;

    // 6. Sincronizar desplegables estilo iOS
    syncIosDropdown('dropdown-accent', cfg.accentTheme);
    syncIosDropdown('dropdown-glow', cfg.glowIntensity);
    syncIosDropdown('dropdown-spin-speed', cfg.spinSpeed);
    syncIosDropdown('dropdown-speed', cfg.speedLimit);
    syncIosDropdown('dropdown-conflict', cfg.fileConflict);
    syncIosDropdown('dropdown-aria-conn', cfg.ariaConnections);
    syncIosDropdown('dropdown-finish-action', cfg.finishAction);

    // 7. Renderizar lista arrastrable de secciones
    renderWorkspaceSections(cfg);

    // 8. Notificar a app.js para reconstruir el conmutador superior
    if (typeof window.updateMatrixSwitchUI === 'function') {
      window.updateMatrixSwitchUI(cfg.sectionsOrder, cfg.sectionsVisibility);
    }
  }

  function renderWorkspaceSections(cfg) {
    const container = document.getElementById('magnetic-capsule-dock');
    if (!container) return;
    container.innerHTML = '';

    const metadata = {
      anime: { title: 'Anime', emoji: '🍙', color: '#ffd60a', glow: 'rgba(255, 214, 10, 0.45)' },
      movie: { title: 'Cine', emoji: '🎬', color: '#bf5af2', glow: 'rgba(191, 90, 242, 0.45)' },
      youtube: { title: 'YouTube', emoji: '🔴', color: '#ff0055', glow: 'rgba(255, 0, 85, 0.45)' }
    };

    cfg.sectionsOrder.forEach((key) => {
      const isVisible = cfg.sectionsVisibility[key] !== false;
      const meta = metadata[key] || { title: key, emoji: '⚡', color: '#ffd60a', glow: 'rgba(255, 214, 10, 0.3)' };

      const pill = document.createElement('div');
      pill.className = `magnetic-pill ${isVisible ? '' : 'is-off'}`;
      pill.draggable = true;
      pill.dataset.key = key;
      pill.style.setProperty('--pill-color', meta.color);
      pill.style.setProperty('--pill-glow', meta.glow);

      pill.innerHTML = `
        <div class="magnetic-pill-left">
          <span class="magnetic-pill-grip">⠿</span>
          <span class="magnetic-pill-emoji">${meta.emoji}</span>
          <span class="magnetic-pill-name">${meta.title}</span>
        </div>
        <div class="magnetic-pill-led" title="${isVisible ? 'Apagar sección' : 'Activar sección'}"></div>
      `;

      // Drag & Drop con físicas elásticas
      pill.addEventListener('dragstart', (e) => {
        pill.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      });

      pill.addEventListener('dragend', () => {
        pill.classList.remove('is-dragging');
        container.querySelectorAll('.magnetic-pill').forEach(el => el.classList.remove('drag-over'));
      });

      pill.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        pill.classList.add('drag-over');
      });

      pill.addEventListener('dragleave', () => {
        pill.classList.remove('drag-over');
      });

      pill.addEventListener('drop', (e) => {
        e.preventDefault();
        pill.classList.remove('drag-over');
        const draggedKey = e.dataTransfer.getData('text/plain');
        if (!draggedKey || draggedKey === key) return;

        const newOrder = [...currentSettings.sectionsOrder];
        const oldIndex = newOrder.indexOf(draggedKey);
        const newIndex = newOrder.indexOf(key);

        if (oldIndex > -1 && newIndex > -1) {
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, draggedKey);
          if (typeof window.playSynth === 'function') window.playSynth('origami');
          saveSettings({ sectionsOrder: newOrder });
        }
      });

      // Detección táctil: diferencia un clic de un arrastre
      let startX = 0;
      let startY = 0;
      let wasDragged = false;

      pill.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        wasDragged = false;
      });

      pill.addEventListener('dragstart', (e) => {
        wasDragged = true;
        pill.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      });

      pill.addEventListener('mouseup', (e) => {
        const deltaX = Math.abs(e.clientX - startX);
        const deltaY = Math.abs(e.clientY - startY);

        // Si el puntero apenas se movió y no comenzó el evento drag, es un clic
        if (!wasDragged && deltaX < 6 && deltaY < 6) {
          toggleVisibility(e);
        }
      });

      const toggleVisibility = (e) => {
        e.stopPropagation();
        const willBeActive = pill.classList.contains('is-off');
        const activeCount = Object.values(currentSettings.sectionsVisibility).filter(Boolean).length;

        // No permitir desactivar la última que queda activa
        if (!willBeActive && activeCount <= 1) {
          if (typeof window.playSynth === 'function') window.playSynth('click');
          pill.style.transform = 'scale(0.95)';
          pill.style.borderColor = '#ef4444';
          setTimeout(() => {
            pill.style.transform = '';
            pill.style.borderColor = '';
          }, 350);
          return;
        }

        const newVis = { ...currentSettings.sectionsVisibility, [key]: willBeActive };
        if (typeof window.playSynth === 'function') window.playSynth(willBeActive ? 'chord' : 'click');
        saveSettings({ sectionsVisibility: newVis });

        // Si desactivamos la sección activa en este momento, saltar a la primera visible
        if (!willBeActive && window.currentMode === key) {
          const firstVisible = currentSettings.sectionsOrder.find(k => newVis[k]);
          if (firstVisible && typeof window.setAppMode === 'function') {
            window.setAppMode(firstVisible, true);
          }
        }
      };

      container.appendChild(pill);
    });
  }

  function syncIosDropdown(containerId, value) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.setAttribute('data-val', value);

    const items = el.querySelectorAll('.ios-dropdown-item');
    let labelTxt = '';
    items.forEach(item => {
      const isMatch = item.getAttribute('data-val') === String(value);
      item.classList.toggle('active', isMatch);
      if (isMatch) labelTxt = item.textContent;
    });

    const labelEl = el.querySelector('.ios-dropdown-label');
    if (labelEl && labelTxt) labelEl.textContent = labelTxt;
  }

  function setupIosDropdowns() {
    document.querySelectorAll('.ios-dropdown').forEach(dropdown => {
      const trigger = dropdown.querySelector('.ios-dropdown-trigger');
      const items = dropdown.querySelectorAll('.ios-dropdown-item');

      trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = dropdown.classList.contains('is-open');
        document.querySelectorAll('.ios-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
        if (!wasOpen) {
          if (typeof window.playSynth === 'function') window.playSynth('click');
          dropdown.classList.add('is-open');
        }
      });

      items.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.getAttribute('data-val');
          dropdown.classList.remove('is-open');
          if (typeof window.playSynth === 'function') window.playSynth('origami');

          if (dropdown.id === 'dropdown-accent') saveSettings({ accentTheme: val });
          if (dropdown.id === 'dropdown-glow') saveSettings({ glowIntensity: val });
          if (dropdown.id === 'dropdown-spin-speed') saveSettings({ spinSpeed: val });
          if (dropdown.id === 'dropdown-speed') saveSettings({ speedLimit: val });
          if (dropdown.id === 'dropdown-conflict') saveSettings({ fileConflict: val });
          if (dropdown.id === 'dropdown-aria-conn') saveSettings({ ariaConnections: val });
          if (dropdown.id === 'dropdown-finish-action') saveSettings({ finishAction: val });
        });
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.ios-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
    });
  }

  function openModal() {
    const overlay = document.getElementById('settings-modal-overlay');
    if (!overlay) return;
    if (typeof window.playSynth === 'function') window.playSynth('chord');

    applySettings(currentSettings);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    checkBinariesStatus();
  }

  function closeModal() {
    const overlay = document.getElementById('settings-modal-overlay');
    if (!overlay) return;
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    document.querySelectorAll('.ios-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 250);
  }

  async function checkBinariesStatus() {
    const ariaStatus = document.getElementById('status-bin-aria');
    const ffmpegStatus = document.getElementById('status-bin-ffmpeg');

    if (window.pyCall) {
      const res = await window.pyCall('check_binaries_status');
      if (res) {
        if (ariaStatus) {
          ariaStatus.textContent = res.aria2 ? 'DISPONIBLE' : 'NO DETECTADO';
          ariaStatus.style.color = res.aria2 ? '#10b981' : '#ef4444';
        }
        if (ffmpegStatus) {
          ffmpegStatus.textContent = res.ffmpeg ? 'DISPONIBLE' : 'NO DETECTADO';
          ffmpegStatus.style.color = res.ffmpeg ? '#10b981' : '#ef4444';
        }
        return;
      }
    }

    if (ariaStatus) { ariaStatus.textContent = 'LISTO'; ariaStatus.style.color = '#10b981'; }
    if (ffmpegStatus) { ffmpegStatus.textContent = 'LISTO'; ffmpegStatus.style.color = '#10b981'; }
  }

  function switchTab(tabId) {
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.settings-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-content-${tabId}`);
    });
  }

  function init() {
    loadSettings();
    setupIosDropdowns();

    // Botón engranaje
    document.getElementById('win-settings')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });

    // Cerrar modal
    document.getElementById('settings-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('settings-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal-overlay') closeModal();
    });

    // Pestañas
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('origami');
        const tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Switches
    document.getElementById('setting-chk-sound')?.addEventListener('change', (e) => {
      saveSettings({ soundEffects: e.target.checked });
      if (e.target.checked && typeof window.playSynth === 'function') window.playSynth('click');
    });

    document.getElementById('setting-chk-perf')?.addEventListener('change', (e) => {
      saveSettings({ performanceMode: e.target.checked });
    });

    document.getElementById('setting-chk-updates')?.addEventListener('change', (e) => {
      saveSettings({ checkUpdatesOnStartup: e.target.checked });
    });

    document.getElementById('setting-chk-notify')?.addEventListener('change', (e) => {
      saveSettings({ notifySound: e.target.checked });
      if (e.target.checked && typeof window.playSynth === 'function') window.playSynth('chord');
    });

    document.getElementById('setting-chk-spinning-cover')?.addEventListener('change', (e) => {
      saveSettings({ spinningCover: e.target.checked });
      if (typeof window.playSynth === 'function') window.playSynth(e.target.checked ? 'chord' : 'click');
    });

    // Abrir carpeta del config.json
    document.getElementById('btn-open-config-folder')?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      if (window.pyCall) {
        window.pyCall('open_config_folder');
      }
    });

    // Diálogo propio de reseteo de fábrica
    const confirmOverlay = document.getElementById('settings-confirm-dialog');
    const btnOpenReset = document.getElementById('btn-reset-factory');
    const btnCancelReset = document.getElementById('btn-cancel-reset');
    const btnDoReset = document.getElementById('btn-do-reset');

    btnOpenReset?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      if (confirmOverlay) confirmOverlay.style.display = 'flex';
    });

    btnCancelReset?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('origami');
      if (confirmOverlay) confirmOverlay.style.display = 'none';
    });

    btnDoReset?.addEventListener('click', async () => {
      if (typeof window.playSynth === 'function') window.playSynth('chord');
      if (confirmOverlay) confirmOverlay.style.display = 'none';

      // 1. Pulverizar todo el almacenamiento local de la app
      localStorage.clear();
      sessionStorage.clear();

      // 2. Avisar a Python para que limpie el disco y su RAM
      if (window.pyCall) {
        await window.pyCall('reset_factory_config');
      }

      // 3. Recargar la ventana de inmediato: borra la RAM de JS y resetea la app
      setTimeout(() => {
        window.location.reload();
      }, 150);
    });

    // Limpieza de caché
    const btnClean = document.getElementById('btn-clear-temp-cache');
    const txtClean = document.getElementById('txt-clean-temp');
    btnClean?.addEventListener('click', async () => {
      if (typeof window.playSynth === 'function') window.playSynth('chord');
      if (txtClean) txtClean.textContent = 'Limpiando...';
      btnClean.style.pointerEvents = 'none';

      let freedMb = 0;
      if (window.pyCall) {
        freedMb = await window.pyCall('clear_temp_cache') || 0;
      }

      setTimeout(() => {
        if (txtClean) txtClean.textContent = `¡Listo! (${freedMb} MB)`;
        btnClean.style.borderColor = '#10b981';
        btnClean.style.color = '#10b981';
        setTimeout(() => {
          if (txtClean) txtClean.textContent = 'Limpiar Caché';
          btnClean.style.borderColor = '';
          btnClean.style.color = '';
          btnClean.style.pointerEvents = 'auto';
        }, 2200);
      }, 400);
    });

    // Buscar actualizaciones
    const btnUpdateCheck = document.getElementById('btn-manual-check-updates');
    const txtUpdate = document.getElementById('update-btn-txt');
    const feedbackEl = document.getElementById('update-status-feedback');

    btnUpdateCheck?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('chord');
      btnUpdateCheck.classList.add('is-checking');
      if (txtUpdate) txtUpdate.textContent = 'Verificando repositorio...';
      if (feedbackEl) {
        feedbackEl.textContent = 'Conectando con GitHub API...';
        feedbackEl.style.color = '#94a3b8';
      }

      if (window.pyCall) {
        window.pyCall('check_for_updates');
      }

      setTimeout(() => {
        btnUpdateCheck.classList.remove('is-checking');
        if (txtUpdate) txtUpdate.textContent = 'Buscar actualizaciones ahora';
        if (feedbackEl) {
          const isModalOpen = document.getElementById('update-modal-overlay')?.classList.contains('active');
          if (!isModalOpen) {
            feedbackEl.textContent = '✔ ¡Aurion v1.1.9 está completamente al día!';
            feedbackEl.style.color = '#10b981';
            setTimeout(() => {
              feedbackEl.textContent = '';
            }, 3500);
          } else {
            feedbackEl.textContent = '';
          }
        }
      }, 2500);
    });
  }

  return {
    init,
    openModal,
    closeModal,
    loadSettings,
    getSettings: () => ({ ...currentSettings })
  };
})();