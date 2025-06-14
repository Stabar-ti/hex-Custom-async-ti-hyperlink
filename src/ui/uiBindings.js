// ─────────────── ui/uiBindings.js ───────────────
import { toggleTheme } from './uiTheme.js';
import { populateSectorControls } from './uisectorControls.js';
import { showModal, closeModal } from './uiModals.js';
import { updateLayerVisibility } from '../features/realIDsOverlays.js';

export function bindUI(editor) {
  // Theme toggle
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  // Modal toggles
  document.getElementById('helpToggle')?.addEventListener('click', () => showModal('controlsModal'));
  document.getElementById('infoToggle')?.addEventListener('click', () => showModal('infoModal'));
  document.getElementById('featuresToggle')?.addEventListener('click', () => showModal('featuresModal'));

  // RealID Overlay toggles
  document.getElementById('togglePlanetTypes')?.addEventListener('click', () => {
    editor.showPlanetTypes = !editor.showPlanetTypes;
    updateLayerVisibility(editor, 'planetTypeLayer', editor.showPlanetTypes);
  });
  document.getElementById('toggleResInf')?.addEventListener('click', () => {
    editor.showResInf = !editor.showResInf;
    updateLayerVisibility(editor, 'resInfLayer', editor.showResInf);
  });
  document.getElementById('toggleIdealRI')?.addEventListener('click', () => {
    editor.showIdealRI = !editor.showIdealRI;
    updateLayerVisibility(editor, 'idealRILayer', editor.showIdealRI);
  });
  document.getElementById('toggleRealID')?.addEventListener('click', () => {
    editor.showRealID = !editor.showRealID;
    updateLayerVisibility(editor, 'realIDLabelLayer', editor.showRealID);
  });


  // Control arrangement
  document.getElementById('arrangeBtn')?.addEventListener('click', () => editor.cycleControlPanelPosition());

  // Map generation
  document.getElementById('genMapBtn')?.addEventListener('click', () => editor.generateMap());
  document.getElementById('cornerToggle')?.addEventListener('change', e => editor.toggleCorners(e.target.checked));

  // Export buttons
  document.getElementById('exportHL')?.addEventListener('click', () => editor.exportData());
  document.getElementById('exportTypes')?.addEventListener('click', () => editor.exportSectorTypes());
  document.getElementById('exportPos')?.addEventListener('click', () => editor.exportHyperlaneTilePositions());
  document.getElementById('exportWormholePos')?.addEventListener('click', () => editor.exportWormholePositions());

  // Import modals
  document.getElementById('importHLBtn')?.addEventListener('click', () => showModal('importModal'));
  document.getElementById('importTypesBtn')?.addEventListener('click', () => showModal('importTypesModal'));
  document.getElementById('doImportHL')?.addEventListener('click', () => editor.importData());
  document.getElementById('doImportTypes')?.addEventListener('click', () => editor.importSectorTypes());

  //Layout options
  document.getElementById('layoutToggleBtn')?.addEventListener('click', () => {
    document.getElementById('layoutControls').classList.toggle('hidden');
  });

  // Overlay Toggle
  document.getElementById('overlayToggleBtn')?.addEventListener('click', () => {
    document.getElementById('overlayControls').classList.toggle('hidden');
  });

  // Copy buttons
  document.getElementById('copyExportHL')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportText').value));
  document.getElementById('copyExportTypes')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportTypesText').value));
  document.getElementById('copyExportPos')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportHyperlanePositionsText').value));
  document.getElementById('copyExportWormholePos')?.addEventListener('click', () =>
    navigator.clipboard.writeText(document.getElementById('exportWormholePositionsText').value));

  populateSectorControls(editor);

  // Undo/redo
  document.addEventListener('keydown', (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) editor.redo(); else editor.undo();
    }
  });

  // Modal close buttons
  document.querySelectorAll('button[data-close]')?.forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // CSV loader
  document.getElementById('loadCsvBtn')?.addEventListener('click', () =>
    document.getElementById('idImportCSV').click());
  document.getElementById('idImportCSV')?.addEventListener('change', e => editor._onCsvUpload(e));

  // Wormhole linking toggle
  document.getElementById('linkWormholesBtn')?.addEventListener('click', () => {
    if (editor.wormholeLinksShown) {
      editor.clearWormholeLinks();
    } else {
      editor.drawWormholeLinks();
    }
    editor.wormholeLinksShown = !editor.wormholeLinksShown;
  });

  document.getElementById('cornerToggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.getElementById('ringCount').value = 9;
    }
    editor.toggleCorners(e.target.checked);
  });

  editor.maxDistance = 3;
  document.getElementById('distanceCalcLimit')?.addEventListener('change', (e) => {
    editor.maxDistance = parseInt(e.target.value, 10);
  });
}