if (window.top !== window) {
  // En iframes: avisar a la ventana principal cuando se detecta el vídeo
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURION_MEDIA_DETECTED') {
      window.top.postMessage({
        aurionType: 'FORWARD_MEDIA_DETECTED',
        media: msg.media
      }, '*');
    }
  });
} else {
  let activeMedia = null;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return Math.round(mb) + ' MB';
  }

  function shouldShowHUD(hostname, callback) {
    chrome.storage.local.get(['disabledHosts'], (res) => {
      const disabled = res.disabledHosts || [];
      if (disabled.includes(hostname)) return callback(false);
      callback(true);
    });
  }

  function removeHUD() {
    const existing = document.getElementById('aurion-floating-pill');
    if (existing) existing.remove();
  }

  function createOrUpdateHUD(media) {
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
        removeHUD();
      });

      document.getElementById('aurion-ignore-site').addEventListener('click', (e) => {
        e.stopPropagation();
        const host = window.location.hostname;
        chrome.storage.local.get(['disabledHosts'], (res) => {
          const list = res.disabledHosts || [];
          if (!list.includes(host)) list.push(host);
          chrome.storage.local.set({ disabledHosts: list }, () => {
            removeHUD();
          });
        });
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
            setTimeout(() => {
              removeHUD();
            }, 1000);
          }
        } catch (err) {
          btn.innerText = 'AURION NO CONECTADA';
          setTimeout(() => { btn.innerText = 'ENVIAR A AURION ⚡'; }, 2200);
        }
      });
    }

    document.getElementById('aurion-pill-title').innerText = document.title;
    document.getElementById('aurion-pill-server').innerText = media.source || 'STREAM';
    document.getElementById('aurion-pill-url').innerText = media.url;

    const metaTag = document.getElementById('aurion-pill-meta-tag');
    metaTag.innerText = media.resolution && media.resolution !== 'Auto' ? media.resolution : 'Auto';

    const sizeTag = document.getElementById('aurion-pill-size-tag');
    if (media.bytes && media.bytes > 0) {
      sizeTag.style.display = 'inline-block';
      sizeTag.innerText = formatBytes(media.bytes);
    } else {
      sizeTag.style.display = 'none';
    }

    pill.classList.add('aurion-visible');
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURION_MEDIA_DETECTED') {
      shouldShowHUD(window.location.hostname, (allowed) => {
        if (!allowed) return;
        createOrUpdateHUD(msg.media);
      });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.aurionType === 'FORWARD_MEDIA_DETECTED') {
      shouldShowHUD(window.location.hostname, (allowed) => {
        if (!allowed) return;
        createOrUpdateHUD(event.data.media);
      });
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeHUD();
  });
}