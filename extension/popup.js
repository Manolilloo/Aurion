document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let currentHost = '';
  try {
    const urlObj = new URL(tab.url);
    currentHost = urlObj.hostname;
  } catch (e) {
    currentHost = 'Pestaña local';
  }
  
  const domainEl = document.getElementById('site-domain');
  if (domainEl) domainEl.innerText = currentHost;

  function refreshList() {
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
        badge.style.boxShadow = '0 0 10px rgba(255, 51, 102, 0.2)';
        toggleBtn.innerText = 'Reactivar en este sitio';
        toggleBtn.style.borderColor = 'rgba(0, 255, 170, 0.4)';
      } else {
        badge.innerText = 'ACTIVO';
        badge.style.color = '#00ffaa';
        badge.style.borderColor = 'rgba(0, 255, 170, 0.3)';
        badge.style.background = 'rgba(0, 255, 170, 0.12)';
        badge.style.boxShadow = '0 0 10px rgba(0, 255, 170, 0.15)';
        toggleBtn.innerText = 'Silenciar en este sitio';
        toggleBtn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      }

      const container = document.getElementById('blocked-list');
      container.innerHTML = '';
      if (list.length === 0) {
        container.innerHTML = '<div style="font-size: 10px; color: #64748b; padding: 4px 0;">No hay sitios silenciados.</div>';
      } else {
        list.forEach(h => {
          const item = document.createElement('div');
          item.className = 'blocked-item';
          item.innerHTML = `<span>${h}</span><button data-h="${h}">DESBLOQUEAR</button>`;
          item.querySelector('button').addEventListener('click', () => {
            const updated = list.filter(x => x !== h);
            chrome.storage.local.set({ disabledHosts: updated }, refreshList);
          });
          container.appendChild(item);
        });
      }
    });
  }

  document.getElementById('btn-toggle-site').addEventListener('click', () => {
    chrome.storage.local.get(['disabledHosts'], (res) => {
      let list = res.disabledHosts || [];
      if (list.includes(currentHost)) {
        list = list.filter(x => x !== currentHost);
      } else {
        list.push(currentHost);
      }
      chrome.storage.local.set({ disabledHosts: list }, refreshList);
    });
  });

  document.getElementById('btn-send-manual').addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'GET_MEDIA_INFO', tabId: tab.id }, async (res) => {
      const streams = res?.streams || [];
      const iframes = res?.iframes || [];

      let chosenUrl = tab.url;
      if (streams.length > 0) {
        chosenUrl = streams[streams.length - 1];
      } else if (iframes.length > 0) {
        chosenUrl = iframes[iframes.length - 1];
      }

      const payload = {
        page_title: tab.title,
        page_url: tab.url,
        stream_url: chosenUrl
      };

      try {
        const resp = await fetch('http://127.0.0.1:6800/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const b = document.getElementById('btn-send-manual');
          b.innerText = '¡TRANSMISIÓN ENVIADA! ✔';
          setTimeout(() => window.close(), 600);
        }
      } catch (err) {
        alert('Asegúrate de tener Aurion abierto en tu escritorio.');
      }
    });
  });

  refreshList();
});