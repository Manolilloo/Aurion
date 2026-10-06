// Memoria en caché de enlaces capturados por pestaña
const capturedStreams = {};

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    const tabId = details.tabId;
    if (tabId < 0) return;

    // Detectar streams directos de vídeo o listas m3u8
    const isVideoStream = url.includes('.m3u8') || 
                          url.includes('.mp4') || 
                          url.includes('master.txt') ||
                          url.includes('streamtape.com/get_video') ||
                          url.includes('voe.sx/engine');

    if (isVideoStream) {
      if (!capturedStreams[tabId]) {
        capturedStreams[tabId] = new Set();
      }
      capturedStreams[tabId].add(url);
    }
  },
  { urls: ["<all_urls>"] }
);

// Limpiar cuando se cierre la pestaña
chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedStreams[tabId];
});

// Responder al popup con los enlaces capturados
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'GET_STREAMS') {
    const list = Array.from(capturedStreams[req.tabId] || []);
    sendResponse({ streams: list });
  }
});