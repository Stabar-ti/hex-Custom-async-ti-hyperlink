
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
import { importFullState, loadSystemInfo, loadLoreData } from './data/import.js';
import { initHistory } from './features/history.js';
import { showModal, closeModal } from './ui/uiModals.js';
import { assignSystem } from './features/assignSystem.js';
import { installSystemPickerUI } from './modules/SystemPicker/pickerUI.js';
//import { initHexHoverInfo } from './ui/hexHoverInfo.js';
import { openCalcSlicePopup } from './features/calcSlice.js';
import { installCustomLinksUI } from './ui/customLinksUI.js';
import { installBorderAnomaliesUI } from './ui/borderAnomaliesUI.js';
import { loadBorderAnomalyTypes, clearCache } from './constants/borderAnomalies.js';
import { overlayDefaults } from './config/toggleSettings.js';
import { setupTileCopySingleButtonAndPopup } from './ui/tileCopyPasteWizardUI.js';
import { showOptionsPopup, showOverlayOptionsPopup, showLayoutOptionsPopup, showSanityCheckPopup } from './ui/simplepPopup.js';
import { showHelpPopup, showInfoPopup, showFeaturesPopup } from './ui/staticPopups.js';
import { resetAllPopupPositions, togglePopup } from './ui/popupUI.js';
import { installFileMenu } from './ui/fileMenu.js';
import { installTopBarMenus } from './ui/topBarMenus.js';
import { installInspector } from './ui/inspector.js';
import { installStatusBar } from './ui/statusBar.js';
import { installTopBarControls } from './ui/topBarControls.js';
import { installDistanceTool } from './features/distanceTool.js';
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
  useWormholes: true,
  useAdjacencyOverrides: true,
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

// The shell's status line: armed tool, hovered hex, zoom.
installStatusBar(editor);

// The inspector column: what is on the hex under the pointer.
installInspector(editor);

// Undo/redo, zoom, pan mode and reset view — the verbs that had no buttons.
installTopBarControls(editor);
installDistanceTool(editor);

// Tell the boot guard in index.html that the module graph resolved and the editor is
// alive. Without this it shows a "failed to load" notice ten seconds in.
window.dispatchEvent(new CustomEvent('ti4:booted'));
//initHexHoverInfo(editor); // <- Add this line

installCustomLinksUI(editor);
installBorderAnomaliesUI(editor);
installSystemPickerUI(editor);
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

// Border anomaly types, reloaded rather than taken from cache.
clearCache();
loadBorderAnomalyTypes().catch(console.error);

// Distance Options is an anchored panel under the Analyse menu; the button opens and
// closes it like the rest of them.
bindMenuToggle('optionsBtn', 'options-popup', () => showOptionsPopup(editor));

// The overlay toggles (planet types, R/I, ideal R/I, RealID, tile images, wormholes,
// effects, link wormholes) all live in the Toggle Overlays popup and are wired by
// setupToggle in ui/simplepPopup.js as that popup is built. Blocks that bound them here
// at startup found nothing and never ran.

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
import { saveMapInfo } from './data/cloudflare.js';

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

// ───── Show Import modal for full map JSON ─────
const importBtn = document.getElementById('importFullBtn');
if (importBtn) {
  importBtn.addEventListener('click', () => {
    showModal('importFullModal');
  });
}

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

// Enable keyboard focus for global hotkeys
document.body.tabIndex = -1;
document.body.focus();

// ───── Data the map needs before anything can be placed on it ─────
// This used to be the head of the legacy lookup modal's IIFE. The modal is gone — the
// system picker replaced it — but these two loads were never about the modal: the map
// can't resolve a realId without SystemInfo, and the Lore module reads loreData.
(async () => {
  await loadSystemInfo(editor);
  loadLoreData(editor); // fire-and-forget: Lore module degrades gracefully without it
})();

// Placement now belongs to src/modules/SystemPicker/pickerPlacement.js, which takes the
// map click in the capture phase while a tile is armed. The handler that used to live
// here ran in the bubble phase — *after* the polygon's own handler had already painted
// the hex with the current mode — so one click both painted and assigned, and put two
// entries in the undo history.



const resetPopupBtn = document.getElementById('resetPopupPositionsBtn');
if (resetPopupBtn) {
  resetPopupBtn.onclick = () => {
    resetAllPopupPositions();
    alert('All popup positions have been reset. Please reopen your popups.');
  };
}



// Dynamically injected module scripts are async — DOMContentLoaded may have already
// fired by the time this module executes. Guard against that here.
function _onDOMReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

_onDOMReady(() => {
  setupTileCopySingleButtonAndPopup();

  // Import, export and map generation now live behind the File button rather than in a
  // panel permanently covering the map.
  installFileMenu(editor);

  // Group the rest of the bar by purpose. After installFileMenu and installTopBarControls,
  // since it moves buttons those two have already placed.
  installTopBarMenus();
});

// Any button that stays on screen while the thing it opened is open has to close it
// again. togglePopup is the rule; this adds the aria the bar's menu buttons need.
function bindMenuToggle(buttonId, popupId, open) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.onclick = () => {
    const opened = togglePopup(popupId, open);
    btn.setAttribute('aria-expanded', opened ? 'true' : 'false');
  };
}

bindMenuToggle('overlayToggleBtn', 'overlayOptionsPopup', showOverlayOptionsPopup);
bindMenuToggle('layoutToggleBtn', 'layoutOptionsPopup', showLayoutOptionsPopup);

// The three Analyse items and the three Help items opened a window each and left the
// button that opened it sitting there doing nothing on a second press.
bindMenuToggle('sanityCheckBtn', 'sanity-check-popup', () => showSanityCheckPopup());
bindMenuToggle('calcSliceBtn', 'calcSlicePopup', openCalcSlicePopup);
bindMenuToggle('helpToggle', 'help-popup', showHelpPopup);
bindMenuToggle('infoToggle', 'info-popup', showInfoPopup);
bindMenuToggle('featuresToggle', 'features-popup', showFeaturesPopup);

window.editor = editor;

