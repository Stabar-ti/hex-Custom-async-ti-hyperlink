import { showPopup, hidePopup, resetAllPopupPositions } from './popupUI.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { toggleTheme } from './uiTheme.js';

export function showOptionsPopup(editor) {
    // Build content dynamically, reflecting current editor options
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div>
        <h3>Turn off or on special tile effects</h3>
        <label>
          <input type="checkbox" id="toggleSupernova" ${editor.options.useSupernova ? 'checked' : ''}>
          Block Supernova
        </label><br>
        <label>
          <input type="checkbox" id="toggleAsteroid" ${editor.options.useAsteroid ? 'checked' : ''}>
          Block Asteroid
        </label><br>
        <label>
          <input type="checkbox" id="toggleNebula" ${editor.options.useNebula ? 'checked' : ''}>
          Block Nebula
        </label><br>
        <label>
          <input type="checkbox" id="toggleRift" ${editor.options.useRift ? 'checked' : ''}>
          Enable Rift chaining
        </label><br>
        <label>
          <input type="checkbox" id="toggleCustomLinks" ${editor.options.useCustomLinks ? 'checked' : ''}>
          Use Custom Links
        </label><br>
        <label>
          <input type="checkbox" id="toggleBorderAnomalies" ${editor.options.useBorderAnomalies ? 'checked' : ''}>
          Use Border Anomalies
        </label><br>
        <br>
        <label>
          Max Distance:
          <input type="number" id="maxDistanceInput" value="${editor.maxDistance}" min="1" max="10">
        </label><br>
      </div>
    `;

    showPopup({
        id: 'options-popup',
        className: 'options-popup',
        content: wrapper,
        actions: [
            {
                label: 'Save',
                action: () => {
                    // Save logic
                    const supernovaCB = wrapper.querySelector('#toggleSupernova');
                    const asteroidCB = wrapper.querySelector('#toggleAsteroid');
                    const nebulaCB = wrapper.querySelector('#toggleNebula');
                    const riftCB = wrapper.querySelector('#toggleRift');
                    const customLinksCB = wrapper.querySelector('#toggleCustomLinks');
                    const borderAnomaliesCB = wrapper.querySelector('#toggleBorderAnomalies');
                    const maxDistInp = wrapper.querySelector('#maxDistanceInput');

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

                    hidePopup('options-popup');
                }
            },
            { label: 'Close', action: () => hidePopup('options-popup') }
        ],
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        modal: false,
        title: 'Distance Calculator Options',
        style: {
            minWidth: '340px',
            borderRadius: '12px',
            zIndex: 10010
        },
        showHelp: false
    });
}

export function showOverlayOptionsPopup() {
    // Build content for overlay options
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <li><strong>IMPORTANT </strong> In rare occasions the visual ques on the buttons get flipped </li>
      <div class="popup-section-label">System Wide</div>
      <div class="popup-btn-grid">
        <button id="toggleTileImagesBtn" class="mode-button">Show Tile Images</button>
        <button id="toggleHoverInfoBtn" class="mode-button">Tile Hover Info</button>
        <button id="toggleEffects" class="mode-button">Effects</button>
        <button id="toggleWormholes" class="mode-button">Wormhole Visibility</button>
      </div>
      <div class="popup-section-label">Tile Information</div>
      <div class="popup-btn-grid">
        <button id="togglePlanetTypes" class="mode-button">Planet Types</button>
        <button id="toggleResInf" class="mode-button">Resources/ Influence</button>
        <button id="toggleIdealRI" class="mode-button">Ideal R/I</button>
        <button id="toggleRealID" class="mode-button">RealID Labels</button>
      </div>
      <div class="popup-section-label">Tile Information</div>
      <div class="popup-btn-grid">
        <button id="toggleBorderAnomalies" class="mode-button">Border Anomalies Overlay</button>
        <button id="toggleCustomLinks" class="mode-button">Custom Links Overlay</button>
        <button id="linkWormholesBtn" class="mode-button">Link Wormholes</button>
      </div>
    `;

    // Debug: log when popup is about to be shown
    console.log('showOverlayOptionsPopup: showing overlay options popup');

    // Remove any existing popup with the same id before showing a new one
    hidePopup('overlayOptionsPopup');

    showPopup({
        id: 'overlayOptionsPopup',
        className: 'layout-options-popup',
        title: 'Toggle Overlays',
        content: wrapper,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        style: {
            left: '360px',
            top: '86px',
            minWidth: '240px',
            // background and color intentionally omitted to allow CSS to apply
            border: '2px solid #ffe066',
            boxShadow: '0 8px 40px #000a',
            zIndex: 1200
        }
    });

    setTimeout(() => {
        const editor = window.editor;
        if (!editor) return;

        // Helper to toggle and update .active
        function setupToggle(btnId, prop, updateFn) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            btn.classList.toggle('active', !!editor[prop]);
            btn.onclick = () => {
                // Special handling for border anomalies: call redraw after toggle
                if (btnId === 'toggleBorderAnomalies') {
                    editor.showBorderAnomalies = !editor.showBorderAnomalies;
                    btn.classList.toggle('active', editor.showBorderAnomalies);
                    import('../features/borderAnomaliesOverlay.js').then(({ redrawBorderAnomaliesOverlay }) => {
                        redrawBorderAnomaliesOverlay(editor);
                    });
                    return;
                }
                // Special handling for custom links: call redraw after toggle
                if (btnId === 'toggleCustomLinks') {
                    editor.showCustomAdjacency = !editor.showCustomAdjacency;
                    btn.classList.toggle('active', editor.showCustomAdjacency);
                    import('../features/customLinksOverlay.js').then(({ toggleCustomLinksOverlay }) => {
                        toggleCustomLinksOverlay(editor);
                    });
                    return;
                }
                // Normal overlays
                editor[prop] = !editor[prop];
                btn.classList.toggle('active', !!editor[prop]);
                if (typeof updateFn === 'function') updateFn();
            };
        }

        // Use correct relative import paths for dynamic imports
        setupToggle('toggleTileImagesBtn', 'showTileImages', () => {
            import('../features/imageSystemsOverlay.js').then(({ updateTileImageLayer }) => {
                updateTileImageLayer(editor);
                import('../draw/enforceSvgLayerOrder.js').then(({ enforceSvgLayerOrder }) => enforceSvgLayerOrder(editor.svg));
            });
        });

        setupToggle('toggleHoverInfoBtn', 'showHoverInfo', () => {
            // No-op: just toggles .active, actual hover info handled elsewhere
        });

        setupToggle('toggleEffects', 'showEffects', () => {
            import('../features/baseOverlays.js').then(({ updateEffectsVisibility }) => {
                updateEffectsVisibility(editor);
                import('../draw/enforceSvgLayerOrder.js').then(({ enforceSvgLayerOrder }) => enforceSvgLayerOrder(editor.svg));
            });
        });

        setupToggle('toggleWormholes', 'showWormholes', () => {
            import('../features/baseOverlays.js').then(({ updateWormholeVisibility }) => {
                updateWormholeVisibility(editor);
                import('../draw/enforceSvgLayerOrder.js').then(({ enforceSvgLayerOrder }) => enforceSvgLayerOrder(editor.svg));
            });
        });

        // Couple overlay toggles to realID overlays redraw
        setupToggle('togglePlanetTypes', 'showPlanetTypes', () => {
            redrawAllRealIDOverlays(editor);
        });
        setupToggle('toggleResInf', 'showResInf', () => {
            redrawAllRealIDOverlays(editor);
        });
        setupToggle('toggleIdealRI', 'showIdealRI', () => {
            redrawAllRealIDOverlays(editor);
        });
        setupToggle('toggleRealID', 'showRealID', () => {
            redrawAllRealIDOverlays(editor);
        });

        // Border Anomalies toggle (handled above in setupToggle)
        setupToggle('toggleBorderAnomalies', 'showBorderAnomalies');

        // Custom Links toggle (handled above in setupToggle)
        setupToggle('toggleCustomLinks', 'showCustomAdjacency');

        // Link Wormholes button (not a toggle, just an action)
        const linkBtn = document.getElementById('linkWormholesBtn');
        if (linkBtn) {
            linkBtn.onclick = () => {
                if (typeof editor.drawWormholeLinks === 'function') editor.drawWormholeLinks();
            };
        }

        // --- NEW: Hook up tile hover info logic to the button ---
        import('./HexHoverInfo2.js').then(({ setupHexHoverInfo }) => {
            setupHexHoverInfo(editor);
        });

    }, 0);
}

export function showLayoutOptionsPopup() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="popup-section-label">General</div>
      <div class="popup-btn-grid">
        <button id="toggleControlsBtn" class="mode-button">Im/Export & map generation</button>
        <button id="arrangeBtn" class="mode-button">Arrange Controls</button>
      </div>
      <div class="popup-section-label">Theme</div>
      <div class="popup-btn-grid">
        <button id="themeToggle" class="mode-button">Toggle Dark Mode</button>
        <button id="resetPopupPositionsBtn" class="mode-button">Reset Popup Positions</button>
      </div>
    `;

    showPopup({
        id: 'layoutOptionsPopup',
        className: 'layout-options-popup',
        title: 'Layout Options',
        content: wrapper,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        style: {
            left: '200px',
            top: '80px',
            minWidth: '240px',
            // background and color intentionally omitted to allow CSS to apply
            border: '2px solid #ffe066',
            boxShadow: '0 8px 40px #000a',
            zIndex: 1200
        }
    });

    setTimeout(() => {
        // Im/Export & map generation panel toggle
        const controlsBtn = document.getElementById('toggleControlsBtn');
        if (controlsBtn) {
            controlsBtn.onclick = () => {
                const controlsPanel = document.getElementById('controlsPanel');
                if (controlsPanel) {
                    controlsPanel.classList.toggle('collapsed');
                }
            };
        }
        // Arrange Controls
        const arrangeBtn = document.getElementById('arrangeBtn');
        if (arrangeBtn) {
            arrangeBtn.onclick = () => {
                const editor = window.editor;
                if (editor && typeof editor.cycleControlPanelPosition === 'function') {
                    editor.cycleControlPanelPosition();
                }
            };
        }
        // Theme toggle
        const themeBtn = document.getElementById('themeToggle');
        if (themeBtn) {
            themeBtn.onclick = () => toggleTheme();
        }
        // Reset popup positions
        const resetBtn = document.getElementById('resetPopupPositionsBtn');
        if (resetBtn) {
            resetBtn.onclick = () => {
                resetAllPopupPositions();
                alert('All popup positions have been reset. Please reopen your popups.');
            };
        }
    }, 0);
}