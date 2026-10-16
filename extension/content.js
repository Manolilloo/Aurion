if (window.top !== window) {
  // EJECUCIÓN EN IFRAMES: Detectar resolución nativa y fuentes <video src="http..."> directas
  let lastReportedSrc = '';

  function checkNativeVideoAndSource() {
    // Si este iframe es un embed de MEGA, notificar SOLO si el vídeo tiene vista previa real reproducible
    const href = window.location.href || '';
    if (href.includes('mega.nz/embed/') && href.includes('#') && href !== lastReportedSrc) {
      const megaVideo = document.querySelector('video');
      const bodyTxt = (document.body?.innerText || '').toLowerCase();
      const isUnavailable = bodyTxt.includes('preview is not available') ||
                            bodyTxt.includes('vista previa no está disponible') ||
                            bodyTxt.includes('vista previa no disponible');

      if (megaVideo && !isUnavailable && (megaVideo.readyState >= 1 || megaVideo.src || megaVideo.currentSrc)) {
        lastReportedSrc = href;
        window.top.postMessage({
          aurionType: 'EMBED_IFRAME_DETECTED',
          url: href,
          source: 'MEGA',
          resolution: megaVideo.videoHeight > 0 ? `${megaVideo.videoHeight}p` : '1080p'
        }, '*');
      }
    }

    const v = document.querySelector('video');
    if (!v) return;

    if (v.videoHeight > 0) {
      window.top.postMessage({
        aurionType: 'NATIVE_RES_DETECTED',
        height: v.videoHeight,
        resolution: `${v.videoHeight}p`,
        frameUrl: window.location.href
      }, '*');
    }

    const src = v.currentSrc || v.src || '';
    if (src && src.startsWith('http') && !src.startsWith('blob:') && src !== lastReportedSrc) {
      lastReportedSrc = src;
      try {
        chrome.runtime.sendMessage({
          type: 'DOM_VIDEO_SRC_FOUND',
          url: src,
          frameUrl: window.location.href
        });
      } catch (_) {}
    }
  }

  document.addEventListener('loadedmetadata', checkNativeVideoAndSource, true);
  document.addEventListener('play', checkNativeVideoAndSource, true);
  document.addEventListener('playing', checkNativeVideoAndSource, true);
  setInterval(checkNativeVideoAndSource, 1200);

} else {
  // EJECUCIÓN EN LA VENTANA PRINCIPAL
  let activeMedia = null;
  let detectedStreams = [];
  let isHostMuted = false;
  let lastScannedIframeSrc = '';

  const currentHostname = window.location.hostname;

  function syncMutedState(callback) {
    try {
      chrome.storage.local.get(['disabledHosts'], (res) => {
        const list = res?.disabledHosts || [];
        isHostMuted = list.includes(currentHostname);
        if (isHostMuted) {
          const existingPill = document.getElementById('aurion-floating-pill');
          if (existingPill) existingPill.classList.remove('aurion-visible');
        }
        if (typeof callback === 'function') callback(isHostMuted);
      });
    } catch (_) {
      if (typeof callback === 'function') callback(false);
    }
  }

  syncMutedState();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.disabledHosts) {
        const newList = changes.disabledHosts.newValue || [];
        isHostMuted = newList.includes(currentHostname);
        const existingPill = document.getElementById('aurion-floating-pill');
        if (isHostMuted && existingPill) {
          existingPill.classList.remove('aurion-visible');
        } else if (!isHostMuted && activeMedia) {
          createOrUpdateHUD(activeMedia, detectedStreams);
        }
      }
    });
  } catch (_) {}

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return Math.round(mb) + ' MB';
  }

  function estimateBytesFromResolution(resStr) {
    const h = parseInt(resStr, 10);
    if (!h || isNaN(h)) return 0;
    const bitrateMap = { 1080: 2600000, 720: 1400000, 480: 750000, 360: 400000 };
    const bw = bitrateMap[h] || (h >= 1080 ? 2600000 : 1400000);
    return Math.round((bw * 1440) / 8);
  }

  // Los streams de VOE, Streamtape, MixDrop, etc. se capturan directamente por red (.m3u8 / .mp4)
  // y MEGA se notifica desde dentro de su iframe solo cuando el vídeo es reproducible.

  // EXTRACTOR DE ALTA PRECISIÓN PARA NOMBRE DE ANIME, TEMPORADA, ARCO Y EPISODIO
  function getCleanMediaTitle() {
    let rawSeriesName = '';
    let detectedEp = null;
    let detectedSeason = null;

    // 1. Leer el nombre oficial de la serie desde el DOM / Breadcrumbs del portal
    const seriesSelectors = [
      'nav.Brdcrmb a[href*="/anime/"]',
      '.breadcrumb a[href*="/anime/"]',
      '.epi-nav a[href*="/anime/"]',
      'h1.Title',
      '.anime-title',
      '.ep-title',
      '.info-content h1'
    ];

    const forbiddenGeneric = ['inicio', 'home', 'animes', 'anime', 'ver anime', 'episodios', 'lista de episodios', 'online'];

    for (const sel of seriesSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt.length > 2 && !forbiddenGeneric.includes(txt.toLowerCase())) {
          rawSeriesName = txt;
          break;
        }
      }
      if (rawSeriesName) break;
    }

    // 2. Extraer desde la URL canónica (Temporada, Arco y Episodio)
    try {
      let path = (window.top?.location?.pathname || window.location.pathname || '');
      while (path.endsWith('/')) path = path.slice(0, -1);
      const segments = path.split('/').filter(Boolean);

      let targetSlug = '';
      const validFolders = ['episodio', 'ver', 'watch', 'anime', 'cap', 'capitulo'];
      const epIndex = segments.findIndex(s => validFolders.includes(s.toLowerCase()));
      if (epIndex !== -1 && segments[epIndex + 1]) {
        targetSlug = segments[epIndex + 1];
      } else if (segments.length > 0) {
        targetSlug = segments[segments.length - 1];
      }

      if (targetSlug.toLowerCase().endsWith('.html')) {
        targetSlug = targetSlug.slice(0, -5);
      }

      if (targetSlug && targetSlug.length > 2) {
        const sMatch = targetSlug.match(/[-_](?:s|season[-_]?|temporada[-_]?)(\d{1,2})/i);
        if (sMatch) detectedSeason = parseInt(sMatch[1], 10);

        const xMatch = targetSlug.match(/[-_](\d{1,2})x(\d{1,4})/i);
        if (xMatch) {
          detectedSeason = parseInt(xMatch[1], 10);
          detectedEp = parseInt(xMatch[2], 10);
        } else {
          const cMatch = targetSlug.match(/[-_](?:cap|capitulo|ep|episodio)?[-_]?(\d{1,4})(?!.)/i);
          if (cMatch) detectedEp = parseInt(cMatch[1], 10);
        }

        if (!rawSeriesName) {
          let baseName = targetSlug
            .replace(/^ver[-_]/i, '')
            .replace(/[-_]\d{1,2}x\d{1,4}.*/gi, '')
            .replace(/[-_](?:cap|capitulo|ep|episodio)?[-_]?\d{1,4}(?!.)/gi, '')
            .replace(/[-_]+/g, ' ')
            .trim();

          baseName = baseName.replace(/\b\w/g, c => c.toUpperCase());
          if (baseName.length > 2 && !forbiddenGeneric.includes(baseName.toLowerCase())) {
            rawSeriesName = baseName;
          }
        }
      }
    } catch (_) {}

    // 3. Fallback a document.title
    const pageTitle = document.title || '';
    if (!rawSeriesName) {
      rawSeriesName = pageTitle;
    }

    const combinedText = rawSeriesName + ' ' + pageTitle;
    if (detectedEp === null) {
      let epInTitle = combinedText.match(/(?:Episodio|Capitulo|Capítulo|Episode|Cap|Ep)\s*(\d{1,4})/i);
      if (!epInTitle) epInTitle = combinedText.match(/\b(\d{1,2})[xX](\d{1,4})\b/);

      if (epInTitle) {
        if (epInTitle[2]) {
          detectedSeason = detectedSeason || parseInt(epInTitle[1], 10);
          detectedEp = parseInt(epInTitle[2], 10);
        } else {
          detectedEp = parseInt(epInTitle[1], 10);
        }
      } else {
        let endNum = rawSeriesName.match(/\s+-\s*(\d{1,4})(?!.)/);
        if (!endNum) endNum = rawSeriesName.match(/\s+(\d{1,3})(?!.)/);
        if (endNum) detectedEp = parseInt(endNum[1], 10);
      }
    }

    // Detectar temporada explícita en el texto
    if (!detectedSeason) {
      let seaInTxt = combinedText.match(/(?:temporada|season)\s*(\d{1,2})/i);
      if (!seaInTxt) seaInTxt = combinedText.match(/(\d{1,2})(?:st|nd|rd|th)\s*season/i);
      if (seaInTxt) detectedSeason = parseInt(seaInTxt[1], 10);
    }

    // Limpiar coletillas de webs de streaming conservando Arcos y Temporadas
    let cleanTitle = rawSeriesName
      .replace(/^(Ver\s*Anime|Ver\s*Pelicula|Ver\s*Película|Ver|Watch|Descargar|Download)\s*[:\-–—]*\s*/i, '')
      .replace(/\s+(Sub\s*Español|Español\s*Latino|Castellano|Latino|HD|FHD|Online|Gratis|en\s*AnimeFLV|en\s*JKAnime|AnimeFLV|JKAnime|AnimeOnlineNinja|Anime\s*Online\s*Ninja|TioAnime|Monoschinos|Ver\s*Anime).*/i, '')
      .replace(/(?:[\s\-_:]+(?:Episodio|Capitulo|Capítulo|Episode|Cap|Ep)[\s\-_]*\d{1,4}).*/i, '')
      .replace(/\b\d{1,2}[xX]\d{1,4}\b.*/i, '')
      .replace(/\s+-\s*\d{1,4}(?!.)/, '')
      .replace(/[\(\[\{](?:Sub|Lat|Cast|1080|720|HD|TV).*?[\)\]\}]/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[:\-_•·]+(?!.)/, '')
      .trim();

    if (detectedEp !== null) {
      const trailingEpRegex = new RegExp('\\s+' + detectedEp + '(?!.)');
      if (trailingEpRegex.test(cleanTitle)) {
        cleanTitle = cleanTitle.replace(trailingEpRegex, '').trim();
      }
    }

    if (detectedSeason && detectedSeason > 1) {
      const sRegex = new RegExp('(?:season|temporada)\\s*' + detectedSeason + '|\\b' + detectedSeason + '(?:st|nd|rd|th)?\\s*season', 'i');
      if (!sRegex.test(cleanTitle)) {
        cleanTitle = cleanTitle + ' Season ' + detectedSeason;
      }
    }

    if (cleanTitle.length > 1 && detectedEp !== null) {
      return cleanTitle + ' - Ep ' + detectedEp;
    }
    return cleanTitle || 'Episodio';
  }

  function findSurgicalPlayerElement() {
    const specificSelectors = [
      '#video_player', '#player_div', '#reproductor', '#embed_holder',
      '.video-player-container', '.player-container', '.embed-responsive',
      '.play-box', '#player', '.player', '.vbox', '#playex', '.TPlayer'
    ];

    for (const sel of specificSelectors) {
      const container = document.querySelector(sel);
      if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
        return container;
      }
    }

    const iframes = document.querySelectorAll('iframe');
    for (const f of iframes) {
      const r = f.getBoundingClientRect();
      if (r.width >= 260 && r.height >= 140) return f;
    }
    return null;
  }

  function positionHUD(pill) {
    const player = findSurgicalPlayerElement();
    const pillWidth = 335;
    const gap = 14;

    if (player) {
      const rect = player.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const spaceRight = window.innerWidth - (rect.right + gap);

      let targetLeft = spaceRight >= pillWidth
        ? rect.right + gap + scrollX
        : Math.max(10, rect.left - pillWidth - gap + scrollX);
      let targetTop = rect.top + scrollY + 8;

      pill.style.position = 'absolute';
      pill.style.left = `${Math.round(targetLeft)}px`;
      pill.style.top = `${Math.round(targetTop)}px`;
    } else {
      pill.style.position = 'fixed';
      pill.style.top = '85px';
      pill.style.right = '24px';
      pill.style.left = 'auto';
    }
  }

  function renderPillDetails(media) {
    if (!media) return;
    activeMedia = media;

    const titleEl = document.getElementById('aurion-pill-title');
    const serverEl = document.getElementById('aurion-pill-server');
    const urlEl = document.getElementById('aurion-pill-url');
    const metaTag = document.getElementById('aurion-pill-meta-tag');
    const sizeTag = document.getElementById('aurion-pill-size-tag');
    const countBadge = document.getElementById('aurion-pill-stream-count');
    const selectEl = document.getElementById('aurion-stream-selector');

    if (titleEl) titleEl.innerText = getCleanMediaTitle();
    if (serverEl) serverEl.innerText = `⚡ ${media.source || 'STREAM'}`;
    if (urlEl) urlEl.innerText = media.url;
    if (metaTag) metaTag.innerText = media.resolution || '1080p';
    if (countBadge) countBadge.innerText = `${detectedStreams.length} ${detectedStreams.length === 1 ? 'FUENTE' : 'FUENTES'}`;

    const displayBytes = (media.bytes && media.bytes > 0)
      ? media.bytes
      : estimateBytesFromResolution(media.resolution);

    if (sizeTag) {
      if (displayBytes > 0) {
        sizeTag.style.display = 'inline-block';
        sizeTag.innerText = formatBytes(displayBytes);
      } else {
        sizeTag.style.display = 'none';
      }
    }

    if (selectEl) {
      if (detectedStreams.length > 1) {
        selectEl.style.display = 'block';
        selectEl.innerHTML = '';
        detectedStreams.forEach((s, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          const bTxt = s.bytes > 0 ? ` • ${formatBytes(s.bytes)}` : '';
          opt.textContent = `Fuente ${i + 1}: ${s.source} (${s.resolution || '1080p'}${bTxt})`;
          if (s.url === media.url) opt.selected = true;
          selectEl.appendChild(opt);
        });
      } else {
        selectEl.style.display = 'none';
      }
    }
  }

  function createOrUpdateHUD(media, list = []) {
    if (!media || !media.url) return;
    if (list && list.length > 0) {
      detectedStreams = list;
    } else if (!detectedStreams.some(x => x.url === media.url)) {
      detectedStreams.unshift(media);
    }

    syncMutedState((muted) => {
      if (muted) return;

      let pill = document.getElementById('aurion-floating-pill');
      if (!pill) {
        pill = document.createElement('div');
        pill.id = 'aurion-floating-pill';
        pill.innerHTML = `
          <div class="aurion-pill-header">
            <div class="aurion-pill-badge-box">
              <div class="aurion-pill-dot"></div>
              <span class="aurion-pill-badge">AURION SNIFFER V4</span>
            </div>
            <div class="aurion-pill-actions">
              <span class="aurion-pill-count-chip" id="aurion-pill-stream-count">1 FUENTE</span>
              <button class="aurion-pill-btn-icon" id="aurion-close-hud" title="Ocultar panel">✕</button>
            </div>
          </div>
          <div class="aurion-pill-title" id="aurion-pill-title"></div>
          <select id="aurion-stream-selector" class="aurion-stream-selector" style="display: none;"></select>
          <div class="aurion-pill-preview-box">
            <div class="aurion-pill-preview-top">
              <span class="aurion-pill-server-tag" id="aurion-pill-server">SERVIDOR</span>
              <div style="display: flex; gap: 5px; align-items: center;">
                <span class="aurion-pill-server-tag" id="aurion-pill-size-tag" style="background: rgba(0,255,170,0.12); color: #00ffaa; border-color: rgba(0,255,170,0.3); display: none;"></span>
                <span class="aurion-pill-server-tag" id="aurion-pill-meta-tag" style="background: rgba(255,214,10,0.14); color: #ffd60a; border-color: rgba(255,214,10,0.35);">1080p</span>
              </div>
            </div>
            <div class="aurion-pill-url-preview" id="aurion-pill-url">...</div>
          </div>
          <button class="aurion-pill-btn-send" id="aurion-pill-send">
            <span>ENVIAR A AURION STUDIO</span>
            <span style="font-size: 14px;">⚡</span>
          </button>
        `;
        document.body.appendChild(pill);

        document.getElementById('aurion-close-hud').addEventListener('click', (e) => {
          e.stopPropagation();
          pill.classList.remove('aurion-visible');
        });

        document.getElementById('aurion-stream-selector').addEventListener('change', (e) => {
          const idx = parseInt(e.target.value, 10);
          if (detectedStreams[idx]) {
            renderPillDetails(detectedStreams[idx]);
          }
        });

        document.getElementById('aurion-pill-send').addEventListener('click', async () => {
          const btn = document.getElementById('aurion-pill-send');
          btn.innerHTML = '<span>SINCRONIZANDO CON AURION...</span>';

          const payload = {
            page_title: getCleanMediaTitle(),
            page_url: activeMedia?.pageUrl || window.location.href,
            stream_url: activeMedia?.url || window.location.href,
            resolution: activeMedia?.resolution || '1080p',
            bytes: activeMedia?.bytes || 0
          };

          try {
            const resp = await fetch('http://127.0.0.1:6800/api/enqueue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (resp.ok) {
              btn.innerHTML = '<span>¡CAPÍTULO EN COLA! ✔</span>';
              btn.classList.add('aurion-success');
              setTimeout(() => {
                pill.classList.remove('aurion-visible');
                btn.classList.remove('aurion-success');
                btn.innerHTML = '<span>ENVIAR A AURION STUDIO</span><span style="font-size: 14px;">⚡</span>';
              }, 1100);
            }
          } catch (_) {
            btn.innerHTML = '<span>ABRE AURION DESKTOP PRIMERO</span>';
            setTimeout(() => {
              btn.innerHTML = '<span>ENVIAR A AURION STUDIO</span><span style="font-size: 14px;">⚡</span>';
            }, 2000);
          }
        });
      }

      renderPillDetails(media);
      positionHUD(pill);
      pill.classList.add('aurion-visible');
    });
  }

  setInterval(() => {
    const pill = document.getElementById('aurion-floating-pill');
    if (pill && pill.classList.contains('aurion-visible')) {
      positionHUD(pill);
    }
  }, 1400);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURION_MEDIA_DETECTED') {
      createOrUpdateHUD(msg.media, msg.mediaList || []);
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data?.aurionType === 'EMBED_IFRAME_DETECTED') {
      const entry = {
        url: event.data.url,
        source: event.data.source || 'MEGA',
        resolution: event.data.resolution || '1080p',
        bytes: 240 * 1024 * 1024,
        pageUrl: window.location.href,
        timestamp: Date.now()
      };
      createOrUpdateHUD(entry, [entry, ...detectedStreams.filter(x => x.url !== entry.url)]);
    } else if (event.data?.aurionType === 'NATIVE_RES_DETECTED') {
      const metaTag = document.getElementById('aurion-pill-meta-tag');
      const sizeTag = document.getElementById('aurion-pill-size-tag');
      const newRes = event.data.resolution;

      if (newRes) {
        if (metaTag) metaTag.innerText = newRes;
        if (activeMedia) {
          activeMedia.resolution = newRes;
          if (!activeMedia.bytes || activeMedia.bytes === 0) {
            activeMedia.bytes = estimateBytesFromResolution(newRes);
          }
        }
        if (sizeTag) {
          const b = (activeMedia?.bytes && activeMedia.bytes > 0)
            ? activeMedia.bytes
            : estimateBytesFromResolution(newRes);
          if (b > 0) {
            sizeTag.style.display = 'inline-block';
            sizeTag.innerText = formatBytes(b);
          }
        }
      }
    }
  });
}