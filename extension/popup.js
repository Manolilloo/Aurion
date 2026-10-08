document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let currentHost = '';
  try {
    currentHost = new URL(tab.url).hostname;
  } catch (e) {
    currentHost = 'Pestaña local';
  }
  
  const domainEl = document.getElementById('site-domain');
  if (domainEl) domainEl.innerText = currentHost;

  function refreshStatus() {
    chrome.storage.local.get(['disabledHosts'], (res) => {
      const list = res.disabledHosts || [];
      const isBlocked = list.includes(currentHost);

      const toggleBtn = document.getElementById('btn-toggle-site');
      const badge = document.getElementById('host-badge');

      if (isBlocked) {
        badge.innerText = 'SILENCIADO';
        badge.style.color = '#ff3366';
        badge.style.borderColor = '#ff3366';
        badge.style.background = 'rgba(255, 51, 102, 0.15)';
        toggleBtn.innerText = 'Reactivar en este sitio';
      } else {
        badge.innerText = 'ACTIVO';
        badge.style.color = '#00ffaa';
        badge.style.borderColor = 'rgba(0, 255, 170, 0.25)';
        badge.style.background = 'rgba(0, 255, 170, 0.1)';
        toggleBtn.innerText = 'Silenciar en este sitio';
      }
    });
  }

  // Cargar lista de streams detectados por el background
  function loadDetectedStreams() {
    chrome.runtime.sendMessage({ type: 'GET_MEDIA_INFO', tabId: tab.id }, (res) => {
      const list = res?.mediaList || [];
      const container = document.getElementById('detected-streams-list');
      const countEl = document.getElementById('streams-count');

      if (countEl) countEl.innerText = list.length;
      if (!container) return;

      container.innerHTML = '';

      if (list.length === 0) {
        container.innerHTML = '<div style="font-size: 9.5px; color: #64748b; padding: 4px 0;">Reproduce el vídeo para capturarlo.</div>';
        return;
      }

      list.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'blocked-item';
        item.innerHTML = `
          <div style="display:flex; flex-direction:column; max-width: 190px; overflow:hidden;">
            <span style="color:#fff; font-weight:800;">${m.source} (${m.resolution || 'Auto'})</span>
            <span style="font-size:8px; color:#64748b; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${m.url}</span>
          </div>
          <button style="color:var(--accent);" data-idx="${idx}">ENVIAR</button>
        `;

        item.querySelector('button').addEventListener('click', async (e) => {
          e.stopPropagation();
          sendPayloadToAurion(m.url, m.resolution, m.bytes);
        });

        container.appendChild(item);
      });
    });
  }

  async function sendPayloadToAurion(streamUrl, resolution = 'Auto', bytes = 0) {
    const payload = {
      page_title: tab.title,
      page_url: tab.url,
      stream_url: streamUrl,
      resolution: resolution,
      bytes: bytes
    };

    try {
      const resp = await fetch('http://127.0.0.1:6800/api/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const btn = document.getElementById('btn-send-manual');
        if (btn) btn.innerText = '¡TRANSMISIÓN ENVIADA! ✔';
        setTimeout(() => window.close(), 700);
      }
    } catch (err) {
      alert('Asegúrate de tener la app Aurion abierta en tu escritorio.');
    }
  }

  document.getElementById('btn-toggle-site').addEventListener('click', () => {
    chrome.storage.local.get(['disabledHosts'], (res) => {
      let list = res.disabledHosts || [];
      if (list.includes(currentHost)) {
        list = list.filter(x => x !== currentHost);
      } else {
        list.push(currentHost);
      }
      chrome.storage.local.set({ disabledHosts: list }, refreshStatus);
    });
  });

  document.getElementById('btn-send-manual').addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'GET_MEDIA_INFO', tabId: tab.id }, async (res) => {
      const list = res?.mediaList || [];
      const streamUrl = list.length > 0 ? list[0].url : tab.url;
      sendPayloadToAurion(streamUrl, list[0]?.resolution, list[0]?.bytes);
    });
  });

  refreshStatus();
  loadDetectedStreams();
});