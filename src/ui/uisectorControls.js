// ───────────────────────────────────────────────────────────────
// ui/sectorControls.js
// Populates the sector control panel with interactive tool buttons
// Adds Effects/Wormholes as movable pop-ups like Border Anomalies
// ───────────────────────────────────────────────────────────────

import { sectorModes, wormholeTypes } from '../constants/constants.js';
import { showModal } from './uiModals.js';
import { makePopupDraggable } from './uiUtils.js';

export function populateSectorControls(editor) {
  const container = document.getElementById('sectorControlsContainer');
  if (!container) {
    console.warn('Sector controls container not found.');
    return;
  }
  container.innerHTML = '';

  // ───────────── Base Sector Buttons (Planet, Hyperlane, etc.) ─────────────
  sectorModes.forEach(({ mode, label, cls }) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = `mode-button ${cls}`;
    b.dataset.mode = mode;
    b.addEventListener('click', (e) => {
      document.querySelectorAll('#sectorControlsContainer .mode-button').forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      editor.setMode(mode);
    });
    container.appendChild(b);

    // Insert Async Tiles lookup button after hyperlane
    if (mode === 'hyperlane') {
      const realIdBtn = document.createElement('button');
      realIdBtn.id = 'jumpToSystemBtn';
      realIdBtn.className = 'mode-button btn-lookup-id';
      realIdBtn.textContent = 'Async Tiles';
      realIdBtn.title = 'Choose Async Tile';
      realIdBtn.addEventListener('click', () => showModal('systemLookupModal'));
      container.appendChild(realIdBtn);
    }
  });

  // ───────────── Effects Modal Launcher ─────────────
  const effectsBtn = document.createElement('button');
  effectsBtn.id = 'launchEffectsPopup';
  effectsBtn.className = 'mode-button';
  effectsBtn.textContent = 'Effects…';
  effectsBtn.title = 'Select Effect';
  effectsBtn.onclick = () => {
    const popup = document.getElementById('effectsPopupModal');
    if (popup) popup.style.display = 'block';
  };
  container.appendChild(effectsBtn);

  // ───────────── Wormholes Modal Launcher ─────────────
  const wormholesBtn = document.createElement('button');
  wormholesBtn.id = 'launchWormholesPopup';
  wormholesBtn.className = 'mode-button';
  wormholesBtn.textContent = 'Wormholes…';
  wormholesBtn.title = 'Pick Wormhole'
  wormholesBtn.onclick = () => {
    const popup = document.getElementById('wormholesPopupModal');
    if (popup) popup.style.display = 'block';
  };
  container.appendChild(wormholesBtn);

  // ───────────── Effects Popup Modal ─────────────
  if (!document.getElementById('effectsPopupModal')) {
    const popup = document.createElement('div');
    popup.id = 'effectsPopupModal';
    popup.className = 'modal layout-options-popup';
    popup.style.display = 'none';
    popup.style.position = 'absolute';
    popup.style.left = '420px';
    popup.style.top = '150px';
    popup.style.minWidth = '220px';
    popup.style.zIndex = 1300;

    // Draggable header
    const header = document.createElement('div');
    header.className = 'modal-header draggable-handle';
    header.innerHTML = '<span>Effects</span>';
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close-btn';
    closeBtn.title = 'Close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => { popup.style.display = 'none'; };
    header.appendChild(closeBtn);

    popup.appendChild(header);

    // Content: effect buttons in grid
    const content = document.createElement('div');
    content.className = 'modal-content popup-btn-grid effects-btn-grid';
    ['nebula', 'rift', 'asteroid', 'supernova'].forEach(effect => {
      const btn = document.createElement('button');
      btn.textContent = effect;
      btn.className = `mode-button btn-${effect}`;
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#effectsPopupModal .mode-button').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        editor.setMode(effect);
      });
      content.appendChild(btn);
    });

    popup.appendChild(content);
    document.body.appendChild(popup);
    makePopupDraggable('effectsPopupModal');
  }

  // ───────────── Wormholes Popup Modal ─────────────
  if (!document.getElementById('wormholesPopupModal')) {
    const popup = document.createElement('div');
    popup.id = 'wormholesPopupModal';
    popup.className = 'modal layout-options-popup';
    popup.style.display = 'none';
    popup.style.position = 'absolute';
    popup.style.left = '600px';
    popup.style.top = '160px';
    popup.style.minWidth = '220px';
    popup.style.zIndex = 1300;

    // Draggable header
    const header = document.createElement('div');
    header.className = 'modal-header draggable-handle';
    header.innerHTML = '<span>Wormholes</span>';
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close-btn';
    closeBtn.title = 'Close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => { popup.style.display = 'none'; };
    header.appendChild(closeBtn);

    popup.appendChild(header);

    // Content: wormhole buttons in grid
    const content = document.createElement('div');
    content.className = 'modal-content popup-btn-grid wormhole-btn-grid';
    Object.entries(wormholeTypes).forEach(([type, { label, color }]) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.className = 'mode-button btn-wormhole';
      btn.style.backgroundColor = color;
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#wormholesPopupModal .mode-button').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        editor.setMode(type);
      });
      content.appendChild(btn);
    });

    popup.appendChild(content);
    document.body.appendChild(popup);
    makePopupDraggable('wormholesPopupModal');
  }
}
