// ========================================================
// AURION • TOUR HOLOGRÁFICO YOUTUBE STUDIO SPATIAL (V2.0)
// ========================================================
let currentYtTourStep = 0;
let ytTourDemoInterval = null;

const youtubeTourSteps = [
  {
    title: '1. Radar Dual: Vídeos y Colecciones (Playlists)',
    desc: 'Alterna al instante entre piezas individuales o listas de reproducción enteras. También puedes pegar cualquier URL directamente.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div class="chip-group" style="position: relative; width: 240px;">
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
      }, 1050);
    }
  },
  {
    title: '2. Cinema Hero: Explorador de Canales con Filtro en Vivo',
    desc: 'Pulsa sobre el nombre de cualquier creador para abrir su perfil panorámico, filtrar sus vídeos en tiempo real y cargar su catálogo completo.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:10px; width:100%;">
          <button class="yt-video-channel-btn tour-channel-pulse" style="padding: 10px 20px; font-size: 12px; pointer-events: none;">
            <span class="yt-channel-btn-icon">📺</span>
            <span>Explorar Canal Completo del Creador ➔</span>
          </button>
          <span style="font-size:10.5px; color:#94a3b8; font-weight:700;">Incluye buscador instantáneo dentro del canal</span>
        </div>
      `;
    }
  },
  {
    title: '3. Playlists Split-Deck: Duración Acumulada e Inversión',
    desc: 'Dentro de una lista puedes filtrar pistas por nombre, invertir la selección con un clic y ver la duración exacta de lo que vas a descargar.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.04); padding:10px 16px; border-radius:14px; border:1px solid rgba(255,0,85,0.3); width:92%;">
          <div style="width:22px; height:22px; border-radius:7px; background:var(--color-accent-1); color:#000; font-weight:900; display:flex; align-items:center; justify-content:center;">✔</div>
          <div style="flex:1; text-align:left;">
            <div style="font-size:12px; font-weight:800; color:#fff;">01. Opening Oficial 4K Creditless</div>
            <div style="font-size:10px; color:#94a3b8;">⏱ 01:30 • Duración total calculada en vivo</div>
          </div>
          <span style="font-size:10px; font-weight:900; color:var(--color-accent-1);">EN COLA</span>
        </div>
      `;
    }
  },
  {
    title: '4. Motor DASH Real: Desde 144p hasta 4K Ultra HD y MP3 320K',
    desc: 'Desliza el selector táctil para elegir la resolución exacta. Nuestro motor une las pistas de vídeo y audio sin pérdida ni caídas a 360p.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; width: 100%;">
          <span id="demo-tier-txt" style="font-size:11px; font-weight:900; color:var(--color-accent-1); letter-spacing:1px;">FULL HD (1080p)</span>
          <div class="chip-group yt-chips-resolutions" id="demo-res-group" style="position: relative; width: 310px; height: 36px;">
            <div class="chip-glider" id="demo-res-glider" style="width: 25%; transform: translateX(0%);"></div>
            <button class="chip-btn active" style="flex:1;">720p</button>
            <button class="chip-btn" style="flex:1;">1080p</button>
            <button class="chip-btn" style="flex:1;">2K</button>
            <button class="chip-btn" style="flex:1;">4K</button>
          </div>
        </div>
      `;
      const labels = ['HD READY (720p)', 'FULL HD (1080p)', 'QUAD HD (2K)', 'ULTRA HD (4K)'];
      const resGlider = container.querySelector('#demo-res-glider');
      const resBtns = container.querySelectorAll('#demo-res-group .chip-btn');
      const tierTxt = container.querySelector('#demo-tier-txt');
      let idx = 0;
      ytTourDemoInterval = setInterval(() => {
        idx = (idx + 1) % 4;
        resBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
        if (resGlider) resGlider.style.transform = `translateX(${idx * 100}%)`;
        if (tierTxt) tierTxt.textContent = labels[idx];
      }, 800);
    }
  },
  {
    title: '5. Nuevo: Recorte de Clips (✂️) y Portada 4K (🖼️)',
    desc: '¿Solo quieres un fragmento del vídeo? Despliega "Recortar Fragmento" e indica el minuto de inicio y fin, o guarda la miniatura en 4K con un clic.',
    renderDemo: (container) => {
      container.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.45); padding:12px 16px; border-radius:14px; border:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px; font-weight:900; color:#fff;">✂️ Inicio: <b style="color:var(--color-accent-1);">01:15</b></span>
          <span style="color:#64748b;">➔</span>
          <span style="font-size:12px; font-weight:900; color:#fff;">Fin: <b style="color:var(--color-accent-1);">02:45</b></span>
          <span style="margin-left:8px; padding:4px 8px; border-radius:8px; background:rgba(255,255,255,0.08); font-size:10px; font-weight:800; color:#cbd5e1;">🖼️ Portada 4K</span>
        </div>
      `;
    }
  }
];

function stopYtTourDemo() {
  if (ytTourDemoInterval && typeof ytTourDemoInterval.clear === 'function') {
    ytTourDemoInterval.clear();
  } else if (Array.isArray(ytTourDemoInterval)) {
    ytTourDemoInterval.forEach(id => clearInterval(id));
  } else if (ytTourDemoInterval) {
    clearInterval(ytTourDemoInterval);
  }
  ytTourDemoInterval = null;
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

  if (badge) badge.textContent = `YOUTUBE STUDIO • PASO ${stepIdx + 1} DE ${youtubeTourSteps.length}`;
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
    btnNext.className = 'btn-tour-primary';
    btnNext.textContent = (stepIdx === youtubeTourSteps.length - 1) ? '¡Estrenar YouTube Studio! 🚀' : 'Siguiente ➔';
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

function snapMatrixSwitchToYoutube() {
  const btnSwitch = document.getElementById('btn-switch-mode');
  if (!btnSwitch) return;

  const ytBtn = btnSwitch.querySelector('[data-mode="youtube"]') || document.getElementById('mode-youtube');
  const thumb = btnSwitch.querySelector('.matrix-thumb');
  if (!ytBtn || !thumb) return;

  btnSwitch.querySelectorAll('.matrix-opt').forEach(b => b.classList.toggle('active', b === ytBtn));

  // Obtener solo las secciones activas reales en Settings (ej. Anime y YouTube si Cine está oculto)
  const settings = window.SettingsModule?.getSettings();
  const visibleSections = (settings?.sectionsOrder || ['anime', 'movie', 'youtube'])
    .filter(k => settings?.sectionsVisibility?.[k] !== false);

  const count = visibleSections.length || 1;
  const ytIdx = visibleSections.indexOf('youtube');
  const safeIdx = ytIdx > -1 ? ytIdx : (count - 1);

  // Limpiar estilos residuales y forzar la posición exacta relativa al número de pestañas visibles
  thumb.style.removeProperty('left');
  thumb.style.width = `calc((100% - 6px) / ${count})`;
  thumb.style.setProperty('transform', `translateX(${safeIdx * 100}%)`, 'important');
}

window.openYtTourModal = function () {
  const backdrop = document.getElementById('yt-tour-modal-backdrop');
  if (!backdrop) return;
  document.body.classList.add('tour-running-active');
  backdrop.classList.add('active');
  renderYtModalStep(0);

  snapMatrixSwitchToYoutube();
  requestAnimationFrame(snapMatrixSwitchToYoutube);
  setTimeout(snapMatrixSwitchToYoutube, 50);
  setTimeout(snapMatrixSwitchToYoutube, 180);
};

window.closeYtTourModal = function () {
  stopYtTourDemo();
  document.body.classList.remove('tour-running-active');
  const backdrop = document.getElementById('yt-tour-modal-backdrop');
  if (backdrop) backdrop.classList.remove('active');

  snapMatrixSwitchToYoutube();
};

window.openYtTourModal = function () {
  const backdrop = document.getElementById('yt-tour-modal-backdrop');
  if (!backdrop) return;
  document.body.classList.add('tour-running-active');
  backdrop.classList.add('active');
  renderYtModalStep(0);
  
  // Bloquear la píldora en su sitio exacto
  snapMatrixSwitchToYoutube();
  requestAnimationFrame(snapMatrixSwitchToYoutube);
};

window.closeYtTourModal = function () {
  stopYtTourDemo();
  document.body.classList.remove('tour-running-active');
  const backdrop = document.getElementById('yt-tour-modal-backdrop');
  if (backdrop) backdrop.classList.remove('active');
  
  snapMatrixSwitchToYoutube();
};

window.initYtTourEvents = function () {
  document.getElementById('yt-tour-btn-close')?.addEventListener('click', window.closeYtTourModal);
  document.getElementById('yt-tour-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'yt-tour-modal-backdrop') window.closeYtTourModal();
  });
};