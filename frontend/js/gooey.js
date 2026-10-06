// ========================================================
// AURION // MOTOR GOOEY Y PORTALES DINÁMICOS
// ========================================================

const portalData = {
  anime: [
    { id: 'FLV', title: 'AnimeFLV', url: 'https://www3.animeflv.net/' },
    { id: 'JK', title: 'JKAnime', url: 'https://jkanime.net/' },
    { id: 'AON', title: 'AnimeOnlineNinja', url: 'https://ww3.animeonline.ninja/' }
  ],
  movie: [
    { id: 'PP', title: 'PelisPlus', url: 'https://pelisplushd.bz/' },
    { id: 'C3', title: 'Cuevana3', url: 'https://icuevana3.video/' },
    { id: 'HDF', title: 'HDFull', url: 'https://dominioshdfull.com/' }
  ]
};

function renderGooeyMenu(mode) {
  const wrapper = document.querySelector('.gooey-wrapper');
  if (!wrapper) return;

  const existingItems = wrapper.querySelectorAll('.goo-item');
  existingItems.forEach(item => item.remove());

  const portals = portalData[mode] || portalData['anime'];
  
  portals.forEach((portal, index) => {
    const item = document.createElement('div');
    item.className = `goo-item slot-${index + 1}`;
    item.innerText = portal.id;
    item.title = portal.title;
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if(typeof playSynth === 'function') playSynth('click');
      
      if (window.pywebview && window.pywebview.api && window.pywebview.api.open_external_browser) {
        window.pywebview.api.open_external_browser(portal.url);
      } else {
        window.open(portal.url, '_blank');
      }
    });

    wrapper.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderGooeyMenu(typeof currentMode !== 'undefined' ? currentMode : 'anime');
});