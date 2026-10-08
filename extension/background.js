const tabMediaData = {};

const DIRECT_VIDEO_REGEX = /\.(m3u8|mp4|webm|mpd)(\?|$)/i;

const VERIFIED_VIDEO_DOMAINS = [
  'filelions.top', 'filelions.to', 'filelions.site', 'streamwish.to', 'streamwish.com',
  'streamwish.top', 'streamwish.site', 'wishembed.pro', 'wishembed', 'vidhide.com',
  'vidhidepro.com', 'vidhidepre.com', 'streamtape.com', 'voe.sx', 'filemoon.sx',
  'filemoon.to', 'filemoon.in', 'yourupload.com', 'doodstream.com', 'dood.',
  'ds2play', 'luluvdo.com', 'lulustream.com', 'mp4upload.com', 'vidmoly.net',
  'mega.nz/embed', 'ok.ru/videoembed', 'vk.com/video_ext', 'acek-cdn.com',
  'saidochesto.top', 'uqload.io', 'uqload.to', 'waaw.to', 'netu.tv'
];

// Heurística de resolución por inspección de parámetros y slugs en URL (Streamwish, Voe, Filelions...)
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

// Analizador profundo de manifiestos HLS / M3U8
async function inspectManifest(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': '*/*' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { res: 'Auto', bytes: 0 };
    const text = await resp.text();

    // 1. Detección directa por etiqueta RESOLUTION=WxH
    const resMatches = [...text.matchAll(/RESOLUTION=\d+x(\d+)/gi)];
    let bestHeight = 0;
    if (resMatches.length > 0) {
      for (const m of resMatches) {
        const h = parseInt(m[1], 10);
        if (h > bestHeight) bestHeight = h;
      }
    }

    // 2. Detección por NAME="720p" o etiquetas de variantes en Streamwish
    if (bestHeight === 0) {
      const nameMatches = [...text.matchAll(/NAME="?(\d{3,4})p?"?/gi)];
      for (const m of nameMatches) {
        const h = parseInt(m[1], 10);
        if (h > bestHeight) bestHeight = h;
      }
    }

    // 3. Cálculo de bitrate / ancho de banda
    const bwMatches = [...text.matchAll(/BANDWIDTH=(\d+)/gi)];
    let bestBw = 0;
    if (bwMatches.length > 0) {
      for (const b of bwMatches) {
        const val = parseInt(b[1], 10);
        if (val > bestBw) bestBw = val;
      }
    }

    // 4. Estimación de resolución por ancho de banda si no está declarada la altura
    if (bestHeight === 0 && bestBw > 0) {
      if (bestBw >= 3500000) bestHeight = 1080;
      else if (bestBw >= 1800000) bestHeight = 720;
      else if (bestBw >= 800000) bestHeight = 480;
      else if (bestBw >= 300000) bestHeight = 360;
    }

    // 5. Cálculo exacto de peso total en bytes
    const durMatches = [...text.matchAll(/#EXTINF:([\d\.]+)/gi)];
    let totalSec = 0;
    durMatches.forEach(d => { totalSec += parseFloat(d[1]); });

    let bytes = 0;
    if (totalSec > 0 && bestBw > 0) {
      bytes = Math.round((bestBw * totalSec) / 8);
    }

    return {
      res: bestHeight > 0 ? `${bestHeight}p` : 'Auto',
      bytes: bytes
    };
  } catch (e) {
    return { res: 'Auto', bytes: 0 };
  }
}

function resolveServerName(url) {
  const u = url.toLowerCase();
  if (u.includes('streamwish') || u.includes('wishembed')) return 'STREAMWISH';
  if (u.includes('filelions')) return 'FILELIONS';
  if (u.includes('vidhide')) return 'VIDHIDE';
  if (u.includes('streamtape')) return 'STREAMTAPE';
  if (u.includes('voe.sx')) return 'VOE';
  if (u.includes('filemoon')) return 'FILEMOON';
  if (u.includes('yourupload')) return 'YOURUPLOAD';
  if (u.includes('dood')) return 'DOODSTREAM';
  if (u.includes('mp4upload')) return 'MP4UPLOAD';
  if (u.includes('vidmoly')) return 'VIDMOLY';
  if (u.includes('uqload')) return 'UQLOAD';
  if (u.includes('acek-cdn')) return 'ACEK (HLS)';
  if (u.includes('.m3u8')) return 'HLS (m3u8)';
  return 'STREAM DIRECTO';
}

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const { url, tabId, frameId } = details;
    if (tabId < 0) return;

    // Descartar fragmentos o peticiones que no sean el flujo maestro
    if (url.includes('.ts') || url.includes('.m4s') || url.includes('.key') || url.includes('doubleclick') || url.includes('google') || url.includes('/ad/')) {
      return;
    }

    let isMatch = false;
    let sourceName = resolveServerName(url);

    if (DIRECT_VIDEO_REGEX.test(url)) {
      isMatch = true;
    } else {
      for (const domain of VERIFIED_VIDEO_DOMAINS) {
        if (url.includes(domain)) {
          isMatch = true;
          break;
        }
      }
    }

    if (!isMatch) return;

    if (!tabMediaData[tabId]) tabMediaData[tabId] = [];

    // Inspección de manifiesto
    let probe = { res: 'Auto', bytes: 0 };
    if (url.includes('.m3u8')) {
      probe = await inspectManifest(url);
    }

    // Si el manifiesto devolvió 'Auto', recurrir al escaneo de URL heurístico de Streamwish/Filelions
    if (probe.res === 'Auto') {
      const urlRes = extractResolutionFromUrl(url);
      if (urlRes) probe.res = urlRes;
    }

    const mediaEntry = {
      url: url,
      source: sourceName,
      resolution: probe.res,
      bytes: probe.bytes,
      frameId: frameId,
      timestamp: Date.now()
    };

    // Actualización reactiva sin duplicados
    const existIdx = tabMediaData[tabId].findIndex(item => item.url === url);
    if (existIdx > -1) {
      tabMediaData[tabId][existIdx] = mediaEntry;
    } else {
      tabMediaData[tabId].unshift(mediaEntry);
    }

    // Transmitir inmediatamente la detección dopada a la pestaña
    chrome.tabs.sendMessage(tabId, {
      type: 'AURION_MEDIA_DETECTED',
      media: mediaEntry,
      frameId: frameId
    }).catch(() => {});
  },
  { urls: ["<all_urls>"] }
);

// Canal de respuesta para el popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_MEDIA_INFO') {
    const list = tabMediaData[msg.tabId] || [];
    sendResponse({ mediaList: list });
  } else if (msg.type === 'UPDATE_MEDIA_RESOLUTION') {
    // Si el content script detecta resolución nativa por etiqueta <video>, sincronizarla en el background
    const list = tabMediaData[msg.tabId];
    if (list && list[0] && msg.resolution && msg.resolution !== 'Auto') {
      list[0].resolution = msg.resolution;
    }
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    delete tabMediaData[tabId];
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaData[tabId];
});