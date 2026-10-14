// ========================================================
// AURION • MÓDULO DE HISTORIAL Y TELEMETRÍA SQLITE
// ========================================================

window.HistoryModule = (function () {
  let currentFilter = 'all';
  let searchDebounce = null;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return (mb / 1024).toFixed(2).replace('.', ',') + ' GB';
    }
    return mb.toFixed(1).replace('.', ',') + ' MB';
  }

  function getModeBadge(mode) {
    if (mode === 'movie') return { label: '🎬 CINE', color: '#bf5af2', bg: 'rgba(191, 90, 242, 0.14)' };
    if (mode === 'youtube') return { label: '🔴 YOUTUBE', color: '#ff0055', bg: 'rgba(255, 0, 85, 0.14)' };
    return { label: '🍙 ANIME', color: '#ffd60a', bg: 'rgba(255, 214, 10, 0.14)' };
  }

  async function refreshHistory() {
    const searchVal = document.getElementById('history-search-input')?.value || '';
    const container = document.getElementById('history-list-container');
    if (!container) return;

    const data = await window.pyCall('get_download_history', currentFilter, searchVal);
    if (!data) return;

    const stats = data.stats || {};
    const countEl = document.getElementById('hist-stat-count');
    const sizeEl = document.getElementById('hist-stat-size');
    const breakEl = document.getElementById('hist-stat-breakdown');

    if (countEl) countEl.textContent = `${stats.total_count || 0} archivos`;
    if (sizeEl) sizeEl.textContent = formatBytes(stats.total_bytes || 0);
    if (breakEl) breakEl.textContent = `🍙 ${stats.anime_count || 0}  •  🎬 ${stats.movie_count || 0}  •  🔴 ${stats.yt_count || 0}`;

    const items = data.items || [];
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #64748b; font-size: 13px; font-weight: 700;">
          No hay descargas registradas todavía en esta categoría.
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const badge = getModeBadge(item.mode);
      const row = document.createElement('div');
      row.className = 'history-item-row';

      const statusHtml = item.file_exists
        ? `<button class="hist-action-btn hist-btn-play" title="Reproducir archivo ahora">▶ Reproducir</button>
           <button class="hist-action-btn hist-btn-folder" title="Mostrar en carpeta">📂</button>`
        : `<span style="font-size: 10px; color: #64748b; font-weight: 800; padding: 4px 8px;">Movido / Eliminado</span>`;

      row.innerHTML = `
        <div class="history-item-info">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="history-mode-tag" style="color: ${badge.color}; background: ${badge.bg}; border: 1px solid ${badge.color}44;">${badge.label}</span>
            <span class="history-item-title" title="${item.title}">${item.title}</span>
          </div>
          <div class="history-item-meta">
            <span>📅 ${item.created_at}</span>
            <span>•</span>
            <span style="color: #f8fafc; font-weight: 800;">${item.resolution}</span>
            <span>•</span>
            <span style="color: var(--color-accent-1); font-weight: 800;">${formatBytes(item.size_bytes)}</span>
          </div>
        </div>
        <div class="history-item-actions">
          ${statusHtml}
          <button class="hist-action-btn hist-btn-del" title="Borrar del historial">✕</button>
        </div>
      `;

      row.querySelector('.hist-btn-play')?.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        window.pyCall('open_history_file', item.file_path, false);
      });

      row.querySelector('.hist-btn-folder')?.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        window.pyCall('open_history_file', item.file_path, true);
      });

      row.querySelector('.hist-btn-del')?.addEventListener('click', async () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        await window.pyCall('delete_history_item', item.id);
        refreshHistory();
      });

      container.appendChild(row);
    });
  }

  function openModal() {
    const overlay = document.getElementById('history-modal-overlay');
    if (!overlay) return;
    if (typeof window.playSynth === 'function') window.playSynth('chord');
    overlay.classList.add('active');
    refreshHistory();
  }

  function closeModal() {
    const overlay = document.getElementById('history-modal-overlay');
    if (!overlay) return;
    if (typeof window.playSynth === 'function') window.playSynth('origami');
    overlay.classList.remove('active');
  }

  function init() {
    document.getElementById('btn-history-modal')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    document.getElementById('history-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('history-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'history-modal-overlay') closeModal();
    });

    document.querySelectorAll('#history-filter-pills .hist-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof window.playSynth === 'function') window.playSynth('click');
        document.querySelectorAll('#history-filter-pills .hist-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter') || 'all';
        refreshHistory();
      });
    });

    document.getElementById('history-search-input')?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(refreshHistory, 200);
    });

    document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
      if (typeof window.playSynth === 'function') window.playSynth('chord');
      await window.pyCall('clear_download_history');
      refreshHistory();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('history-modal-overlay')?.classList.contains('active')) {
        closeModal();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { openModal, closeModal, refreshHistory };
})();