document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const urlObj = new URL(tab.url);
  const currentHost = urlObj.hostname;
  document.getElementById('site-domain').innerText = currentHost;

  function refreshList() {
    chrome.storage.local.get(['disabledHosts'], (res) => {
      const list = res.disabledHosts || [];
      const isBlocked = list.includes(currentHost);

      const toggleBtn = document.getElementById('btn-toggle-site');
      const badge = document.getElementById('host-badge');

      if (isBlocked) {
        badge.innerText = 'BLOQUEADO';
        badge.style.color = '#ff3366';
        badge.style.borderColor = '#ff3366';
        badge.style.background = 'rgba(255,51,102,0.15)';
        toggleBtn.innerText = 'Reactivar en este sitio';
        toggleBtn.style.borderColor = '#00ffaa';
      } else {
        badge.innerText = 'ACTIVO';
        badge.style.color = '#00ffaa';
        badge.style.borderColor = '#00ffaa';
        badge.style.background = 'rgba(0,255,170,0.15)';
        toggleBtn.innerText = 'Desactivar en este sitio';
        toggleBtn.style.borderColor = 'rgba(255,255,255,0.15)';
      }

      const container = document.getElementById('blocked-list');
      container.innerHTML = '';
      if (list.length === 0) {
        container.innerHTML = '<div style="font-size: 10px; color: #64748b;">No hay sitios desactivados.</div>';
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
    chrome.runtime.sendMessage({ type: 'GET_STREAMS', tabId: tab.id }, async (res) => {
      const streams = res?.streams || [];
      const payload = {
        page_title: tab.title,
        page_url: tab.url,
        streams: streams.length > 0 ? streams : [tab.url]
      };
      try {
        const resp = await fetch('http://127.0.0.1:6800/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const b = document.getElementById('btn-send-manual');
          b.innerText = '¡ENVIADO A AURION! ✔';
          setTimeout(() => window.close(), 600);
        }
      } catch (err) {
        alert('Asegúrate de tener Aurion abierto.');
      }
    });
  });

  refreshList();
});