if (window.top !== window) {
  // EJECUCIÓN EN IFRAMES: Avisar a la ventana padre si el reproductor arranca
  function checkNativeVideoResolution() {
    const v = document.querySelector('video');
    if (v && v.videoHeight > 0) {
      window.top.postMessage({
        aurionType: 'NATIVE_RES_DETECTED',
        height: v.videoHeight,
        resolution: `${v.videoHeight}p`,
        frameUrl: window.location.href
      }, '*');
    }
  }

  document.addEventListener('loadedmetadata', checkNativeVideoResolution, true);
  document.addEventListener('play', checkNativeVideoResolution, true);
  document.addEventListener('playing', checkNativeVideoResolution, true);
  setInterval(checkNativeVideoResolution, 1500);

} else {
  // EJECUCIÓN EN LA VENTANA PRINCIPAL
  let activeMedia = null;
  let activeFrameUrl = null;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return Math.round(mb) + ' MB';
  }

function getCleanMediaTitle() {
    let raw = '';

    // 1. Extraer desde el slug de la URL canónica (evita basura del DOM como "Fuentes de vídeo")
    try {
      const path = (window.top?.location?.pathname || window.location.pathname || '');
      const epMatch = path.match(/(?:episodio|ver|watch)\/([a-zA-Z0-9\-]+?)(?:\/|$)/i);
      if (epMatch) {
        let slug = epMatch[1];
        
        let seasonNum = null;
        let epNum = null;

        const sMatch = slug.match(/[-_](?:s|temporada[-_]?)(\d+)/i);
        if (sMatch) seasonNum = parseInt(sMatch[1], 10);

        const xMatch = slug.match(/[-_](\d+)x(\d+)/i);
        if (xMatch) {
          seasonNum = parseInt(xMatch[1], 10);
          epNum = parseInt(xMatch[2], 10);
        } else {
          const cMatch = slug.match(/[-_](?:cap|ep|episodio)?[-_]?(\d+)$/i);
          if (cMatch) epNum = parseInt(cMatch[1], 10);
        }

        let baseName = slug
          .replace(/[-_](?:s|temporada[-_]?)\d+/gi, '')
          .replace(/[-_]\d+x\d+/gi, '')
          .replace(/[-_](?:cap|ep|episodio)?[-_]?\d+$/gi, '')
          .replace(/[-_]+/g, ' ')
          .trim();

        baseName = baseName.replace(/\b\w/g, c => c.toUpperCase());

        if (seasonNum && seasonNum > 1) {
          baseName = `${baseName} Season ${seasonNum}`;
        }

        if (baseName.length > 2 && epNum !== null) {
          return `${baseName} - Ep ${epNum}`;
        } else if (baseName.length > 2) {
          raw = baseName;
        }
      }
    } catch (_) {}

    // 2. Fallback: document.title de la pestaña
    if (!raw) {
      raw = document.title || '';
    }

    raw = raw.replace(/^(Ver\s*Anime|Ver|Watch|Descargar|Download)\s+/i, '');
    raw = raw.replace(/\s+(Sub Español|Español Latino|Castellano|HD|FHD|Online|Gratis|en AnimeFLV|en JKAnime|AnimeFLV|JKAnime|AnimeOnlineNinja|Anime Online Ninja).*$/i, '');
    raw = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

    const seasonExplicit = raw.match(/(?:(\d{1,2})[xX](\d+))|(?:(?:temporada|season)\s*(\d{1,2}))/i);
    let sNum = seasonExplicit ? (seasonExplicit[1] || seasonExplicit[3]) : null;

    const epMatchTitle = raw.match(/(?:[\s\-_:]+(?:(?:Episodio|Capitulo|Episode|Cap|Ep)[\s\-_]*|(?:\d{1,2}[xX]))|(?:\bS\d+E))(\d+)/i);
    if (epMatchTitle) {
      let animeName = raw.substring(0, epMatchTitle.index).trim().replace(/[:\-_]+$/, '').trim();
      const epN = parseInt(epMatchTitle[1], 10);

      if (sNum && parseInt(sNum, 10) > 1 && !new RegExp(`season\\s*${sNum}|\\b${sNum}\\b`, 'i').test(animeName)) {
        animeName = `${animeName} Season ${sNum}`;
      }

      if (animeName.length > 1) return `${animeName} - Ep ${epN}`;
    }

    return raw.replace(/[:\-_]+$/, '').trim() || 'Episodio';
  }

  function findSurgicalPlayerElement() {
    const specificSelectors = [
      '#video_player', '#player_div', '#reproductor', '#embed_holder',
      '.video-player-container', '.player-container', '.embed-responsive',
      '.play-box', '#player', '.player', '.vbox', '#playex'
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
    const pillWidth = 310;
    const gap = 12;

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

  function createOrUpdateHUD(media) {
    if (!media || !media.url) return;
    activeMedia = media;

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
            <button class="aurion-pill-btn-icon" id="aurion-close-hud" title="Cerrar">✕</button>
          </div>
        </div>
        <div class="aurion-pill-title" id="aurion-pill-title"></div>
        <div class="aurion-pill-preview-box">
          <div class="aurion-pill-preview-top">
            <span class="aurion-pill-server-tag" id="aurion-pill-server">SERVIDOR</span>
            <span class="aurion-pill-server-tag" id="aurion-pill-meta-tag" style="background: rgba(255,255,255,0.1); color: #fff;">Auto</span>
          </div>
          <div class="aurion-pill-url-preview" id="aurion-pill-url">...</div>
        </div>
        <button class="aurion-pill-btn-send" id="aurion-pill-send">ENVIAR A AURION ⚡</button>
      `;
      document.body.appendChild(pill);

      document.getElementById('aurion-close-hud').addEventListener('click', (e) => {
        e.stopPropagation();
        pill.classList.remove('aurion-visible');
      });

      document.getElementById('aurion-pill-send').addEventListener('click', async () => {
        const btn = document.getElementById('aurion-pill-send');
        btn.innerText = 'CONECTANDO...';

        const payload = {
          page_title: getCleanMediaTitle(),
          page_url: activeFrameUrl || activeMedia?.pageUrl || window.location.href,
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
            setTimeout(() => { pill.classList.remove('aurion-visible'); }, 1200);
          }
        } catch (_) {
          btn.innerText = 'AURION NO CONECTADA';
          setTimeout(() => { btn.innerText = 'ENVIAR A AURION ⚡'; }, 2000);
        }
      });
    }

    const titleEl = document.getElementById('aurion-pill-title');
    const serverEl = document.getElementById('aurion-pill-server');
    const urlEl = document.getElementById('aurion-pill-url');
    const metaTag = document.getElementById('aurion-pill-meta-tag');

    if (titleEl) titleEl.innerText = getCleanMediaTitle();
    if (serverEl) serverEl.innerText = media.source || 'STREAM';
    if (urlEl) urlEl.innerText = media.url;
    if (metaTag) metaTag.innerText = media.resolution || 'Auto';

    positionHUD(pill);
    pill.classList.add('aurion-visible');
  }

  // Comprobar posición sin ocultar la píldora si no encuentra el reproductor
  setInterval(() => {
    const pill = document.getElementById('aurion-floating-pill');
    if (pill && pill.classList.contains('aurion-visible')) {
      positionHUD(pill);
    }
  }, 1500);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURION_MEDIA_DETECTED') {
      createOrUpdateHUD(msg.media);
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data?.aurionType === 'NATIVE_RES_DETECTED') {
      const metaTag = document.getElementById('aurion-pill-meta-tag');
      if (metaTag && event.data.resolution) {
        metaTag.innerText = event.data.resolution;
        if (activeMedia) activeMedia.resolution = event.data.resolution;
      }
    }
  });
}