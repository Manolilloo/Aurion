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
          <div class="chip-group" id="demo-fmt-group" style="position: relative; width: 240px; height: 36px;">
            <div class="chip-glider" id="demo-fmt-glider" style="width: 50%; height: 100%; transform: translateX(0px); background: var(--color-accent-1); border-radius: 8px; opacity: 1; display: block; position: absolute; top: 0; left: 0; transition: transform 0.25s ease;"></div>
            <button class="chip-btn active" data-val="video" style="flex: 1; z-index: 2; position: relative;">VÍDEO (MP4)</button>
            <button class="chip-btn" data-val="audio" style="flex: 1; z-index: 2; position: relative;">AUDIO (MP3)</button>
          </div>

          <!-- SELECTOR DE CALIDADES -->
          <div class="chip-group yt-chips-resolutions" id="demo-res-group" style="position: relative; width: 320px; height: 36px;">
            <div class="chip-glider" id="demo-res-glider" style="width: 25%; height: 100%; transform: translateX(25%); background: var(--color-accent-1); border-radius: 8px; opacity: 1; display: block; position: absolute; top: 0; left: 0; transition: transform 0.22s ease;"></div>
            <button class="chip-btn" style="flex: 1; z-index: 2; position: relative;">720p</button>
            <button class="chip-btn active" style="flex: 1; z-index: 2; position: relative;">1080p</button>
            <button class="chip-btn" style="flex: 1; z-index: 2; position: relative;">2K</button>
            <button class="chip-btn" style="flex: 1; z-index: 2; position: relative;">4K</button>
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
        fmtBtns.forEach((b, i) => b.classList.toggle('active', i === fmtIdx));
        if (fmtGlider) fmtGlider.style.transform = `translateX(${fmtIdx * 100}%)`;
      }, 1150);

      let resIdx = 1;
      let resForward = true;
      const resTimer = setInterval(() => {
        if (resForward) {
          resIdx++;
          if (resIdx >= resBtns.length - 1) resForward = false;
        } else {
          resIdx--;
          if (resIdx <= 0) resForward = true;
        }
        resBtns.forEach((b, i) => b.classList.toggle('active', i === resIdx));
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
  }
];

function stopYtTourDemo() {
  if (Array.isArray(ytTourDemoInterval)) {
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