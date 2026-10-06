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
// MOTOR PARALLAX ULTRA-FLUIDO (LERP + RAF POR HARDWARE)
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
  // Interpolación LERP (0.08) para suavidad extrema sin tirones
  currentX += (targetX - currentX) * 0.08;
  currentY += (targetY - currentY) * 0.08;

  if (poster) {
    poster.style.transform = `perspective(1000px) rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
  }

  // Si sigue el cursor o aún no ha vuelto al centro exacto, sigue el bucle a 60/144hz
  if (isHovered || Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
    rafId = requestAnimationFrame(renderParallax);
  } else {
    if (poster) poster.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
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

// ========================================================
// BOTÓN MAGNÉTICO
// ========================================================
const magWrap = document.getElementById('mag-wrap');
const magBtn = document.getElementById('btn-master');
const magTxt = document.getElementById('mag-txt');
const chars = '!<>-_\\/[]{}—=+*^?#_';
let scrambleInterval;

if(magWrap && magBtn) {
  magWrap.addEventListener('mousemove', (e) => {
    if(magBtn.classList.contains('loading') || magBtn.classList.contains('done')) return;
    const rect = magBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    
    magBtn.style.transform = `translate(${dx * 0.1}px, ${dy * 0.1}px)`;
    magTxt.style.transform = `translate(${dx * 0.05}px, ${dy * 0.05}px)`;
  });

  magWrap.addEventListener('mouseenter', () => {
    if(magBtn.classList.contains('loading') || magBtn.classList.contains('done')) return;
    playSynth('hover');
    let iteration = 0;
    const target = magTxt.getAttribute('data-target');
    clearInterval(scrambleInterval);
    
    scrambleInterval = setInterval(() => {
      magTxt.innerText = target.split('').map((l, i) => {
        if(i < iteration) return target[i];
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');
      if(iteration >= target.length) clearInterval(scrambleInterval);
      iteration += 1/2;
    }, 30);
  });

  magWrap.addEventListener('mouseleave', () => {
    if(magBtn.classList.contains('loading') || magBtn.classList.contains('done')) return;
    magBtn.style.transform = `translate(0px, 0px)`;
    magTxt.style.transform = `translate(0px, 0px)`;
    clearInterval(scrambleInterval);
    magTxt.innerText = magTxt.getAttribute('data-target');
  });

  magBtn.addEventListener('click', () => {
    if(magBtn.classList.contains('loading') || magBtn.classList.contains('done')) return;
    playSynth('chord');
    magBtn.style.transform = `translate(0px, 0px)`;
    magBtn.classList.add('loading');
    
    setTimeout(() => {
      playSynth('click');
      magBtn.classList.remove('loading');
      magBtn.classList.add('done');
      magTxt.innerText = "¡COMPLETADO!";
      
      setTimeout(() => {
        magBtn.classList.remove('done');
        magTxt.innerText = magTxt.getAttribute('data-target');
      }, 3000);
    }, 2000);
  });
}