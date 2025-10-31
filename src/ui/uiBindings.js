// ───────────────────────────────────────────────────────────────
// ui/uiBindings.js
// Wires up all UI controls, buttons, and interactive elements
// ───────────────────────────────────────────────────────────────

import { toggleTheme } from './uiTheme.js';
import { populateSectorControls, openSectorControlsPopup } from './uisectorControls.js';
import { showModal, closeModal } from './uiModals.js';
import { updateLayerVisibility } from '../features/realIDsOverlays.js';
import { generateRings } from '../draw/drawHexes.js';
import { makePopupDraggable, syncToggleButtons } from './uiUtils.js';
import { toggleBorderAnomaliesOverlay } from '../features/borderAnomaliesOverlay.js';
import { toggleCustomLinksOverlay } from '../features/customLinksOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

import { exportAdjacencyOverrides, exportCustomAdjacents, exportBorderAnomaliesGrouped } from '../data/export.js'; // use your actual path

export function bindUI(editor) {
  // Theme switcher
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  // Modal openers
  document.getElementById('helpToggle')?.addEventListener('click', () => showModal('controlsModal'));
  document.getElementById('infoToggle')?.addEventListener('click', () => showModal('infoModal'));
  document.getElementById('featuresToggle')?.addEventListener('click', () => showModal('featuresModal'));

  // Overlay toggles (Planet Types, R/I, IdealRI, RealID)
  const btnPlanetTypes = document.getElementById('togglePlanetTypes');
  btnPlanetTypes?.addEventListener('click', () => {
    editor.showPlanetTypes = !editor.showPlanetTypes;
    updateLayerVisibility(editor, 'planetTypeLayer', editor.showPlanetTypes);
    btnPlanetTypes.classList.toggle('active', editor.showPlanetTypes);
    // Ensure correct SVG layering after toggling
    enforceSVGLayerOrder(editor.svg);
  });

  const btnResInf = document.getElementById('toggleResInf');
  btnResInf?.addEventListener('click', () => {
    editor.showResInf = !editor.showResInf;
    updateLayerVisibility(editor, 'resInfLayer', editor.showResInf);
    btnResInf.classList.toggle('active', editor.showResInf);
    // Ensure correct SVG layering after toggling
    enforceSVGLayerOrder(editor.svg);
  });

  const btnIdealRI = document.getElementById('toggleIdealRI');
  btnIdealRI?.addEventListener('click', () => {
    editor.showIdealRI = !editor.showIdealRI;
    updateLayerVisibility(editor, 'idealRILayer', editor.showIdealRI);
    btnIdealRI.classList.toggle('active', editor.showIdealRI);
    // Ensure correct SVG layering after toggling
    enforceSVGLayerOrder(editor.svg);
  });

  const btnRealID = document.getElementById('toggleRealID');
  btnRealID?.addEventListener('click', () => {
    editor.showRealID = !editor.showRealID;
    updateLayerVisibility(editor, 'realIDLabelLayer', editor.showRealID);
    btnRealID.classList.toggle('active', editor.showRealID);
    // Ensure correct SVG layering after toggling
    enforceSVGLayerOrder(editor.svg);
  });

  // IDs for all toggles of each overlay
  const borderAnomalyBtnIds = ['toggleBorderAnomaliesOverlay', 'toggleBorderAnomalies'];
  const customLinksBtnIds = ['toggleCustomLinksOverlay', 'toggleCustomLinks'];

  // Generalized handlers
  function toggleBorderAnomaliesAll() {
    toggleBorderAnomaliesOverlay(editor);  // This toggles editor.showBorderAnomalies and SVG
    syncToggleButtons(borderAnomalyBtnIds, editor.showBorderAnomalies);
    // Ensure correct SVG layering after toggling
    enforceSVGLayerOrder(editor.svg);
  }
  function toggleCustomLinksAll() {
    editor.showCustomLinks = !editor.showCustomLinks;
    toggleCustomLinksOverlay(editor);
    syncToggleButtons(customLinksBtnIds, editor.showCustomLinks);
    // Ensure correct SVG layering after toggling
    enforceSVGLayerOrder(editor.svg);
  }

  // Attach all buttons (repeat if you add more UI for these overlays)
  borderAnomalyBtnIds.forEach(id => {
    document.getElementById(id)?.addEventListener('click', toggleBorderAnomaliesAll);
  });
  customLinksBtnIds.forEach(id => {
    document.getElementById(id)?.addEventListener('click', toggleCustomLinksAll);
  });

  // Set initial state on page load/UI refresh (after all DOM exists)
  syncToggleButtons(borderAnomalyBtnIds, editor.showBorderAnomalies); // On load
  syncToggleButtons(customLinksBtnIds, editor.showCustomLinks);

  // Rearrange control panel (left/top/right)
  document.getElementById('arrangeBtn')?.addEventListener('click', () => editor.cycleControlPanelPosition());

  // Map generation controls
  document.getElementById('genMapBtn')?.addEventListener('click', () => editor.generateMap());
  document.getElementById('cornerToggle')?.addEventListener('change', e => editor.toggleCorners(e.target.checked));

  // Advanced Export Toggle
  document.getElementById('advancedExportToggle')?.addEventListener('click', () => {
    const container = document.getElementById('advancedExportContainer');
    const button = document.getElementById('advancedExportToggle');
    if (container && button) {
      const isHidden = container.style.display === 'none';
      container.style.display = isHidden ? 'block' : 'none';
      button.textContent = isHidden ? 'Advanced Fragmented Export ▴' : 'Advanced Fragmented Export ▾';
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

  // Ring add/remove controls
  document.getElementById('addRingBtn')?.addEventListener('click', () => editor.addRing());
  document.getElementById('removeRingBtn')?.addEventListener('click', () => {
    const ringsInput = document.getElementById('ringCount');
    const rings = ringsInput ? parseInt(ringsInput.value, 10) : 1;
    if (rings <= 1) return; // Don't go below 1

    // Gather which labels/hexes would be lost
    const layout = editor.ringDirections ? generateRings(rings, editor.fillCorners) : [];
    const nextLayout = editor.ringDirections ? generateRings(rings - 1, editor.fillCorners) : [];
    const nextLabels = new Set(nextLayout.map(h => h.label));
    const lostHexes = Object.values(editor.hexes).filter(h => !nextLabels.has(h.label) && (
      h.baseType || h.realId || (h.planets && h.planets.length) || (h.wormholes && h.wormholes.size)
    ));
    if (lostHexes.length) {
      const confirmMsg = `Warning: ${lostHexes.length} tile(s) with data will be removed if you shrink the map. Proceed?`;
      if (!window.confirm(confirmMsg)) return;
    }
    editor.removeRing();
  });

  // Corner toggle: When enabled, set ring count and redraw map with corners
  document.getElementById('cornerToggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      const ringsInput = document.getElementById('ringCount');
      if (ringsInput) ringsInput.value = 6;
    }
    editor.toggleCorners(e.target.checked);
  });

  // Distance overlay maximum distance
  editor.maxDistance = 3;
  document.getElementById('distanceCalcLimit')?.addEventListener('change', (e) => {
    editor.maxDistance = parseInt(e.target.value, 10);
  });

  // Dropdown open/close logic for .popup-group .dropdown-toggle (effects/wormholes)
  document.querySelectorAll('.popup-group .dropdown-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const group = btn.closest('.popup-group');
      if (!group) return;
      group.classList.toggle('open');
      // Hide other open dropdowns
      document.querySelectorAll('.popup-group').forEach(g => {
        if (g !== group) g.classList.remove('open');
      });
    });
  });

  // (Any popups you want to initialize for draggable, etc, can go here)


  // Close all dropdowns if click anywhere else
  document.getElementById('layoutToggleBtn')?.addEventListener('click', () => {
    const popup = document.getElementById('layoutOptionsPopup');
    if (!popup) return;

    // Toggle display
    const isVisible = popup.style.display === 'block';
    popup.style.display = isVisible ? 'none' : 'block';

    // Only make draggable once
    if (!popup.dataset.draggableInitialized) {
      makePopupDraggable('layoutOptionsPopup');
      popup.dataset.draggableInitialized = 'true';
    }

    // Only add close button if not present
    if (!popup.querySelector('.popup-close-btn')) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'popup-close-btn';
      closeBtn.title = 'Close';
      closeBtn.innerHTML = '✕';
      // If you have a .draggable-handle div, append to it, else append to popup
      const handle = popup.querySelector('.draggable-handle');
      (handle || popup).appendChild(closeBtn);

      closeBtn.onclick = () => {
        popup.style.display = 'none';
      };
    }
  });


  // Open popup below the button, clamped to viewport
  document.getElementById('overlayToggleBtn')?.addEventListener('click', () => {
    const popup = document.getElementById('overlayOptionsPopup');
    if (!popup) return;

    // Toggle display
    const isVisible = popup.style.display === 'block';
    popup.style.display = isVisible ? 'none' : 'block';

    // Make draggable ONCE
    if (!popup.dataset.draggableInitialized) {
      makePopupDraggable('overlayOptionsPopup');
      popup.dataset.draggableInitialized = 'true';
    }

    // Add close button if not present
    if (!popup.querySelector('.popup-close-btn')) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'popup-close-btn';
      closeBtn.title = 'Close';
      closeBtn.innerHTML = '✕';
      const handle = popup.querySelector('.draggable-handle');
      (handle || popup).appendChild(closeBtn);
      closeBtn.onclick = () => { popup.style.display = 'none'; };
    }
  });

  // Close button logic
  document.querySelector('#overlayOptionsPopup .popup-close-btn')?.addEventListener('click', () => {
    document.getElementById('overlayOptionsPopup').style.display = 'none';
  });


  // Make popup draggable if you want (optional)
  // makePopupDraggable('exportLinksModal');

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
