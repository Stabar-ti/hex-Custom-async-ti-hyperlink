// ───────────────────────────────────────────────────────────────
// main.js — Entry point that initializes the editor, UI bindings,
// import/export handlers, and map interaction logic
// ───────────────────────────────────────────────────────────────

// Load and apply the last-used theme (light/dark)
import { applySavedTheme } from './ui/uiTheme.js';
//import { initHexHoverInfo } from './ui/hexHoverInfo.js';
applySavedTheme();

// Import main components and features required for the app
import HexEditor from './core/HexEditor.js';
import { exportFullState } from './data/export.js';
import { importFullState } from './data/import.js';
import { initHistory } from './features/history.js';
import { showModal, closeModal } from './ui/uiModals.js';
import { loadSystemInfo } from './data/import.js';
import { assignSystem } from './features/assignSystem.js';
import './ui/systemLookup.js'; // Adds system search modal
import { redrawAllRealIDOverlays } from './features/realIDsOverlays.js';
import { markRealIDUsed } from './ui/uiFilters.js';
import { initHexHoverInfo } from './ui/hexHoverInfo.js';
import { openCalcSlicePopup } from './features/calcSlice.js';
import { installCustomLinksUI } from './ui/customLinksUI.js';
import { installBorderAnomaliesUI } from './ui/borderAnomaliesUI.js';
import { redrawBorderAnomaliesOverlay } from './features/borderAnomaliesOverlay.js';
import { overlayDefaults } from './config/toggleSettings.js';

// ───── Initialize the core HexEditor and set defaults ─────
const svg = document.getElementById('hexMap');
const editor = new HexEditor({
  svg,
  confirmReset: () => window.confirm("Are you sure? This will erase your map changes.")
});

Object.assign(editor, overlayDefaults);

// Define default generation settings and distance limit
editor.options = {
  useSupernova: true,
  useAsteroid: true,
  useNebula: true,
  useRift: true,
  useCustomLinks: true,
  useBorderAnomalies: true
};
editor.maxDistance = 3; // Used for BFS calculations

// Expose modal control functions and editor globally
window.showModal = showModal;
window.closeModal = closeModal;
window.editor = editor;

// Enable undo/redo history tracking
initHistory(editor);
initHexHoverInfo(editor); // <- Add this line

installCustomLinksUI(editor);
installBorderAnomaliesUI(editor);

// ───── Options Modal: Save settings and update map behavior ─────
document.getElementById('saveOptionsBtn').addEventListener('click', () => {
  const supernovaCB = document.getElementById('toggleSupernova');
  const asteroidCB = document.getElementById('toggleAsteroid');
  const nebulaCB = document.getElementById('toggleNebula');
  const riftCB = document.getElementById('toggleRift');
  const customLinksCB = document.getElementById('toggleCustomLinks');
  const borderAnomaliesCB = document.getElementById('toggleBorderAnomalies');
  const maxDistInp = document.getElementById('maxDistanceInput');

  editor.options.useSupernova = !!supernovaCB.checked;
  editor.options.useAsteroid = !!asteroidCB.checked;
  editor.options.useNebula = !!nebulaCB.checked;
  editor.options.useRift = !!riftCB.checked;
  editor.options.useCustomLinks = !!customLinksCB.checked;
  editor.options.useBorderAnomalies = !!borderAnomaliesCB.checked;

  // Clamp max distance between 1 and 10
  let md = parseInt(maxDistInp.value, 10);
  if (isNaN(md) || md < 1) md = 1;
  if (md > 10) md = 10;
  editor.maxDistance = md;
  maxDistInp.value = md;

  closeModal('optionsModal');
});


const btnPlanetTypes = document.getElementById('togglePlanetTypes');
if (btnPlanetTypes) btnPlanetTypes.classList.toggle('active', editor.showPlanetTypes);

const btnResInf = document.getElementById('toggleResInf');
if (btnResInf) btnResInf.classList.toggle('active', editor.showResInf);

const btnIdealRI = document.getElementById('toggleIdealRI');
if (btnIdealRI) btnIdealRI.classList.toggle('active', editor.showIdealRI);

const btnRealID = document.getElementById('toggleRealID');
if (btnRealID) btnRealID.classList.toggle('active', editor.showRealID);



// ───── Event handler to render wormhole connections ─────
const linkWormholesBtn = document.getElementById('linkWormholesBtn');
if (linkWormholesBtn) {
  linkWormholesBtn.addEventListener('click', () => {
    editor.drawWormholeLinks();
  });
}

// ───── Export full map state to JSON string ─────
const exportBtn = document.getElementById('exportFullBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    document.getElementById('exportFullText').value = exportFullState(editor);
    showModal('exportFullModal');
  });
}

// Copy export text to clipboard
document.getElementById('copyExportFull')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('exportFullText').value);
});

// Save export as downloadable JSON file
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

// ───── Load system reference data (ID/name/aliases) ─────
(async () => {
  await loadSystemInfo(editor);
})();

// ───── Show Import modal for full map JSON ─────
const importBtn = document.getElementById('importFullBtn');
if (importBtn) {
  importBtn.addEventListener('click', () => {
    showModal('importFullModal');
  });
}

// ---- Slice Calculation -----
document.getElementById('calcSliceBtn')?.addEventListener('click', openCalcSlicePopup);

// Parse and apply imported map JSON from text input
document.getElementById('doImportFull')?.addEventListener('click', () => {
  const text = document.getElementById('importFullText').value;
  if (!text) {
    alert("Please paste exported JSON into the box.");
    return;
  }
  importFullState(editor, text);
  closeModal('importFullModal');
});

// Load map JSON from uploaded file and fill input box
document.getElementById('importFullFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById('importFullText').value = event.target.result;
  };
  reader.readAsText(file);
});

// ───── Toggle visibility of wormhole or effect icons ─────
const btnToggleWormholes = document.getElementById('toggleWormholes');
if (btnToggleWormholes) {
  btnToggleWormholes.classList.toggle('active', !!editor.showWormholes);

  btnToggleWormholes.addEventListener('click', () => {
    editor.showWormholes = !editor.showWormholes;
    import('./features/baseOverlays.js').then(({ updateWormholeVisibility }) => {
      updateWormholeVisibility(editor);
    });
    btnToggleWormholes.classList.toggle('active', editor.showWormholes);
  });
}

const btnToggleEffects = document.getElementById('toggleEffects');
if (btnToggleEffects) {
  // Set initial .active state (on page load)
  btnToggleEffects.classList.toggle('active', !!editor.showEffects);

  btnToggleEffects.addEventListener('click', () => {
    editor.showEffects = !editor.showEffects;
    import('./features/baseOverlays.js').then(({ updateEffectsVisibility }) => {
      updateEffectsVisibility(editor);
    });
    btnToggleEffects.classList.toggle('active', editor.showEffects);
  });
}

// ───── Collapse/Expand Import/Export panel ─────
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const controlsPanel = document.getElementById('controlsPanel');

toggleControlsBtn?.addEventListener('click', () => {
  controlsPanel.classList.toggle('collapsed');
  toggleControlsBtn.textContent = controlsPanel.classList.contains('collapsed')
    ? 'Show Im/Export & mapGen'
    : 'hide Im/Export & mapGen';
});

// Enable keyboard focus for global hotkeys
document.body.tabIndex = -1;
document.body.focus();

// ───── System Lookup Modal: search and select system ID ─────
(async () => {
  await loadSystemInfo(editor);
  const searchInput = document.getElementById('systemSearch');
  const resultsList = document.getElementById('systemList');
  const jumpBtn = document.getElementById('jumpToSystemBtn');

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
        || aliases.some(a => (a || '').toUpperCase().startsWith(q));
    });

    matches = Array.from(new Map(matches.map(s => [s.id, s])).values());
    matches.slice(0, 20).forEach(sys => {
      const li = document.createElement('li');
      li.textContent = `${sys.id} – ${sys.name}`;
      li.addEventListener('click', () => {
        editor.pendingSystemId = sys.id.toString();
      });
      resultsList.appendChild(li);
    });
  });
})();

svg.addEventListener('click', e => {
  const poly = e.target.closest('polygon');
  if (!poly) return;
  const hexID = poly.dataset.label;
  if (!hexID) return;

  editor.selectedHex = hexID;

  const pid = editor.pendingSystemId;
  if (pid) {
    const sys = editor.sectorIDLookup[pid.toUpperCase()];

    if (sys) {

      const sys = editor.sectorIDLookup[pid.toUpperCase()];
      if (!sys) return;

      editor.beginUndoGroup();

      // lock history so nested setSectorType / clearAll don’t re-snapshot
      editor._historyLocked = true;
      editor.saveState(hexID);
      assignSystem(editor, sys, hexID);
      markRealIDUsed(sys.id)
      editor._historyLocked = false;

      editor.commitUndoGroup();
      redrawAllRealIDOverlays(editor);
    }
    editor.pendingSystemId = null;
  }
});

