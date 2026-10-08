const tabMediaData = {};

const DIRECT_VIDEO_REGEX = /\.(m3u8|mp4|webm|mpd)(\?|$)/i;

const VERIFIED_VIDEO_DOMAINS = [
  'streamtape.com', 'voe.sx', 'filemoon.sx', 'filemoon.to', 'filemoon.in',
  'yourupload.com', 'doodstream.com', 'dood.', 'ds2play', 'streamwish.to',
  'streamwish.com', 'streamwish.top', 'wishembed', 'luluvdo.com', 'lulustream.com',
  'mp4upload.com', 'vidmoly.net', 'mega.nz/embed', 'ok.ru/videoembed', 'vk.com/video_ext'
];

// Comprobar si la URL parece un master playlist (contiene todas las calidades)
function isMasterManifest(url) {
  const u = url.toLowerCase();
  return u.includes('master.m3u8') || u.includes('playlist.m3u8') || (!u.includes('-v1') && !u.includes('/720') && !u.includes('/480') && !u.includes('/360'));
}

async function inspectManifest(url) {
  try {
    const resp = await fetch(url, { method: 'GET', headers: { 'Accept': '*/*' } });
    if (!resp.ok) return { res: 'Auto', bytes: 0 };
    const text = await resp.text();

    // Buscar la máxima resolución declarada en el master
    const resMatches = [...text.matchAll(/RESOLUTION=\d+x(\d+)/gi)];
    let bestHeight = 0;
    if (resMatches.length > 0) {
      for (const m of resMatches) {
        const h = parseInt(m[1], 10);
        if (h > bestHeight) bestHeight = h;
      }
    }

    const bwMatches = [...text.matchAll(/BANDWIDTH=(\d+)/gi)];
    let bestBw = 0;
    if (bwMatches.length > 0) {
      for (const b of bwMatches) {
        const val = parseInt(b[1], 10);
        if (val > bestBw) bestBw = val;
      }
    }

    const durMatches = [...text.matchAll(/#EXTINF:([\d\.]+)/gi)];
    let totalSec = 0;
    durMatches.forEach(d => { totalSec += parseFloat(d[1]); });

    let bytes = 0;
    if (totalSec > 0 && bestBw > 0) {
      bytes = Math.round((bestBw * totalSec) / 8);
    } else {
      // Si el m3u8 no expone fragmentos ni duración previa, no asumir 24 minutos inventados
      bytes = 0;
    }

    return {
      res: bestHeight > 0 ? `${bestHeight}p` : 'Auto',
      bytes: bytes
    };
  } catch (e) {
    return { res: 'Auto', bytes: 0 };
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const { url, tabId } = details;
    if (tabId < 0) return;

    // Descartar fragmentos, audio o anuncios
    if (url.includes('.ts') || url.includes('.m4s') || url.includes('.key') || url.includes('doubleclick') || url.includes('google')) {
      return;
    }

    let isMatch = false;
    let sourceName = 'Vídeo Directo';

    if (DIRECT_VIDEO_REGEX.test(url)) {
      isMatch = true;
      sourceName = url.includes('.m3u8') ? 'HLS (m3u8)' : 'MP4';
    } else {
      for (const domain of VERIFIED_VIDEO_DOMAINS) {
        if (url.includes(domain)) {
          isMatch = true;
          sourceName = domain.split('.')[0].toUpperCase();
          break;
        }
      }
    }

    if (!isMatch) return;

    if (!tabMediaData[tabId]) tabMediaData[tabId] = [];

    // Si ya tenemos una URL para este host o es un subfragmento, no acumular
    const alreadyExists = tabMediaData[tabId].some(item => item.url === url);
    if (alreadyExists) return;

    let probe = { res: 'Auto', bytes: 0 };
    if (url.includes('.m3u8')) {
      probe = await inspectManifest(url);
    }

    const mediaEntry = {
      url: url,
      source: sourceName,
      resolution: probe.res,
      bytes: probe.bytes,
      isMaster: isMasterManifest(url),
      timestamp: Date.now()
    };

    // Si encontramos un master playlist, lo colocamos como principal para priorizar máxima calidad
    if (mediaEntry.isMaster) {
      tabMediaData[tabId].unshift(mediaEntry);
    } else {
      tabMediaData[tabId].push(mediaEntry);
    }

    // Seleccionamos el mejor candidato (el master con mayor resolución)
    const bestMedia = tabMediaData[tabId].find(m => m.isMaster) || tabMediaData[tabId][0];

    chrome.tabs.sendMessage(tabId, {
      type: 'AURION_MEDIA_DETECTED',
      media: bestMedia,
      total: 1 // Forzamos 1 para mostrar únicamente el reproductor principal relevante
    }).catch(() => {});
  },
  { urls: ["<all_urls>"] }
);

// Limpiar memoria cuando el usuario navega a otro episodio o cierra la pestaña
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    delete tabMediaData[tabId];
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabMediaData[tabId];
});