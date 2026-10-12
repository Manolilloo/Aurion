/**
 * Aurion - Módulo Extension Bridge
 * Gestiona la recepción de transmisiones desde la extensión Chromium (puerto 6800),
 * cálculo heurístico de coincidencias y modal de confirmación / rescate.
 */

window.ExtensionBridgeModule = (function () {
  let pendingTransmission = null;
  let modalTargetMode = 'anime';

  function init() {
    bindModalControls();
  }

  function calculateWordMatchScore(query, candidateTitle) {
    // Ignorar palabras genéricas de temporada y numeraciones para comparar la raíz del anime
    const stopWords = new Set(['season', 'temporada', 'final', 'the', 'no', 'de', 'la', 'el', 'part', 'parte', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w && !stopWords.has(w));
    
    const qWords = normalize(query);
    const cWords = normalize(candidateTitle);

    if (qWords.length === 0 || cWords.length === 0) return 0;

    let common = 0;
    qWords.forEach(w => {
      if (cWords.includes(w)) common++;
    });

    return common / Math.max(qWords.length, cWords.length);
  }

  function extractSearchQuery(rawTitle, rawUrl = '') {
    let text = rawTitle || '';

    // Rescate de temporada antes de cualquier limpieza
    let seasonTag = '';
    const fullSource = `${text} ${rawUrl}`;
    const sMatch = fullSource.match(/(?:(?:temporada|season)\s*(\d+))|(?:\b(\d{1,2})[xX]\d+)|(?:\bS(\d{1,2})\b)/i);
    const isFinalSeason = /final\s*season|temporada\s*final/i.test(fullSource);

    if (isFinalSeason) {
      seasonTag = 'FINAL SEASON';
    } else if (sMatch) {
      const sNum = parseInt(sMatch[1] || sMatch[2] || sMatch[3], 10);
      if (sNum > 1) {
        seasonTag = `Season ${sNum}`;
      }
    }

    const isHash = /^[a-zA-Z0-9_\-]{6,30}$/.test(text.trim());
    const isGeneric = !text || text.trim().length < 3 || text.trim().toLowerCase() === 'episodio';

    if ((isGeneric || isHash) && rawUrl && typeof rawUrl === 'string') {
      try {
        const urlObj = new URL(rawUrl);
        const match = urlObj.pathname.match(/(?:episodio|ver|watch)\/([a-zA-Z0-9\-]+)/i);
        if (match) {
          text = match[1].replace(/-(?:cap|ep|episodio)?-?\d+.*$/i, '').replace(/[-_]+/g, ' ');
        } else {
          const segments = urlObj.pathname.split('/').filter(Boolean);
          let slug = segments[segments.length - 1] || segments[0] || '';
          slug = slug.replace(/^ver[-_]/i, '').replace(/[-_](cap|episodio|episode)[-_]?\d+.*$/i, '').replace(/[-_]\d+$/, '');
          if (slug && slug.length > 3 && !slug.includes('.') && !/^[a-zA-Z0-9_\-]{6,30}$/.test(slug)) {
            text = slug.replace(/[-_]/g, ' ');
          }
        }
      } catch (e) {}
    }

    let cleaned = text
      .replace(/^(Ver|Watch|Descargar|Download)\s+/i, '')
      .replace(/\b(sub\s*español|castellano|latino|dual|audio|hd|fhd|1080p|720p|online)\b.*/gi, '')
      .replace(/\s*-\s*(?:Ep|Cap|Episodio|Capitulo)\s*\d+.*$/i, '')
      .replace(/\b(capitulo|capítulo|episodio|episode|cap)\b[\s\-_]*\d*.*/gi, '')
      .replace(/[\(\[\{].*?[\)\]\}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Si detectamos temporada específica y no está en el nombre limpio, incorporarla a la consulta
    if (seasonTag && !new RegExp(seasonTag.replace(' ', '\\s*'), 'i').test(cleaned)) {
      cleaned = `${cleaned} ${seasonTag}`.trim();
    }

    return cleaned;
  }

  function extractEpisodeNumber(rawText) {
    if (!rawText) return 1;

    const capMatch = rawText.match(/(?:episodio|episode|capitulo|capítulo|cap|ep)[\s\.\-_]*(\d{1,4})/i);
    if (capMatch) return parseInt(capMatch[1], 10);

    const seMatch = rawText.match(/\d{1,2}[xX](\d{1,4})/i);
    if (seMatch) return parseInt(seMatch[1], 10);

    const endMatch = rawText.match(/[-_\/](\d{1,4})(?:\/|\?|$|\.html)/i);
    if (endMatch) return parseInt(endMatch[1], 10);

    return 1;
  }

  function showMatchModal(proposedItem, rawData, detectedEp) {
    const backdrop = document.getElementById('match-modal-backdrop');
    const thumb = document.getElementById('modal-prop-thumb');
    const titleEl = document.getElementById('modal-prop-title');
    const metaEl = document.getElementById('modal-prop-meta');
    const manualSection = document.getElementById('modal-manual-section');

    if (manualSection) manualSection.classList.remove('open');

    pendingTransmission = {
      proposed: proposedItem,
      raw: rawData,
      ep: detectedEp
    };

    if (titleEl) titleEl.innerText = proposedItem.title;
    if (metaEl) metaEl.innerText = proposedItem.meta || 'Coincidencia estimada';
    if (thumb) thumb.style.backgroundImage = proposedItem.image ? `url('${proposedItem.image}')` : 'none';

    if (typeof window.playSynth === 'function') window.playSynth('chord');
    if (backdrop) backdrop.classList.add('active');
  }

  function closeMatchModal() {
    const backdrop = document.getElementById('match-modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    pendingTransmission = null;
  }

  function commitTransmission(chosenItem, targetMode, episodeNum) {
    try {
      if (window.currentMode !== targetMode && typeof window.setAppMode === 'function') {
        window.setAppMode(targetMode, true);
      }

      const rawData = (pendingTransmission && pendingTransmission.raw) ? pendingTransmission.raw : {};
      const fullText = (rawData.page_title || '') + ' ' + (rawData.page_url || '') + ' ' + (chosenItem.title || '');
      const detectedSeason = typeof window.extractSeasonNumber === 'function' ? window.extractSeasonNumber(fullText) : 1;

      if (targetMode === 'anime') {
        if (typeof window.setStepperValue === 'function') window.setStepperValue('cfg-season', detectedSeason, 0);
        if (typeof window.updateSingleSeasonState === 'function') window.updateSingleSeasonState(detectedSeason);
      }

      if (typeof window.expandCenterWorkspace === 'function') window.expandCenterWorkspace();
      if (typeof window.updatePoster === 'function') window.updatePoster(chosenItem.image, chosenItem.title, chosenItem.meta);

      const state = window.modeStates[targetMode];
      state.title = chosenItem.title;
      state.tags = chosenItem.meta || 'SISTEMA LISTO';
      state.bg = chosenItem.image ? `url('${chosenItem.image}')` : 'none';

      if (chosenItem.image && window.pywebview && window.pywebview.api && window.pywebview.api.get_dominant_colors) {
        window.pyCall('get_dominant_colors', chosenItem.image).then(pal => {
          if (pal && pal.accent1 && typeof window.applyDynamicPalette === 'function') {
            window.applyDynamicPalette(pal.accent1, pal.accent2);
          }
        });
      } else if (chosenItem.color && typeof window.applyDynamicPalette === 'function') {
        window.applyDynamicPalette(chosenItem.color, '#8a2be2');
      }

      let fileName = chosenItem.title;
      if (targetMode === 'anime') {
        let epVal = episodeNum || state.startEp || 1;

        const existingEps = state.queue.map(t => {
          const m = t.title.match(/ - Ep (\d+)/i);
          return m ? parseInt(m[1], 10) : null;
        }).filter(n => n !== null);

        if (existingEps.includes(epVal)) {
          epVal = Math.max(...existingEps) + 1;
        }

        fileName = `${chosenItem.title} - Ep ${epVal}`;
        if (typeof window.setStepperValue === 'function') window.setStepperValue('cfg-start-ep', epVal + 1, 0);
      } else {
        fileName = `${chosenItem.title}`;
      }

      const streamUrl = rawData.stream_url || rawData.page_url || '';
      const incomingRes = (rawData.resolution && rawData.resolution !== 'Auto') ? rawData.resolution : 'N/D';
      const incomingBytes = (rawData.bytes && rawData.bytes > 0) ? rawData.bytes : 0;

      const task = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        title: fileName,
        url: streamUrl,
        pageUrl: rawData.page_url || '',
        status: 'En cola',
        resolution: incomingRes,
        bytes: incomingBytes,
        progress: 0,
        speed: '0 KB/s'
      };

      state.queue.push(task);
      if (typeof window.renderQueueCard === 'function') window.renderQueueCard(task);
      if (typeof window.updateTotalQueueSize === 'function') window.updateTotalQueueSize();

      if (streamUrl) {
        window.pyCall('probe_stream_metadata', task.id, streamUrl, rawData.page_url || '');
      }
    } catch (err) {
      console.error('[commitTransmission] Error al registrar transmisión:', err);
    } finally {
      closeMatchModal();
    }
  }

  async function handleLinkReceived(data) {
    const streamUrl = data.stream_url || (data.streams && data.streams[0]) || data.page_url;
    if (!streamUrl) return;

    if (window.currentMode === 'youtube' && typeof window.setAppMode === 'function') {
      window.setAppMode('anime', true);
    }

    const currentQueue = window.modeStates[window.currentMode].queue;
    if (currentQueue.some(item => item.url === streamUrl || item.pageUrl === data.page_url)) {
      return;
    }

    const fullText = (data.page_title || '') + ' ' + (data.page_url || '');
    const detectedEp = extractEpisodeNumber(fullText);
    let detectedSeason = typeof window.extractSeasonNumber === 'function' ? window.extractSeasonNumber(fullText) : 1;
    const cleanName = extractSearchQuery(data.page_title, data.page_url);

    const activeTitle = window.modeStates[window.currentMode].title;
    const state = window.modeStates[window.currentMode];
    const hasActiveAnime = Boolean(activeTitle && activeTitle !== 'Esperando consulta...');

    // Si ya tienes un anime cargado en pantalla, priorizar su temporada real sobre el "1x" falso de la web
    if (hasActiveAnime && window.currentMode === 'anime') {
      const activeSeasonMatch = activeTitle.match(/(?:season|temporada)\s*(\d+)|(\d+)(?:st|nd|rd|th)?\s*season/i);
      if (activeSeasonMatch) {
        detectedSeason = parseInt(activeSeasonMatch[1] || activeSeasonMatch[2], 10);
      } else if (/final\s*season/i.test(activeTitle)) {
        // En "FINAL SEASON", si la web marcaba temporada (ej: 8x5 de Boku no Hero), mantener esa temporada
        const rawSeasonMatch = fullText.match(/(?:(?:temporada|season)\s*|(\d{1,2})[xX])(\d{1,2})/i);
        if (rawSeasonMatch && (rawSeasonMatch[1] || rawSeasonMatch[2])) {
          detectedSeason = parseInt(rawSeasonMatch[1] || rawSeasonMatch[2], 10);
        }
      }
    }

    if (window.currentMode === 'anime') {
      if (typeof window.setStepperValue === 'function') window.setStepperValue('cfg-season', detectedSeason, 0);
      if (typeof window.updateSingleSeasonState === 'function') window.updateSingleSeasonState(detectedSeason);
    }

    const isSuspiciousHash = /^[a-zA-Z0-9_\-]{6,30}$/.test(cleanName.trim());
    const isGenericOrEmpty = !cleanName || cleanName.toLowerCase() === 'episodio' || cleanName.toLowerCase() === 'episode';
    const matchScore = hasActiveAnime ? calculateWordMatchScore(cleanName, activeTitle) : 0;

    // Solo es la misma serie si el título entrante realmente se parece al activo,
    // o si viene sin nombre / con hash. Si es un anime completamente distinto (ej. Blue Box vs Boku no Hero),
    // matchScore será bajo y NO entrará aquí, permitiendo detectar la nueva serie.
    const isSameSeries = hasActiveAnime && !isGenericOrEmpty && !isSuspiciousHash
      ? (matchScore >= 0.55)
      : (hasActiveAnime && (isSuspiciousHash || isGenericOrEmpty));

    if (isSameSeries) {
      if (typeof window.expandCenterWorkspace === 'function') window.expandCenterWorkspace();
      let epVal = detectedEp || state.startEp || 1;

      if (window.currentMode === 'anime') {
        const existingEps = state.queue.map(t => {
          const m = t.title.match(/ - Ep (\d+)/i);
          return m ? parseInt(m[1], 10) : null;
        }).filter(n => n !== null);

        if (existingEps.includes(epVal)) {
          epVal = Math.max(...existingEps) + 1;
        }

        if (typeof window.setStepperValue === 'function') window.setStepperValue('cfg-start-ep', epVal + 1, 0);
      }

      const fileName = window.currentMode === 'anime' ? `${activeTitle} - Ep ${epVal}` : `${activeTitle}`;
      const incomingRes = (data.resolution && data.resolution !== 'Auto') ? data.resolution : 'N/D';
      const incomingBytes = (data.bytes && data.bytes > 0) ? data.bytes : 0;

      const task = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        title: fileName,
        url: streamUrl,
        pageUrl: data.page_url,
        status: 'En cola',
        resolution: incomingRes,
        bytes: incomingBytes,
        progress: 0,
        speed: '0 KB/s'
      };

      state.queue.push(task);
      if (typeof window.renderQueueCard === 'function') window.renderQueueCard(task);
      if (typeof window.updateTotalQueueSize === 'function') window.updateTotalQueueSize();
      window.pyCall('probe_stream_metadata', task.id, streamUrl, data.page_url);
      return;
    }

    let bestProposal = { title: cleanName, image: '', meta: 'Sin carátula disponible' };
    try {
      const list = await window.pyCall('search_media', window.currentMode, cleanName);
      if (list && list.length > 0) {
        let maxScore = -1;
        const targetSeasonStr = detectedSeason > 1 ? `${detectedSeason}` : '';

        list.forEach(item => {
          let sc = calculateWordMatchScore(cleanName, item.title);
          const itemTitleLower = (item.title || '').toLowerCase();

          // Bonificación si el elemento contiene explícitamente el número de temporada buscado
          if (targetSeasonStr) {
            if (itemTitleLower.includes(`season ${targetSeasonStr}`) ||
                itemTitleLower.includes(`temporada ${targetSeasonStr}`) ||
                itemTitleLower.includes(` ${targetSeasonStr}`) ||
                new RegExp(`\\b${targetSeasonStr}\\b`).test(itemTitleLower)) {
              sc += 0.5;
            }
          }

          // Bonificación para Final Season
          if (/final\s*season/i.test(cleanName) && itemTitleLower.includes('final season')) {
            sc += 0.6;
          }

          if (sc > maxScore) {
            maxScore = sc;
            bestProposal = item;
          }
        });
      }
    } catch (e) {}

    // Bloqueo final de seguridad: nunca mostrar modal si el candidato es un hash ininteligible
    if (/^[a-zA-Z0-9_\-]{6,30}$/.test(bestProposal.title.trim())) {
      if (hasActiveAnime) {
        bestProposal.title = activeTitle;
      } else {
        return;
      }
    }

    modalTargetMode = window.currentMode;
    showMatchModal(bestProposal, data, detectedEp);
  }

  function bindModalControls() {
    document.getElementById('modal-btn-dismiss')?.addEventListener('click', closeMatchModal);

    document.getElementById('modal-btn-confirm')?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      if (pendingTransmission && pendingTransmission.proposed) {
        commitTransmission(pendingTransmission.proposed, modalTargetMode, pendingTransmission.ep);
      } else {
        closeMatchModal();
      }
    });

    const manualSection = document.getElementById('modal-manual-section');
    document.getElementById('modal-btn-show-search')?.addEventListener('click', () => {
      if (manualSection) manualSection.classList.toggle('open');
    });

    const mAnime = document.getElementById('modal-mode-anime');
    const mMovie = document.getElementById('modal-mode-movie');
    const mContainer = document.getElementById('modal-switch-container');

    function setModalMode(mode) {
      modalTargetMode = mode;
      if (mContainer) {
        mContainer.classList.remove('mode-anime', 'mode-movie');
        mContainer.classList.add(`mode-${mode}`);
      }
      if (mode === 'movie') {
        mAnime?.classList.remove('active');
        mMovie?.classList.add('active');
      } else {
        mMovie?.classList.remove('active');
        mAnime?.classList.add('active');
      }
      if (mSearch && mSearch.value.trim().length >= 2) {
        mSearch.dispatchEvent(new Event('input'));
      }
    }

    mAnime?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      setModalMode('anime');
    });
    mMovie?.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('click');
      setModalMode('movie');
    });

    const mSearch = document.getElementById('modal-search-input');
    const mSugg = document.getElementById('modal-suggestions');
    let mTimer;
    let activeModalSuggIndex = -1;

    function updateModalSelectedSuggestion(items) {
      items.forEach((item, idx) => {
        if (idx === activeModalSuggIndex) {
          item.classList.add('selected');
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          item.classList.remove('selected');
        }
      });
    }

    if (mSearch && mSugg) {
      mSearch.addEventListener('input', () => {
        clearTimeout(mTimer);
        activeModalSuggIndex = -1;
        const q = mSearch.value.trim();
        if (q.length < 2) {
          mSugg.classList.remove('active');
          mSugg.innerHTML = '';
          return;
        }
        mTimer = setTimeout(async () => {
          mSugg.innerHTML = '';
          const list = await window.pyCall('search_media', modalTargetMode, q);
          if (list && list.length > 0) {
            list.forEach(item => {
              const div = document.createElement('div');
              div.className = 'sugg-item';
              div.innerHTML = `
                <div class="sugg-thumb" style="background-image: url('${item.image}');"></div>
                <div class="sugg-info">
                  <div class="sugg-title">${item.title}</div>
                  <div class="sugg-meta">${item.meta}</div>
                </div>
              `;
              div.addEventListener('click', () => {
                commitTransmission(item, modalTargetMode, pendingTransmission?.ep || 1);
              });
              mSugg.appendChild(div);
            });
            mSugg.classList.add('active');
          } else {
            mSugg.classList.remove('active');
          }
        }, 150);
      });

      mSearch.addEventListener('keydown', (e) => {
        const items = mSugg.querySelectorAll('.sugg-item');
        if (!mSugg.classList.contains('active') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeModalSuggIndex = (activeModalSuggIndex + 1) % items.length;
          updateModalSelectedSuggestion(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeModalSuggIndex = (activeModalSuggIndex - 1 + items.length) % items.length;
          updateModalSelectedSuggestion(items);
        } else if (e.key === 'Enter') {
          if (activeModalSuggIndex >= 0 && items[activeModalSuggIndex]) {
            e.preventDefault();
            items[activeModalSuggIndex].click();
          }
        } else if (e.key === 'Escape') {
          mSugg.classList.remove('active');
          activeModalSuggIndex = -1;
        }
      });
    }
  }

  return {
    init,
    handleLinkReceived
  };
})();