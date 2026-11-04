// ========================================================
// AURION • TOUR HUD MODAL YOUTUBE
// ========================================================
let currentYtTourStep = 0;
let ytTourDemoInterval = null;

const youtubeTourSteps = [
  {
    title: '1. Filtro: Vídeos o Listas de Reproducción',
    desc: 'Alterna con un clic si deseas buscar piezas individuales o listas enteras listas para descargar por bloques.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div class="chip-group" style="position: relative; width: 220px;">
          <div class="chip-glider" id="yt-demo-glider" style="width: 50%; transform: translateX(0px);"></div>
          <button class="chip-btn active" id="yt-demo-btn-v" style="flex: 1;">VÍDEOS</button>
          <button class="chip-btn" id="yt-demo-btn-p" style="flex: 1;">LISTAS</button>
        </div>
      `;
      const glider = container.querySelector('#yt-demo-glider');
      const btnV = container.querySelector('#yt-demo-btn-v');
      const btnP = container.querySelector('#yt-demo-btn-p');
      let isPl = false;
      ytTourDemoInterval = setInterval(() => {
        isPl = !isPl;
        btnV.classList.toggle('active', !isPl);
        btnP.classList.toggle('active', isPl);
        if (glider) glider.style.transform = isPl ? 'translateX(100%)' : 'translateX(0%)';
      }, 1100);
    }
  },
  {
    title: '2. Invocación Instantánea y Enlaces Directos',
    desc: 'Teclea el nombre del vídeo, creador o pega cualquier URL completa de YouTube. Los vídeos aparecen de inmediato con su miniatura, duración y autor.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div class="yt-video-card" style="pointer-events: none; width: 100%; margin: 0;">
          <div class="yt-thumb-box">
            <img class="yt-thumb-img" src="https://i.ytimg.com/vi/D_T7Ocz9RWA/mqdefault.jpg" alt="Thumbnail">
            <span class="yt-duration-badge">28:14</span>
          </div>
          <div class="yt-video-details">
            <span class="yt-video-title">¡¡HUECOS CON SORPRESAS ESPECIAL DANIREP!! - GTA 5 ONLINE</span>
            <div class="yt-video-channel">
              <button class="yt-video-channel-btn">
                <span class="yt-channel-btn-icon">📺</span>
                <span>DaniRep | +6 Vídeos Diarios De GTA 5 Online!</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }
  },
  {
    title: '3. Acceso a Canales y Creadores',
    desc: 'Cada tarjeta dispone de un acceso directo al creador. Al pulsarlo se despliega su cabecera panorámica, avatar oficial y todo su catálogo subido.',
    renderDemo: (container) => {
      container.innerHTML = `
        <button class="yt-video-channel-btn tour-channel-pulse" style="padding: 10px 20px; font-size: 12px; pointer-events: none;">
          <span class="yt-channel-btn-icon">📺</span>
          <span>DaniRep | +6 Vídeos Diarios De GTA 5 Online!</span>
        </button>
      `;
    }
  },
  {
    title: '4. Formatos y Calidad Máxima',
    desc: 'Elige entre VÍDEO (MP4) o AUDIO puro (MP3). El selector elástico permite fijar calidades desde MIN hasta 4K Ultra HD.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px; align-items: center; width: 100%;">
          <!-- SELECTOR DE FORMATO -->
          <div class="chip-group" id="demo-fmt-group" style="position: relative; width: 240px; height: 36px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; overflow: hidden; padding: 2px; box-sizing: border-box;">
            <div class="chip-glider" id="demo-fmt-glider" style="position: absolute; top: 2px; left: 2px; width: calc(50% - 2px); height: calc(100% - 4px); transform: translateX(0%); background: var(--color-accent-1); border-radius: 6px; z-index: 1; transition: transform 0.25s ease;"></div>
            <button class="chip-btn active" data-val="video" style="flex: 1; z-index: 2; position: relative; color: #ffffff !important; font-weight: 800; background: none; border: none;">VÍDEO (MP4)</button>
            <button class="chip-btn" data-val="audio" style="flex: 1; z-index: 2; position: relative; color: #94a3b8 !important; font-weight: 800; background: none; border: none;">AUDIO (MP3)</button>
          </div>

          <!-- SELECTOR DE CALIDADES -->
          <div class="chip-group yt-chips-resolutions" id="demo-res-group" style="position: relative; width: 320px; height: 36px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; overflow: hidden; padding: 2px; box-sizing: border-box;">
            <div class="chip-glider" id="demo-res-glider" style="position: absolute; top: 2px; left: 2px; width: calc(25% - 2px); height: calc(100% - 4px); transform: translateX(0%); background: var(--color-accent-1); border-radius: 6px; z-index: 1; transition: transform 0.22s ease;"></div>
            <button class="chip-btn active" style="flex: 1; z-index: 2; position: relative; color: #ffffff !important; font-weight: 800; background: none; border: none;">720p</button>
            <button class="chip-btn" style="flex: 1; z-index: 2; position: relative; color: #94a3b8 !important; font-weight: 800; background: none; border: none;">1080p</button>
            <button class="chip-btn" style="flex: 1; z-index: 2; position: relative; color: #94a3b8 !important; font-weight: 800; background: none; border: none;">2K</button>
            <button class="chip-btn" style="flex: 1; z-index: 2; position: relative; color: #94a3b8 !important; font-weight: 800; background: none; border: none;">4K</button>
          </div>
        </div>
      `;

      const fmtGlider = container.querySelector('#demo-fmt-glider');
      const resGlider = container.querySelector('#demo-res-glider');
      const fmtBtns = container.querySelectorAll('#demo-fmt-group .chip-btn');
      const resBtns = container.querySelectorAll('#demo-res-group .chip-btn');

      let fmtIdx = 0;
      const fmtTimer = setInterval(() => {
        fmtIdx = (fmtIdx + 1) % fmtBtns.length;
        fmtBtns.forEach((b, i) => {
          b.classList.toggle('active', i === fmtIdx);
          b.style.setProperty('color', i === fmtIdx ? '#ffffff' : '#94a3b8', 'important');
        });
        if (fmtGlider) fmtGlider.style.transform = `translateX(${fmtIdx * 100}%)`;
      }, 1150);

      let resIdx = 0;
      let resForward = true;
      const resTimer = setInterval(() => {
        if (resForward) {
          resIdx++;
          if (resIdx >= resBtns.length - 1) resForward = false;
        } else {
          resIdx--;
          if (resIdx <= 0) resForward = true;
        }
        resBtns.forEach((b, i) => {
          b.classList.toggle('active', i === resIdx);
          b.style.setProperty('color', i === resIdx ? '#ffffff' : '#94a3b8', 'important');
        });
        if (resGlider) resGlider.style.transform = `translateX(${resIdx * 100}%)`;
      }, 720);

      ytTourDemoInterval = [fmtTimer, resTimer];
    }
  },
  {
    title: '5. Descarga Paralela y Cancelación en Vivo',
    desc: 'Inicia la extracción al instante. El botón maestro se divide durante el proceso para cancelar o pausar en cualquier momento sin bloqueos.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div class="split-cluster" id="yt-demo-split" style="width: 280px; pointer-events: none;">
          <button class="btn-god btn-split-main" style="flex: 1;">
            <span class="btn-god-txt" id="yt-demo-btn-txt">DESCARGAR VÍDEO</span>
          </button>
          <button class="btn-split-cancel">
            <span>⏹ CANCELAR</span>
          </button>
        </div>
      `;
      const cluster = container.querySelector('#yt-demo-split');
      const txt = container.querySelector('#yt-demo-btn-txt');
      let isDownloading = false;

      ytTourDemoInterval = setInterval(() => {
        isDownloading = !isDownloading;
        if (isDownloading) {
          cluster?.classList.add('is-split');
          if (txt) txt.innerText = 'DESCARGANDO...';
        } else {
          cluster?.classList.remove('is-split');
          if (txt) txt.innerText = 'DESCARGAR VÍDEO';
        }
      }, 1200);
    }
  },
  {
    title: '6. ¿Fallo temporal? Cancelar y Reintentar',
    desc: 'Si YouTube bloquea temporalmente una descarga, no te preocupes: pulsa Cancelar y vuelve a darle a Descargar de inmediato para renovar el token.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%;">
          <div class="split-cluster is-split" id="yt-demo-fail-split" style="width: 290px; pointer-events: none; transition: transform 0.2s ease;">
            <button class="btn-god btn-split-main" id="yt-demo-fail-btn" style="flex: 1; transition: background 0.3s ease, border-color 0.3s ease;">
              <span class="btn-god-txt" id="yt-demo-fail-txt">DESCARGANDO...</span>
            </button>
            <button class="btn-split-cancel" id="yt-demo-cancel-btn" style="transition: transform 0.15s ease, background 0.2s ease;">
              <span>⏹ CANCELAR</span>
            </button>
          </div>
          <div id="yt-demo-status-pill" style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: rgba(255, 255, 255, 0.05); color: #94a3b8; transition: all 0.3s ease;">
            DESCARGANDO STREAM...
          </div>
        </div>
      `;

      const cluster = container.querySelector('#yt-demo-fail-split');
      const mainBtn = container.querySelector('#yt-demo-fail-btn');
      const mainTxt = container.querySelector('#yt-demo-fail-txt');
      const cancelBtn = container.querySelector('#yt-demo-cancel-btn');
      const statusPill = container.querySelector('#yt-demo-status-pill');

      let timer1, timer2, timer3;

      function loopAnimation() {
        if (!cluster) return;

        // Fase 1: Error simulado
        cluster.classList.add('is-split');
        if (mainBtn) {
          mainBtn.style.background = '#ef4444';
          mainBtn.style.borderColor = '#dc2626';
        }
        if (mainTxt) mainTxt.innerText = '⚠️ ERROR TEMPORAL';
        if (statusPill) {
          statusPill.innerText = '1. ¡FALLO DETECTADO! PULSA CANCELAR';
          statusPill.style.background = 'rgba(239, 68, 68, 0.15)';
          statusPill.style.color = '#ef4444';
        }

        // Fase 2: Pulsar cancelar
        timer1 = setTimeout(() => {
          if (cancelBtn) {
            cancelBtn.style.transform = 'scale(0.88)';
            cancelBtn.style.background = 'rgba(255, 255, 255, 0.25)';
          }
          if (statusPill) {
            statusPill.innerText = '2. PULSANDO CANCELAR...';
            statusPill.style.color = '#f59e0b';
            statusPill.style.background = 'rgba(245, 158, 11, 0.15)';
          }

          // Fase 3: Reinicio y volver a pulsar descargar
          timer2 = setTimeout(() => {
            if (cancelBtn) {
              cancelBtn.style.transform = 'scale(1)';
              cancelBtn.style.background = '';
            }
            cluster.classList.remove('is-split');
            if (mainBtn) {
              mainBtn.style.background = '';
              mainBtn.style.borderColor = '';
              mainBtn.style.transform = 'scale(0.92)';
            }
            if (mainTxt) mainTxt.innerText = 'DESCARGAR VÍDEO';
            if (statusPill) {
              statusPill.innerText = '3. ¡PULSA DESCARGAR OTRA VEZ Y FUNCIONARÁ!';
              statusPill.style.color = 'var(--color-accent-1)';
              statusPill.style.background = 'rgba(255, 214, 10, 0.15)';
            }

            timer3 = setTimeout(() => {
              if (mainBtn) mainBtn.style.transform = 'scale(1)';
            }, 250);
          }, 800);
        }, 1800);
      }

      loopAnimation();
      const mainInterval = setInterval(loopAnimation, 4200);

      ytTourDemoInterval = {
        clear: () => {
          clearInterval(mainInterval);
          clearTimeout(timer1);
          clearTimeout(timer2);
          clearTimeout(timer3);
        }
      };
    }
  }
];

function stopYtTourDemo() {
  if (ytTourDemoInterval && typeof ytTourDemoInterval.clear === 'function') {
    ytTourDemoInterval.clear();
    ytTourDemoInterval = null;
  } else if (Array.isArray(ytTourDemoInterval)) {
    ytTourDemoInterval.forEach(id => clearInterval(id));
    ytTourDemoInterval = null;
  } else if (ytTourDemoInterval) {
    clearInterval(ytTourDemoInterval);
    ytTourDemoInterval = null;
  }
}

function renderYtModalStep(stepIdx) {
  stopYtTourDemo();
  const step = youtubeTourSteps[stepIdx];
  if (!step) {
    closeYtTourModal();
    return;
  }

  currentYtTourStep = stepIdx;
  const badge = document.getElementById('yt-tour-step-badge');
  const title = document.getElementById('yt-tour-title');
  const desc = document.getElementById('yt-tour-desc');
  const stage = document.getElementById('yt-tour-interactive-stage');
  const actionsRow = document.getElementById('yt-tour-actions-row');

  if (badge) badge.textContent = `YOUTUBE • PASO ${stepIdx + 1} DE ${youtubeTourSteps.length}`;
  if (title) title.textContent = step.title;
  if (desc) desc.textContent = step.desc;

  if (stage) {
    stage.innerHTML = '';
    step.renderDemo(stage);
  }

  if (actionsRow) {
    actionsRow.innerHTML = '';

    if (stepIdx > 0) {
      const btnPrev = document.createElement('button');
      btnPrev.className = 'btn-neu';
      btnPrev.textContent = 'Anterior';
      btnPrev.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        renderYtModalStep(stepIdx - 1);
      });
      actionsRow.appendChild(btnPrev);
    }

    const btnNext = document.createElement('button');
    btnNext.className = 'btn-neu';
    btnNext.style.background = 'var(--color-accent-1)';
    btnNext.style.color = '#000';
    btnNext.style.fontWeight = '800';
    btnNext.textContent = (stepIdx === youtubeTourSteps.length - 1) ? '¡A descargar! 🚀' : 'Siguiente ➔';
    btnNext.addEventListener('click', () => {
      if (typeof window.playSynth === 'function') window.playSynth('origami');
      if (stepIdx === youtubeTourSteps.length - 1) {
        closeYtTourModal();
      } else {
        renderYtModalStep(stepIdx + 1);
      }
    });
    actionsRow.appendChild(btnNext);
  }
}

window.openYtTourModal = function() {
  const backdrop = document.getElementById('yt-tour-modal-backdrop');
  if (!backdrop) return;
  document.body.classList.add('tour-running-active');
  backdrop.classList.add('active');
  renderYtModalStep(0);
};

window.closeYtTourModal = function() {
  stopYtTourDemo();
  document.body.classList.remove('tour-running-active');
  const backdrop = document.getElementById('yt-tour-modal-backdrop');
  if (backdrop) backdrop.classList.remove('active');
};

window.initYtTourEvents = function() {
  document.getElementById('yt-tour-btn-close')?.addEventListener('click', window.closeYtTourModal);
  document.getElementById('yt-tour-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'yt-tour-modal-backdrop') window.closeYtTourModal();
  });
};