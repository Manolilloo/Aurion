// ========================================================
// AURION // SÍNTESIS DE AUDIO HÁPTICO
// ========================================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSynth(type) {
  // Para la melodía de finalización, comprobar el ajuste específico notifySound
  if (type === 'finish') {
    const cfg = window.SettingsModule?.getSettings?.();
    if (cfg && cfg.notifySound === false) return;
  } else if (window.__aurionMuteAudio) {
    return;
  }

  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;

  if (type === 'finish') {
    // Acorde ascendente cristalino de finalización de lote (Do5 - Mi5 - Sol5 - Do6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      const startTime = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.07, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.38);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
    return;
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  } else if (type === 'origami') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  } else if (type === 'chord') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  } else if (type === 'hover') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  }

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

window.playSynth = playSynth;

// Callback global invocado por Python al concluir satisfactoriamente un lote
window.onBatchFinished = function () {
  playSynth('finish');
};

// BLOQUEO DE MENÚ CONTEXTUAL NATIVO
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ========================================================
// MOTOR PARALLAX
// ========================================================
const sensor = document.getElementById('parallax-sensor');
const poster = document.getElementById('main-poster');

let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
let isHovered = false;
let rafId = null;

function renderParallax() {
  currentX += (targetX - currentX) * 0.08;
  currentY += (targetY - currentY) * 0.08;

  if (poster) {
    poster.style.transform = `rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)`;
  }

  if (isHovered || Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
    rafId = requestAnimationFrame(renderParallax);
  } else {
    if (poster) poster.style.transform = `rotateX(0deg) rotateY(0deg)`;
    rafId = null;
  }
}

if (sensor && poster) {
  sensor.addEventListener('mousemove', (e) => {
    isHovered = true;
    const rect = sensor.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    targetX = ((y - cy) / cy) * -9;
    targetY = ((x - cx) / cx) * 9;

    poster.style.setProperty('--px', `${(x / rect.width) * 100}%`);
    poster.style.setProperty('--py', `${(y / rect.height) * 100}%`);

    if (!rafId) {
      rafId = requestAnimationFrame(renderParallax);
    }
  });

  sensor.addEventListener('mouseleave', () => {
    isHovered = false;
    targetX = 0;
    targetY = 0;
    if (!rafId) {
      rafId = requestAnimationFrame(renderParallax);
    }
  });
}