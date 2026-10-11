/**
 * Aurion - Módulo Cine (Películas y Series de PelisPlus, Cuevana, HDFull)
 * Controla comportamientos específicos del modo Cine: ajuste visual de carátulas,
 * reglas de carpetas sin temporadas y paleta de acentos cinemática.
 */

window.CinemaModule = (function () {
  let isInitialized = false;

  function init() {
    if (isInitialized) return;
    isInitialized = true;
  }

  // Ajustes visuales de cabina al activar modo película
  function onModeActivated() {
    const sInput = document.getElementById('search-input');
    if (sInput) sInput.placeholder = 'Buscar película...';

    // Ocultar badge y control de temporada única en Cine
    const singleBadge = document.getElementById('badge-single-season');
    if (singleBadge) singleBadge.style.display = 'none';

    const cardSingle = document.getElementById('card-single-season');
    if (cardSingle) {
      cardSingle.style.opacity = '0.35';
      cardSingle.style.pointerEvents = 'none';
      cardSingle.title = 'Inactivo en modo Películas';
    }

    // La paleta cinemática usa sus acentos distintivos si no hay portada cargada
    const state = window.modeStates?.movie;
    if (state && (!state.bg || state.bg === 'none' || state.title === 'Esperando consulta...')) {
      if (typeof window.applyDynamicPalette === 'function') {
        window.applyDynamicPalette(state.accent1 || '#ff3366', state.accent2 || '#ffaa00');
      }
    }
  }

  // Ajustes al salir del modo película hacia otro modo
  function onModeDeactivated() {
    const cardSingle = document.getElementById('card-single-season');
    if (cardSingle) {
      cardSingle.style.opacity = '1';
      cardSingle.style.pointerEvents = 'auto';
      cardSingle.title = '';
    }
  }

  return {
    init,
    onModeActivated,
    onModeDeactivated
  };
})();