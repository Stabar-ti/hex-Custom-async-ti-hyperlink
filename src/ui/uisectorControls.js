// ───────────────────────────────────────────────────────────────
// ui/sectorControls.js
// Populates the sector control panel with interactive tool buttons
// Adds Effects/Wormholes as movable pop-ups like Border Anomalies
// ───────────────────────────────────────────────────────────────

import { sectorModes, wormholeTypes } from '../constants/constants.js';
import { showModal } from './uiModals.js';
import { makePopupDraggable } from './uiUtils.js';
import { showPopup, hidePopup } from './popupUI.js';

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
      realIdBtn.addEventListener('click', () => {
        // Use the new popup system if available, fallback to old modal
        if (typeof window.showSystemLookupPopup === 'function') {
          window.showSystemLookupPopup();
        } else {
          showModal('systemLookupModal');
        }
      });
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
    showPopup({
      id: 'effectsPopupModal',
      className: 'layout-options-popup',
      title: 'Effects',
      draggable: true,
      dragHandleSelector: '.popup-ui-titlebar',
      scalable: true,
      rememberPosition: true,
      style: {
        left: '420px',
        top: '180px',
        minWidth: '220px',
        maxWidth: '600px',
        minHeight: '120px',
        maxHeight: '600px',
        //  background: '#222',
        color: '#fff',
        border: '2px solid #ffe066',
        boxShadow: '0 8px 40px #000a',
        padding: '0 0 18px 0',
        zIndex: 1300
      },
      content: (() => {
        const content = document.createElement('div');
        content.className = 'modal-content popup-btn-grid effects-btn-grid';
        ['nebula', 'rift', 'asteroid', 'supernova'].forEach(effect => {
          const btn = document.createElement('button');
          btn.textContent = effect;
          btn.className = `mode-button btn-${effect}`;
          btn.addEventListener('click', (e) => {
            content.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            editor.setMode(effect);
          });
          content.appendChild(btn);
        });
        return content;
      })()
    });
  };
  container.appendChild(effectsBtn);

  // ───────────── Wormholes Modal Launcher ─────────────
  const wormholesBtn = document.createElement('button');
  wormholesBtn.id = 'launchWormholesPopup';
  wormholesBtn.className = 'mode-button';
  wormholesBtn.textContent = 'Wormholes…';
  wormholesBtn.title = 'Pick Wormhole';
  wormholesBtn.onclick = () => {
    showPopup({
      id: 'wormholesPopupModal',
      className: 'layout-options-popup',
      title: 'Wormholes',
      draggable: true,
      dragHandleSelector: '.popup-ui-titlebar',
      scalable: true,
      rememberPosition: true,
      style: {
        left: '600px',
        top: '160px',
        minWidth: '220px',
        maxWidth: '600px',
        minHeight: '120px',
        maxHeight: '600px',
        //   background: '#222',
        color: '#fff',
        border: '2px solid #ffe066',
        boxShadow: '0 8px 40px #000a',
        padding: '0 0 18px 0',
        zIndex: 1300
      },
      content: (() => {
        const content = document.createElement('div');
        content.className = 'modal-content popup-btn-grid wormhole-btn-grid';
        Object.entries(wormholeTypes).forEach(([type, { label, color }]) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.className = 'mode-button btn-wormhole';
          btn.style.backgroundColor = color;
          btn.addEventListener('click', (e) => {
            content.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            editor.setMode(type);
          });
          content.appendChild(btn);
        });
        return content;
      })()
    });
  };
  container.appendChild(wormholesBtn);

  // Remove the old manual popup creation code for effectsPopupModal and wormholesPopupModal.
}
