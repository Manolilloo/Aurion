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

async function inspectManifest(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': '*/*' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { res: 'Auto', bytes: 0 };
    const text = await resp.text();

    // 1. Extraer resoluciones estándar (RESOLUTION=1920x1080)
    const resMatches = [...text.matchAll(/RESOLUTION=\d+x(\d+)/gi)];
    let bestHeight = 0;
    if (resMatches.length > 0) {
      for (const m of resMatches) {
        const h = parseInt(m[1], 10);
        if (h > bestHeight) bestHeight = h;
      }
    }

    // 2. Extraer variantes nombradas propias de Streamwish (NAME="720p", "1080p", etc.)
    if (bestHeight === 0) {
      const nameMatches = [...text.matchAll(/(?:NAME|LABEL)="?(\d{3,4})p?"?/gi)];
      for (const m of nameMatches) {
        const h = parseInt(m[1], 10);
        if (h > bestHeight) bestHeight = h;
      }
    }

    // 3. Extraer Bandwidth
    const bwMatches = [...text.matchAll(/BANDWIDTH=(\d+)/gi)];
    let bestBw = 0;
    if (bwMatches.length > 0) {
      for (const b of bwMatches) {
        const val = parseInt(b[1], 10);
        if (val > bestBw) bestBw = val;
      }
    }

    // Heurística de altura por bitrate si Streamwish omite la resolución explícita
    if (bestHeight === 0 && bestBw > 0) {
      if (bestBw >= 2800000) bestHeight = 1080;
      else if (bestBw >= 1400000) bestHeight = 720;
      else if (bestBw >= 700000) bestHeight = 480;
      else if (bestBw >= 250000) bestHeight = 360;
    }

    // 4. Calcular duración y peso (24 min = 1440 s si el manifiesto no lista fragmentos)
    const durMatches = [...text.matchAll(/#EXTINF:([\d\.]+)/gi)];
    let totalSec = 0;
    durMatches.forEach(d => { totalSec += parseFloat(d[1]); });

    let bytes = 0;
    if (totalSec > 0 && bestBw > 0) {
      bytes = Math.round((bestBw * totalSec) / 8);
    } else if (bestBw > 0) {
      bytes = Math.round((bestBw * 1440) / 8);
    } else if (bestHeight > 0) {
      const bitrates = { 1080: 2800000, 720: 1600000, 480: 800000, 360: 450000 };
      const estBw = bitrates[bestHeight] || 1600000;
      bytes = Math.round((estBw * 1440) / 8);
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

    // Descartar fragmentos, anuncios y archivos de código/scripts que confunden a Streamwish
    if (url.includes('.ts') || url.includes('.m4s') || url.includes('.key') || 
        url.includes('.js') || url.includes('.css') || url.includes('/player/') ||
        url.includes('doubleclick') || url.includes('google') || url.includes('/ad/')) {
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

    let probe = { res: 'Auto', bytes: 0 };
    if (url.includes('.m3u8')) {
      probe = await inspectManifest(url);
    }

    if (probe.res === 'Auto') {
      const urlRes = extractResolutionFromUrl(url);
      if (urlRes) probe.res = urlRes;
    }

    // BLINDAJE ANTIDEGRADACIÓN: Si ya hay una calidad detectada superior (ej. 1080p),
    // ninguna petición secundaria menor (480p/360p) la rebajará
    const lastEntry = tabMediaData[tabId] ? tabMediaData[tabId][0] : null;
    if (lastEntry && lastEntry.resolution && lastEntry.resolution !== 'Auto') {
      const currentH = parseInt(probe.res, 10) || 0;
      const prevH = parseInt(lastEntry.resolution, 10) || 0;
      if (prevH > currentH) {
        probe.res = lastEntry.resolution;
        if (probe.bytes === 0) probe.bytes = lastEntry.bytes;
      }
    }

    const mediaEntry = {
      url: url,
      source: sourceName,
      resolution: probe.res,
      bytes: probe.bytes,
      frameId: frameId,
      timestamp: Date.now()
    };

    const existIdx = tabMediaData[tabId].findIndex(item => item.url === url);
    if (existIdx > -1) {
      tabMediaData[tabId][existIdx] = mediaEntry;
    } else {
      tabMediaData[tabId].unshift(mediaEntry);
    }

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
    const list = tabMediaData[msg.tabId] || [];
    sendResponse({ mediaList: list });
  } else if (msg.type === 'UPDATE_MEDIA_RESOLUTION') {
    const list = tabMediaData[msg.tabId];
    if (list && list[0] && msg.resolution && msg.resolution !== 'Auto') {
      const currentH = parseInt(msg.resolution, 10) || 0;
      const prevH = parseInt(list[0].resolution, 10) || 0;
      if (currentH >= prevH) {
        list[0].resolution = msg.resolution;
      }
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