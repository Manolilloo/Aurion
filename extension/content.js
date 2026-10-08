if (window.top !== window) {
  // EJECUCIÓN DENTRO DE LOS IFRAMES DE STREAMWISH / FILELIONS / OTROS
  function checkNativeVideoResolution() {
    const v = document.querySelector('video');
    if (v && v.videoHeight > 0) {
      const detectedRes = `${v.videoHeight}p`;
      window.top.postMessage({
        aurionType: 'NATIVE_RES_DETECTED',
        resolution: detectedRes,
        frameUrl: window.location.href
      }, '*');
      chrome.runtime.sendMessage({
        type: 'UPDATE_MEDIA_RESOLUTION',
        resolution: detectedRes
      }).catch(() => {});
    }
  }

  // Observar cuando el vídeo empiece a reproducirse para leer los píxeles reales del decodificador
  document.addEventListener('loadedmetadata', checkNativeVideoResolution, true);
  document.addEventListener('play', checkNativeVideoResolution, true);
  document.addEventListener('playing', checkNativeVideoResolution, true);
  setInterval(checkNativeVideoResolution, 1200);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURION_MEDIA_DETECTED') {
      window.top.postMessage({
        aurionType: 'FORWARD_MEDIA_DETECTED',
        media: msg.media,
        frameUrl: window.location.href
      }, '*');
    }
  });

} else {
  // VENTANA PRINCIPAL
  let activeMedia = null;
  let activeFrameUrl = null;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return Math.round(mb) + ' MB';
  }

  function shouldShowHUD(hostname, callback) {
    if (!chrome.runtime?.id) return;
    try {
      chrome.storage.local.get(['disabledHosts'], (res) => {
        if (chrome.runtime.lastError) return;
        const disabled = res?.disabledHosts || [];
        if (disabled.includes(hostname)) return callback(false);
        callback(true);
      });
    } catch (e) {}
  }

  function findSurgicalPlayerElement() {
    if (activeFrameUrl) {
      try {
        const targetHost = new URL(activeFrameUrl).hostname;
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
          if (f.src && f.src.includes(targetHost) && isElementVisible(f)) {
            return f;
          }
        }
      } catch (err) {}
    }

    const specificSelectors = [
      '#video_player', '#player_div', '#reproductor', '#embed_holder',
      '.video-player-container', '.player-container', '.embed-responsive',
      '.play-box', '#player', '.player', '.vbox'
    ];

    for (const sel of specificSelectors) {
      const container = document.querySelector(sel);
      if (container && isElementVisible(container)) {
        const sub = container.querySelector('iframe, video');
        if (sub && isElementVisible(sub)) return sub;
        return container;
      }
    }

    const candidates = document.querySelectorAll('iframe, video');
    for (const el of candidates) {
      const src = (el.src || '').toLowerCase();
      if (src.includes('google') || src.includes('doubleclick') || src.includes('banner') || src.includes('ads')) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width >= 280 && r.height >= 160 && isElementVisible(el)) {
        return el;
      }
    }
    return null;
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0);
  }

  function positionHUDNearPlayer(pill) {
    const player = findSurgicalPlayerElement();
    const pillWidth = 310;
    const gap = 12;

    if (player) {
      const rect = player.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const spaceRight = window.innerWidth - (rect.right + gap);

      let targetLeft = 0;
      let targetTop = 0;

      if (spaceRight >= pillWidth) {
        targetLeft = rect.right + gap + scrollX;
        targetTop = rect.top + scrollY + 8;
      } else if (rect.left >= (pillWidth + gap)) {
        targetLeft = rect.left - pillWidth - gap + scrollX;
        targetTop = rect.top + scrollY + 8;
      } else {
        targetLeft = rect.right - pillWidth - 14 + scrollX;
        targetTop = rect.top + scrollY + 14;
      }

      pill.style.position = 'absolute';
      pill.style.left = `${Math.max(10, Math.round(targetLeft))}px`;
      pill.style.top = `${Math.max(10, Math.round(targetTop))}px`;
      pill.style.bottom = 'auto';
      pill.style.right = 'auto';
    } else {
      pill.style.position = 'fixed';
      pill.style.top = '80px';
      pill.style.right = '24px';
      pill.style.left = 'auto';
      pill.style.bottom = 'auto';
    }
  }

  function showHUD() {
    const pill = document.getElementById('aurion-floating-pill');
    if (!pill) return;
    positionHUDNearPlayer(pill);
    pill.classList.add('aurion-visible');
  }

  function hideHUD() {
    const pill = document.getElementById('aurion-floating-pill');
    if (pill) pill.classList.remove('aurion-visible');
  }

  function createOrUpdateHUD(media, frameUrl = null) {
    if (!media || !media.url) return;
    if (frameUrl) activeFrameUrl = frameUrl;

    let pill = document.getElementById('aurion-floating-pill');

    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'aurion-floating-pill';
      pill.innerHTML = `
        <div class="aurion-pill-header">
          <div class="aurion-pill-badge-box">
            <div class="aurion-pill-dot"></div>
            <span class="aurion-pill-badge">VÍDEO DETECTADO</span>
          </div>
          <div class="aurion-pill-actions">
            <button class="aurion-pill-btn-icon" id="aurion-ignore-site" title="Silenciar en este sitio">🚫</button>
            <button class="aurion-pill-btn-icon" id="aurion-close-hud" title="Cerrar">✕</button>
          </div>
        </div>
        <div class="aurion-pill-title" id="aurion-pill-title"></div>
        
        <div class="aurion-pill-preview-box">
          <div class="aurion-pill-preview-top">
            <span class="aurion-pill-server-tag" id="aurion-pill-server">SERVIDOR</span>
            <div style="display: flex; gap: 5px; align-items: center;">
              <span class="aurion-pill-server-tag" id="aurion-pill-size-tag" style="background: rgba(0,255,170,0.12); color: #00ffaa; border-color: rgba(0,255,170,0.3); display: none;"></span>
              <span class="aurion-pill-server-tag" id="aurion-pill-meta-tag" style="background: rgba(255, 255, 255, 0.1); color: #fff; border-color: rgba(255,255,255,0.2);">Auto</span>
            </div>
          </div>
          <div class="aurion-pill-url-preview" id="aurion-pill-url">...</div>
        </div>

        <button class="aurion-pill-btn-send" id="aurion-pill-send">
          ENVIAR A AURION ⚡
        </button>
      `;

      document.body.appendChild(pill);

      document.getElementById('aurion-close-hud').addEventListener('click', (e) => {
        e.stopPropagation();
        hideHUD();
      });

      document.getElementById('aurion-ignore-site').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!chrome.runtime?.id) return;
        const host = window.location.hostname;
        try {
          chrome.storage.local.get(['disabledHosts'], (res) => {
            const list = res?.disabledHosts || [];
            if (!list.includes(host)) list.push(host);
            chrome.storage.local.set({ disabledHosts: list }, () => {
              hideHUD();
            });
          });
        } catch (err) {}
      });

      document.getElementById('aurion-pill-send').addEventListener('click', async () => {
        const btn = document.getElementById('aurion-pill-send');
        btn.innerText = 'CONECTANDO...';

        const payload = {
          page_title: document.title,
          page_url: window.location.href,
          stream_url: activeMedia?.url || window.location.href,
          resolution: activeMedia?.resolution || 'Auto',
          bytes: activeMedia?.bytes || 0
        };

        try {
          const resp = await fetch('http://127.0.0.1:6800/api/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (resp.ok) {
            btn.innerText = '¡ENVIADO A AURION! ✔';
            btn.classList.add('aurion-success');
            setTimeout(() => { hideHUD(); }, 1000);
          }
        } catch (err) {
          btn.innerText = 'AURION NO CONECTADA';
          setTimeout(() => { btn.innerText = 'ENVIAR A AURION ⚡'; }, 2200);
        }
      });
    }

    // Actualización de campos
    const isDifferent = !activeMedia || (activeMedia.url !== media.url);

    // Si es el mismo stream y la resolución entrante es 'Auto', mantener la detectada
    if (!isDifferent && media.resolution === 'Auto' && activeMedia.resolution !== 'Auto') {
      media.resolution = activeMedia.resolution;
      media.bytes = activeMedia.bytes;
    }

    activeMedia = media;

    const titleEl = document.getElementById('aurion-pill-title');
    const serverEl = document.getElementById('aurion-pill-server');
    const urlEl = document.getElementById('aurion-pill-url');
    const metaTag = document.getElementById('aurion-pill-meta-tag');
    const sizeTag = document.getElementById('aurion-pill-size-tag');
    const btnSend = document.getElementById('aurion-pill-send');

    if (titleEl) titleEl.innerText = document.title;
    if (serverEl) serverEl.innerText = media.source || 'STREAM';
    if (urlEl) urlEl.innerText = media.url;

    if (metaTag) {
      metaTag.innerText = media.resolution || 'Auto';
    }

    if (sizeTag) {
      if (media.bytes && media.bytes > 0) {
        sizeTag.style.display = 'inline-block';
        sizeTag.innerText = formatBytes(media.bytes);
      } else {
        sizeTag.style.display = 'none';
      }
    }

    if (btnSend) {
      btnSend.classList.remove('aurion-success');
      btnSend.innerText = 'ENVIAR A AURION ⚡';
      btnSend.style.pointerEvents = 'auto';
    }

    showHUD();
  }

  // Recalcular posición dinámicamente
  window.addEventListener('resize', () => {
    const pill = document.getElementById('aurion-floating-pill');
    if (pill && pill.classList.contains('aurion-visible')) {
      positionHUDNearPlayer(pill);
    }
  });

  setInterval(() => {
    const pill = document.getElementById('aurion-floating-pill');
    if (pill && pill.classList.contains('aurion-visible')) {
      const player = findSurgicalPlayerElement();
      if (!player) {
        hideHUD();
      } else {
        positionHUDNearPlayer(pill);
      }
    }
  }, 1200);

  // Escuchar mensajes de background y sub-frames
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURION_MEDIA_DETECTED') {
      shouldShowHUD(window.location.hostname, (allowed) => {
        if (!allowed) return;
        createOrUpdateHUD(msg.media);
      });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data?.aurionType === 'FORWARD_MEDIA_DETECTED') {
      shouldShowHUD(window.location.hostname, (allowed) => {
        if (!allowed) return;
        createOrUpdateHUD(event.data.media, event.data.frameUrl);
      });
    } else if (event.data?.aurionType === 'NATIVE_RES_DETECTED') {
      // El reproductor dentro del iframe ya midió la resolución nativa por hardware
      const metaTag = document.getElementById('aurion-pill-meta-tag');
      if (metaTag && event.data.resolution) {
        metaTag.innerText = event.data.resolution;
        if (activeMedia) activeMedia.resolution = event.data.resolution;
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideHUD();
  });
}