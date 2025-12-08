// ───────────────────────────────────────────────────────────────
// ui/sectorControls.js
// Populates the sector control panel with interactive tool buttons
// Converted to popup-based system that auto-opens and is minimizable only
// ───────────────────────────────────────────────────────────────

import { sectorModes, wormholeTypes } from '../constants/constants.js';
import { showModal } from './uiModals.js';
import { makePopupDraggable } from './uiUtils.js';
import { showPopup, hidePopup } from './popupUI.js';

let sectorControlsPopup = null;

export function populateSectorControls(editor) {
  // Legacy function - now just opens the popup
  openSectorControlsPopup(editor);
}

export function openSectorControlsPopup(editor) {
  // Close existing popup if any
  if (sectorControlsPopup) {
    hidePopup('sectorControlsPopupModal');
  }

  // Create the content for the popup
  const content = createSectorControlsContent(editor);

  // Show the popup
  sectorControlsPopup = showPopup({
    id: 'sectorControlsPopupModal',
    className: 'layout-options-popup sector-controls-popup',
    title: 'Sector Controls',
    draggable: true,
    dragHandleSelector: '.popup-ui-titlebar',
    scalable: true, // Allow users to resize the popup
    rememberPosition: true,
    modal: false, // Allow title bar creation, we'll manually remove close button
    style: {
      left: '20px', // Position on the left side like the original container
      top: '80px',
      minWidth: '180px',
      maxWidth: '400px',
      minHeight: '200px',
      maxHeight: '800px',
      color: '#fff',
      border: '2px solid #4a9eff',
      boxShadow: '0 8px 40px #000a',
      padding: '0',
      zIndex: 1200,
      borderRadius: '8px'
    },
    content: content,
    onClose: () => {
      sectorControlsPopup = null;
    }
  });

  // Remove the close button and add custom minimize button
  customizeTitleBar(sectorControlsPopup);

  return sectorControlsPopup;
}

function customizeTitleBar(popup) {
  const titleBar = popup.querySelector('.popup-ui-titlebar');
  if (!titleBar) return;

  // Remove the close button
  const closeBtn = titleBar.querySelector('.popup-ui-close');
  if (closeBtn) {
    closeBtn.remove();
  }

  // Add custom minimize button
  addMinimizeButton(popup);
}

function addMinimizeButton(popup) {
  const titleBar = popup.querySelector('.popup-ui-titlebar');
  if (!titleBar) return;

  // Create minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'popup-ui-minimize wizard-btn';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.style.fontSize = '1.2rem';
  minimizeBtn.style.width = '28px';
  minimizeBtn.style.height = '28px';
  minimizeBtn.style.lineHeight = '28px';
  minimizeBtn.style.position = 'relative';
  minimizeBtn.style.marginLeft = '8px';
  minimizeBtn.style.display = 'flex';
  minimizeBtn.style.alignItems = 'center';
  minimizeBtn.style.justifyContent = 'center';
  minimizeBtn.style.borderRadius = '0';
  minimizeBtn.style.border = '1px solid #666';
  minimizeBtn.style.background = '#333';
  minimizeBtn.style.color = '#fff';
  minimizeBtn.style.cursor = 'pointer';

  let isMinimized = false;
  let originalHeight = popup.style.height;

  minimizeBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent popup dragging
    const content = popup.querySelector('.sector-controls-content');
    if (!content) return;

    if (isMinimized) {
      // Restore
      content.style.display = 'block';
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize';
      popup.style.height = originalHeight || 'auto';
      popup.style.resize = 'both'; // Re-enable resizing
      isMinimized = false;
    } else {
      // Minimize
      originalHeight = popup.style.height; // Store current height
      content.style.display = 'none';
      minimizeBtn.innerHTML = '□';
      minimizeBtn.title = 'Restore';
      popup.style.height = '40px';
      popup.style.resize = 'none'; // Disable resizing when minimized
      isMinimized = true;
    }
  };

  titleBar.appendChild(minimizeBtn);
}

function createSectorControlsContent(editor) {
  const container = document.createElement('div');
  container.className = 'sector-controls-content';
  container.style.padding = '15px';
  container.style.overflow = 'auto'; // Allow scrolling if content is too long
  container.style.width = '100%'; // Explicit width constraint
  container.style.maxWidth = '100%'; // Never exceed parent
  container.style.boxSizing = 'border-box';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.minWidth = '0'; // Prevent flex items from growing beyond container

  // ───────────── Async Tiles Button ─────────────
  const realIdBtn = document.createElement('button');
  realIdBtn.id = 'jumpToSystemBtn';
  realIdBtn.className = 'mode-button btn-lookup-id';
  realIdBtn.textContent = 'Async Tiles';
  realIdBtn.title = 'Choose Async Tile';
  realIdBtn.style.width = '100%';
  realIdBtn.style.maxWidth = '200px'; // Hard limit to prevent infinite growth
  realIdBtn.style.minWidth = '70px'; // Same as wormhole popup buttons
  realIdBtn.style.height = '38px'; // Same as wormhole popup buttons
  realIdBtn.style.marginBottom = '6px';
  realIdBtn.style.fontSize = '0.9em';
  realIdBtn.style.padding = '8px 12px';
  realIdBtn.style.boxSizing = 'border-box';
  realIdBtn.style.textOverflow = 'ellipsis';
  realIdBtn.style.whiteSpace = 'nowrap';
  realIdBtn.style.overflow = 'hidden';
  realIdBtn.style.flex = 'none'; // Prevent flex growth
  realIdBtn.addEventListener('click', () => {
    // Deactivate lore mode if it was active
    if (typeof window.deactivateLoreMode === 'function') {
      window.deactivateLoreMode();
    }
    
    // Use the new popup system if available, fallback to old modal
    if (typeof window.showSystemLookupPopup === 'function') {
      window.showSystemLookupPopup();
    } else {
      showModal('systemLookupModal');
    }
  });
  container.appendChild(realIdBtn);

  // ───────────── Essential System Types ─────────────
  const essentialSystemTypes = [
    { mode: 'hyperlane', label: 'Hyperlanes', cls: 'btn-empty' },
    { mode: 'void', label: 'Void', cls: 'btn-void' },
    { mode: 'homesystem', label: 'Homesystem', cls: 'btn-homesystem' }
  ];

  essentialSystemTypes.forEach(({ mode, label, cls }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = `mode-button ${cls}`;
    btn.dataset.mode = mode;
    btn.style.width = '100%';
    btn.style.maxWidth = '200px'; // Hard limit to prevent infinite growth
    btn.style.minWidth = '70px'; // Same as wormhole popup buttons
    btn.style.height = '38px'; // Same as wormhole popup buttons
    btn.style.marginBottom = '6px';
    btn.style.fontSize = '0.9em';
    btn.style.padding = '8px 12px';
    btn.style.boxSizing = 'border-box';
    btn.style.textOverflow = 'ellipsis';
    btn.style.whiteSpace = 'nowrap';
    btn.style.overflow = 'hidden';
    btn.style.flex = 'none'; // Prevent flex growth
    btn.addEventListener('click', (e) => {
      // Clear active state from all buttons in the sector controls
      container.querySelectorAll('.mode-button').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      });
      
      // Deactivate lore mode if it was active
      if (typeof window.deactivateLoreMode === 'function') {
        window.deactivateLoreMode();
      }
      // Set active state on clicked button (like wormhole popup)
      e.currentTarget.classList.add('active');
      e.currentTarget.style.background = '#666';
      e.currentTarget.style.color = '#fff';
      e.currentTarget.style.fontWeight = 'bold';
      editor.setMode(mode);
    });
    container.appendChild(btn);
  });

  // ───────────── Draw Helpers Modal Launcher ─────────────
  const drawHelpersBtn = document.createElement('button');
  drawHelpersBtn.id = 'launchDrawHelpersPopup';
  drawHelpersBtn.className = 'mode-button';
  drawHelpersBtn.textContent = 'Draw Helpers…';
  drawHelpersBtn.title = 'Quick Drawing Tools';
  drawHelpersBtn.style.width = '100%';
  drawHelpersBtn.style.maxWidth = '200px'; // Hard limit to prevent infinite growth
  drawHelpersBtn.style.minWidth = '70px'; // Same as wormhole popup buttons
  drawHelpersBtn.style.height = '38px'; // Same as wormhole popup buttons
  drawHelpersBtn.style.marginBottom = '6px';
  drawHelpersBtn.style.fontSize = '0.9em';
  drawHelpersBtn.style.padding = '8px 12px';
  drawHelpersBtn.style.boxSizing = 'border-box';
  drawHelpersBtn.style.textOverflow = 'ellipsis';
  drawHelpersBtn.style.whiteSpace = 'nowrap';
  drawHelpersBtn.style.overflow = 'hidden';
  drawHelpersBtn.style.flex = 'none'; // Prevent flex growth
  drawHelpersBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });
    
    // Deactivate lore mode if it was active
    if (typeof window.deactivateLoreMode === 'function') {
      window.deactivateLoreMode();
    }

    showPopup({
      id: 'drawHelpersPopupModal',
      className: 'layout-options-popup',
      title: 'Draw Helpers',
      draggable: true,
      dragHandleSelector: '.popup-ui-titlebar',
      scalable: true,
      rememberPosition: true,
      style: {
        left: '800px',
        top: '120px',
        minWidth: '240px',
        maxWidth: '600px',
        minHeight: '120px',
        maxHeight: '600px',
        color: '#fff',
        border: '2px solid #66ff66',
        boxShadow: '0 8px 40px #000a',
        padding: '0 0 18px 0',
        zIndex: 1300
      },
      content: (() => {
        const content = document.createElement('div');
        content.className = 'modal-content popup-btn-grid draw-helpers-btn-grid';
        content.style.display = 'grid';
        content.style.gridTemplateColumns = 'repeat(3, 1fr)'; // 3 columns for compact layout
        content.style.gap = '8px';
        content.style.padding = '15px';

        // Define draw helper tools
        const drawHelpers = [
          { mode: '1 planet', label: '1 Planet', cls: 'btn-1' },
          { mode: '2 planet', label: '2 Planet', cls: 'btn-2' },
          { mode: '3 planet', label: '3 Planet', cls: 'btn-3' },
          { mode: 'legendary planet', label: 'Legendary', cls: 'btn-legendary' },
          { mode: 'empty', label: 'Empty', cls: 'btn-empty' },
          { mode: 'special', label: 'Special', cls: 'btn-special' }
        ];

        drawHelpers.forEach(({ mode, label, cls }) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.className = `mode-button ${cls}`;
          btn.style.border = '1px solid #666';
          btn.style.borderRadius = '4px';
          btn.style.padding = '8px 12px';
          btn.style.fontSize = '0.9em';
          btn.style.fontWeight = 'bold';
          btn.style.maxWidth = '120px'; // Fixed max size for compact grid
          btn.style.height = '35px'; // Fixed height
          btn.style.overflow = 'hidden';
          btn.style.textOverflow = 'ellipsis';
          btn.style.whiteSpace = 'nowrap';
          btn.addEventListener('click', (e) => {
            // Clear active from draw helpers popup buttons
            content.querySelectorAll('.mode-button').forEach(b => {
              b.classList.remove('active');
              b.style.background = '';
              b.style.color = '';
              b.style.fontWeight = 'bold';
            });
            // Set active state on clicked button
            e.currentTarget.classList.add('active');
            e.currentTarget.style.background = '#666';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.fontWeight = 'bold';
            // Also show draw helpers button as active in sector controls
            drawHelpersBtn.classList.add('active');
            drawHelpersBtn.style.background = '#666';
            drawHelpersBtn.style.color = '#fff';
            drawHelpersBtn.style.fontWeight = 'bold';
            editor.setMode(mode);
          });
          content.appendChild(btn);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.gridColumn = '1 / -1'; // Span all columns
        separator.style.borderTop = '1px solid #666';
        separator.style.margin = '10px 0';
        content.appendChild(separator);

        // Add Effects section
        const effectsLabel = document.createElement('div');
        effectsLabel.textContent = 'Effects:';
        effectsLabel.style.gridColumn = '1 / -1'; // Span all columns
        effectsLabel.style.fontWeight = 'bold';
        effectsLabel.style.color = '#ffe066';
        effectsLabel.style.marginBottom = '8px';
        content.appendChild(effectsLabel);

        const effects = [
          { mode: 'nebula', label: 'Nebula', cls: 'btn-nebula' },
          { mode: 'rift', label: 'Rift', cls: 'btn-rift' },
          { mode: 'asteroid', label: 'Asteroid', cls: 'btn-asteroid' },
          { mode: 'supernova', label: 'Supernova', cls: 'btn-supernova' }
        ];

        effects.forEach(({ mode, label, cls }) => {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.className = `mode-button ${cls}`;
          btn.style.border = '1px solid #666';
          btn.style.borderRadius = '4px';
          btn.style.padding = '8px 12px';
          btn.style.fontSize = '0.9em';
          btn.style.fontWeight = 'bold';
          btn.style.maxWidth = '120px'; // Fixed max size for compact grid
          btn.style.height = '35px'; // Fixed height
          btn.style.overflow = 'hidden';
          btn.style.textOverflow = 'ellipsis';
          btn.style.whiteSpace = 'nowrap';
          btn.addEventListener('click', (e) => {
            // Clear active from all buttons in the popup
            content.querySelectorAll('.mode-button').forEach(b => {
              b.classList.remove('active');
              b.style.background = '';
              b.style.color = '';
              b.style.fontWeight = 'bold';
            });
            // Set active state on clicked button
            e.currentTarget.classList.add('active');
            e.currentTarget.style.background = '#666';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.fontWeight = 'bold';
            // Also show draw helpers button as active in sector controls
            drawHelpersBtn.classList.add('active');
            drawHelpersBtn.style.background = '#666';
            drawHelpersBtn.style.color = '#fff';
            drawHelpersBtn.style.fontWeight = 'bold';
            editor.setMode(mode);
          });
          content.appendChild(btn);
        });

        return content;
      })()
    });
  };
  container.appendChild(drawHelpersBtn);

  // Add a visual separator
  const separator1 = document.createElement('div');
  separator1.style.borderTop = '1px solid #666';
  separator1.style.margin = '12px 0';
  container.appendChild(separator1);

  // ───────────── Wormholes Modal Launcher ─────────────
  const wormholesBtn = document.createElement('button');
  wormholesBtn.id = 'launchWormholesPopup';
  wormholesBtn.className = 'mode-button';
  wormholesBtn.textContent = 'Wormholes…';
  wormholesBtn.title = 'Pick Wormhole';
  wormholesBtn.style.width = '100%';
  wormholesBtn.style.maxWidth = '200px'; // Hard limit to prevent infinite growth
  wormholesBtn.style.minWidth = '70px'; // Same as wormhole popup buttons
  wormholesBtn.style.height = '38px'; // Same as wormhole popup buttons
  wormholesBtn.style.marginBottom = '6px';
  wormholesBtn.style.fontSize = '0.9em';
  wormholesBtn.style.padding = '8px 12px';
  wormholesBtn.style.boxSizing = 'border-box';
  wormholesBtn.style.textOverflow = 'ellipsis';
  wormholesBtn.style.whiteSpace = 'nowrap';
  wormholesBtn.style.overflow = 'hidden';
  wormholesBtn.style.flex = 'none'; // Prevent flex growth
  wormholesBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });
    
    // Deactivate lore mode if it was active
    if (typeof window.deactivateLoreMode === 'function') {
      window.deactivateLoreMode();
    }

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
            // Clear active from wormhole popup buttons
            content.querySelectorAll('.mode-button').forEach(b => {
              b.classList.remove('active');
              b.style.background = b.style.backgroundColor; // Restore original color
              b.style.color = '';
              b.style.fontWeight = '';
            });
            // Set active state on clicked button (like original wormhole popup)
            e.currentTarget.classList.add('active');
            e.currentTarget.style.background = '#666';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.fontWeight = 'bold';
            // Also show wormholes button as active in sector controls
            wormholesBtn.classList.add('active');
            wormholesBtn.style.background = '#666';
            wormholesBtn.style.color = '#fff';
            wormholesBtn.style.fontWeight = 'bold';
            editor.setMode(type);
          });
          content.appendChild(btn);
        });
        return content;
      })()
    });
  };
  container.appendChild(wormholesBtn);

  // ───────────── Custom Links Modal Launcher ─────────────
  const customLinksBtn = document.createElement('button');
  customLinksBtn.id = 'launchCustomLinksPopup';
  customLinksBtn.className = 'mode-button';
  customLinksBtn.textContent = 'Custom Links…';
  customLinksBtn.title = 'Manage Custom Links';
  customLinksBtn.style.width = '100%';
  customLinksBtn.style.maxWidth = '200px'; // Hard limit to prevent infinite growth
  customLinksBtn.style.minWidth = '70px'; // Same as wormhole popup buttons
  customLinksBtn.style.height = '38px'; // Same as wormhole popup buttons
  customLinksBtn.style.marginBottom = '6px';
  customLinksBtn.style.fontSize = '0.9em';
  customLinksBtn.style.padding = '8px 12px';
  customLinksBtn.style.boxSizing = 'border-box';
  customLinksBtn.style.textOverflow = 'ellipsis';
  customLinksBtn.style.whiteSpace = 'nowrap';
  customLinksBtn.style.overflow = 'hidden';
  customLinksBtn.style.flex = 'none'; // Prevent flex growth
  customLinksBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });
    
    // Deactivate lore mode if it was active
    if (typeof window.deactivateLoreMode === 'function') {
      window.deactivateLoreMode();
    }

    // Open the custom links popup
    if (typeof window.showCustomLinksPopup === 'function') {
      window.showCustomLinksPopup();
    } else {
      // Fallback: import and call the function
      import('./customLinksUI.js').then(module => {
        if (module && typeof module.showCustomLinksPopup === 'function') {
          module.showCustomLinksPopup();
        }
      });
    }
  };
  container.appendChild(customLinksBtn);

  // ───────────── Border Anomalies Modal Launcher ─────────────
  const borderAnomaliesBtn = document.createElement('button');
  borderAnomaliesBtn.id = 'launchBorderAnomaliesPopup';
  borderAnomaliesBtn.className = 'mode-button';
  borderAnomaliesBtn.textContent = 'Border Anomalies…';
  borderAnomaliesBtn.title = 'Manage Border Anomalies';
  borderAnomaliesBtn.style.width = '100%';
  borderAnomaliesBtn.style.maxWidth = '200px'; // Hard limit to prevent infinite growth
  borderAnomaliesBtn.style.minWidth = '70px'; // Same as wormhole popup buttons
  borderAnomaliesBtn.style.height = '38px'; // Same as wormhole popup buttons
  borderAnomaliesBtn.style.marginBottom = '6px';
  borderAnomaliesBtn.style.fontSize = '0.9em';
  borderAnomaliesBtn.style.padding = '8px 12px';
  borderAnomaliesBtn.style.boxSizing = 'border-box';
  borderAnomaliesBtn.style.textOverflow = 'ellipsis';
  borderAnomaliesBtn.style.whiteSpace = 'nowrap';
  borderAnomaliesBtn.style.overflow = 'hidden';
  borderAnomaliesBtn.style.flex = 'none'; // Prevent flex growth
  borderAnomaliesBtn.onclick = (e) => {
    // Clear active state from all buttons in the sector controls first
    container.querySelectorAll('.mode-button').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    });
    
    // Deactivate lore mode if it was active
    if (typeof window.deactivateLoreMode === 'function') {
      window.deactivateLoreMode();
    }

    // Open the border anomalies popup
    if (typeof window.showBorderAnomaliesPopup === 'function') {
      window.showBorderAnomaliesPopup();
    } else {
      // Fallback: import and call the function
      import('./borderAnomaliesUI.js').then(module => {
        if (module && typeof module.showBorderAnomaliesPopup === 'function') {
          module.showBorderAnomaliesPopup();
        }
      });
    }
  };
  container.appendChild(borderAnomaliesBtn);

  // ───────────── Select Hex for Lore Button ─────────────
  const selectHexForLoreBtn = document.createElement('button');
  selectHexForLoreBtn.id = 'selectHexForLoreBtn';
  selectHexForLoreBtn.className = 'mode-button';
  selectHexForLoreBtn.textContent = 'Add Lore';
  selectHexForLoreBtn.title = 'Click to activate hex selection mode for lore editing';
  selectHexForLoreBtn.style.width = '100%';
  selectHexForLoreBtn.style.maxWidth = '200px';
  selectHexForLoreBtn.style.minWidth = '70px';
  selectHexForLoreBtn.style.height = '38px';
  selectHexForLoreBtn.style.marginBottom = '6px';
  selectHexForLoreBtn.style.fontSize = '0.9em';
  selectHexForLoreBtn.style.padding = '8px 12px';
  selectHexForLoreBtn.style.boxSizing = 'border-box';
  selectHexForLoreBtn.style.textOverflow = 'ellipsis';
  selectHexForLoreBtn.style.whiteSpace = 'nowrap';
  selectHexForLoreBtn.style.overflow = 'hidden';
  selectHexForLoreBtn.style.flex = 'none';
  
  let loreHexSelectorActive = false;
  
  selectHexForLoreBtn.onclick = (e) => {
    console.log('Add Lore button clicked!');
    e.preventDefault();
    e.stopPropagation();
    
    // Clear active state from other mode buttons
    container.querySelectorAll('.mode-button').forEach(btn => {
      if (btn !== selectHexForLoreBtn) {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
      }
    });

    // Toggle lore hex selector mode
    loreHexSelectorActive = !loreHexSelectorActive;
    console.log('loreHexSelectorActive toggled to:', loreHexSelectorActive);
    
    if (loreHexSelectorActive) {
      console.log('Activating lore hex selection mode');
      // Activate mode
      selectHexForLoreBtn.classList.add('active');
      selectHexForLoreBtn.style.background = '#27ae60';
      selectHexForLoreBtn.style.color = '#fff';
      selectHexForLoreBtn.style.fontWeight = 'bold';
      selectHexForLoreBtn.textContent = 'Click a Hex...';
      
      // Enable hex click listener
      enableLoreHexSelection();
    } else {
      // Deactivate mode
      deactivateLoreMode();
    }
  };
  container.appendChild(selectHexForLoreBtn);

  return container;
}

// ───────────── Lore Hex Selection Helper Functions ─────────────
let loreHexClickHandler = null;
let previousMode = null;

function deactivateLoreMode() {
  const btn = document.getElementById('selectHexForLoreBtn');
  if (btn) {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.fontWeight = '';
    btn.textContent = 'Add Lore';
  }
  disableLoreHexSelection();
}

// Make deactivateLoreMode globally available so other buttons can call it
window.deactivateLoreMode = deactivateLoreMode;

function enableLoreHexSelection() {
  console.log('enableLoreHexSelection called');
  // Remove any existing handler first
  disableLoreHexSelection();
  
  // Store the current editor mode and switch to a special lore mode
  const editor = window.editor;
  if (editor) {
    previousMode = editor.mode;
    editor.mode = 'lore-selection'; // Special mode to prevent other click handlers
  }
  
  // Create new click handler
  loreHexClickHandler = (event) => {
    console.log('Lore hex click handler triggered', event.target);
    const hex = event.target.closest('[data-label]');
    console.log('Found hex element:', hex);
    if (hex) {
      const hexLabel = hex.getAttribute('data-label');
      console.log('Hex label:', hexLabel);
      if (hexLabel) {
        // Select hex in lore popup
        selectHexInLorePopup(hexLabel);
        
        // Don't deactivate - let user continue selecting hexes
        // Only deactivate when another button is clicked or same button is toggled
        
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };
  
  // Add event listener to the hex map
  const svgContainer = document.querySelector('#hexMap');
  console.log('SVG container found:', !!svgContainer);
  if (svgContainer) {
    svgContainer.addEventListener('click', loreHexClickHandler, true);
    svgContainer.style.cursor = 'crosshair';
    console.log('Event listener added to hexMap, cursor set to crosshair');
  }
}

function disableLoreHexSelection() {
  // Restore the previous editor mode
  const editor = window.editor;
  if (editor && previousMode !== null) {
    editor.mode = previousMode;
    previousMode = null;
  }
  
  // Remove event listener
  if (loreHexClickHandler) {
    const svgContainer = document.querySelector('#hexMap');
    if (svgContainer) {
      svgContainer.removeEventListener('click', loreHexClickHandler, true);
      svgContainer.style.cursor = '';
    }
    loreHexClickHandler = null;
  }
}

function selectHexInLorePopup(hexLabel) {
  console.log('selectHexInLorePopup called with:', hexLabel);
  
  // Check if lore popup is already open
  const loreInput = document.getElementById('hexLabelInput');
  console.log('loreInput found:', !!loreInput);
  
  if (loreInput) {
    // Set the hex label and trigger selection
    loreInput.value = hexLabel;
    
    // Trigger the select button click
    const selectBtn = document.getElementById('selectHexBtn');
    console.log('selectBtn found:', !!selectBtn);
    if (selectBtn) {
      selectBtn.click();
    }
  } else {
    // Open lore popup first, then select hex
    console.log('Opening lore popup first...');
    console.log('window.showLorePopup available:', typeof window.showLorePopup);
    
    // Try window.showLorePopup first (if module was already loaded)
    if (typeof window.showLorePopup === 'function') {
      console.log('Using window.showLorePopup');
      window.showLorePopup();
      // Wait a moment for popup to load, then select hex
      setTimeout(() => selectHexInLorePopup(hexLabel), 150);
    } else {
      // Use dynamic import as fallback
      console.log('Using dynamic import...');
      import('../modules/Lore/loreUI.js').then(mod => {
        console.log('Lore module loaded:', mod);
        const showLoreUI = mod.showLorePopup;
        
        if (typeof showLoreUI === 'function') {
          console.log('Calling showLoreUI function');
          showLoreUI();
          // Wait a moment for popup to load, then select hex
          setTimeout(() => selectHexInLorePopup(hexLabel), 150);
        } else {
          console.error('showLorePopup is not a function in the loaded module.');
          alert('Error: Could not initialize Lore Module UI.');
        }
      }).catch(err => {
        console.error('Failed to load Lore module:', err);
        alert('Error: Failed to load Lore module.');
      });
    }
  }
}
