// Memoria de flujos detectados por pestaña
const tabStreams = {};

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    if (tabId < 0) return;

    const isVideo = url.includes('.m3u8') ||
                    url.includes('.mp4') ||
                    url.includes('streamtape.com/get_video') ||
                    url.includes('voe.sx/engine') ||
                    url.includes('/video.mp4');

    if (isVideo) {
      if (!tabStreams[tabId]) tabStreams[tabId] = new Set();
      tabStreams[tabId].add(url);

      // Avisar al content script para que despliegue la píldora flotante
      chrome.tabs.sendMessage(tabId, {
        type: 'AURION_STREAM_DETECTED',
        streamUrl: url
      }).catch(() => {});
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStreams[tabId];
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'GET_STREAMS') {
    const list = Array.from(tabStreams[req.tabId] || []);
    sendResponse({ streams: list });
  }
});