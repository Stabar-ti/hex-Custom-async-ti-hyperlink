// main.js
import { applySavedTheme } from './ui/uiTheme.js';
applySavedTheme();

import HexEditor from './core/HexEditor.js';
import { exportFullState } from './data/export.js';
import { importFullState } from './data/import.js';
import { initHistory } from './features/history.js';
import { showModal, closeModal } from './ui/uiModals.js';
import { loadSystemInfo } from './data/import.js';
import { assignSystem } from './features/assignSystem.js';
import './ui/systemLookup.js';   // ← add this line
import { redrawAllRealIDOverlays } from './features/realIDsOverlays.js';

const svg = document.getElementById('hexMap');
const editor = new HexEditor({
  svg,
  confirmReset: () => confirm('Generating new map clears data. Proceed?')
});

// 1) Initialize editor.options and editor.maxDistance with defaults
editor.options = {
  useSupernova: true,
  useAsteroid: true,
  useNebula:   true,
  useRift:     true
};
// Default “maximum distance” for the BFS
editor.maxDistance = 3;

window.showModal = showModal;
window.closeModal = closeModal;

window.editor = editor;
initHistory(editor);

window.editor = editor;

// Wire up the “Save” button inside the Options modal
document.getElementById('saveOptionsBtn').addEventListener('click', () => {
  // Read each checkbox’s checked state
  const supernovaCB = document.getElementById('toggleSupernova');
  const asteroidCB  = document.getElementById('toggleAsteroid');
  const nebulaCB    = document.getElementById('toggleNebula');
  const riftCB      = document.getElementById('toggleRift');
  const maxDistInp  = document.getElementById('maxDistanceInput');

  // Update editor.options
  editor.options.useSupernova = !!supernovaCB.checked;
  editor.options.useAsteroid  = !!asteroidCB.checked;
  editor.options.useNebula    = !!nebulaCB.checked;
  editor.options.useRift      = !!riftCB.checked;

  // Update editor.maxDistance (clamp to [1..10] just in case)
  let md = parseInt(maxDistInp.value, 10);
  if (isNaN(md) || md < 1) md = 1;
  if (md > 10) md = 10;
  editor.maxDistance = md;
  // Update the number‐input in case we had to clamp it
  maxDistInp.value = md;

  // Finally, hide the modal again
  closeModal('optionsModal');
});

// ─── Hook up “Link Wormholes” button ───
const linkWormholesBtn = document.getElementById('linkWormholesBtn');
if (linkWormholesBtn) {
  linkWormholesBtn.addEventListener('click', () => {
    editor.drawWormholeLinks();
  });
}

// Export Full
const exportBtn = document.getElementById('exportFullBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    document.getElementById('exportFullText').value = exportFullState(editor);
    showModal('exportFullModal');
  });
}

document.getElementById('copyExportFull')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('exportFullText').value);
});

document.getElementById('downloadExportFull')?.addEventListener('click', () => {
  const data = exportFullState(editor);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ti4-map-export.json';
  link.click();
  URL.revokeObjectURL(url);
});

(async () => {
  await loadSystemInfo(editor);
  // Now sectorIDLookup is populated
})();

// Import Full
const importBtn = document.getElementById('importFullBtn');
if (importBtn) {
  importBtn.addEventListener('click', () => {
    showModal('importFullModal');
  });
}

document.getElementById('doImportFull')?.addEventListener('click', () => {
  const text = document.getElementById('importFullText').value;
  if (!text) {
    alert("Please paste exported JSON into the box.");
    return;
  }
  importFullState(editor, text);
  closeModal('importFullModal');
});

document.getElementById('importFullFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById('importFullText').value = event.target.result;
  };
  reader.readAsText(file);
});

document.getElementById('toggleWormholes')?.addEventListener('click', () => {
  editor.showWormholes = !editor.showWormholes;
  import('./features/wormholes.js').then(({ updateWormholeVisibility }) => {
    updateWormholeVisibility(editor);
  });
});

document.getElementById('toggleEffects')?.addEventListener('click', () => {
  editor.showEffects = !editor.showEffects;
  import('./features/effects.js').then(({ updateEffectsVisibility }) => {
    updateEffectsVisibility(editor);
  });
});

// grab the new toggle
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const controlsPanel     = document.getElementById('controlsPanel');

toggleControlsBtn?.addEventListener('click', () => {
  controlsPanel.classList.toggle('collapsed');
  // Optionally change the icon/text:
  toggleControlsBtn.textContent = controlsPanel.classList.contains('collapsed')
    ? 'Show Im/Export & mapGen'
    : 'hide Im/Export & mapGen';
});

document.body.tabIndex = -1;
document.body.focus();

// System lookup binding
(async () => {
  await loadSystemInfo(editor);
  const searchInput = document.getElementById('systemSearch');
  const resultsList = document.getElementById('systemList');
  const jumpBtn     = document.getElementById('jumpToSystemBtn');
  console.log(
  'systemSearch:', document.getElementById('systemSearch'),
  'systemList:', document.getElementById('systemList'),
  'jumpToSystemBtn:', document.getElementById('jumpToSystemBtn')
);
  if (!searchInput || !resultsList || !jumpBtn) {
    console.warn('Lookup elements not found.');
    return;
  }
  jumpBtn.addEventListener('click', () => {
    showModal('systemLookupModal');
    searchInput.value = '';
    resultsList.innerHTML = '';
    editor.pendingSystemId = null;
    setTimeout(() => searchInput.focus(), 0);
  });
  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim().toUpperCase();
    resultsList.innerHTML = '';
    if (!q) return;
    const lookup = editor.sectorIDLookup || {};
    let matches = Object.values(lookup).filter(sys => {
      if (/^\d+$/.test(q)) return sys.id.toString() === q;
      const name = sys.name || '';
      const aliases = Array.isArray(sys.aliases) ? sys.aliases : [];
      return sys.id.toString().startsWith(q)
        || name.toUpperCase().includes(q)
        || aliases.some(a => (a||'').toUpperCase().startsWith(q));
    });
    matches = Array.from(new Map(matches.map(s => [s.id, s])).values());
    matches.slice(0, 20).forEach(sys => {
      const li = document.createElement('li');
      li.textContent = `${sys.id} – ${sys.name}`;
      li.addEventListener('click', () => {
        editor.pendingSystemId = sys.id.toString();
        //closeModal('systemLookupModal');
        //alert(`Now click a hex to assign system ${sys.id} – ${sys.name}`);
      });
      resultsList.appendChild(li);
    });
  });
})();

// Hex click to assign pending system ID
/*svg.addEventListener('click', e => {
  const pid = editor.pendingSystemId;
  if (!pid) return;
  const poly = e.target.closest('polygon');
  if (!poly) return;
  const hexID = poly.dataset.label;
  if (!hexID) return;
  const sys = editor.sectorIDLookup[pid];
  if (sys) assignSystem(editor, sys, hexID);
  editor.pendingSystemId = null;
});
*/

svg.addEventListener('click', e => {
    const poly = e.target.closest('polygon');
    if (!poly) return;
    const hexID = poly.dataset.label;
    if (!hexID) return;

    editor.selectedHex = hexID; // Track selection for any other features

    const pid = editor.pendingSystemId;
if (pid) {
    const sys = editor.sectorIDLookup[pid.toUpperCase()];
    if (sys) {
        assignSystem(editor, sys, hexID);
        redrawAllRealIDOverlays(editor);
    }
    editor.pendingSystemId = null;
}
});