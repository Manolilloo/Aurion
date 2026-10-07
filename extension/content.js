let currentStreams = [];

function shouldShowHUD(hostname, callback) {
  chrome.storage.local.get(['disabledHosts', 'whitelistMode', 'whitelistedHosts'], (res) => {
    const disabled = res.disabledHosts || [];
    const isWhitelistedOnly = res.whitelistMode || false;
    const allowed = res.whitelistedHosts || [];

    if (disabled.includes(hostname)) return callback(false);
    if (isWhitelistedOnly && !allowed.includes(hostname)) return callback(false);
    callback(true);
  });
}

function createHUD() {
  if (document.getElementById('aurion-floating-pill')) return;

  const pill = document.createElement('div');
  pill.id = 'aurion-floating-pill';
  pill.innerHTML = `
    <div class="aurion-pill-header">
      <span class="aurion-pill-badge">VÍDEO DETECTADO</span>
      <div class="aurion-pill-actions">
        <button class="aurion-pill-btn-icon" id="aurion-ignore-site" title="No volver a mostrar en esta web">🚫</button>
        <button class="aurion-pill-btn-icon" id="aurion-close-hud" title="Cerrar">✕</button>
      </div>
    </div>
    <div class="aurion-pill-title" id="aurion-pill-title">${document.title}</div>
    <button class="aurion-pill-btn-send" id="aurion-pill-send">
      ENVIAR A AURION ⚡
    </button>
  `;

  document.body.appendChild(pill);

  document.getElementById('aurion-close-hud').addEventListener('click', () => {
    pill.classList.remove('aurion-visible');
  });

  document.getElementById('aurion-ignore-site').addEventListener('click', () => {
    const host = window.location.hostname;
    chrome.storage.local.get(['disabledHosts'], (res) => {
      const list = res.disabledHosts || [];
      if (!list.includes(host)) list.push(host);
      chrome.storage.local.set({ disabledHosts: list }, () => {
        pill.classList.remove('aurion-visible');
      });
    });
  });

  document.getElementById('aurion-pill-send').addEventListener('click', async () => {
    const btn = document.getElementById('aurion-pill-send');
    btn.innerText = 'ENVIANDO...';

    // Elegir únicamente el stream más relevante para evitar duplicados
    const chosenStream = currentStreams.length > 0 ? currentStreams[currentStreams.length - 1] : window.location.href;

    const payload = {
      page_title: document.title,
      page_url: window.location.href,
      stream_url: chosenStream
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
          pill.classList.remove('aurion-visible');
          btn.innerText = 'ENVIAR A AURION ⚡';
          btn.classList.remove('aurion-success');
        }, 1200);
      }
    } catch (err) {
      btn.innerText = 'ERROR (¿APP ABIERTA?)';
      setTimeout(() => { btn.innerText = 'ENVIAR A AURION ⚡'; }, 2000);
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AURION_STREAM_DETECTED') {
    const host = window.location.hostname;
    shouldShowHUD(host, (allowed) => {
      if (!allowed) return;

      if (!currentStreams.includes(msg.streamUrl)) {
        currentStreams.push(msg.streamUrl);
      }

      createHUD();
      const pill = document.getElementById('aurion-floating-pill');
      if (pill) {
        document.getElementById('aurion-pill-title').innerText = document.title;
        pill.classList.add('aurion-visible');
      }
    });
  }
});