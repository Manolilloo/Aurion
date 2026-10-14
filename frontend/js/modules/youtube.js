// ========================================================
// AURION • MÓDULO YOUTUBE STUDIO SPATIAL (V2.1 - SINGLETON)
// ========================================================

window.initYoutubeModule = function () {
  // CERROJO CRÍTICO: Evita que app.js y youtube.js inicialicen los eventos 2 veces
  if (window.__ytModuleInitialized) return;
  window.__ytModuleInitialized = true;

  const TOUR_VERSION_KEY = 'aurion_yt_tour_v1.1.8_shown';

  const qualityTierLabels = {
    min: 'AHORRO DATOS (144p)',
    '144': 'LOW SD (144p)',
    '240': 'COMPACT SD (240p)',
    '360': 'STANDARD SD (360p)',
    '480': 'DVD SD (480p)',
    '720': 'HD READY (720p)',
    '1080': 'FULL HD (1080p)',
    '1440': 'QUAD HD (2K)',
    '2160': 'ULTRA HD (4K)',
    max: 'MÁSTER ORIGINAL (8K/4K)'
  };

  function updateQualityTierLabel(resVal) {
    const badge = document.getElementById('yt-quality-tier-badge');
    if (badge) {
      badge.textContent = qualityTierLabels[String(resVal)] || `${resVal}p`;
    }
  }

  function updatePlaylistToggleBtnText() {
    const btn = document.getElementById('btn-playlist-toggle-panel');
    if (!btn) return;
    const isVisible = document.body.classList.contains('yt-has-selection');
    btn.innerHTML = isVisible ? '⚙ OCULTAR INSPECTOR' : '⚙ MOSTRAR INSPECTOR';
    btn.style.borderColor = isVisible ? 'var(--color-accent-1)' : '';
    btn.style.color = isVisible ? 'var(--color-accent-1)' : '';
  }

  window.triggerYtTourWelcomeIfVirginUser = function () {
    if (window.currentMode !== 'youtube') return;
    if (localStorage.getItem(TOUR_VERSION_KEY)) return;

    const states = window.modeStates || {};
    const anime = states.anime || {};
    const movie = states.movie || {};
    const yt = states.youtube || {};

    const hasAnimeData = !!(
      (anime.dir && anime.dir.trim().length > 0) ||
      (anime.title && anime.title !== 'Esperando consulta...' && anime.title.trim() !== '') ||
      (anime.bg && anime.bg.trim() !== '' && anime.bg !== 'none')
    );
    const hasMovieData = !!(
      (movie.dir && movie.dir.trim().length > 0) ||
      (movie.title && movie.title !== 'Esperando consulta...' && movie.title.trim() !== '')
    );
    const hasYtData = !!(yt.dir && yt.dir.trim().length > 0);

    if (hasAnimeData || hasMovieData || hasYtData) return;
    if (document.getElementById('yt-giant-welcome-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'yt-giant-welcome-backdrop';
    backdrop.style.cssText = `
      position: fixed; inset: 0; background: rgba(2, 4, 9, 0.82); backdrop-filter: blur(16px);
      z-index: 100000; display: flex; align-items: center; justify-content: center;
    `;

    backdrop.innerHTML = `
      <div style="background: linear-gradient(155deg, rgba(16, 22, 34, 0.98), rgba(8, 11, 18, 0.99)); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 26px; width: 90%; max-width: 540px; padding: 36px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(255, 0, 85, 0.25); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 18px; color: #f8fafc;">
        <div style="width: 68px; height: 68px; border-radius: 22px; background: rgba(255, 0, 85, 0.14); border: 1px solid rgba(255, 0, 85, 0.35); display: flex; align-items: center; justify-content: center; font-size: 32px; box-shadow: 0 8px 24px rgba(255, 0, 85, 0.3);">
          🎬
        </div>
        <div>
          <h2 style="font-size: 22px; font-weight: 900; color: #ffffff; margin-bottom: 8px;">Bienvenido a YouTube Studio Spatial</h2>
          <p style="font-size: 13.5px; color: #94a3b8; line-height: 1.55; margin: 0;">
            Descubre en 30 segundos cómo descargar vídeos en 4K real, recortar clips por minuto, explorar canales completos y bajar listas enteras.
          </p>
        </div>
        <div style="display: flex; width: 100%; gap: 12px; margin-top: 8px;">
          <button id="btn-giant-yt-later" class="btn-neu" style="flex: 1; padding: 12px; font-size: 12.5px;">Más tarde</button>
          <button id="btn-giant-yt-start" class="btn-god" style="flex: 1.4; height: 44px !important; min-height: 44px !important; font-size: 12px !important;">¡Iniciar Tour Studio! 🚀</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.querySelector('#btn-giant-yt-later')?.addEventListener('click', () => {
      localStorage.setItem(TOUR_VERSION_KEY, 'true');
      backdrop.remove();
    });

    backdrop.querySelector('#btn-giant-yt-start')?.addEventListener('click', () => {
      localStorage.setItem(TOUR_VERSION_KEY, 'true');
      backdrop.remove();
      if (typeof window.openYtTourModal === 'function') {
        window.openYtTourModal();
      }
    });
  };

  const ytSearchInput = document.getElementById('yt-search-input');
  const ytHeroWrapper = document.getElementById('yt-hero-wrapper');
  const ytResultsDock = document.getElementById('yt-results-dock');
  const ytClearBtn = document.getElementById('yt-clear-btn');
  const ytSearchModeSwitch = document.getElementById('yt-search-mode-switch');

  let ytDebounce = null;
  let currentYtSearchType = 'video';
  let currentYtSearchPage = 1;
  let ytSearchSessionId = 0;

  // ========================================================
  // RECORTADOR INTERACTIVO DE CLIPS CON LÍMITE DE DURACIÓN REAL
  // ========================================================
  const clipToggleBtn = document.getElementById('yt-clip-toggle-btn');
  const clipInputsRow = document.getElementById('yt-clip-inputs-row');
  const clipChevron = document.getElementById('yt-clip-chevron');
  const clipStartInput = document.getElementById('yt-clip-start');
  const clipEndInput = document.getElementById('yt-clip-end');
  const clipRangeStart = document.getElementById('yt-clip-range-start');
  const clipRangeEnd = document.getElementById('yt-clip-range-end');
  const clipSliderFill = document.getElementById('yt-clip-slider-fill');
  const clipSummaryPill = document.getElementById('yt-clip-summary-pill');
  const clipClearBtn = document.getElementById('yt-clip-clear-btn');

  let activeVideoMaxSeconds = 180;
  let isClipCustomModified = false;

  function parseHumanDurationToSec(durText) {
    if (!durText || durText === '--:--') return 180;
    const str = String(durText).trim();
    if (str.includes(':')) {
      const p = str.split(':').map(n => parseInt(n, 10) || 0);
      if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
      if (p.length === 2) return p[0] * 60 + p[1];
    }
    let total = 0;
    const hM = str.match(/(\d+)\s*h/i);
    const mM = str.match(/(\d+)\s*min/i);
    const sM = str.match(/(\d+)\s*s/i);
    if (hM) total += parseInt(hM[1], 10) * 3600;
    if (mM) total += parseInt(mM[1], 10) * 60;
    if (sM) total += parseInt(sM[1], 10);
    return total > 0 ? total : 180;
  }

  function formatSecToTimestamp(sec) {
    const s = Math.max(0, Math.floor(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function parseTimestampInputToSec(valStr, fallbackSec) {
    const cleaned = String(valStr || '').replace(/[^0-9:]/g, '').trim();
    if (!cleaned) return fallbackSec;
    const parts = cleaned.split(':').filter(Boolean).map(n => parseInt(n, 10) || 0);
    let sec = 0;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    else if (parts.length === 1) sec = parts[0];
    return Math.max(0, Math.min(activeVideoMaxSeconds, sec));
  }

  function syncClipVisuals(startSec, endSec, markModified = true) {
    const s = Math.max(0, Math.min(startSec, endSec - 1));
    const e = Math.min(activeVideoMaxSeconds, Math.max(endSec, s + 1));

    if (clipRangeStart) clipRangeStart.value = String(s);
    if (clipRangeEnd) clipRangeEnd.value = String(e);
    if (clipStartInput) clipStartInput.value = formatSecToTimestamp(s);
    if (clipEndInput) clipEndInput.value = formatSecToTimestamp(e);

    const max = Math.max(1, activeVideoMaxSeconds);
    const leftPct = (s / max) * 100;
    const rightPct = (e / max) * 100;
    if (clipSliderFill) {
      clipSliderFill.style.left = `${leftPct}%`;
      clipSliderFill.style.width = `${Math.max(0, rightPct - leftPct)}%`;
    }

    isClipCustomModified = markModified && (s > 0 || e < activeVideoMaxSeconds);
    if (clipSummaryPill) {
      if (isClipCustomModified) {
        const clipLen = e - s;
        clipSummaryPill.textContent = `${formatSecToTimestamp(s)} ➔ ${formatSecToTimestamp(e)} (${clipLen}s)`;
        clipSummaryPill.classList.add('is-active');
      } else {
        clipSummaryPill.textContent = 'vídeo completo';
        clipSummaryPill.classList.remove('is-active');
      }
    }
  }

  function resetClipTrimmerForVideo(video) {
    activeVideoMaxSeconds = parseHumanDurationToSec(video?.duration);
    if (clipRangeStart) {
      clipRangeStart.min = '0';
      clipRangeStart.max = String(activeVideoMaxSeconds);
    }
    if (clipRangeEnd) {
      clipRangeEnd.min = '0';
      clipRangeEnd.max = String(activeVideoMaxSeconds);
    }
    syncClipVisuals(0, activeVideoMaxSeconds, false);
  }

  clipRangeStart?.addEventListener('input', () => {
    let s = parseInt(clipRangeStart.value, 10) || 0;
    let e = parseInt(clipRangeEnd.value, 10) || activeVideoMaxSeconds;
    if (s >= e) s = Math.max(0, e - 1);
    syncClipVisuals(s, e, true);
  });

  clipRangeEnd?.addEventListener('input', () => {
    let s = parseInt(clipRangeStart.value, 10) || 0;
    let e = parseInt(clipRangeEnd.value, 10) || activeVideoMaxSeconds;
    if (e <= s) e = Math.min(activeVideoMaxSeconds, s + 1);
    syncClipVisuals(s, e, true);
  });

  [clipStartInput, clipEndInput].forEach(inp => {
    inp?.addEventListener('input', () => {
      // Bloquear en tiempo real cualquier letra o símbolo que no sea dígito o ':'
      inp.value = inp.value.replace(/[^0-9:]/g, '');
    });
    inp?.addEventListener('change', () => {
      let s = parseTimestampInputToSec(clipStartInput?.value, 0);
      let e = parseTimestampInputToSec(clipEndInput?.value, activeVideoMaxSeconds);
      if (s >= e) {
        if (inp === clipStartInput) s = Math.max(0, e - 1);
        else e = Math.min(activeVideoMaxSeconds, s + 1);
      }
      syncClipVisuals(s, e, true);
    });
  });

  clipToggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.playSynth === 'function') window.playSynth('click');
    const isHidden = window.getComputedStyle(clipInputsRow).display === 'none';
    clipInputsRow.style.display = isHidden ? 'flex' : 'none';
    if (clipChevron) {
      clipChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  });

  clipClearBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.playSynth === 'function') window.playSynth('click');
    syncClipVisuals(0, activeVideoMaxSeconds, false);
  });

  // BOTÓN PORTADA 4K — EJECUCIÓN ÚNICA CON BLOQUEO ANTIRREBOTE
  let isSavingThumb = false;
  document.getElementById('yt-btn-save-thumb')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSavingThumb) return;
    isSavingThumb = true;

    if (typeof window.playSynth === 'function') window.playSynth('chord');
    const v = window.modeStates?.youtube?.selectedVideo;
    if (!v || !v.id) {
      isSavingThumb = false;
      return;
    }
    const dir = document.getElementById('yt-cfg-dir')?.value || window.modeStates?.youtube?.dir || '';
    const ok = await window.pyCall('save_yt_thumbnail', v.id, v.title, dir);
    if (ok && typeof window.showAurionToast === 'function') {
      window.showAurionToast('Portada 4K guardada en tu carpeta de destino', '🖼️');
    }
    setTimeout(() => { isSavingThumb = false; }, 800);
  });

  function selectVideoForInspector(video, cardEl = null) {
    resetClipTrimmerForVideo(video);
    if (typeof window.playSynth === 'function') window.playSynth('click');
    document.querySelectorAll('.yt-video-card, .yt-grid-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
    if (cardEl) cardEl.classList.add('selected');

    const pBox = document.getElementById('yt-dl-progress-box');
    const pBar = document.getElementById('yt-dl-bar');
    if (pBox) pBox.style.display = 'none';
    if (pBar) pBar.style.width = '0%';

    if (typeof window.setYtDownloadState === 'function') {
      window.setYtDownloadState(false);
    }

    if (window.modeStates && window.modeStates.youtube) {
      window.modeStates.youtube.selectedVideo = video;
    }
    document.body.classList.add('yt-has-selection');
    updatePlaylistToggleBtnText();
    if (typeof window.saveCurrentState === 'function') window.saveCurrentState();

    setTimeout(() => {
      if (typeof window.refreshAllGliders === 'function') window.refreshAllGliders();
    }, 150);

    const pImg = document.getElementById('yt-preview-img');
    const pEmpty = document.getElementById('yt-preview-empty');
    const pTitle = document.getElementById('yt-prev-title');
    const pBadges = document.getElementById('yt-preview-badges');
    const pChannelBadge = document.getElementById('yt-prev-channel-badge');
    const btnDownload = document.getElementById('yt-btn-download');
    const btnTxt = document.getElementById('yt-btn-txt');

    if (pImg) {
      pImg.src = video.thumbnail;
      pImg.style.display = 'block';
    }
    if (pEmpty) pEmpty.style.display = 'none';
    if (pBadges) pBadges.style.display = 'flex';
    if (pChannelBadge) pChannelBadge.textContent = `📺 ${video.uploader || 'YouTube'}`;
    if (pTitle) pTitle.innerText = video.title;

    const isAudio = window.modeStates?.youtube?.format === 'audio';
    if (btnTxt && !currentPlaylistData) {
      btnTxt.innerText = isAudio ? 'DESCARGAR AUDIO (MP3)' : 'DESCARGAR VÍDEO';
    }

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

    if (video.thumbnail && window.pywebview?.api?.get_dominant_colors) {
      window.pyCall('get_dominant_colors', video.thumbnail).then(pal => {
        if (pal && pal.accent1) {
          const acc1 = pal.accent1;
          const acc2 = pal.accent2 || '#ff5500';
          if (window.modeStates?.youtube) {
            window.modeStates.youtube.accent1 = acc1;
            window.modeStates.youtube.accent2 = acc2;
          }
          if (typeof window.applyDynamicPalette === 'function') {
            window.applyDynamicPalette(acc1, acc2);
          }
        }
      });
    }
  }

  // Interruptor VÍDEOS / LISTAS
  ytSearchModeSwitch?.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-search-mode') || 'video';
      if (mode === currentYtSearchType) return;
      if (typeof window.playSynth === 'function') window.playSynth('origami');

      ytSearchModeSwitch.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (typeof window.updateChipGlider === 'function') {
        window.updateChipGlider(ytSearchModeSwitch, btn);
      }

      currentYtSearchType = mode;
      currentYtSearchPage = 1;
      ytSearchSessionId++;

      document.body.classList.remove('yt-has-selection');
      updatePlaylistToggleBtnText();
      document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
      if (window.modeStates && window.modeStates.youtube) {
        window.modeStates.youtube.selectedVideo = null;
      }

      if (ytSearchInput && ytSearchInput.value.trim().length >= 2) {
        triggerYoutubeSearch();
      }
    });
  });

  function renderYtResults(items) {
    const resultsContainer = document.getElementById('yt-results-list');
    const dockEl = document.getElementById('yt-results-dock');
    const heroEl = document.getElementById('yt-hero-wrapper');
    if (!resultsContainer) return;

    if (heroEl) heroEl.classList.add('is-searched');
    if (dockEl) {
      dockEl.style.display = 'flex';
      dockEl.style.opacity = '1';
      dockEl.style.transform = 'translateY(0)';
      dockEl.classList.add('active');
    }
    resultsContainer.innerHTML = '';

    if (!items || items.length === 0) {
      resultsContainer.innerHTML = '<div style="text-align:center; padding:50px; color:#64748b; font-size:12px; font-weight:800;">NO SE ENCONTRARON TRANSMISIONES</div>';
      return;
    }

    items.forEach((item, idx) => {
      if (item.is_playlist) {
        const card = document.createElement('div');
        card.className = 'yt-video-card is-playlist-card';
        card.style.animationDelay = `${Math.min(idx * 0.03, 0.3)}s`;
        card.innerHTML = `
          <div class="yt-thumb-box">
            <span class="yt-playlist-badge">COLECCIÓN</span>
            <img class="yt-thumb-img" src="${item.thumbnail}" alt="Thumbnail" loading="lazy">
            <span class="yt-duration-badge">${item.item_count ? item.item_count + ' vídeos' : 'PLAYLIST'}</span>
          </div>
          <div class="yt-video-details">
            <span class="yt-video-title" title="${item.title}">${item.title}</span>
            <div class="yt-video-channel">
              <span class="yt-playlist-author-pill">📁 ${item.uploader}</span>
              <span style="font-size: 10px; color: var(--color-accent-1); font-weight: 800;">Abrir colección ➔</span>
            </div>
          </div>
        `;
        card.addEventListener('click', () => {
          if (typeof window.playSynth === 'function') window.playSynth('chord');
          openYtPlaylistView(item.url);
        });
        resultsContainer.appendChild(card);
        return;
      }

      const video = item;
      const card = document.createElement('div');
      card.className = 'yt-video-card';
      card.style.animationDelay = `${Math.min(idx * 0.03, 0.3)}s`;
      if (window.modeStates?.youtube?.selectedVideo && window.modeStates.youtube.selectedVideo.id === video.id) {
        card.classList.add('selected');
      }

      let rawChannel = video.channel_url || video.uploader || '';
      if (!rawChannel.startsWith('http')) {
        rawChannel = rawChannel.split(/ y | and | & /i)[0].trim();
      }
      const channelTarget = rawChannel;

      card.innerHTML = `
        <div class="yt-thumb-box">
          <img class="yt-thumb-img" src="${video.thumbnail}" alt="Thumbnail" loading="lazy">
          <span class="yt-duration-badge">${video.duration}</span>
        </div>
        <div class="yt-video-details">
          <span class="yt-video-title" title="${video.title}">${video.title}</span>
          <div class="yt-video-channel">
            <button class="yt-video-channel-btn" data-channel="${channelTarget}" title="Explorar canal completo">
              <span class="yt-channel-btn-icon">📺</span>
              <span>${video.uploader}</span>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.yt-video-channel-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.playSynth === 'function') window.playSynth('click');
        openYtChannelView(channelTarget, video.uploader);
      });

      card.addEventListener('click', () => selectVideoForInspector(video, card));
      resultsContainer.appendChild(card);
    });

    const minThreshold = (currentYtSearchType === 'playlist') ? 4 : 8;
    if (items.length >= minThreshold) {
      const isPlaylist = currentYtSearchType === 'playlist';
      const labelText = isPlaylist ? 'CARGAR MÁS COLECCIONES ▾' : 'CARGAR MÁS VÍDEOS ▾';
      const loadingText = isPlaylist ? 'BUSCANDO COLECCIONES...' : 'CARGANDO MÁS VÍDEOS...';

      const loadMoreRow = document.createElement('div');
      loadMoreRow.className = 'yt-load-more-playlists-box';
      loadMoreRow.innerHTML = `
        <button class="btn-channel-load-more" id="btn-load-more-general">
          <span class="btn-load-more-spinner" id="spin-load-more-general" style="display: none;"></span>
          <span id="txt-load-more-general">${labelText}</span>
        </button>
      `;

      loadMoreRow.querySelector('#btn-load-more-general')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const spin = btn.querySelector('#spin-load-more-general');
        const txt = btn.querySelector('#txt-load-more-general');
        const val = ytSearchInput?.value.trim();
        if (!val) return;

        if (typeof window.playSynth === 'function') window.playSynth('origami');
        if (spin) spin.style.display = 'inline-block';
        if (txt) txt.textContent = loadingText;
        btn.disabled = true;

        currentYtSearchPage++;
        const loadSize = (currentYtSearchType === 'playlist') ? 4 : 12;
        const nextResults = await window.pyCall('search_youtube', val, currentYtSearchType, currentYtSearchPage, loadSize);

        if (spin) spin.style.display = 'none';
        btn.disabled = false;

        if (nextResults && nextResults.length > 0) {
          nextResults.forEach(item => {
            if (!window.modeStates.youtube.results.some(r => r.id === item.id)) {
              window.modeStates.youtube.results.push(item);
            }
          });
          renderYtResults(window.modeStates.youtube.results);
        } else {
          if (txt) txt.textContent = 'FIN DE RESULTADOS';
        }
      });

      resultsContainer.appendChild(loadMoreRow);
    }
  }

  async function triggerYoutubeSearch() {
    const inputEl = document.getElementById('yt-search-input');
    const heroEl = document.getElementById('yt-hero-wrapper');
    const dockEl = document.getElementById('yt-results-dock');
    const listEl = document.getElementById('yt-results-list');
    const clearEl = document.getElementById('yt-clear-btn');

    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (clearEl) clearEl.style.display = val.length > 0 ? 'block' : 'none';

    if (val.length < 2) {
      if (heroEl) heroEl.classList.remove('is-searched');
      if (dockEl) {
        dockEl.classList.remove('active');
        dockEl.style.display = 'none';
      }
      document.body.classList.remove('yt-has-selection');
      updatePlaylistToggleBtnText();
      return;
    }

    if (val.includes('list=') && (val.startsWith('http://') || val.startsWith('https://'))) {
      if (heroEl) heroEl.classList.add('is-searched');
      if (dockEl) {
        dockEl.style.display = 'none';
        dockEl.classList.remove('active');
      }
      openYtPlaylistView(val);
      return;
    }

    if (heroEl) heroEl.classList.add('is-searched');
    if (dockEl) {
      dockEl.style.display = 'flex';
      dockEl.style.opacity = '1';
      dockEl.style.transform = 'translateY(0)';
      dockEl.classList.add('active');
    }

    currentYtSearchPage = 1;
    const thisSessionId = ++ytSearchSessionId;
    const requestedType = currentYtSearchType;

    if (listEl) {
      listEl.innerHTML = `
        <div class="yt-loading-box">
          <div class="yt-orbital-spinner"></div>
          <span class="yt-loading-txt">LOCALIZANDO TRANSMISIONES...</span>
        </div>
      `;
    }

    const pageSize = (requestedType === 'playlist') ? 4 : 12;
    const results = await window.pyCall('search_youtube', val, requestedType, 1, pageSize);

    if (thisSessionId !== ytSearchSessionId || requestedType !== currentYtSearchType) return;

    if (window.modeStates && window.modeStates.youtube) {
      window.modeStates.youtube.results = results || [];
    }
    renderYtResults(results || []);
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
      const val = ytSearchInput.value.trim();
      if (ytClearBtn) ytClearBtn.style.display = val.length > 0 ? 'block' : 'none';
      ytDebounce = setTimeout(triggerYoutubeSearch, 350);
    });

    ytSearchInput.addEventListener('keydown', (e) => {
      const cards = document.querySelectorAll('.yt-video-card');
      if (e.key === 'ArrowDown' && cards.length > 0) {
        e.preventDefault();
        activeYtNavIndex = (activeYtNavIndex + 1) % cards.length;
        updateYtKeyboardSelection(cards);
      } else if (e.key === 'ArrowUp' && cards.length > 0) {
        e.preventDefault();
        activeYtNavIndex = (activeYtNavIndex - 1 + cards.length) % cards.length;
        updateYtKeyboardSelection(cards);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(ytDebounce);
        if (activeYtNavIndex >= 0 && cards[activeYtNavIndex]) {
          cards[activeYtNavIndex].click();
        } else {
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
      updatePlaylistToggleBtnText();
      ytClearBtn.style.display = 'none';
      ytSearchInput.focus();
    }
  });

  document.getElementById('yt-btn-close-panel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof window.playSynth === 'function') window.playSynth('click');
    document.body.classList.remove('yt-has-selection');
    updatePlaylistToggleBtnText();
    document.querySelectorAll('.yt-video-card, .yt-grid-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
  });

  // FORMATO: VÍDEO / AUDIO
  const ytFormatChips = document.getElementById('yt-format-chips');
  const ytResGroup = document.getElementById('yt-res-group');
  const ytBtnTxt = document.getElementById('yt-btn-txt');

  ytFormatChips?.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ytFormatChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (typeof window.updateChipGlider === 'function') {
        window.updateChipGlider(ytFormatChips, btn);
      }

      const isAudio = btn.getAttribute('data-format') === 'audio';
      if (window.modeStates?.youtube) {
        window.modeStates.youtube.format = isAudio ? 'audio' : 'video';
      }
      if (ytResGroup) {
        ytResGroup.style.display = isAudio ? 'none' : 'block';
        if (!isAudio) {
          requestAnimationFrame(() => {
            const rChips = document.getElementById('yt-res-chips');
            const activeRes = rChips?.querySelector('.chip-btn.active') || rChips?.querySelector(`[data-res="${window.modeStates?.youtube?.res || '1080'}"]`);
            if (activeRes && rChips && typeof window.updateChipGlider === 'function') {
              activeRes.classList.add('active');
              window.updateChipGlider(rChips, activeRes);
            }
          });
        }
      }
      if (ytBtnTxt && !currentPlaylistData) {
        ytBtnTxt.innerText = isAudio ? 'DESCARGAR AUDIO (MP3)' : 'DESCARGAR VÍDEO';
      }
      if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
    });
  });

  // SELECTOR DE CARPETA — AHORA ABRE UNA SOLA VENTANA
  const ytBtnBrowse = document.getElementById('yt-btn-browse');
  const ytCfgDir = document.getElementById('yt-cfg-dir');
  let isBrowsingFolder = false;

  ytBtnBrowse?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBrowsingFolder) return;
    isBrowsingFolder = true;
    if (typeof window.playSynth === 'function') window.playSynth('click');

    try {
      const selected = await window.pyCall('select_folder', ytCfgDir?.value || '');
      if (selected && ytCfgDir) {
        ytCfgDir.value = selected;
        if (window.modeStates?.youtube) window.modeStates.youtube.dir = selected;
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
      }
    } finally {
      setTimeout(() => { isBrowsingFolder = false; }, 500);
    }
  });

  // TOGGLE ABRIR CARPETA
  const ytCfgOpenFolder = document.getElementById('yt-cfg-open-folder');
  const ytCardOpenFolder = document.getElementById('yt-card-open-folder');

  if (ytCardOpenFolder && ytCfgOpenFolder) {
    ytCardOpenFolder.addEventListener('click', (e) => {
      if (e.target !== ytCfgOpenFolder) ytCfgOpenFolder.checked = !ytCfgOpenFolder.checked;
      if (typeof window.playSynth === 'function') window.playSynth('click');
      if (window.modeStates?.youtube) {
        window.modeStates.youtube.openFolder = ytCfgOpenFolder.checked;
      }
      if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
    });
  }

  // SLIDER DE RESOLUCIÓN CON INDICADOR DE RANGO (SD / HD / FHD / 4K)
  const ytResChips = document.getElementById('yt-res-chips');
  let activeYtDownloadTaskId = null;

  function snapGliderToBtn(group, targetBtn) {
    if (!group || !targetBtn) return;
    const glider = group.querySelector('.chip-glider');
    group.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');

    if (glider) {
      glider.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), width 0.2s ease';
      glider.style.width = `${targetBtn.offsetWidth}px`;
      glider.style.transform = `translateX(${targetBtn.offsetLeft}px)`;
    }

    const resVal = targetBtn.getAttribute('data-res') || '1080';
    updateQualityTierLabel(resVal);
    if (window.modeStates?.youtube) {
      window.modeStates.youtube.res = resVal;
    }
    if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
  }

  if (ytResChips) {
    let isDragging = false;
    let lastActiveBtn = null;
    const gliderEl = ytResChips.querySelector('.chip-glider');

    function updateGliderPosAtCursor(clientX, isInitial = false) {
      const rect = ytResChips.getBoundingClientRect();
      const buttons = Array.from(ytResChips.querySelectorAll('.chip-btn'));
      if (buttons.length === 0 || !gliderEl) return;

      const gliderW = buttons[0].offsetWidth;
      gliderEl.style.width = `${gliderW}px`;

      const mouseRelX = clientX - rect.left;
      const clampedLeft = Math.max(0, Math.min(ytResChips.clientWidth - gliderW, mouseRelX - (gliderW / 2)));

      gliderEl.style.transition = isInitial ? 'transform 0.1s ease-out' : 'none';
      gliderEl.style.transform = `translateX(${clampedLeft}px)`;

      let closestBtn = buttons[0];
      let minDistance = Infinity;
      buttons.forEach(btn => {
        const dist = Math.abs(mouseRelX - (btn.offsetLeft + btn.offsetWidth / 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestBtn = btn;
        }
      });

      if (closestBtn !== lastActiveBtn) {
        lastActiveBtn = closestBtn;
        if (typeof window.playSynth === 'function') window.playSynth('click');
        buttons.forEach(b => b.classList.toggle('active', b === closestBtn));
        updateQualityTierLabel(closestBtn.getAttribute('data-res'));
      }
    }

    const startDrag = (e) => {
      isDragging = true;
      gliderEl?.classList.add('is-dragging');
      updateGliderPosAtCursor(e.clientX || e.touches?.[0]?.clientX || 0, true);
    };
    const moveDrag = (e) => {
      if (!isDragging) return;
      updateGliderPosAtCursor(e.clientX || e.touches?.[0]?.clientX || 0, false);
    };
    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      gliderEl?.classList.remove('is-dragging');
      const currentActive = ytResChips.querySelector('.chip-btn.active') || ytResChips.querySelector('.chip-btn');
      if (currentActive) snapGliderToBtn(ytResChips, currentActive);
    };

    ytResChips.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', stopDrag);
  }

  // BOTÓN DE DESCARGA MAESTRO YOUTUBE
  const ytBtnDownload = document.getElementById('yt-btn-download');
  ytBtnDownload?.addEventListener('click', (e) => {
    e.preventDefault();

    const targetDir = (ytCfgDir?.value || window.modeStates?.youtube?.dir || '').trim();
    if (!targetDir) {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      const origTxt = ytBtnTxt ? ytBtnTxt.innerText : 'DESCARGAR VÍDEO';
      if (ytBtnTxt) ytBtnTxt.innerText = 'SELECCIONA RUTA';
      ytBtnDownload.classList.add('is-empty');
      setTimeout(() => {
        ytBtnDownload.classList.remove('is-empty');
        if (ytBtnTxt) ytBtnTxt.innerText = origTxt;
      }, 1400);
      document.getElementById('yt-btn-browse')?.click();
      return;
    }

    if (typeof window.playSynth === 'function') window.playSynth('chord');

    const pBox = document.getElementById('yt-dl-progress-box');
    const pBar = document.getElementById('yt-dl-bar');
    const pStatus = document.getElementById('yt-dl-status');
    const pSpeed = document.getElementById('yt-dl-speed');

    if (pBox) pBox.style.display = 'flex';
    if (pBar) pBar.style.width = '0%';
    if (pStatus) pStatus.innerText = 'Iniciando motor...';
    if (pSpeed) pSpeed.innerText = '0%';

    const isAudioOnly = window.modeStates?.youtube?.format === 'audio';
    const activeResBtn = document.querySelector('#yt-res-chips .chip-btn.active');
    const quality = activeResBtn?.getAttribute('data-res') || window.modeStates?.youtube?.res || '1080';
    const shouldOpen = ytCfgOpenFolder ? ytCfgOpenFolder.checked : true;
    const clipStart = isClipCustomModified ? (clipStartInput?.value?.trim() || '') : '';
    const clipEnd = isClipCustomModified ? (clipEndInput?.value?.trim() || '') : '';

    if (currentPlaylistData && selectedPlaylistVideos.size > 0) {
      const selectedTasks = currentPlaylistData.videos
        .filter(v => selectedPlaylistVideos.has(v.id))
        .map((v, idx) => ({
          id: 'task_pl_' + Date.now() + '_' + idx,
          title: v.title + (isAudioOnly ? ' [MP3]' : ''),
          url: v.url,
          pageUrl: v.url,
          status: 'En cola',
          resolution: isAudioOnly ? 'MP3' : `${quality}p`,
          bytes: 0,
          progress: 0,
          speed: '0 KB/s'
        }));

      if (typeof window.setYtDownloadState === 'function') window.setYtDownloadState(true);

      window.pyCall('start_downloads', {
        tasks: selectedTasks,
        config: {
          dir: targetDir,
          is_youtube: true,
          is_playlist: true,
          playlist_title: currentPlaylistData.title,
          create_playlist_subfolder: true,
          is_audio_only: isAudioOnly,
          quality: quality,
          title: currentPlaylistData.title,
          open_folder: shouldOpen
        }
      });
      return;
    }

    const video = window.modeStates?.youtube?.selectedVideo;
    if (!video) return;

    activeYtDownloadTaskId = 'task_yt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

    const task = {
      id: activeYtDownloadTaskId,
      title: video.title + (isAudioOnly ? ' [MP3]' : (clipStart || clipEnd ? ' [CLIP]' : '')),
      url: video.url,
      pageUrl: video.url,
      status: 'En cola',
      resolution: isAudioOnly ? 'MP3' : `${quality}p`,
      bytes: 0,
      progress: 0,
      speed: '0 KB/s'
    };

    if (typeof window.setYtDownloadState === 'function') window.setYtDownloadState(true);

    window.pyCall('start_downloads', {
      tasks: [task],
      config: {
        dir: targetDir,
        is_youtube: true,
        is_audio_only: isAudioOnly,
        quality: quality,
        clip_start: clipStart,
        clip_end: clipEnd,
        title: video.title,
        open_folder: shouldOpen
      }
    });
  });

  // CANCELAR DESCARGA YOUTUBE
  const ytBtnCancel = document.getElementById('yt-btn-cancel');
  let ytCancelFadeTimeout = null;

  ytBtnCancel?.addEventListener('click', () => {
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    const pBox = document.getElementById('yt-dl-progress-box');
    const pStatus = document.getElementById('yt-dl-status');
    const pBar = document.getElementById('yt-dl-bar');

    if (activeYtDownloadTaskId) {
      window.pyCall('cancel_download_task', activeYtDownloadTaskId);
    }
    window.pyCall('cancel_download_task', 'youtube_active');

    if (pStatus) {
      pStatus.innerText = 'Descarga cancelada ✕';
      pStatus.style.color = '#ff3366';
    }
    if (pBar) pBar.style.background = '#ff3366';
    if (typeof window.setYtDownloadState === 'function') window.setYtDownloadState(false);

    clearTimeout(ytCancelFadeTimeout);
    ytCancelFadeTimeout = setTimeout(() => {
      if (pBox) {
        pBox.classList.add('is-fading-out');
        setTimeout(() => {
          pBox.style.display = 'none';
          pBox.classList.remove('is-fading-out');
          if (pBar) { pBar.style.width = '0%'; pBar.style.background = ''; }
          if (pStatus) { pStatus.innerText = 'Iniciando...'; pStatus.style.color = ''; }
        }, 280);
      }
    }, 1600);
  });

  // ========================================================
  // VISTA DE CANAL (CINEMA HERO + FILTRO EN VIVO)
  // ========================================================
  const ytChannelView = document.getElementById('yt-channel-view');
  const ytChannelLoading = document.getElementById('yt-channel-loading');
  const ytChannelContent = document.getElementById('yt-channel-content');
  const btnChannelBack = document.getElementById('btn-channel-back');
  const btnLoadMoreChannel = document.getElementById('btn-channel-load-more');
  const channelFilterInput = document.getElementById('yt-channel-filter-input');

  let currentChannelTarget = '';
  let channelVideosList = [];
  let nextStartIndex = 1;
  const channelPageSize = 24;

  channelFilterInput?.addEventListener('input', () => {
    renderChannelVideosGrid(channelFilterInput.value.trim().toLowerCase());
  });

  async function openYtChannelView(channelIdentifier, fallbackName = 'Canal') {
    if (!ytChannelView) return;

    currentChannelTarget = channelIdentifier;
    channelVideosList = [];
    nextStartIndex = 1;
    if (channelFilterInput) channelFilterInput.value = '';

    if (ytHeroWrapper) ytHeroWrapper.style.display = 'none';
    if (ytResultsDock) ytResultsDock.style.display = 'none';
    if (ytPlaylistView) ytPlaylistView.style.display = 'none';

    ytChannelView.style.display = 'flex';
    if (ytChannelLoading) ytChannelLoading.style.display = 'flex';
    if (ytChannelContent) ytChannelContent.style.display = 'none';

    const data = await window.pyCall('get_channel_details', channelIdentifier, 1, channelPageSize);
    if (ytChannelLoading) ytChannelLoading.style.display = 'none';
    if (ytChannelContent) ytChannelContent.style.display = 'flex';

    if (!data) return;

    const nameEl = document.getElementById('yt-channel-name');
    const bioEl = document.getElementById('yt-channel-bio');
    const avatarImg = document.getElementById('yt-channel-avatar-img');
    const bannerBox = document.getElementById('yt-channel-banner');
    const subsEl = document.getElementById('yt-channel-subs');

    if (nameEl) nameEl.textContent = data.title || fallbackName;
    if (bioEl) bioEl.textContent = (data.description && data.description.trim()) ? data.description : 'Canal oficial verificado en YouTube';
    if (subsEl) subsEl.textContent = data.subscribers || '--';

    if (avatarImg) {
      avatarImg.src = data.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.title || 'YT')}&background=ff0055&color=fff&size=128`;
      avatarImg.style.display = 'block';
    }
    if (bannerBox) {
      bannerBox.style.backgroundImage = data.banner ? `url('${data.banner}')` : 'none';
    }

    channelVideosList = data.videos || [];
    nextStartIndex = channelVideosList.length + 1;
    renderChannelVideosGrid();
  }

  function renderChannelVideosGrid(filterText = '') {
    const grid = document.getElementById('yt-channel-videos-grid');
    const countBadge = document.getElementById('yt-channel-loaded-count');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = filterText
      ? channelVideosList.filter(v => (v.title || '').toLowerCase().includes(filterText))
      : channelVideosList;

    if (countBadge) countBadge.textContent = `${filtered.length} vídeos`;

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#64748b; font-size:12px; font-weight:800;">NO HAY VÍDEOS QUE COINCIDAN CON EL FILTRO</div>';
      return;
    }

    filtered.forEach((v, idx) => {
      const card = document.createElement('div');
      card.className = 'yt-grid-video-card';
      card.style.animationDelay = `${Math.min(idx * 0.025, 0.35)}s`;
      if (window.modeStates?.youtube?.selectedVideo && window.modeStates.youtube.selectedVideo.id === v.id) {
        card.classList.add('selected');
      }

      card.innerHTML = `
        <div class="yt-grid-thumb-box">
          <img class="yt-grid-thumb-img" src="${v.thumbnail}" alt="Thumbnail" loading="lazy">
          <span class="yt-duration-badge">${v.duration}</span>
          <div class="yt-grid-hover-overlay"><span>⚡ INSPECCIONAR</span></div>
        </div>
        <span class="yt-grid-video-title" title="${v.title}">${v.title}</span>
        <div class="yt-grid-video-meta">
          <span>👁 ${v.views} vistas</span>
          <span style="font-weight: 900;">Seleccionar ➔</span>
        </div>
      `;

      card.addEventListener('click', () => selectVideoForInspector(v, card));
      grid.appendChild(card);
    });
  }

  btnLoadMoreChannel?.addEventListener('click', async () => {
    if (!currentChannelTarget) return;
    const spin = document.getElementById('spin-load-more');
    const txt = document.getElementById('txt-load-more');
    if (spin) spin.style.display = 'inline-block';
    if (txt) txt.textContent = 'CARGANDO CATÁLOGO...';
    btnLoadMoreChannel.disabled = true;

    const data = await window.pyCall('get_channel_details', currentChannelTarget, nextStartIndex, channelPageSize);
    if (spin) spin.style.display = 'none';
    if (txt) txt.textContent = 'CARGAR MÁS VÍDEOS DEL CANAL ▾';
    btnLoadMoreChannel.disabled = false;

    if (data && data.videos && data.videos.length > 0) {
      data.videos.forEach(nv => {
        if (!channelVideosList.some(ev => ev.id === nv.id)) channelVideosList.push(nv);
      });
      nextStartIndex += data.videos.length;
      renderChannelVideosGrid(channelFilterInput?.value?.trim().toLowerCase() || '');
    }
  });

  btnChannelBack?.addEventListener('click', () => {
    if (typeof window.playSynth === 'function') window.playSynth('click');
    if (ytChannelView) ytChannelView.style.display = 'none';
    if (ytHeroWrapper) ytHeroWrapper.style.display = 'block';
    if (ytResultsDock) ytResultsDock.style.display = 'flex';
  });

  // ========================================================
  // VISTA DE PLAYLIST (SPLIT-DECK + TOGGLE DE STUDIO INSPECTOR)
  // ========================================================
  const ytPlaylistView = document.getElementById('yt-playlist-view');
  const ytPlaylistLoading = document.getElementById('yt-playlist-loading');
  const ytPlaylistContent = document.getElementById('yt-playlist-content');
  const btnPlaylistBack = document.getElementById('btn-playlist-back');
  const btnPlaylistSelectAll = document.getElementById('btn-playlist-select-all');
  const btnPlaylistInvert = document.getElementById('btn-playlist-invert');
  const btnPlaylistTogglePanel = document.getElementById('btn-playlist-toggle-panel');
  const playlistFilterInput = document.getElementById('yt-playlist-filter-input');

  let currentPlaylistData = null;
  let selectedPlaylistVideos = new Set();

  function parseDurationToSeconds(durStr) {
    if (!durStr || durStr === '--:--') return 0;
    const parts = durStr.split(':').map(n => parseInt(n, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  function formatTotalDuration(totalSec) {
    if (!totalSec || totalSec <= 0) return '0 min';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  }

  playlistFilterInput?.addEventListener('input', () => {
    renderPlaylistVideosGrid(playlistFilterInput.value.trim().toLowerCase());
  });

  async function openYtPlaylistView(playlistUrl) {
    if (!ytPlaylistView) return;
    if (playlistFilterInput) playlistFilterInput.value = '';

    if (ytHeroWrapper) ytHeroWrapper.style.display = 'none';
    if (ytResultsDock) ytResultsDock.style.display = 'none';
    if (ytChannelView) ytChannelView.style.display = 'none';

    ytPlaylistView.style.display = 'flex';
    if (ytPlaylistLoading) ytPlaylistLoading.style.display = 'flex';
    if (ytPlaylistContent) ytPlaylistContent.style.display = 'none';

    const data = await window.pyCall('get_playlist_details', playlistUrl);
    if (ytPlaylistLoading) ytPlaylistLoading.style.display = 'none';

    if (!data || !data.videos || data.videos.length === 0) {
      btnPlaylistBack?.click();
      return;
    }

    currentPlaylistData = data;
    selectedPlaylistVideos = new Set(data.videos.map(v => v.id));

    if (ytPlaylistContent) ytPlaylistContent.style.display = 'flex';

    const tTitle = document.getElementById('yt-playlist-title');
    const tUploader = document.getElementById('yt-playlist-uploader');
    const tCount = document.getElementById('yt-playlist-count');
    const tImg = document.getElementById('yt-playlist-thumb-img');

    if (tTitle) tTitle.textContent = data.title;
    if (tUploader) tUploader.textContent = `📁 Creador: ${data.uploader}`;
    if (tCount) tCount.textContent = `${data.count} pistas`;
    if (tImg && data.thumbnail) tImg.src = data.thumbnail;

    renderPlaylistVideosGrid();
    updatePlaylistSelectionUI();

    document.body.classList.add('yt-has-selection');
    updatePlaylistToggleBtnText();

    const pTitle = document.getElementById('yt-prev-title');
    const pImg = document.getElementById('yt-preview-img');
    const pEmpty = document.getElementById('yt-preview-empty');
    const pBadges = document.getElementById('yt-preview-badges');
    const btnDownload = document.getElementById('yt-btn-download');

    if (pTitle) pTitle.innerText = `[Colección] ${data.title}`;
    if (pImg) { pImg.src = data.thumbnail; pImg.style.display = 'block'; }
    if (pEmpty) pEmpty.style.display = 'none';
    if (pBadges) pBadges.style.display = 'none';
    if (btnDownload) { btnDownload.disabled = false; btnDownload.style.pointerEvents = 'auto'; }

    setTimeout(() => {
      if (typeof window.refreshAllGliders === 'function') window.refreshAllGliders();
    }, 150);
  }

  function updatePlaylistSelectionUI() {
    const statusEl = document.getElementById('yt-playlist-selection-status');
    const durEl = document.getElementById('yt-playlist-total-duration');
    const btnTxt = document.getElementById('yt-btn-txt');
    const count = selectedPlaylistVideos.size;

    if (statusEl) statusEl.textContent = `${count} DE ${currentPlaylistData?.videos?.length || 0} MARCADOS`;
    if (btnTxt && currentPlaylistData) {
      btnTxt.innerText = `DESCARGAR COLECCIÓN (${count})`;
    }
    if (btnPlaylistSelectAll && currentPlaylistData) {
      btnPlaylistSelectAll.textContent = count === 0 ? '✔ MARCAR TODOS' : '✕ DESMARCAR TODOS';
    }

    if (durEl && currentPlaylistData) {
      let sumSec = 0;
      currentPlaylistData.videos.forEach(v => {
        if (selectedPlaylistVideos.has(v.id)) {
          sumSec += parseDurationToSeconds(v.duration);
        }
      });
      durEl.textContent = formatTotalDuration(sumSec);
    }
  }

  function renderPlaylistVideosGrid(filterText = '') {
    const listContainer = document.getElementById('yt-playlist-videos-list');
    if (!listContainer || !currentPlaylistData) return;
    listContainer.innerHTML = '';

    const filtered = filterText
      ? currentPlaylistData.videos.filter(v => (v.title || '').toLowerCase().includes(filterText))
      : currentPlaylistData.videos;

    filtered.forEach((v, idx) => {
      const row = document.createElement('div');
      const isSelected = selectedPlaylistVideos.has(v.id);
      row.className = `yt-playlist-item-row ${isSelected ? 'selected' : ''}`;
      row.style.animationDelay = `${Math.min(idx * 0.02, 0.3)}s`;

      const numStr = String(idx + 1).padStart(2, '0');
      row.innerHTML = `
        <div class="yt-row-neon-check ${isSelected ? 'is-checked' : ''}">
          ${isSelected ? '✔' : ''}
        </div>
        <span class="yt-row-index">${numStr}</span>
        <div class="yt-row-thumb-box">
          <img class="yt-row-thumb-img" src="${v.thumbnail}" alt="Thumbnail" loading="lazy">
        </div>
        <div class="yt-row-details">
          <span class="yt-row-title" title="${v.title}">${v.title}</span>
          <div class="yt-row-meta">
            <span>⏱ ${v.duration}</span>
            <span>•</span>
            <span>👤 ${v.uploader}</span>
          </div>
        </div>
        <span class="yt-row-check-badge" style="background: ${isSelected ? 'rgba(255, 0, 85, 0.16)' : 'rgba(255, 255, 255, 0.04)'}; color: ${isSelected ? 'var(--color-accent-1)' : '#64748b'}; border: 1px solid ${isSelected ? 'var(--color-accent-1)' : 'transparent'};">
          ${isSelected ? 'EN COLA' : 'OMITIDO'}
        </span>
      `;

      row.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        if (selectedPlaylistVideos.has(v.id)) {
          selectedPlaylistVideos.delete(v.id);
        } else {
          selectedPlaylistVideos.add(v.id);
        }
        renderPlaylistVideosGrid(playlistFilterInput?.value?.trim().toLowerCase() || '');
        updatePlaylistSelectionUI();
      });

      listContainer.appendChild(row);
    });
  }

  btnPlaylistSelectAll?.addEventListener('click', () => {
    if (!currentPlaylistData?.videos) return;
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    if (selectedPlaylistVideos.size > 0) {
      selectedPlaylistVideos.clear();
    } else {
      currentPlaylistData.videos.forEach(v => selectedPlaylistVideos.add(v.id));
    }
    renderPlaylistVideosGrid(playlistFilterInput?.value?.trim().toLowerCase() || '');
    updatePlaylistSelectionUI();
  });

  btnPlaylistInvert?.addEventListener('click', () => {
    if (!currentPlaylistData?.videos) return;
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    const nextSet = new Set();
    currentPlaylistData.videos.forEach(v => {
      if (!selectedPlaylistVideos.has(v.id)) nextSet.add(v.id);
    });
    selectedPlaylistVideos = nextSet;
    renderPlaylistVideosGrid(playlistFilterInput?.value?.trim().toLowerCase() || '');
    updatePlaylistSelectionUI();
  });

  // TOGGLE DE STUDIO INSPECTOR EN LISTAS DE REPRODUCCIÓN (OCULTAR / MOSTRAR)
  btnPlaylistTogglePanel?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    document.body.classList.toggle('yt-has-selection');
    updatePlaylistToggleBtnText();
    setTimeout(() => {
      if (typeof window.refreshAllGliders === 'function') window.refreshAllGliders();
    }, 120);
  });

  btnPlaylistBack?.addEventListener('click', () => {
    if (typeof window.playSynth === 'function') window.playSynth('click');
    if (ytPlaylistView) ytPlaylistView.style.display = 'none';
    if (ytHeroWrapper) {
      ytHeroWrapper.style.display = 'block';
      ytHeroWrapper.classList.add('is-searched');
    }
    if (ytResultsDock) {
      ytResultsDock.style.display = 'flex';
      ytResultsDock.classList.add('active');
    }
    currentPlaylistData = null;
    selectedPlaylistVideos.clear();
  });
};