const tabMediaData = {};

const VIDEO_STREAM_REGEX = /\.(m3u8|mpd)(\?|$)|[\/=](playlist|master|manifest|chunklist|index-f\d+)[^\/]*\.(m3u8|txt|mpd)/i;
const DIRECT_VIDEO_REGEX = /\.(mp4|webm|mkv)(\?|$)/i;

function extractResolutionFromUrl(url) {
  const u = url.toLowerCase();
  if (/(?:[\/\._\-=])(2160|4k)(?:[\/\._\-=p]|$)/i.test(u)) return '4K';
  if (/(?:[\/\._\-=])(1440|2k)(?:[\/\._\-=p]|$)/i.test(u)) return '2K';
  if (/(?:[\/\._\-=])(1080)(?:[\/\._\-=p]|$)/i.test(u)) return '1080p';
  if (/(?:[\/\._\-=])(720)(?:[\/\._\-=p]|$)/i.test(u)) return '720p';
  if (/(?:[\/\._\-=])(480)(?:[\/\._\-=p]|$)/i.test(u)) return '480p';
  if (/(?:[\/\._\-=])(360)(?:[\/\._\-=p]|$)/i.test(u)) return '360p';
  return null;
}

async function inspectManifest(url, pageUrl = '') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const headers = { 'Accept': '*/*' };
    if (pageUrl) {
      try {
        const u = new URL(pageUrl);
        headers['Referer'] = u.origin + '/';
        headers['Origin'] = u.origin;
      } catch (_) {}
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers: headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { res: 'Auto', bytes: 0 };
    const text = await resp.text();

    let bestHeight = 0;
    const resMatches = [...text.matchAll(/RESOLUTION=\d+x(\d+)/gi)];
    for (const m of resMatches) {
      const h = parseInt(m[1], 10);
      if (h > bestHeight) bestHeight = h;
    }

    let bestBw = 0;
    const bwMatches = [...text.matchAll(/BANDWIDTH=(\d+)/gi)];
    for (const b of bwMatches) {
      const val = parseInt(b[1], 10);
      if (val > bestBw) bestBw = val;
    }

    let totalSec = 0;
    const durMatches = [...text.matchAll(/#EXTINF:([\d\.]+)/gi)];
    durMatches.forEach(d => { totalSec += parseFloat(d[1]); });

    let bytes = 0;
    if (totalSec > 0 && bestBw > 0) {
      bytes = Math.round((bestBw * totalSec) / 8);
    } else if (bestBw > 0) {
      bytes = Math.round((bestBw * 1440) / 8);
    } else if (bestHeight > 0) {
      const bitrates = { 1080: 2500000, 720: 1400000, 480: 750000, 360: 400000 };
      bytes = Math.round(((bitrates[bestHeight] || 1600000) * 1440) / 8);
    }

    return {
      res: bestHeight > 0 ? `${bestHeight}p` : 'Auto',
      bytes: bytes
    };
  } catch (_) {
    return { res: 'Auto', bytes: 0 };
  }
}

function resolveServerName(url) {
  const u = url.toLowerCase();
  if (u.includes('earnvids') || u.includes('earn')) return 'EARNVIDS';
  if (u.includes('playmate') || u.includes('mate')) return 'PLAYMATE';
  if (u.includes('streamwish') || u.includes('wishembed') || u.includes('wish')) return 'STREAMWISH';
  if (u.includes('filelions') || u.includes('lion')) return 'FILELIONS';
  if (u.includes('vidhide')) return 'VIDHIDE';
  if (u.includes('mp4upload')) return 'MP4UPLOAD';
  if (u.includes('sprintcdn') || u.includes('hglamioz')) return 'EARNVIDS (CDN)';
  if (u.includes('.m3u8')) return 'HLS STREAM';
  return 'DIRECT STREAM';
}

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const { url, tabId, frameId } = details;
    if (tabId < 0) return;

    const u = url.toLowerCase();

    // Filtrar recursos irrelevantes, fragmentos de transporte individuales y anuncios
    if (
      u.includes('.ts') || u.includes('.m4s') || u.includes('.key') || 
      u.includes('.css') || u.includes('.png') || u.includes('.jpg') ||
      u.includes('doubleclick') || u.includes('google') || u.includes('/ad/') ||
      u.includes('/embed/') || u.includes('/e/') || u.includes('embed.html') ||
      u.includes('/analytics') || u.includes('/ping')
    ) {
      return;
    }

    const isHls = VIDEO_STREAM_REGEX.test(url) || u.includes('.m3u8');
    const isDirect = DIRECT_VIDEO_REGEX.test(url);

    // Solo admitir flujos de vídeo
    if (!isHls && !isDirect) {
      return;
    }

    let effectiveUrl = url;
    if (/index-f\d+-[^\.]+\.m3u8/i.test(effectiveUrl)) {
      effectiveUrl = effectiveUrl.replace(/index-f\d+-[^\.]+\.m3u8/i, 'master.m3u8');
    }

    // 1. Obtener primero la URL de la página
    let pageUrl = details.initiator || '';
    try {
      const currentTab = await chrome.tabs.get(tabId);
      if (currentTab && currentTab.url) pageUrl = currentTab.url;
    } catch (_) {}

    // 2. Calcular resolución y tamaño (probe)
    let probe = { res: 'Auto', bytes: 0 };
    if (isHls) {
      probe = await inspectManifest(effectiveUrl, pageUrl);
    } else {
      try {
        const headResp = await fetch(effectiveUrl, { method: 'HEAD' });
        const cl = headResp.headers.get('content-length');
        if (cl && parseInt(cl, 10) > 0) probe.bytes = parseInt(cl, 10);
      } catch (_) {}
    }

    if (probe.res === 'Auto') {
      const urlRes = extractResolutionFromUrl(effectiveUrl);
      if (urlRes) probe.res = urlRes;
    }

    // 3. Crear el objeto con todos los datos ya resueltos
    const mediaEntry = {
      url: effectiveUrl,
      source: resolveServerName(effectiveUrl),
      resolution: probe.res,
      bytes: probe.bytes,
      pageUrl: pageUrl,
      frameId: frameId,
      timestamp: Date.now()
    };

    if (!tabMediaData[tabId]) tabMediaData[tabId] = [];
    tabMediaData[tabId].unshift(mediaEntry);

    // 4. Enviar señal al content script
    chrome.tabs.sendMessage(tabId, {
      type: 'AURION_MEDIA_DETECTED',
      media: mediaEntry,
      frameId: frameId
    }).catch(() => {});
  },
  { urls: ["<all_urls>"] }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_MEDIA_INFO') {
    sendResponse({ mediaList: tabMediaData[msg.tabId] || [] });
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') delete tabMediaData[tabId];
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaData[tabId];
});