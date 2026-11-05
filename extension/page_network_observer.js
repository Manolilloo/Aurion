/*
 * Observe manifest requests made by player code in the page's main JavaScript world.
 * The isolated content script receives only validated manifest URL/MIME hints.
 */
(() => {
  const installedFlag = '__aurionManifestObserverV1__';
  if (window[installedFlag]) return;

  try {
    Object.defineProperty(window, installedFlag, {
      value: true,
      configurable: false
    });
  } catch (_) {
    window[installedFlag] = true;
  }

  const MESSAGE_SOURCE = 'aurion-main-world';
  const MESSAGE_TYPE = 'AURION_MANIFEST_RESOURCE';

  function getRequestUrl(input) {
    try {
      if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    } catch (_) {}
    return String(input || '');
  }

  function reportManifest(rawUrl, contentType = '') {
    try {
      const parsed = new URL(String(rawUrl || ''), window.location.href);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;

      const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
      const isManifestUrl = /\.(?:mpd|m3u8)$/i.test(parsed.pathname);
      const isManifestMime = mime.includes('dash+xml') || mime.includes('mpegurl');
      if (!isManifestUrl && !isManifestMime) return;

      window.postMessage({
        source: MESSAGE_SOURCE,
        type: MESSAGE_TYPE,
        url: parsed.href,
        contentType: mime
      }, '*');
    } catch (_) {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (...args) {
      const requestUrl = getRequestUrl(args[0]);
      const result = Reflect.apply(originalFetch, this, args);

      try {
        Promise.resolve(result).then((response) => {
          if (!response || response.ok === false) return;

          let contentType = '';
          try {
            contentType = response.headers?.get?.('content-type') || '';
          } catch (_) {}

          reportManifest(response.url || requestUrl, contentType);
        }).catch(() => {});
      } catch (_) {}

      return result;
    };
  }

  try {
    const prototype = XMLHttpRequest.prototype;
    const originalOpen = prototype.open;
    const originalSend = prototype.send;
    const requestUrls = new WeakMap();

    prototype.open = function (method, url, ...args) {
      requestUrls.set(this, getRequestUrl(url));
      return Reflect.apply(originalOpen, this, [method, url, ...args]);
    };

    prototype.send = function (...args) {
      const request = this;
      try {
        request.addEventListener('loadend', () => {
          if (request.status < 200 || request.status >= 300) return;

          let contentType = '';
          try {
            contentType = request.getResponseHeader('content-type') || '';
          } catch (_) {}

          reportManifest(request.responseURL || requestUrls.get(request), contentType);
        }, { once: true });
      } catch (_) {}

      return Reflect.apply(originalSend, this, args);
    };
  } catch (_) {}
})();
