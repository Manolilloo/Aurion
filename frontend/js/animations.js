// ========================================================
// AURION // SÍNTESIS DE AUDIO HÁPTICO
// ========================================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSynth(type) {
  if(!audioCtx) audioCtx = new AudioContext();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  if(type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  } else if (type === 'origami') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  } else if (type === 'chord') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  } else if (type === 'hover') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
  }
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

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