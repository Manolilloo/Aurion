const tabMediaData = {};
const processedTabUrls = {};

const VIDEO_STREAM_REGEX = /\.(m3u8|mpd)(\?|$)|[\/=](playlist|master|manifest|chunklist|index-f\d+)[^\/]*\.(m3u8|txt|mpd|urlset)/i;
const DIRECT_VIDEO_REGEX = /\.(mp4|webm|mkv)(\?|$)|\/get_video\?|\/dl\?.*mime=video|\/videoplayback\?/i;

const IGNORED_PATTERNS = [
  '.ts', '.m4s', '.aac', '.vtt', '.srt', '.key', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff',
  'doubleclick', 'googlesyndication', 'google-analytics', '/ad/', '/ads/', 'popads', 'exoclick',
  '/embed/', '/e/', 'embed.html', '/analytics', '/ping', 'vast.xml', 'preroll'
];

function shouldIgnoreUrl(url) {
  const u = url.toLowerCase();
  if (u.startsWith('blob:') || u.startsWith('data:') || u.includes('127.0.0.1:6800')) return true;
  if (/\.(ts|m4s)(\?|$)/i.test(u)) return true;
  return IGNORED_PATTERNS.some(p => u.includes(p));
}

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

function resolveServerName(url) {
  const u = url.toLowerCase();
  if (u.includes('streamwish') || u.includes('wishembed') || u.includes('wish')) return 'STREAMWISH';
  if (u.includes('filelions') || u.includes('lion')) return 'FILELIONS';
  if (u.includes('vidhide') || u.includes('peytone') || u.includes('ryderjet')) return 'VIDHIDE';
  if (u.includes('voe.sx') || u.includes('voe') || u.includes('launchrelay')) return 'VOE';
  if (u.includes('mp4upload')) return 'MP4UPLOAD';
  if (u.includes('streamtape') || u.includes('tapecontent')) return 'STREAMTAPE';
  if (u.includes('dood') || u.includes('d000d') || u.includes('ds2play')) return 'DOODSTREAM';
  if (u.includes('yourupload') || u.includes('vidcache')) return 'YOURUPLOAD';
  if (u.includes('ok.ru') || u.includes('okcdn') || u.includes('odnoklassniki')) return 'OKRU';
  if (u.includes('filemoon') || u.includes('moon') || u.includes('kerapoxy')) return 'FILEMOON';
  if (u.includes('lulustream') || u.includes('luluvdo')) return 'LULUSTREAM';
  if (u.includes('vidguard') || u.includes('vgfplay') || u.includes('listeamed')) return 'VIDGUARD';
  if (u.includes('mixdrop') || u.includes('mixdrp')) return 'MIXDROP';
  if (u.includes('fastream')) return 'FASTREAM';
  if (u.includes('uqload')) return 'UQLOAD';
  if (u.includes('upstream')) return 'UPSTREAM';
  if (u.includes('fembed') || u.includes('femax')) return 'FEMBED';
  if (u.includes('burstcloud')) return 'BURSTCLOUD';
  if (u.includes('pixeldrain')) return 'PIXELDRAIN';
  if (u.includes('gofile')) return 'GOFILE';
  if (u.includes('earnvids') || u.includes('sprintcdn') || u.includes('hglamioz')) return 'EARNVIDS';
  if (u.includes('playmate')) return 'PLAYMATE';
  if (u.includes('vixeo')) return 'VIXEO';
  if (u.includes('.m3u8')) return 'HLS STREAM';
  return 'DIRECT MP4';
}

async function inspectManifest(url, refererUrl = '') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const headers = { 'Accept': '*/*' };
    if (refererUrl) {
      try {
        const u = new URL(refererUrl);
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

async function registerDetectedStream(tabId, frameId, rawUrl, initiator = '', knownBytes = 0, isHlsHint = false) {
  if (tabId < 0 || shouldIgnoreUrl(rawUrl)) return;

  // Forzar master.m3u8 para desbloquear siempre la pista 1080p de máxima velocidad
  let effectiveUrl = rawUrl;
  if (/index-f\d+-[^\.]+\.m3u8/i.test(effectiveUrl)) {
    effectiveUrl = effectiveUrl.replace(/index-f\d+-[^\.]+\.m3u8/i, 'master.m3u8');
  }

  if (!processedTabUrls[tabId]) processedTabUrls[tabId] = new Set();
  if (processedTabUrls[tabId].has(effectiveUrl)) return;
  processedTabUrls[tabId].add(effectiveUrl);

  let pageUrl = initiator || '';
  try {
    const currentTab = await chrome.tabs.get(tabId);
    if (!pageUrl && currentTab && currentTab.url) pageUrl = currentTab.url;
  } catch (_) {}

  const isHls = isHlsHint || VIDEO_STREAM_REGEX.test(effectiveUrl) || effectiveUrl.toLowerCase().includes('.m3u8');
  let probe = { res: 'Auto', bytes: knownBytes || 0 };

  if (isHls) {
    const mProbe = await inspectManifest(effectiveUrl, initiator || pageUrl);
    if (mProbe.res !== 'Auto') probe.res = mProbe.res;
    if (mProbe.bytes > 0) probe.bytes = mProbe.bytes;
  } else if (probe.bytes === 0) {
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

  if (!tabMediaData[tabId]) tabMediaData[tabId] = [];

  const mediaEntry = {
    url: effectiveUrl,
    source: resolveServerName(effectiveUrl),
    resolution: probe.res,
    bytes: probe.bytes,
    pageUrl: initiator || pageUrl,
    frameId: frameId,
    timestamp: Date.now()
  };

  tabMediaData[tabId] = [mediaEntry, ...tabMediaData[tabId].filter(x => x.url !== effectiveUrl)].slice(0, 12);

  chrome.tabs.sendMessage(tabId, {
    type: 'AURION_MEDIA_DETECTED',
    media: mediaEntry,
    mediaList: tabMediaData[tabId],
    frameId: frameId
  }).catch(() => {});
}

// CAPA 1: Patrones directos en URL
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId, frameId, initiator } = details;
    if (tabId < 0 || shouldIgnoreUrl(url)) return;

    const u = url.toLowerCase();
    const isHls = VIDEO_STREAM_REGEX.test(url) || u.includes('.m3u8');
    const isDirect = DIRECT_VIDEO_REGEX.test(url);

    if (isHls || isDirect) {
      registerDetectedStream(tabId, frameId, url, initiator, 0, isHls);
    }
  },
  { urls: ["<all_urls>"] }
);

// CAPA 2: Inspección de cabeceras MIME
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { url, tabId, frameId, initiator, responseHeaders } = details;
    if (tabId < 0 || !responseHeaders || shouldIgnoreUrl(url)) return;

    let contentType = '';
    let contentLength = 0;

    for (const h of responseHeaders) {
      const name = (h.name || '').toLowerCase();
      if (name === 'content-type') contentType = (h.value || '').toLowerCase();
      else if (name === 'content-length') contentLength = parseInt(h.value || '0', 10) || 0;
      else if (name === 'content-range' && h.value && h.value.includes('/')) {
        const total = parseInt(h.value.split('/').pop(), 10);
        if (total > contentLength) contentLength = total;
      }
    }

    const isHlsMime = contentType.includes('mpegurl') || contentType.includes('vnd.apple.mpegurl') || contentType.includes('x-mpegurl');
    const isVideoMime = contentType.startsWith('video/mp4') || contentType.startsWith('video/webm') || contentType.startsWith('video/x-matroska');
    const isLargeBinaryVideo = (contentType === 'application/octet-stream' && contentLength > 10 * 1024 * 1024);

    if (isHlsMime || (isVideoMime && contentLength > 1500 * 1024) || isLargeBinaryVideo) {
      registerDetectedStream(tabId, frameId, url, initiator, contentLength, isHlsMime);
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_MEDIA_INFO') {
    sendResponse({ mediaList: tabMediaData[msg.tabId] || [] });
  } else if (msg.type === 'DOM_VIDEO_SRC_FOUND' && sender.tab) {
    registerDetectedStream(sender.tab.id, sender.frameId || 0, msg.url, msg.frameUrl, 0, msg.url.includes('.m3u8'));
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    delete tabMediaData[tabId];
    delete processedTabUrls[tabId];
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaData[tabId];
  delete processedTabUrls[tabId];
});