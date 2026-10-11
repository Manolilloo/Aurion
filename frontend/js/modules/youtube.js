// ========================================================
// AURION • MÓDULO FRONTEND YOUTUBE (Aislado y Blindado)
// ========================================================

window.initYoutubeModule = function() {
  const ytSearchInput = document.getElementById('yt-search-input');
  const ytHeroWrapper = document.getElementById('yt-hero-wrapper');
  const ytResultsDock = document.getElementById('yt-results-dock');
  const ytResultsList = document.getElementById('yt-results-list');
  const ytClearBtn = document.getElementById('yt-clear-btn');
  const ytSearchModeSwitch = document.getElementById('yt-search-mode-switch');
  
  let ytDebounce = null;
  let currentYtSearchType = 'video';
  let currentYtSearchPage = 1;
  let ytSearchSessionId = 0;

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
      document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
      if (window.modeStates && window.modeStates.youtube) {
        window.modeStates.youtube.selectedVideo = null;
      }

      if (ytSearchInput && ytSearchInput.value.trim().length >= 2) {
        triggerYoutubeSearch();
      }
    });
  });

  // Renderizado dinámico de tarjetas
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
      resultsContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b; font-size:12px; font-weight:800;">NO SE ENCONTRARON RESULTADOS</div>';
      return;
    }

    items.forEach(item => {
      // 1. Tarjeta de Playlist
      if (item.is_playlist) {
        const card = document.createElement('div');
        card.className = 'yt-video-card is-playlist-card';
        card.innerHTML = `
          <div class="yt-thumb-box">
            <span class="yt-playlist-badge">PLAYLIST</span>
            <img class="yt-thumb-img" src="${item.thumbnail}" alt="Thumbnail" loading="lazy">
            <span class="yt-duration-badge">${item.item_count ? item.item_count + ' vídeos' : 'LISTA'}</span>
          </div>
          <div class="yt-video-details">
            <span class="yt-video-title" title="${item.title}">${item.title}</span>
            <div class="yt-video-channel">
              <span style="color: var(--color-accent-1); font-weight:800;">📁 Lista • ${item.uploader}</span>
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

      // 2. Tarjeta de Vídeo Estándar
      const video = item;
      const card = document.createElement('div');
      card.className = 'yt-video-card';
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
            <button class="yt-video-channel-btn" data-channel="${channelTarget}" title="Ver canal completo">
              <span class="yt-channel-btn-icon">📺</span>
              <span>${video.uploader}</span>
            </button>
          </div>
        </div>
      `;

      const chBtn = card.querySelector('.yt-video-channel-btn');
      if (chBtn) {
        chBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof window.playSynth === 'function') window.playSynth('click');
          openYtChannelView(channelTarget, video.uploader);
        });
      }

      card.addEventListener('click', async () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
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

        if (window.modeStates && window.modeStates.youtube) {
          window.modeStates.youtube.selectedVideo = video;
        }
        document.body.classList.add('yt-has-selection');
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();

        setTimeout(() => {
          if (typeof window.refreshAllGliders === 'function') window.refreshAllGliders();
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

        if (video.thumbnail && window.pywebview?.api?.get_dominant_colors) {
          const pal = await window.pyCall('get_dominant_colors', video.thumbnail);
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
        }
      });

      resultsContainer.appendChild(card);
    });

    const minThreshold = (currentYtSearchType === 'playlist') ? 4 : 8;
    if (items.length >= minThreshold) {
      const isPlaylist = currentYtSearchType === 'playlist';
      const labelText = isPlaylist ? 'CARGAR MÁS LISTAS ▾' : 'CARGAR MÁS VÍDEOS ▾';
      const loadingText = isPlaylist ? 'CARGANDO MÁS LISTAS...' : 'CARGANDO MÁS VÍDEOS...';
      const emptyText = isPlaylist ? 'NO HAY MÁS LISTAS' : 'NO HAY MÁS VÍDEOS';

      const loadMoreRow = document.createElement('div');
      loadMoreRow.className = 'yt-load-more-playlists-box';
      loadMoreRow.id = 'yt-load-more-box';
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
          if (txt) txt.textContent = emptyText;
          setTimeout(() => { if (txt) txt.textContent = labelText; }, 2000);
        }
      });

      resultsContainer.appendChild(loadMoreRow);
    }
  }

  // Motor de Búsqueda
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

    if (thisSessionId !== ytSearchSessionId || requestedType !== currentYtSearchType) {
      return;
    }

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
      ytDebounce = setTimeout(() => {
        triggerYoutubeSearch();
      }, 350);
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
      ytClearBtn.style.display = 'none';
      ytSearchInput.focus();
    }
  });

  const ytBtnClosePanel = document.getElementById('yt-btn-close-panel');
  ytBtnClosePanel?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof window.playSynth === 'function') window.playSynth('click');
    document.body.classList.remove('yt-has-selection');
    document.querySelectorAll('.yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
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
      if (ytBtnTxt) ytBtnTxt.innerText = isAudio ? 'DESCARGAR AUDIO (MP3)' : 'DESCARGAR VÍDEO';
      if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
    });
  });

  // SELECTOR DE RESOLUCIONES
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

    if (window.modeStates?.youtube) {
      window.modeStates.youtube.res = targetBtn.getAttribute('data-res');
    }
    if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
  }

  if (ytResChips) {
    ytResChips.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const currentActive = ytResChips.querySelector('.chip-btn.active');
        const dir = currentActive ? (btn.offsetLeft - currentActive.offsetLeft) : 0;
        if (typeof window.playSynth === 'function') window.playSynth('origami');
        triggerJellyGlider(ytResChips, btn, dir);
      });
    });
  }

  // BOTÓN DE DESCARGA MAESTRO
  const ytBtnDownload = document.getElementById('yt-btn-download');
  ytBtnDownload?.addEventListener('click', (e) => {
    e.preventDefault();

    const ytCfgDir = document.getElementById('yt-cfg-dir');
    const targetDir = (ytCfgDir?.value || window.modeStates?.youtube?.dir || '').trim();
    if (!targetDir) {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      const ytTxtEl = document.getElementById('yt-btn-txt');
      const origTxt = ytTxtEl ? ytTxtEl.innerText : 'DESCARGAR VÍDEO';
      if (ytTxtEl) ytTxtEl.innerText = 'SELECCIONA RUTA';
      ytBtnDownload.classList.add('is-empty');

      if (ytCfgDir) {
        ytCfgDir.focus();
        ytCfgDir.style.borderColor = '#ff0055';
        ytCfgDir.style.boxShadow = '0 0 16px rgba(255, 0, 85, 0.4)';
        setTimeout(() => {
          ytCfgDir.style.borderColor = '';
          ytCfgDir.style.boxShadow = '';
        }, 2000);
      }

      setTimeout(() => {
        ytBtnDownload.classList.remove('is-empty');
        if (ytTxtEl) ytTxtEl.innerText = origTxt;
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
    if (pStatus) pStatus.innerText = 'Descargando...';
    if (pSpeed) pSpeed.innerText = '0%';

    const isAudioOnly = window.modeStates?.youtube?.format === 'audio';
    const quality = window.modeStates?.youtube?.res || '1080';
    const ytCfgOpen = document.getElementById('yt-cfg-open-folder');
    const shouldOpen = ytCfgOpen ? ytCfgOpen.checked : true;

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

    if (typeof window.setYtDownloadState === 'function') window.setYtDownloadState(true);

    window.pyCall('start_downloads', {
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
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    const pBox = document.getElementById('yt-dl-progress-box');
    const pStatus = document.getElementById('yt-dl-status');

    window.pyCall('cancel_download_task', 'youtube_active');

    if (pStatus) pStatus.innerText = 'Cancelado';
    if (pBox) pBox.style.display = 'none';

    if (typeof window.setYtDownloadState === 'function') window.setYtDownloadState(false);
  });

  // VISTA DE CANAL
  const ytChannelView = document.getElementById('yt-channel-view');
  const ytChannelLoading = document.getElementById('yt-channel-loading');
  const ytChannelContent = document.getElementById('yt-channel-content');
  const btnChannelBack = document.getElementById('btn-channel-back');
  const btnLoadMoreChannel = document.getElementById('btn-channel-load-more');

  let currentChannelTarget = '';
  let channelVideosList = [];
  let nextStartIndex = 1;
  const channelPageSize = 24;

  async function openYtChannelView(channelIdentifier, fallbackName = 'Canal') {
    if (!ytChannelView) return;

    currentChannelTarget = channelIdentifier;
    channelVideosList = [];
    nextStartIndex = 1;

    if (ytHeroWrapper) ytHeroWrapper.style.display = 'none';
    if (ytResultsDock) ytResultsDock.style.display = 'none';
    if (ytPlaylistView) ytPlaylistView.style.display = 'none';

    ytChannelView.style.display = 'flex';
    if (ytChannelLoading) ytChannelLoading.style.display = 'flex';
    if (ytChannelContent) ytChannelContent.style.display = 'none';

    const data = await window.pyCall('get_channel_details', channelIdentifier, 1, channelPageSize);
    if (ytChannelLoading) ytChannelLoading.style.display = 'none';

    if (!data) {
      if (ytChannelContent) ytChannelContent.style.display = 'flex';
      return;
    }

    if (ytChannelContent) ytChannelContent.style.display = 'flex';

    const nameEl = document.getElementById('yt-channel-name');
    const bioEl = document.getElementById('yt-channel-bio');
    const avatarImg = document.getElementById('yt-channel-avatar-img');
    const bannerBox = document.getElementById('yt-channel-banner');
    const subsEl = document.getElementById('yt-channel-subs');

    if (nameEl) nameEl.textContent = data.title || fallbackName;
    if (bioEl) bioEl.textContent = (data.description && data.description.trim()) ? data.description : 'Canal oficial de YouTube';
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

  function renderChannelVideosGrid() {
    const grid = document.getElementById('yt-channel-videos-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!channelVideosList || channelVideosList.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#64748b; font-size:12px; font-weight:800;">NO SE ENCONTRARON VÍDEOS PÚBLICOS</div>';
      return;
    }

    channelVideosList.forEach(v => {
      const card = document.createElement('div');
      card.className = 'yt-grid-video-card';
      if (window.modeStates?.youtube?.selectedVideo && window.modeStates.youtube.selectedVideo.id === v.id) {
        card.classList.add('selected');
      }

      card.innerHTML = `
        <div class="yt-grid-thumb-box">
          <img class="yt-grid-thumb-img" src="${v.thumbnail}" alt="Thumbnail" loading="lazy">
          <span class="yt-duration-badge">${v.duration}</span>
        </div>
        <span class="yt-grid-video-title" title="${v.title}">${v.title}</span>
        <div class="yt-grid-video-meta">
          <span>${v.views} vistas</span>
          <span>Descargar ➔</span>
        </div>
      `;

      card.addEventListener('click', async () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        document.querySelectorAll('.yt-grid-video-card, .yt-video-card').forEach(c => c.classList.remove('selected', 'kb-focused'));
        card.classList.add('selected');

        if (window.modeStates?.youtube) {
          window.modeStates.youtube.selectedVideo = v;
        }
        document.body.classList.add('yt-has-selection');
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();

        setTimeout(() => {
          if (typeof window.refreshAllGliders === 'function') window.refreshAllGliders();
        }, 150);

        const pImg = document.getElementById('yt-preview-img');
        const pEmpty = document.getElementById('yt-preview-empty');
        const pTitle = document.getElementById('yt-prev-title');
        const pChannel = document.getElementById('yt-prev-channel');
        const btnDownload = document.getElementById('yt-btn-download');

        if (pImg) { pImg.src = v.thumbnail; pImg.style.display = 'block'; }
        if (pEmpty) pEmpty.style.display = 'none';
        if (pTitle) pTitle.innerText = v.title;
        if (pChannel) pChannel.innerText = v.uploader;
        if (btnDownload) {
          btnDownload.disabled = false;
          btnDownload.removeAttribute('disabled');
          btnDownload.style.pointerEvents = 'auto';
          btnDownload.style.opacity = '1';
        }

        const bgVal = v.thumbnail ? `url('${v.thumbnail}')` : 'none';
        const aL1 = document.getElementById('ambient-layer-1');
        const aL2 = document.getElementById('ambient-layer-2');
        if (aL1) aL1.style.backgroundImage = bgVal;
        if (aL2) aL2.style.backgroundImage = bgVal;

        if (v.thumbnail && window.pywebview?.api?.get_dominant_colors) {
          window.pyCall('get_dominant_colors', v.thumbnail).then(pal => {
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
      });

      grid.appendChild(card);
    });
  }

  btnLoadMoreChannel?.addEventListener('click', async () => {
    if (!currentChannelTarget) return;
    const spin = document.getElementById('spin-load-more');
    const txt = document.getElementById('txt-load-more');
    if (spin) spin.style.display = 'inline-block';
    if (txt) txt.textContent = 'CARGANDO...';
    btnLoadMoreChannel.disabled = true;

    const data = await window.pyCall('get_channel_details', currentChannelTarget, nextStartIndex, channelPageSize);
    if (spin) spin.style.display = 'none';
    if (txt) txt.textContent = 'CARGAR MÁS VÍDEOS ▾';
    btnLoadMoreChannel.disabled = false;

    if (data && data.videos && data.videos.length > 0) {
      data.videos.forEach(nv => {
        if (!channelVideosList.some(ev => ev.id === nv.id)) {
          channelVideosList.push(nv);
        }
      });
      nextStartIndex += data.videos.length;
      renderChannelVideosGrid();
    }
  });

  btnChannelBack?.addEventListener('click', () => {
    if (typeof window.playSynth === 'function') window.playSynth('click');
    if (ytChannelView) ytChannelView.style.display = 'none';
    if (ytHeroWrapper) ytHeroWrapper.style.display = 'block';
    if (ytResultsDock) ytResultsDock.style.display = 'flex';
  });

  // GESTIÓN DE PLAYLISTS
  const ytPlaylistView = document.getElementById('yt-playlist-view');
  const ytPlaylistLoading = document.getElementById('yt-playlist-loading');
  const ytPlaylistContent = document.getElementById('yt-playlist-content');
  const btnPlaylistBack = document.getElementById('btn-playlist-back');
  const btnPlaylistSelectAll = document.getElementById('btn-playlist-select-all');
  const btnPlaylistTogglePanel = document.getElementById('btn-playlist-toggle-panel');

  let currentPlaylistData = null;
  let selectedPlaylistVideos = new Set();

  async function openYtPlaylistView(playlistUrl) {
    if (!ytPlaylistView) return;

    if (ytHeroWrapper) ytHeroWrapper.style.display = 'none';
    if (ytResultsDock) ytResultsDock.style.display = 'none';
    if (ytChannelView) ytChannelView.style.display = 'none';

    ytPlaylistView.style.display = 'flex';
    if (ytPlaylistLoading) ytPlaylistLoading.style.display = 'flex';
    if (ytPlaylistContent) ytPlaylistContent.style.display = 'none';

    const data = await window.pyCall('get_playlist_details', playlistUrl);
    if (ytPlaylistLoading) ytPlaylistLoading.style.display = 'none';

    if (!data || !data.videos || data.videos.length === 0) {
      alert('No se pudieron extraer vídeos de la lista.');
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
    if (tUploader) tUploader.textContent = data.uploader;
    if (tCount) tCount.textContent = `${data.count} vídeos`;
    if (tImg && data.thumbnail) tImg.src = data.thumbnail;

    renderPlaylistVideosGrid();
    updatePlaylistSelectionUI();

    document.body.classList.add('yt-has-selection');
    const pTitle = document.getElementById('yt-prev-title');
    const pChannel = document.getElementById('yt-prev-channel');
    const pImg = document.getElementById('yt-preview-img');
    const pEmpty = document.getElementById('yt-preview-empty');
    const btnDownload = document.getElementById('yt-btn-download');
    const btnTxt = document.getElementById('yt-btn-txt');

    if (pTitle) pTitle.innerText = `[Playlist] ${data.title}`;
    if (pChannel) pChannel.innerText = data.uploader;
    if (pImg) { pImg.src = data.thumbnail; pImg.style.display = 'block'; }
    if (pEmpty) pEmpty.style.display = 'none';
    if (btnDownload) { btnDownload.disabled = false; btnDownload.style.pointerEvents = 'auto'; }
    if (btnTxt) btnTxt.innerText = `DESCARGAR LISTA (${data.count})`;
  }

  function updatePlaylistSelectionUI() {
    const statusEl = document.getElementById('yt-playlist-selection-status');
    const btnTxt = document.getElementById('yt-btn-txt');
    const count = selectedPlaylistVideos.size;

    if (statusEl) statusEl.textContent = `${count} SELECCIONADOS`;
    if (btnTxt && currentPlaylistData) {
      btnTxt.innerText = `DESCARGAR LISTA (${count})`;
    }
    if (btnPlaylistSelectAll && currentPlaylistData) {
      btnPlaylistSelectAll.textContent = count === 0 ? '✔ SELECCIONAR TODOS' : '✕ DESMARCAR TODOS';
    }
  }

  function renderPlaylistVideosGrid() {
    const listContainer = document.getElementById('yt-playlist-videos-list');
    if (!listContainer || !currentPlaylistData) return;
    listContainer.innerHTML = '';

    currentPlaylistData.videos.forEach((v, idx) => {
      const row = document.createElement('div');
      const isSelected = selectedPlaylistVideos.has(v.id);
      row.className = `yt-playlist-item-row ${isSelected ? 'selected' : ''}`;

      const numStr = String(idx + 1).padStart(2, '0');
      row.innerHTML = `
        <span class="yt-row-index">${numStr}</span>
        <div class="yt-row-thumb-box">
          <img class="yt-row-thumb-img" src="${v.thumbnail}" alt="Thumbnail" loading="lazy">
        </div>
        <div class="yt-row-details">
          <span class="yt-row-title" title="${v.title}">${v.title}</span>
          <div class="yt-row-meta">
            <span>⏱ ${v.duration}</span>
            <span>👤 ${v.uploader}</span>
          </div>
        </div>
        <span class="yt-row-check-badge" style="background: ${isSelected ? 'rgba(255, 214, 10, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${isSelected ? 'var(--color-accent-1)' : '#64748b'};">
          ${isSelected ? '✔ INCLUIDO' : 'EXCLUIDO'}
        </span>
      `;

      row.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        if (selectedPlaylistVideos.has(v.id)) {
          selectedPlaylistVideos.delete(v.id);
        } else {
          selectedPlaylistVideos.add(v.id);
        }
        document.body.classList.add('yt-has-selection');
        renderPlaylistVideosGrid();
        updatePlaylistSelectionUI();
      });

      listContainer.appendChild(row);
    });
  }

  btnPlaylistSelectAll?.addEventListener('click', () => {
    if (!currentPlaylistData || !currentPlaylistData.videos) return;
    if (typeof window.playSynth === 'function') window.playSynth('origami');

    if (selectedPlaylistVideos.size > 0) {
      selectedPlaylistVideos.clear();
      btnPlaylistSelectAll.textContent = '✔ SELECCIONAR TODOS';
    } else {
      currentPlaylistData.videos.forEach(v => selectedPlaylistVideos.add(v.id));
      btnPlaylistSelectAll.textContent = '✕ DESMARCAR TODOS';
    }
    renderPlaylistVideosGrid();
    updatePlaylistSelectionUI();
  });

  btnPlaylistTogglePanel?.addEventListener('click', () => {
    if (typeof window.playSynth === 'function') window.playSynth('click');
    document.body.classList.toggle('yt-has-selection');
    setTimeout(() => {
      if (typeof window.refreshAllGliders === 'function') window.refreshAllGliders();
    }, 100);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.initYoutubeModule && window.initYoutubeModule());
} else {
  if (typeof window.initYoutubeModule === 'function') {
    window.initYoutubeModule();
  }
}