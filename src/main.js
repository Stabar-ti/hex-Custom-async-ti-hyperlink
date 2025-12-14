
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
import { exportFullState, exportMapInfo } from './data/export.js';
import { importFullState } from './data/import.js';
import { initHistory } from './features/history.js';
import { showModal, closeModal } from './ui/uiModals.js';
import { loadSystemInfo, loadHyperlaneMatrices } from './data/import.js';
import { assignSystem } from './features/assignSystem.js';
import './ui/systemLookup.js'; // Adds system search modal
import { redrawAllRealIDOverlays } from './features/realIDsOverlays.js';
import { markRealIDUsed } from './ui/uiFilters.js';
//import { initHexHoverInfo } from './ui/hexHoverInfo.js';
import { openCalcSlicePopup } from './features/calcSlice.js';
import { installCustomLinksUI } from './ui/customLinksUI.js';
import { installBorderAnomaliesUI } from './ui/borderAnomaliesUI.js';
import { redrawBorderAnomaliesOverlay } from './features/borderAnomaliesOverlay.js';
import { loadBorderAnomalyTypes } from './constants/borderAnomalies.js';
import { overlayDefaults } from './config/toggleSettings.js';
import { updateTileImageLayer } from './features/imageSystemsOverlay.js';
import { enforceSvgLayerOrder } from './draw/enforceSvgLayerOrder.js';
import { startCopyPasteWizard } from './features/tileCopyPasteWizard.js';
import { setupTileCopySingleButtonAndPopup } from './ui/tileCopyPasteWizardUI.js';
import { showOptionsPopup, showOverlayOptionsPopup, showLayoutOptionsPopup, showSanityCheckPopup } from './ui/simplepPopup.js';
import { showHelpPopup, showInfoPopup, showFeaturesPopup } from './ui/staticPopups.js';
import { resetAllPopupPositions } from './ui/popupUI.js';
import { checkRealIdUniqueness } from './features/sanityCheck.js';
import './ui/specialModePopup.js';
import { installLoreUI } from './modules/Lore/loreUI.js';
import LoreOverlay from './features/loreOverlay.js';
import { TokenManager } from './modules/Token/tokenCore.js';
import { installTokenUI } from './modules/Token/tokenUI.js';
import { TokenOverlay } from './modules/Token/tokenOverlay.js';

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
window.assignSystem = assignSystem;
window.checkRealIdUniqueness = checkRealIdUniqueness;

// Enable undo/redo history tracking
initHistory(editor);
//initHexHoverInfo(editor); // <- Add this line

installCustomLinksUI(editor);
installBorderAnomaliesUI(editor);
installLoreUI(editor);

// Initialize lore overlay
editor.loreOverlay = new LoreOverlay(editor);

// Initialize token system
console.log('Initializing Token System...');
const tokenManager = new TokenManager(editor);
window.tokenManager = tokenManager;
editor.tokenManager = tokenManager;

// Initialize token manager asynchronously
tokenManager.initialize().then(success => {
  if (success) {
    console.log('Token system initialized successfully');
    
    // Install token UI
    installTokenUI(editor);
    
    // Initialize token overlay
    editor.tokenOverlay = new TokenOverlay(editor);
    editor.tokenOverlay.initialize();
    window.tokenOverlay = editor.tokenOverlay;
    
    console.log('Token system ready');
  } else {
    console.error('Failed to initialize token system');
  }
}).catch(error => {
  console.error('Error initializing token system:', error);
});

// Initialize border anomaly types (force reload)
import { clearCache } from './constants/borderAnomalies.js';
clearCache(); // Clear any cached types
loadBorderAnomalyTypes().catch(console.error);

/*// Add Copy/Move and Cut buttons to top bar
const leftControls = document.getElementById('leftControls');
if (leftControls && !document.getElementById('tileCopyBtn')) {
  const copyBtn = document.createElement('button');
  copyBtn.id = 'tileCopyBtn';
  copyBtn.className = 'mode-button';
  copyBtn.textContent = 'Copy Tiles';
  leftControls.appendChild(copyBtn);
  copyBtn.onclick = () => startCopyPasteWizard(editor, false);
  const cutBtn = document.createElement('button');
  cutBtn.id = 'tileCutBtn';
  cutBtn.className = 'mode-button';
  cutBtn.textContent = 'Cut Tiles';
  leftControls.appendChild(cutBtn);
  cutBtn.onclick = () => startCopyPasteWizard(editor, true);
}*/

// ───── Options Modal: Save settings and update map behavior ─────
/*
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
});*/
document.getElementById('optionsBtn').onclick = () => showOptionsPopup(editor);

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

// ───── Export map info in test.json format ─────
const exportMapInfoBtn = document.getElementById('exportMapInfoBtn');
if (exportMapInfoBtn) {
  exportMapInfoBtn.addEventListener('click', async () => {
    const includeFlavourText = document.getElementById('exportMapInfoIncludeFlavourText')?.checked ?? false;
    const mapInfo = await exportMapInfo(editor, { includeFlavourText });
    document.getElementById('exportMapInfoText').value = JSON.stringify(mapInfo, null, 2);
    showModal('exportMapInfoModal');
  });
}

// Copy map info export text to clipboard
document.getElementById('copyExportMapInfo')?.addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('exportMapInfoText').value);
});

// Save map info export as downloadable JSON file
document.getElementById('downloadExportMapInfo')?.addEventListener('click', async () => {
  const includeFlavourText = document.getElementById('exportMapInfoIncludeFlavourText')?.checked ?? false;
  const mapInfo = await exportMapInfo(editor, { includeFlavourText });
  const data = JSON.stringify(mapInfo, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ti4-map-info.json';
  link.click();
  URL.revokeObjectURL(url);
});

// ───── Cloudflare upload handlers ─────
// Import Cloudflare functions
import { saveMap, saveMapInfo } from './data/cloudflare.js';

// Save map to Cloudflare with 48h link
const saveMapCloudflareBtn = document.getElementById('saveMapCloudflareBtn');
if (saveMapCloudflareBtn) {
  saveMapCloudflareBtn.addEventListener('click', () => {
    saveMap(editor);
  });
}

// Save map info to Cloudflare with 48h link
const saveMapInfoCloudflareBtn = document.getElementById('saveMapInfoCloudflareBtn');
if (saveMapInfoCloudflareBtn) {
  saveMapInfoCloudflareBtn.addEventListener('click', () => {
    saveMapInfo(editor);
  });
}

// Import map info from AsyncTI format
const importMapInfoBtn = document.getElementById('importMapInfoBtn');
if (importMapInfoBtn) {
  importMapInfoBtn.addEventListener('click', () => {
    showModal('importMapInfoModal');
  });
}

// ───── Load system reference data (ID/name/aliases) ─────
(async () => {
  await loadSystemInfo(editor);
  await loadHyperlaneMatrices(editor);
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

// Import mapInfo from AsyncTI format
document.getElementById('doImportMapInfo')?.addEventListener('click', async () => {
  const text = document.getElementById('importMapInfoText').value;
  if (!text) {
    alert("Please paste JSON or upload a file.");
    return;
  }
  try {
    const { importMapInfo } = await import('./data/import.js');
    await importMapInfo(editor, text);
    closeModal('importMapInfoModal');
    alert('Map imported successfully!');
  } catch (err) {
    console.error('Import error:', err);
    alert('Import failed: ' + err.message);
  }
});

// Load mapInfo JSON from uploaded file and fill input box
document.getElementById('importMapInfoFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById('importMapInfoText').value = event.target.result;
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
      enforceSvgLayerOrder(editor.svg); // <--- ENSURE PROPER LAYER ORDER
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
      enforceSvgLayerOrder(editor.svg); // <--- ENSURE PROPER LAYER ORDER
    });
    btnToggleEffects.classList.toggle('active', editor.showEffects);
  });
}

const btnTileImages = document.getElementById('toggleTileImagesBtn');
if (btnTileImages) {
  editor.showTileImages = !!editor.showTileImages; // default (or from localStorage)
  btnTileImages.classList.toggle('active', editor.showTileImages);
  btnTileImages.addEventListener('click', () => {
    editor.showTileImages = !editor.showTileImages;
    btnTileImages.classList.toggle('active', editor.showTileImages);
    updateTileImageLayer(editor);
    enforceSvgLayerOrder(editor.svg); // <--- ENSURE PROPER LAYER ORDER
  });
}

// ───── Collapse/Expand Import/Export panel ─────
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const controlsPanel = document.getElementById('controlsPanel');
const controlsPanelOpenBtn = document.getElementById('controlsPanelOpenBtn');

toggleControlsBtn?.addEventListener('click', () => {
  controlsPanel.classList.toggle('collapsed');
  const isCollapsed = controlsPanel.classList.contains('collapsed');
  toggleControlsBtn.textContent = isCollapsed
    ? 'Show Im/Export & mapGen'
    : 'hide Im/Export & mapGen';
  if (controlsPanelOpenBtn) {
    controlsPanelOpenBtn.style.display = isCollapsed ? 'block' : 'none';
  }
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
    // Use the new popup system if available, fallback to old modal
    if (typeof window.showSystemLookupPopup === 'function') {
      window.showSystemLookupPopup();
    } else {
      showModal('systemLookupModal');
      searchInput.value = '';
      resultsList.innerHTML = '';
      editor.pendingSystemId = null;
      setTimeout(() => searchInput.focus(), 0);
    }
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

  // --- Prevent ANY action (including hyperlane mode) if system lookup popup is open ---
  //const lookupPopupOpen = document.getElementById('system-lookup-popup') !== null;
  //const lookupModalOpen = document.getElementById('systemLookupModal')?.classList.contains('open');
  //if (lookupPopupOpen || lookupModalOpen) {
  // Optionally, flash or shake modal/popup here to show user it's still open
  //  return;
  //}

  // --- System assignment from Async Tiles ---
  if (editor.pendingSystemId) {
    editor.selectedHex = hexID;
    const sys = editor.sectorIDLookup[editor.pendingSystemId.toUpperCase()];
    if (sys) {
      editor.beginUndoGroup();
      editor._historyLocked = true;
      editor.saveState(hexID);
      assignSystem(editor, sys, hexID);
      editor._historyLocked = false;
      editor.commitUndoGroup();
      redrawAllRealIDOverlays(editor);
    }
    editor.pendingSystemId = null;
    return; // <--- Prevents hyperlane drawing after system assign!
  }

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
      editor._historyLocked = false;

      editor.commitUndoGroup();
      redrawAllRealIDOverlays(editor);
    }
    editor.pendingSystemId = null;
  }
});


const resetPopupBtn = document.getElementById('resetPopupPositionsBtn');
if (resetPopupBtn) {
  resetPopupBtn.onclick = () => {
    resetAllPopupPositions();
    alert('All popup positions have been reset. Please reopen your popups.');
  };
}



document.addEventListener('DOMContentLoaded', () => {
  setupTileCopySingleButtonAndPopup();

  // Controls Panel Hide/Show Arrow Buttons
  const controlsPanel = document.getElementById('controlsPanel');
  controlsPanel.classList.add('size-xlarge'); // Set initial size
  const controlsPanelCloseBtn = document.getElementById('controlsPanelCloseBtn');
  const controlsPanelOpenBtn = document.getElementById('controlsPanelOpenBtn');
  if (controlsPanel && controlsPanelCloseBtn && controlsPanelOpenBtn) {
    controlsPanelCloseBtn.addEventListener('click', () => {
      controlsPanel.classList.add('collapsed');
      controlsPanelOpenBtn.style.display = 'block';
      controlsPanelOpenBtn.setAttribute('aria-hidden', 'false');
      controlsPanelOpenBtn.tabIndex = 0;
    });
    controlsPanelOpenBtn.addEventListener('click', () => {
      controlsPanel.classList.remove('collapsed');
      controlsPanelOpenBtn.style.display = 'none';
      controlsPanelOpenBtn.setAttribute('aria-hidden', 'true');
      controlsPanelOpenBtn.tabIndex = -1;
    });
    // Hide open button if panel is visible on load
    if (!controlsPanel.classList.contains('collapsed')) {
      controlsPanelOpenBtn.style.display = 'none';
      controlsPanelOpenBtn.setAttribute('aria-hidden', 'true');
      controlsPanelOpenBtn.tabIndex = -1;
    }
  }

  // Also handle toggleControlsBtn from Layout Options popup
  const toggleControlsBtn = document.getElementById('toggleControlsBtn');
  if (toggleControlsBtn && controlsPanel && controlsPanelOpenBtn) {
    toggleControlsBtn.addEventListener('click', () => {
      controlsPanel.classList.toggle('collapsed');
      const isCollapsed = controlsPanel.classList.contains('collapsed');
      toggleControlsBtn.textContent = isCollapsed
        ? 'Show Im/Export & mapGen'
        : 'hide Im/Export & mapGen';
      controlsPanelOpenBtn.style.display = isCollapsed ? 'block' : 'none';
      controlsPanelOpenBtn.setAttribute('aria-hidden', isCollapsed ? 'false' : 'true');
      controlsPanelOpenBtn.tabIndex = isCollapsed ? 0 : -1;
    });
  }
});

document.getElementById('helpToggle').onclick = showHelpPopup;
document.getElementById('infoToggle').onclick = showInfoPopup;
document.getElementById('featuresToggle').onclick = showFeaturesPopup;

const overlayToggleBtn = document.getElementById('overlayToggleBtn');
if (overlayToggleBtn) {
  overlayToggleBtn.onclick = () => {
    console.log('Overlay toggle button clicked'); // Debug: log on click
    showOverlayOptionsPopup();
  };
  console.log('Overlay toggle button initialized'); // Debug: log on page load
}

const layoutToggleBtn = document.getElementById('layoutToggleBtn');
if (layoutToggleBtn) {
  layoutToggleBtn.onclick = () => showLayoutOptionsPopup();
}

const sanityCheckBtn = document.getElementById('sanityCheckBtn');
if (sanityCheckBtn) {
  sanityCheckBtn.onclick = () => showSanityCheckPopup();
}

// ───── Add test functions to global window for debugging ─────
window.editor = editor;
window.testBorderAnomalies = () => editor.addTestBorderAnomalies();
window.redrawBorderAnomalies = async () => {
  const { drawBorderAnomaliesLayer } = await import('./draw/borderAnomaliesDraw.js');
  drawBorderAnomaliesLayer(editor);
};

