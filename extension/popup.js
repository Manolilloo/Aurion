document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  document.getElementById('page-title').innerText = tab.title || 'Página activa';
  document.getElementById('page-url').innerText = tab.url || '';

  // Solicitar streams capturados
  chrome.runtime.sendMessage({ type: 'GET_STREAMS', tabId: tab.id }, (res) => {
    const list = res?.streams || [];
    document.getElementById('stream-count').innerText = list.length;
    const container = document.getElementById('stream-list');
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<div class="stream-item" style="color: #64748b;">No hay streams directos aún. Reproduce el vídeo o envía la URL principal.</div>';
    } else {
      list.forEach(url => {
        const item = document.createElement('div');
        item.className = 'stream-item';
        item.innerText = url;
        container.appendChild(item);
      });
    }

    // Botón de envío local
    document.getElementById('btn-send-all').addEventListener('click', async () => {
      const payload = {
        page_title: tab.title,
        page_url: tab.url,
        streams: list.length > 0 ? list : [tab.url]
      };

      try {
        const resp = await fetch('http://127.0.0.1:6800/api/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          const btn = document.getElementById('btn-send-all');
          btn.innerText = '¡ENVIADO A AURION! ✔';
          btn.style.background = '#fff';
          setTimeout(() => window.close(), 700);
        }
      } catch (err) {
        alert('No se pudo conectar con Aurion. Asegúrate de que la aplicación esté abierta.');
      }
    });
  });
});