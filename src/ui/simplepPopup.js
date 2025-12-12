import { showPopup, hidePopup, resetAllPopupPositions } from './popupUI.js';
import { redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { toggleTheme } from './uiTheme.js';
import { checkRealIdUniqueness, generateSanityCheckSummary } from '../features/sanityCheck.js';

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
        <button id="toggleLore" class="mode-button">Lore Indicators</button>
        <button id="toggleTokens" class="mode-button">Token Indicators</button>
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

        // Lore overlay toggle
        setupToggle('toggleLore', 'showLore', () => {
            if (!editor.loreOverlay) {
                import('../features/loreOverlay.js').then(({ default: LoreOverlay }) => {
                    editor.loreOverlay = new LoreOverlay(editor);
                    if (editor.showLore) {
                        editor.loreOverlay.show();
                    }
                });
            } else {
                if (editor.showLore) {
                    editor.loreOverlay.show();
                } else {
                    editor.loreOverlay.hide();
                }
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
        // Sector Controls
        const sectorControlsBtn = document.getElementById('sectorControlsBtn');
        if (sectorControlsBtn) {
            sectorControlsBtn.onclick = () => {
                // Import the sector controls function and open the popup
                import('./uisectorControls.js').then(module => {
                    if (window.editor && typeof module.openSectorControlsPopup === 'function') {
                        module.openSectorControlsPopup(window.editor);
                    }
                });
            };
        }
        // Draw Helpers
        const drawHelpersBtn = document.getElementById('drawHelpersBtn');
        if (drawHelpersBtn) {
            drawHelpersBtn.onclick = () => {
                // Import the sector controls function and get the draw helpers functionality
                import('./uisectorControls.js').then(module => {
                    if (window.editor) {
                        // Trigger the draw helpers popup directly
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
                                        window.editor.setMode(mode);
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
                                        window.editor.setMode(mode);
                                    });
                                    content.appendChild(btn);
                                });

                                return content;
                            })()
                        });
                    }
                });
            };
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