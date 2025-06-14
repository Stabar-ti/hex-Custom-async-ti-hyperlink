// ui/sectorControls.js

import { sectorModes, effectModes, wormholeTypes } from '../constants/constants.js';
import { showModal } from './uiModals.js';
//import { populateUiFilters } from './uiFilters.js';

export function populateSectorControls(editor) {
  const container = document.getElementById('sectorControlsContainer');
  if (!container) {
    console.warn('Sector controls container not found.');
    return;
  }

  container.innerHTML = '';

  // Effects popup group
  const effectGroup = document.createElement('div');
  effectGroup.className = 'popup-group';

  const effectToggle = document.createElement('button');
  effectToggle.id = 'effectsToggleBtn';
  effectToggle.className = 'mode-button dropdown-toggle';
  effectToggle.textContent = 'Effects ▾';

  const effectPanel = document.createElement('div');
  effectPanel.id = 'effectPopup';
  effectPanel.className = 'popup-panel';

  const effectModesArr = ['nebula', 'rift', 'asteroid', 'supernova'];
  effectModesArr.forEach(effect => {
    const btn = document.createElement('button');
    btn.textContent = effect;
    btn.className = `mode-button btn-${effect}`;
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      editor.setMode(effect);
    });
    effectPanel.appendChild(btn);
  });

  effectToggle.addEventListener('click', () => effectGroup.classList.toggle('open'));

  effectGroup.appendChild(effectToggle);
  effectGroup.appendChild(effectPanel);

  // Wormhole popup group
  const wormholeGroup = document.createElement('div');
  wormholeGroup.className = 'popup-group';

  const wormholeToggle = document.createElement('button');
  wormholeToggle.id = 'wormholeToggleBtn';
  wormholeToggle.className = 'mode-button dropdown-toggle';
  wormholeToggle.textContent = 'Wormholes ▾';

  const wormholePanel = document.createElement('div');
  wormholePanel.id = 'wormholePopup';
  wormholePanel.className = 'popup-panel';

  Object.entries(wormholeTypes).forEach(([type, { label, color }]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'mode-button btn-wormhole';
    btn.style.backgroundColor = color;
    btn.style.color = '#fff';
    btn.style.border = '1px solid black';
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      editor.setMode(type);
    });
    wormholePanel.appendChild(btn);
  });

  wormholeToggle.addEventListener('click', () => wormholeGroup.classList.toggle('open'));

  wormholeGroup.appendChild(wormholeToggle);
  wormholeGroup.appendChild(wormholePanel);

  // Base sector buttons
  sectorModes.forEach(({ mode, label, cls }) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = `mode-button ${cls}`;
    b.dataset.mode = mode;
    b.addEventListener('click', (e) => {
      document.querySelectorAll('.mode-button').forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      editor.setMode(mode);
    });
    container.appendChild(b);

    // Insert Real ID Lookup button after Hyperlane
    if (mode === 'hyperlane') {
      const realIdBtn = document.createElement('button');
      realIdBtn.id = 'jumpToSystemBtn';
      realIdBtn.className = 'mode-button btn-lookup-id'; // Use a custom class
      realIdBtn.textContent = 'Async Tiles';
      realIdBtn.title = 'Jump to system by Real ID';
      realIdBtn.addEventListener('click', () => showModal('systemLookupModal'));
      container.appendChild(realIdBtn);
    }
  });

  container.appendChild(effectGroup);
  container.appendChild(wormholeGroup);
}
