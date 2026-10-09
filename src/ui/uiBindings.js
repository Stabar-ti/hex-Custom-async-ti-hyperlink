// ───────────────────────────────────────────────────────────────
// ui/uiBindings.js
// Wires up all UI controls, buttons, and interactive elements
// ───────────────────────────────────────────────────────────────

import { openSectorControlsPopup } from './uisectorControls.js';
import { showModal, closeModal } from './uiModals.js';
import { isEmptyHex } from '../features/tileClipboardEngine.js';
import { MAX_MAP_RINGS } from '../constants/constants.js';

import { exportAdjacencyOverrides, exportCustomAdjacents, exportBorderAnomaliesGrouped } from '../data/export.js'; // use your actual path

// A key whose list has been emptied is not content: removing a planet's last lore entry
// or token can leave the key behind.
const nonEmpty = (/** @type {any} */ o) => !!o && Object.values(o)
  .some(v => (Array.isArray(v) ? v.length > 0 : v != null));

/**
 * Whether cutting a hex would lose anything. Everything a resize removes counts: on top of
 * what isEmptyHex looks at, the lore, the tokens and the custom links, which the old
 * check here missed — a hex holding only lore was cut without a word.
 *
 * @param {any} h
 */
function hasContent(h) {
  return !isEmptyHex(h)
    || h.systemLore?.length > 0 || nonEmpty(h.planetLore)
    || h.systemTokens?.length > 0 || nonEmpty(h.planetTokens)
    || nonEmpty(h.customAdjacents) || nonEmpty(h.adjacencyOverrides) || nonEmpty(h.borderAnomalies);
}

export function bindUI(editor) {
  // Nothing to do here for the theme switcher, the three help buttons or any of the
  // overlay toggles. Those controls all live inside popups that simplepPopup.js builds on
  // demand, so none of them exists when bindUI runs — binding them here attached to
  // nothing. (The help buttons pointed at #controlsModal, #infoModal and #featuresModal,
  // which were removed from index.html; showModal on a missing id is a silent no-op, which
  // is why it never surfaced.) setupToggle in simplepPopup.js is the live wiring, and
  // main.js binds the help buttons to the real popups.

  // Rearrange control panel (left/top/right)
  document.getElementById('arrangeBtn')?.addEventListener('click', () => editor.cycleControlPanelPosition());

  // Map generation controls. cornerToggle is bound further down, in the handler that
  // also resets the ring count; binding it here as well fired toggleCorners twice per change.
  document.getElementById('genMapBtn')?.addEventListener('click', () => editor.generateMap());

  // Advanced Export Toggle. This used to set the button's textContent, which meant the
  // label and the caret were one string — and would now wipe out the caret element.
  document.getElementById('advancedExportToggle')?.addEventListener('click', () => {
    const container = document.getElementById('advancedExportContainer');
    const button = document.getElementById('advancedExportToggle');
    if (container && button) {
      const open = container.style.display === 'none';
      container.style.display = open ? 'block' : 'none';
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      const caret = button.querySelector('.fm-caret');
      if (caret) caret.textContent = open ? '▴' : '▾';
    }
  });

  // Export buttons
  document.getElementById('exportHL')?.addEventListener('click', () => editor.exportData());
  document.getElementById('exportTypes')?.addEventListener('click', () => editor.exportSectorTypes());
  document.getElementById('exportPos')?.addEventListener('click', () => editor.exportHyperlaneTilePositions());
  document.getElementById('exportWormholePos')?.addEventListener('click', () => editor.exportWormholePositions());

  // Import popups (modals)
  document.getElementById('importHLBtn')?.addEventListener('click', () => showModal('importModal'));
  document.getElementById('importTypesBtn')?.addEventListener('click', () => showModal('importTypesModal'));
  document.getElementById('doImportHL')?.addEventListener('click', () => editor.importData());
  document.getElementById('doImportTypes')?.addEventListener('click', () => editor.importSectorTypes());

  // Clipboard buttons for export
  document.getElementById('copyExportHL')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportText')?.value || ''));
  document.getElementById('copyExportTypes')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportTypesText')?.value || ''));
  document.getElementById('copyExportPos')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportHyperlanePositionsText')?.value || ''));
  document.getElementById('copyExportWormholePos')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportWormholePositionsText')?.value || ''));

  // Auto-open the sector controls popup (modernized version)
  openSectorControlsPopup(editor);

  // Undo/redo hotkeys (Ctrl/Cmd+Z and Shift+Z)
  document.addEventListener('keydown', (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) editor.redo(); else editor.undo();
    }
  });

  // Modal close (all buttons with data-close attribute)
  document.querySelectorAll('button[data-close]')?.forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // CSV loader
  document.getElementById('loadCsvBtn')?.addEventListener('click', () =>
    document.getElementById('idImportCSV')?.click());
  document.getElementById('idImportCSV')?.addEventListener('change', e => editor._onCsvUpload?.(e));

  // Wormhole link overlay toggle (on/off)
  document.getElementById('linkWormholesBtn')?.addEventListener('click', () => {
    if (editor.wormholeLinksShown) {
      editor.clearWormholeLinks();
    } else {
      editor.drawWormholeLinks();
    }
    editor.wormholeLinksShown = !editor.wormholeLinksShown;
  });

  // Ring controls. All three resize the map in place.
  //
  // Which hexes would lose content is measured from the map rather than the Rings box, and
  // through the same list the resize cuts, which leaves the corners alone: this used to
  // count TL/TR/BL/BR, so anything on a corner warned on every shrink though nothing there
  // was ever removed.
  const confirmShrinkTo = (/** @type {number} */ rings) => {
    const lostHexes = editor.hexesCutBy(rings).filter(hasContent);
    if (!lostHexes.length) return true;
    return window.confirm(`Warning: ${lostHexes.length} tile(s) with data will be removed if you shrink the map. Proceed?`);
  };

  document.getElementById('addRingBtn')?.addEventListener('click', () => editor.addRing());
  document.getElementById('removeRingBtn')?.addEventListener('click', () => {
    if (editor.currentRings <= 1) return; // Don't go below 1
    if (confirmShrinkTo(editor.currentRings - 1)) editor.removeRing();
  });

  // Typing a count resizes too. It used to do nothing until Generate Empty Map, so the box
  // could say one size while the map was another.
  document.getElementById('ringCount')?.addEventListener('change', (e) => {
    const rings = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
    const valid = rings >= 1 && rings <= MAX_MAP_RINGS && rings !== editor.currentRings;
    if (valid && (rings > editor.currentRings || confirmShrinkTo(rings))) {
      editor._setRingCount(rings);
    } else {
      editor._syncRingControls();
    }
  });

  // Corner toggle: When enabled, set ring count and redraw map with corners
  document.getElementById('cornerToggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      const ringsInput = document.getElementById('ringCount');
      if (ringsInput) ringsInput.value = 6;
    }
    editor.toggleCorners(e.target.checked);
  });

  // Default BFS radius. The control that sets it is #maxDistanceInput in the Distance
  // Options popup, read by that popup's Save button; a handler here bound #distanceCalcLimit,
  // an id that does not exist anywhere in the project.
  editor.maxDistance = 3;

  // layoutToggleBtn and overlayToggleBtn are bound in main.js, which opens the popups
  // simplepPopup.js builds. A second binding used to live here that toggled the *static*
  // markup's display and injected its own ✕; it ran first on every click and was then
  // undone by the rebuild, which is why neither button ever closed its own popup.

  // A dropdown handler for '.popup-group .dropdown-toggle' also lived here. No markup in
  // the project uses either class.

  // Show popup for Adjacency Overrides
  document.getElementById('exportAdjOverridesBtn')?.addEventListener('click', () => {
    document.getElementById('exportLinksText').value = exportAdjacencyOverrides(editor);
    document.getElementById('exportLinksModal').style.display = 'block';
  });

  // Show popup for Custom Links
  document.getElementById('exportCustomAdjBtn')?.addEventListener('click', () => {
    document.getElementById('exportLinksText').value = exportCustomAdjacents(editor);
    document.getElementById('exportLinksModal').style.display = 'block';
  });

  // Close popup
  document.getElementById('closeExportLinksModal')?.addEventListener('click', () => {
    document.getElementById('exportLinksModal').style.display = 'none';
  });

  // Copy output to clipboard
  document.getElementById('copyExportLinks')?.addEventListener('click', () => {
    const txt = document.getElementById('exportLinksText').value;
    navigator.clipboard.writeText(txt);
  });

  // Listener for the button
  document.getElementById('exportBorderAnomaliesBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('exportBorderAnomaliesText');
    const doubleSided = !!document.getElementById('borderAnomalyDoubleSided')?.checked;
    textarea.value = exportBorderAnomaliesGrouped(editor, doubleSided);
    document.getElementById('exportBorderAnomaliesModal').style.display = 'block';
  });

  const anomalyDoubleSidedBox = document.getElementById('borderAnomalyDoubleSided');
  if (anomalyDoubleSidedBox) {
    anomalyDoubleSidedBox.addEventListener('change', () => {
      const textarea = document.getElementById('exportBorderAnomaliesText');
      const doubleSided = !!anomalyDoubleSidedBox.checked;
      textarea.value = exportBorderAnomaliesGrouped(editor, doubleSided);
    });
  }

  // Copy logic
  document.getElementById('copyExportBorderAnomalies')?.addEventListener('click', () => {
    const textarea = document.getElementById('exportBorderAnomaliesText');
    textarea.select();
    document.execCommand('copy');
  });

  // Modal close logic (optional if you use a shared handler)
  document.querySelectorAll('[data-close="exportBorderAnomaliesModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('exportBorderAnomaliesModal').style.display = 'none';
    });
  });


}
