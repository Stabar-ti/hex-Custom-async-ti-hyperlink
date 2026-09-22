import { showPopup, hidePopup, resetAllPopupPositions } from './popupUI.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { toggleTheme } from './uiTheme.js';
import { checkRealIdUniqueness, generateSanityCheckSummary } from '../features/sanityCheck.js';
import { setupHexHoverInfo } from './HexHoverInfo2.js';
import { toggleFileMenu, isFileMenuOpen } from './fileMenu.js';
import { showAnchoredPanel } from './dropdownMenu.js';

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
          <input type="checkbox" id="distUseCustomLinks" ${editor.options.useCustomLinks ? 'checked' : ''}>
          Use Custom Links
        </label><br>
        <label>
          <input type="checkbox" id="toggleUseWormholes" ${editor.options.useWormholes !== false ? 'checked' : ''}>
          Use Wormholes
        </label><br>
        <label>
          <input type="checkbox" id="toggleAdjacencyOverrides" ${editor.options.useAdjacencyOverrides !== false ? 'checked' : ''}>
          Use Adjacency Overrides
        </label><br>
        <label>
          <input type="checkbox" id="distUseBorderAnomalies" ${editor.options.useBorderAnomalies ? 'checked' : ''}>
          Use Border Anomalies
        </label><br>
        <br>
        <label>
          Max Distance:
          <input type="number" id="maxDistanceInput" value="${editor.maxDistance}" min="1" max="10">
        </label><br>
      </div>
    `;

    // Save/Close were popup actions in a titlebar footer. As an anchored panel the
    // buttons belong in the content.
    const actions = document.createElement('div');
    actions.className = 'tb-menu__actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'mode-button ui-btn';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
        const read = (sel) => wrapper.querySelector(sel);
        editor.options.useSupernova = !!read('#toggleSupernova').checked;
        editor.options.useAsteroid = !!read('#toggleAsteroid').checked;
        editor.options.useNebula = !!read('#toggleNebula').checked;
        editor.options.useRift = !!read('#toggleRift').checked;
        editor.options.useCustomLinks = !!read('#distUseCustomLinks').checked;
        editor.options.useWormholes = !!read('#toggleUseWormholes').checked;
        editor.options.useAdjacencyOverrides = !!read('#toggleAdjacencyOverrides').checked;
        editor.options.useBorderAnomalies = !!read('#distUseBorderAnomalies').checked;

        // Clamp max distance between 1 and 10
        const maxDistInp = read('#maxDistanceInput');
        let md = parseInt(maxDistInp.value, 10);
        if (isNaN(md) || md < 1) md = 1;
        if (md > 10) md = 10;
        editor.maxDistance = md;
        maxDistInp.value = md;

        hidePopup('options-popup');
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mode-button ui-btn';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => hidePopup('options-popup');

    actions.append(saveBtn, closeBtn);
    wrapper.appendChild(actions);

    // Hangs off whichever button is actually on screen: Distance Options lives inside the
    // Analyse menu, and that menu closes as you choose an item — so anchoring to the item
    // itself would anchor to something no longer visible.
    const anchorId = document.getElementById('analyseMenuBtn') ? 'analyseMenuBtn' : 'optionsBtn';

    showAnchoredPanel({
        id: 'options-popup',
        anchorId,
        title: 'Distance Options',
        className: 'options-popup',
        content: wrapper,
    });
}

export function showOverlayOptionsPopup() {
    // Build content for overlay options
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="overlay-note">If a button ever looks like the opposite of what the map is
      showing, press it twice — a couple of overlays could get out of step with their button.</div>
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
        <button id="toggleLore" class="mode-button">Lore Indicators</button>
        <button id="toggleTokens" class="mode-button">Token Indicators</button>
      </div>
      <div class="popup-section-label">Connections</div>
      <div class="popup-btn-grid">
        <button id="toggleBorderAnomalies" class="mode-button">Border Anomalies Overlay</button>
        <button id="toggleCustomLinks" class="mode-button">Custom Links Overlay</button>
      </div>
      <div class="popup-section-label">Value Overlays</div>
      <div class="popup-btn-grid">
        <button id="toggleValueTargetLayer" class="mode-button">Value Hints (V·R·I·T)</button>
        <button id="toggleValueOverlay" class="mode-button">Value Tiers (T1–T5)</button>
      </div>
      <div class="popup-section-label">Actions</div>
      <div class="popup-btn-grid">
        <button id="linkWormholesBtn" class="mode-button">Link Wormholes</button>
      </div>
    `;

    // Debug: log when popup is about to be shown
    console.log('showOverlayOptionsPopup: showing overlay options popup');

    // Remove any existing popup with the same id before showing a new one
    hidePopup('overlayOptionsPopup');

    // A ▾ promises a menu. This was a draggable popup that reopened wherever it had last
    // been dragged to — frequently nowhere near the button that opened it.
    showAnchoredPanel({
        id: 'overlayOptionsPopup',
        anchorId: 'overlayToggleBtn',
        title: 'Toggle Overlays',
        content: wrapper,
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
                    import('../features/customLinksOverlay.js').then(({ toggleCustomLinksOverlay }) => {
                        toggleCustomLinksOverlay(editor);   // owns showCustomAdjacency
                        btn.classList.toggle('active', !!editor.showCustomAdjacency);
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

        // Lore overlay toggle
        // main.js always constructs editor.loreOverlay at startup. Constructing a second one
        // here orphaned the first's clipboard/active state and left its badge DOM unowned.
        setupToggle('toggleLore', 'showLore', () => {
            if (!editor.loreOverlay) {
                console.warn('Lore overlay not initialized yet');
            } else if (editor.showLore) {
                editor.loreOverlay.show();
            } else {
                editor.loreOverlay.hide();
            }
        });

        // Token overlay toggle
        setupToggle('toggleTokens', 'showTokens', () => {
            if (!editor.tokenOverlay) {
                console.warn('Token overlay not initialized yet');
            } else {
                if (editor.showTokens) {
                    editor.tokenOverlay.show();
                } else {
                    editor.tokenOverlay.hide();
                }
            }
        });

        // Border Anomalies toggle (handled above in setupToggle)
        setupToggle('toggleBorderAnomalies', 'showBorderAnomalies');

        // Custom Links toggle (handled above in setupToggle)
        setupToggle('toggleCustomLinks', 'showCustomAdjacency');

        // Link Wormholes button (now a toggle, consistent with other overlays)
        const linkBtn = document.getElementById('linkWormholesBtn');
        if (linkBtn) {
            // Initialize state if not present
            if (typeof editor.showWormholeLinks === 'undefined') editor.showWormholeLinks = false;
            // Set initial button state
            linkBtn.classList.toggle('active', !!editor.showWormholeLinks);
            linkBtn.onclick = () => {
                editor.showWormholeLinks = !editor.showWormholeLinks;
                linkBtn.classList.toggle('active', editor.showWormholeLinks);
                if (typeof editor.toggleWormholeLinksOverlay === 'function') {
                    editor.toggleWormholeLinksOverlay(editor.showWormholeLinks);
                } else if (typeof editor.drawWormholeLinks === 'function') {
                    // Fallback: draw or clear overlay
                    if (editor.showWormholeLinks) {
                        editor.drawWormholeLinks();
                    } else if (typeof editor.clearWormholeLinks === 'function') {
                        editor.clearWormholeLinks();
                    }
                }
            };
        }

        // Value overlay toggle — use wrapper.querySelector to avoid stale getElementById hits
        const voBtn = wrapper.querySelector('#toggleValueOverlay');
        if (voBtn) {
            const active = () => !!editor.svg?.querySelector('#valueOverlayLayer');
            voBtn.classList.toggle('active', active());

            // The twin switch is in the Balance panel; follow it rather than keeping our own idea
            // of the state. Self-removing for the same reason as there.
            import('../features/valueOverlay.js').then(({ VALUE_OVERLAY_CHANGED }) => {
                const onChange = () => {
                    if (!voBtn.isConnected) {
                        document.removeEventListener(VALUE_OVERLAY_CHANGED, onChange);
                        return;
                    }
                    voBtn.classList.toggle('active', active());
                };
                document.addEventListener(VALUE_OVERLAY_CHANGED, onChange);
            }).catch(console.error);
            voBtn.onclick = () => {
                import('../features/valueOverlay.js').then(({ drawValueOverlay, clearValueOverlay, isValueOverlayActive }) => {
                    if (isValueOverlayActive(editor)) clearValueOverlay(editor);
                    else drawValueOverlay(editor, false, false, false);
                    // Read the layer back rather than assuming: with nothing on the map to
                    // tier, drawValueOverlay draws nothing and the overlay is still off.
                    voBtn.classList.toggle('active', active());
                }).catch(console.error);
            };
        }

        // Value target layer toggle (V1–V5 tier badges + R/I/T skew dots)
        const vtBtn = wrapper.querySelector('#toggleValueTargetLayer');
        if (vtBtn) {
            const targetActive = () => !!editor.svg?.querySelector('#valueTargetLayer');
            vtBtn.classList.toggle('active', targetActive());
            vtBtn.onclick = () => {
                import('../features/valueOverlay.js').then(({ drawValueTargetLayer, clearValueTargetLayer }) => {
                    if (targetActive()) {
                        clearValueTargetLayer(editor);
                        vtBtn.classList.remove('active');
                    } else {
                        drawValueTargetLayer(editor);
                        vtBtn.classList.add('active');
                    }
                }).catch(console.error);
            };
        }

        // --- NEW: Hook up tile hover info logic to the button ---
        setupHexHoverInfo(editor);

    }, 0);
}

export function showLayoutOptionsPopup() {
    // Sector Controls and Draw Helpers exist only in index.html's static #layoutOptionsPopup
    // markup, which showPopup() removes before the handler-binding setTimeout below runs —
    // so both buttons vanished from this menu and their handlers never bound. They live in
    // the wrapper now, where they are actually part of the popup being shown.
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="popup-section-label">General</div>
      <div class="popup-btn-grid">
        <button id="toggleControlsBtn" class="mode-button">Im/Export & map generation</button>
        <button id="arrangeBtn" class="mode-button">Arrange Controls</button>
        <button id="sectorControlsBtn" class="mode-button">Sector Controls</button>
      </div>
      <div class="popup-section-label">Theme</div>
      <div class="popup-btn-grid">
        <button id="themeToggle" class="mode-button">Toggle Dark Mode</button>
        <button id="resetPopupPositionsBtn" class="mode-button">Reset Popup Positions</button>
      </div>
    `;

    showAnchoredPanel({
        id: 'layoutOptionsPopup',
        anchorId: 'layoutToggleBtn',
        title: 'Layout Options',
        content: wrapper,
    });

    setTimeout(() => {
        // Import/export moved to the File menu in the top bar; this entry opens it.
        const controlsBtn = document.getElementById('toggleControlsBtn');
        if (controlsBtn) {
            controlsBtn.textContent = isFileMenuOpen() ? 'Close the File menu' : 'Open the File menu';
            controlsBtn.onclick = () => toggleFileMenu();
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
        // Tool rail. It is docked now rather than a floating popup, so this entry
        // collapses and expands it instead of opening a window.
        const sectorControlsBtn = document.getElementById('sectorControlsBtn');
        if (sectorControlsBtn) {
            sectorControlsBtn.textContent = 'Tool Rail';
            sectorControlsBtn.title = 'Collapse or expand the tool rail';
            sectorControlsBtn.onclick = () => {
                import('./uisectorControls.js')
                    .then(({ toggleToolRail }) => toggleToolRail())
                    .catch(err => console.error('Failed to toggle the tool rail:', err));
            };
        }
        // The Draw Helpers entry lived here. Its paint modes — tile types and effects —
        // are folding groups in the tool rail now, so there is no popup left to open.
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

export function showSanityCheckPopup() {
    // Build content for sanity check
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #ffe066;">RealID Uniqueness Check</h3>
            <p style="margin-bottom: 15px; color: #ccc; font-size: 0.9em;">
                Check for duplicate realID numbers on the map according to different rules.
            </p>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px; color: #fff;">
                    <input type="checkbox" id="uniquePlanets" style="margin-right: 8px;">
                    <strong>Unique Planets</strong> - Only check hexes that contain planets
                </label>
                <label style="display: block; margin-bottom: 8px; color: #fff;">
                    <input type="checkbox" id="uniqueOther" style="margin-right: 8px;">
                    <strong>Unique All</strong> - Check all hexes with realIDs regardless of content
                </label>
            </div>
            
            <button id="runSanityCheck" class="mode-button" style="background: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                Run Check
            </button>
        </div>
        
        <div id="sanityCheckResults" style="border-top: 1px solid #444; padding-top: 15px; min-height: 50px;">
            <p style="color: #888; font-style: italic;">Select check options above and click "Run Check" to analyze the map.</p>
        </div>
    `;

    showPopup({
        id: 'sanity-check-popup',
        className: 'sanity-check-popup',
        title: 'Sanity Check',
        content: wrapper,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        actions: [
            { label: 'Close', action: () => hidePopup('sanity-check-popup') }
        ],
        style: {
            minWidth: '500px',
            maxWidth: '700px',
            borderRadius: '12px',
            zIndex: 10010
        },
        showHelp: false
    });

    // Set up event handlers after popup is shown
    setTimeout(() => {
        const runCheckBtn = document.getElementById('runSanityCheck');
        const uniquePlanetsCheckbox = document.getElementById('uniquePlanets');
        const uniqueOtherCheckbox = document.getElementById('uniqueOther');
        const resultsDiv = document.getElementById('sanityCheckResults');

        // Set default: Unique Planets checked, Unique All unchecked
        if (uniquePlanetsCheckbox) uniquePlanetsCheckbox.checked = true;
        if (uniqueOtherCheckbox) uniqueOtherCheckbox.checked = false;

        if (runCheckBtn && uniquePlanetsCheckbox && uniqueOtherCheckbox && resultsDiv) {
            // Make checkboxes mutually exclusive
            uniquePlanetsCheckbox.addEventListener('change', () => {
                if (uniquePlanetsCheckbox.checked) {
                    uniqueOtherCheckbox.checked = false;
                }
            });

            uniqueOtherCheckbox.addEventListener('change', () => {
                if (uniqueOtherCheckbox.checked) {
                    uniquePlanetsCheckbox.checked = false;
                }
            });
            runCheckBtn.onclick = () => {
                const planetsOnly = uniquePlanetsCheckbox.checked;
                const checkAll = uniqueOtherCheckbox.checked;

                // Validate that exactly one option is selected
                if (!planetsOnly && !checkAll) {
                    resultsDiv.innerHTML = '<p style="color: #dc3545;">Please select one check option.</p>';
                    return;
                }

                // Run the sanity check
                resultsDiv.innerHTML = '<p style="color: #fff;">Running check...</p>';

                try {
                    const results = checkRealIdUniqueness(planetsOnly, checkAll);
                    const summary = generateSanityCheckSummary(results, planetsOnly, checkAll);
                    resultsDiv.innerHTML = summary;
                } catch (error) {
                    resultsDiv.innerHTML = `<p style="color: #dc3545;">Error running sanity check: ${error.message}</p>`;
                    console.error('Sanity check error:', error);
                }
            };
        }
    }, 0);
}