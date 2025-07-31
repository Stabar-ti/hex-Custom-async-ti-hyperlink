// src/modules/Milty/miltyBuilderUI.js
// User interface generation and event handling for Milty Slice Designer
// Restored from original miltyBuilderOLD.js
// 
// This module contains:
// - Main UI generation and layout (showMiltyBuilderUI)
// - UI helper functions for form creation and DOM manipulation
// - Reusable UI components moved from miltyBuilderPopups.js for better separation of concerns

import { defaultSlices, slotPositions, moveSlice, analyzeSliceOccupancy, generateOutputString, capitalizeTech } from './miltyBuilderCore.js';
import { drawSlicePositionOverlays, drawSliceBordersOverlay } from './miltyBuilderDraw.js';
import { showOutputCopyPopup, showDraftValuesPopup } from './miltyBuilderPopups.js';
import { showMiltyDraftGeneratorPopup } from './miltyRandomToolUI.js';
import { showSanityCheckPopup } from '../../ui/simplepPopup.js';

// Main UI function to create and display the Milty Builder popup
export function showMiltyBuilderUI(container) {
    // Slice state tracking
    const sliceMap = { ...defaultSlices };
    const sliceSlots = Array(12).fill(null);
    let selectedMapSlice = null;
    let selectedSlot = null;
    let selectedSource = null; // Can be 'A'-'F' or 1-12
    let selectedSourceType = null; // 'map' or 'slot'

    container.innerHTML = `
        <div style="padding: 15px;">
            <h2 style="margin: 0 0 8px 0; color: #ffe066;">Milty Slice Designer</h2>
            <p style="margin: 0 0 15px 0; color: #ccc; font-size: 14px;">Design and copy slices between the standard map (A–F) and draft slots (1–12).</p>
            <!-- Control Buttons Section -->
            <div style="margin-bottom: 20px;">
                <!-- Row 1: Load Map, Import, Output -->
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">
                    <button id="loadMiltyJsonBtn" class="mode-button" style="font-size:15px;padding:6px 12px;">Load Map</button>
                    <button id="importSlicesBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Import slices</button>
                    <button id="outputCopyBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Output slices</button>
                </div>
                <!-- Row 2: Generate, Analysis, Sanity Check -->
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">
                    <button id="generateSlicesBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Generate Slices</button>
                    <button id="calcDraftValuesBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Analyse Slices</button>
                    <button id="sanityCheckBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Sanity Check</button>
                </div>
                <!-- Row 3: Refresh, Slice Borders, Slice Numbers, Live Slice Analysis -->
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
                    <button id="refreshOccupancyBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Refresh button slice indicators</button>
                    <button id="toggleSliceBordersBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Toggle Slice Borders</button>
                    <button id="toggleSliceNumbersBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Toggle Slice Numbers</button>
                    <label style="display:inline-flex;align-items:center;font-size:13px;margin-left:10px;cursor:pointer;gap:4px;">
                        <input type="checkbox" id="liveSliceAnalysisToggle" style="margin-right:4px;" checked> Live Slice Analysis
                    </label>
                </div>
            </div>
            
            <!-- Standard Map Slices Section -->
            <div style="margin-bottom: 18px;">
                <div style="text-align: center; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: #4CAF50;">Standard Map Slices</span>
                </div>
                <div id="miltyMapRow" style="display:flex;gap:8px;justify-content:center;">
                    ${['A', 'B', 'C', 'D', 'E', 'F'].map(l => `<button class="milty-map-btn" id="sliceMapBtn_${l}" style="width:42px;height:42px;font-size:16px;font-weight:bold;">${l}</button>`).join('')}
                </div>
            </div>
            
            <!-- Draft Slice Slots Section -->
            <div style="margin-bottom: 18px;">
                <div style="text-align: center; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: #2196F3;">Draft Slice Slots</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; align-items: center;">
                    <div id="miltySlotRow1" style="display:flex;gap:6px;">
                        ${Array.from({ length: 6 }, (_, i) => `<button class="milty-slot-btn" id="sliceSlotBtn_${i + 1}" style="width:38px;height:38px;font-size:14px;font-weight:bold;">${i + 1}</button>`).join('')}
                    </div>
                    <div id="miltySlotRow2" style="display:flex;gap:6px;">
                        ${Array.from({ length: 6 }, (_, i) => `<button class="milty-slot-btn" id="sliceSlotBtn_${i + 7}" style="width:38px;height:38px;font-size:14px;font-weight:bold;">${i + 7}</button>`).join('')}
                    </div>
                </div>
            </div>
            
            <!-- Action Section -->
            <div style="text-align:center; margin-bottom: 15px;">
                <button id="clearSelectionBtn" class="mode-button" style="font-size:13px;padding:6px 16px; background: #6c757d; border: 1px solid #545b62;">Clear Selection</button>
            </div>
            
            <!-- Status Message -->
            <div id="miltyStatusMsg" style="text-align:center; min-height: 20px; color:#4a8a4a; font-weight:bold; font-size:13px; padding: 8px; background: rgba(74,138,74,0.1); border-radius: 4px; border: 1px solid rgba(74,138,74,0.3);"></div>
        </div>
    `;

    // Initialize functionality after DOM is ready
    setTimeout(async () => {
        // Live Slice Analysis toggle logic
        let liveAnalysisEnabled = false;
        let observer = null;
        const liveToggle = container.querySelector('#liveSliceAnalysisToggle');
        if (liveToggle) {
            liveToggle.addEventListener('change', function () {
                liveAnalysisEnabled = this.checked;
                if (liveAnalysisEnabled) {
                    import('./miltyBuilderPopups.js').then(mod => {
                        mod.showDraftValuesPopup();
                        setupObserver();
                    });
                } else {
                    if (observer) observer.disconnect();
                }
            });
        }

        function setupObserver() {
            if (observer) observer.disconnect();
            if (window.editor && window.editor.svg) {
                observer = new MutationObserver(() => {
                    if (liveAnalysisEnabled) {
                        import('./miltyBuilderPopups.js').then(mod => {
                            mod.showDraftValuesPopup(true); // force refresh
                        });
                    }
                });
                observer.observe(window.editor.svg, { childList: true, subtree: true });
            }
        }
        // Import wormholes for custom wormhole transfer
        const { updateHexWormholes } = await import('../../features/wormholes.js');
        let sliceBordersVisible = false;
        let sliceNumbersVisible = false;

        // Status message function
        function updateStatusMsg(msg) {
            const status = container.querySelector('#miltyStatusMsg');
            if (status) status.textContent = msg;
        }

        // Load MiltyBuilder.json button
        const loadBtn = container.querySelector('#loadMiltyJsonBtn');
        if (loadBtn) {
            loadBtn.onclick = async () => {
                try {
                    const { importFullState } = await import('../../data/import.js');
                    const res = await fetch('public/data/MiltyBuilder.json');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const jsonText = await res.text();
                    importFullState(window.editor, jsonText);

                    // Draw slice overlays after map is loaded
                    setTimeout(() => {
                        drawSlicePositionOverlays(window.editor);
                        sliceNumbersVisible = true;
                        const numbersBtn = container.querySelector('#toggleSliceNumbersBtn');
                        if (numbersBtn) {
                            numbersBtn.textContent = 'Hide Slice Numbers';
                            numbersBtn.style.background = '#4a8a4a';
                            numbersBtn.style.color = '#fff';
                        }
                        updateSliceButtonColors();
                        console.log('Slice overlays drawn after MiltyBuilder.json load');
                    }, 500);

                    alert('MiltyBuilder.json loaded!');
                } catch (err) {
                    alert('Failed to load MiltyBuilder.json: ' + err);
                }
            };
        }

        // Toggle slice borders button
        const bordersBtn = container.querySelector('#toggleSliceBordersBtn');
        if (bordersBtn) {
            bordersBtn.onclick = () => {
                if (sliceBordersVisible) {
                    // Hide borders
                    const layer = window.editor?.svg?.querySelector('#sliceBordersOverlayLayer');
                    if (layer) layer.remove();
                    sliceBordersVisible = false;
                    bordersBtn.textContent = 'Slice Borders';
                    bordersBtn.style.background = '';
                    bordersBtn.style.color = '';
                } else {
                    // Show borders
                    drawSliceBordersOverlay(window.editor);
                    sliceBordersVisible = true;
                    bordersBtn.textContent = 'Hide Slice Borders';
                    bordersBtn.style.background = '#4a8a4a';
                    bordersBtn.style.color = '#fff';
                }
            };
        }

        // Toggle slice numbers button
        const numbersBtn = container.querySelector('#toggleSliceNumbersBtn');
        if (numbersBtn) {
            numbersBtn.onclick = () => {
                if (sliceNumbersVisible) {
                    // Hide numbers
                    const layer = window.editor?.svg?.querySelector('#sliceNumbersOverlayLayer');
                    if (layer) layer.remove();
                    sliceNumbersVisible = false;
                    numbersBtn.textContent = 'Slice Numbers';
                    numbersBtn.style.background = '';
                    numbersBtn.style.color = '';
                } else {
                    // Show numbers
                    drawSlicePositionOverlays(window.editor);
                    sliceNumbersVisible = true;
                    numbersBtn.textContent = 'Hide Slice Numbers';
                    numbersBtn.style.background = '#4a8a4a';
                    numbersBtn.style.color = '#fff';
                }
            };
        }

        // Refresh occupancy button
        const refreshBtn = container.querySelector('#refreshOccupancyBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                updateSliceButtonColors();
                updateStatusMsg('Slice occupancy refreshed!');
                refreshBtn.style.background = '#28a745';
                refreshBtn.style.color = '#fff';
                setTimeout(() => {
                    refreshBtn.style.background = '';
                    refreshBtn.style.color = '';
                }, 500);
            };
        }


        // Analysis and Output buttons
        const calcDraftBtn = container.querySelector('#calcDraftValuesBtn');
        if (calcDraftBtn) {
            calcDraftBtn.onclick = () => {
                import('./miltyBuilderPopups.js').then(mod => {
                    mod.showDraftValuesPopup();
                });
            };
        }

        const outputBtn = container.querySelector('#outputCopyBtn');

        if (outputBtn) {
            outputBtn.onclick = () => {
                import('./miltyBuilderPopups.js').then(mod => {
                    mod.showOutputCopyPopup();
                });
            };
        }

        // Import button
        const importBtn = container.querySelector('#importSlicesBtn');
        if (importBtn) {
            importBtn.onclick = () => {
                import('./miltyBuilderPopups.js').then(mod => {
                    mod.showImportSlicesPopup();
                });
            };
        }

        // Generate Slices button
        const generateBtn = container.querySelector('#generateSlicesBtn');
        if (generateBtn) {
            generateBtn.onclick = () => {
                showMiltyDraftGeneratorPopup();
            };
        }

        // Sanity Check button
        const sanityCheckBtn = container.querySelector('#sanityCheckBtn');
        if (sanityCheckBtn) {
            sanityCheckBtn.onclick = () => {
                showSanityCheckPopup();
            };
        }

        // Update slice button colors based on occupancy
        function updateSliceButtonColors() {
            // Update standard map slices (A-F)
            ['A', 'B', 'C', 'D', 'E', 'F'].forEach(sliceLetter => {
                const btn = document.getElementById(`sliceMapBtn_${sliceLetter}`);
                if (!btn) return;

                const sliceHexes = defaultSlices[sliceLetter];
                if (!sliceHexes) return;

                const colors = analyzeSliceOccupancy(sliceHexes, sliceLetter);

                // Clear selection styling first
                if (selectedSource !== sliceLetter || selectedSourceType !== 'map') {
                    btn.style.border = '';
                    btn.style.boxShadow = '';
                }

                // Apply occupancy colors
                btn.style.backgroundColor = colors.backgroundColor;
                btn.style.color = colors.textColor;
                btn.title = colors.title;
            });

            // Update draft slot buttons (1-12)
            for (let slotNum = 1; slotNum <= 12; slotNum++) {
                const btn = document.getElementById(`sliceSlotBtn_${slotNum}`);
                if (!btn) continue;

                const slotHexes = slotPositions[slotNum];
                if (!slotHexes) continue;

                const colors = analyzeSliceOccupancy(slotHexes, `Slot ${slotNum}`);

                // Clear selection styling first
                if (selectedSource !== slotNum || selectedSourceType !== 'slot') {
                    btn.style.border = '';
                    btn.style.boxShadow = '';
                }

                // Apply occupancy colors
                btn.style.backgroundColor = colors.backgroundColor;
                btn.style.color = colors.textColor;
                btn.title = colors.title;

                // Add occupancy indicator
                const occupancyIndicator = colors.backgroundColor === '#28a745' ? ' ✓' :
                    colors.backgroundColor === '#fd7e14' ? ' ◐' :
                        colors.backgroundColor === '#dc3545' ? ' ◑' : '';
                btn.textContent = slotNum + occupancyIndicator;
            }
        }

        // Map slice buttons (A-F)
        ['A', 'B', 'C', 'D', 'E', 'F'].forEach(l => {
            const b = document.getElementById(`sliceMapBtn_${l}`);
            if (b) {
                b.onclick = () => {
                    updateSliceButtonColors();

                    if (selectedSource && selectedSourceType) {
                        // Move from source to this map slice
                        const success = moveSlice(selectedSource, selectedSourceType, l, 'map', updateStatusMsg);
                        if (success) {
                            updateSliceButtonColors();
                            clearSelection();
                        }
                    } else {
                        // Select this map slice as source
                        selectedSource = l;
                        selectedSourceType = 'map';
                        updateStatusMsg(`Selected slice ${l}. Now select a destination to move to.`);
                        highlightSliceOnMap(sliceMap[l]);
                        updateSliceButtonStyles();
                    }
                };
            }
        });

        // Slot buttons (1-12)
        for (let i = 1; i <= 12; ++i) {
            const b = document.getElementById(`sliceSlotBtn_${i}`);
            if (b) {
                b.onclick = () => {
                    updateSliceButtonColors();

                    if (selectedSource && selectedSourceType) {
                        // Move from source to this slot
                        const success = moveSlice(selectedSource, selectedSourceType, i, 'slot', updateStatusMsg);
                        if (success) {
                            updateSliceButtonColors();
                            clearSelection();
                        }
                    } else {
                        // Select this slot as source
                        selectedSource = i;
                        selectedSourceType = 'slot';
                        updateStatusMsg(`Selected slot ${i}. Now select a destination to move to.`);
                        const slotData = sliceSlots[i - 1];
                        if (slotData) highlightSliceOnMap(slotData);
                        updateSliceButtonStyles();
                    }
                };
            }
        }

        // Update button styles to show selection
        function updateSliceButtonStyles() {
            updateSliceButtonColors();

            // Clear all selection styling first
            for (let i = 1; i <= 12; ++i) {
                const b = document.getElementById(`sliceSlotBtn_${i}`);
                if (b) {
                    b.style.border = '';
                    b.style.boxShadow = '';
                }
            }

            // Apply selection styling
            if (selectedSource && selectedSourceType) {
                let btn = null;
                if (selectedSourceType === 'map') {
                    btn = document.getElementById(`sliceMapBtn_${selectedSource}`);
                } else if (selectedSourceType === 'slot') {
                    btn = document.getElementById(`sliceSlotBtn_${selectedSource}`);
                }
                if (btn) {
                    btn.style.border = '3px solid orange';
                    btn.style.boxShadow = '0 0 10px orange';
                }
            }
        }

        // Highlight hexes for a slice on the map
        function highlightSliceOnMap(hexIds) {
            clearSliceHighlights();
            if (!Array.isArray(hexIds)) return;
            hexIds.forEach(id => {
                const hexEl = document.querySelector(`[data-hexid="${id}"]`);
                if (hexEl) {
                    hexEl.classList.add('milty-slice-highlight');
                }
            });
        }

        // Remove all slice highlights
        function clearSliceHighlights() {
            document.querySelectorAll('.milty-slice-highlight').forEach(el => {
                el.classList.remove('milty-slice-highlight');
            });
        }

        // Add CSS for highlight if not present
        if (!document.getElementById('miltySliceHighlightStyle')) {
            const style = document.createElement('style');
            style.id = 'miltySliceHighlightStyle';
            style.textContent = `.milty-slice-highlight { outline: 3px solid red !important; z-index: 10002 !important; }`;
            document.head.appendChild(style);
        }

        // Clear selection function
        function clearSelection() {
            selectedSource = null;
            selectedSourceType = null;
            selectedMapSlice = null;
            selectedSlot = null;
            clearSliceHighlights();
            updateSliceButtonStyles();
        }

        // Clear selection button
        const clearBtn = container.querySelector('#clearSelectionBtn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                clearSelection();
                updateStatusMsg('Selection cleared. Select a slice to move.');
            };
        }

        // Initialize
        setTimeout(() => {
            updateSliceButtonColors();
            updateStatusMsg('Ready! Select a slice to move, or load the map first.');
        }, 100);

    }, 0);
}

// UI Helper Functions for Form Creation and Management
// These functions were moved from miltyBuilderPopups.js for better separation of concerns

/**
 * Creates a textarea element with consistent styling
 */
export function createStyledTextarea(id, placeholder, height = '200px') {
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.style.cssText = `
        width: 100%; 
        height: ${height}; 
        font-family: monospace; 
        font-size: 13px; 
        padding: 8px; 
        border: 1px solid #555; 
        background: #2a2a2a; 
        color: #fff; 
        border-radius: 4px; 
        resize: vertical;
    `;
    textarea.placeholder = placeholder;
    return textarea;
}

/**
 * Creates a styled button with consistent appearance
 */
export function createStyledButton(text, style = {}) {
    const button = document.createElement('button');
    button.textContent = text;
    const defaultStyle = {
        background: '#28a745',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        fontSize: '16px',
        fontWeight: 'bold',
        borderRadius: '6px',
        cursor: 'pointer',
        minWidth: '150px',
        ...style
    };
    
    Object.assign(button.style, defaultStyle);
    return button;
}

/**
 * Creates a checkbox with label in a consistent style
 */
export function createStyledCheckbox(id, labelText, checked = false) {
    const label = document.createElement('label');
    label.style.cssText = `
        display: inline-flex; 
        align-items: center; 
        color: #ccc; 
        cursor: pointer;
    `;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = checked;
    checkbox.style.marginRight = '8px';
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelText));
    
    return { label, checkbox };
}

/**
 * Creates a preview container for import data validation
 */
export function createPreviewContainer(id) {
    const preview = document.createElement('div');
    preview.id = id;
    preview.style.cssText = `
        margin-bottom: 15px; 
        padding: 10px; 
        background: #1a1a1a; 
        border-radius: 4px; 
        font-family: monospace; 
        font-size: 12px; 
        color: #aaa; 
        max-height: 150px; 
        overflow-y: auto; 
        display: none;
    `;
    return preview;
}

/**
 * Updates preview display for slice import validation
 */
export function updateSliceImportPreview(textarea, preview) {
    const input = textarea.value.trim();

    if (!input) {
        preview.style.display = 'none';
        return;
    }

    try {
        // Parse the input same way as import function
        let sliceLines = [];
        if (input.includes(';')) {
            sliceLines = input.split(';').map(line => line.trim()).filter(line => line.length > 0);
        } else {
            sliceLines = input.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        }

        if (sliceLines.length === 0) {
            preview.innerHTML = '<span style="color: #ff6b6b;">No valid slice data found</span>';
            preview.style.display = 'block';
            return;
        }

        let previewHTML = `<strong>Preview (${sliceLines.length} slice${sliceLines.length === 1 ? '' : 's'}):</strong><br>`;

        for (let i = 0; i < sliceLines.length && i < 12; i++) {
            const realIds = sliceLines[i].split(',').map(id => id.trim()).filter(id => id.length > 0);
            const isValid = realIds.length === 5 && realIds.every(id => /^\d+$/.test(id));
            const color = isValid ? '#4CAF50' : '#ff6b6b';
            const status = isValid ? '✓' : '✗';

            previewHTML += `<span style="color: ${color};">${status} Slot ${i + 1}: ${realIds.join(', ')}</span><br>`;
        }

        if (sliceLines.length > 12) {
            previewHTML += `<span style="color: #ff9800;">⚠ Only first 12 slices will be imported</span>`;
        }

        preview.innerHTML = previewHTML;
        preview.style.display = 'block';
    } catch (error) {
        preview.innerHTML = `<span style="color: #ff6b6b;">Parse error: ${error.message}</span>`;
        preview.style.display = 'block';
    }
}

/**
 * Handles the import process for slice data
 */
export function handleSliceImport(slicesData, clearExisting, onProgress, onComplete) {
    if (!slicesData) {
        alert('Please enter slice data to import.');
        return false;
    }

    // Clear existing slices if requested
    if (clearExisting) {
        for (let slotNum = 1; slotNum <= 12; slotNum++) {
            const slotHexes = window.miltyBuilderCore?.slotPositions?.[slotNum] || [];
            for (let j = 1; j < slotHexes.length; j++) {
                const hexId = slotHexes[j];
                if (window.editor?.clearAll) {
                    window.editor.clearAll(hexId);
                }
            }
        }
    }

    // Import the slices
    import('./miltyBuilderCore.js').then(({ importSlices }) => {
        const success = importSlices(slicesData, onProgress);

        if (success) {
            // Close the popup and refresh UI
            document.getElementById('milty-import-popup')?.remove();

            // Refresh the MiltyBuilder UI if it's open
            const miltyUI = document.getElementById('milty-builder-popup');
            if (miltyUI) {
                // Trigger a refresh of slice button colors
                setTimeout(() => {
                    const refreshBtn = miltyUI.querySelector('#refreshOccupancyBtn');
                    if (refreshBtn) refreshBtn.click();
                }, 100);
            }
            
            if (onComplete) onComplete(true);
        } else {
            alert('Import failed. Check console for details.');
            if (onComplete) onComplete(false);
        }
    }).catch(error => {
        console.error('Import error:', error);
        alert('Import failed: ' + error.message);
        if (onComplete) onComplete(false);
    });

    return true;
}

/**
 * Creates an output display container for draft slice data
 */
export function createOutputDisplayContainer(outputData) {
    const { outputString, completedSlots, totalSlices } = outputData;
    
    const container = document.createElement('div');
    container.style.padding = '10px';

    if (totalSlices === 0) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = "No completed draft slices found. Each slice needs 5 systems with realId values.";
        noDataMsg.style.color = '#888';
        noDataMsg.style.fontStyle = 'italic';
        container.appendChild(noDataMsg);
        return container;
    }

    // Header
    const header = document.createElement('h3');
    header.textContent = `Draft Output (${totalSlices} slice${totalSlices === 1 ? '' : 's'})`;
    header.style.marginTop = '0';
    header.style.color = '#ffe066';
    container.appendChild(header);

    // Slot positions for lookup
    const slotPositions = {
        1: [836, 941, 837, 732, 942, 838],
        2: [624, 625, 521, 520, 626, 522],
        3: [724, 725, 621, 620, 622, 518],
        4: [617, 515, 514, 616, 412, 411],
        5: [510, 408, 509, 611, 407, 508],
        6: [813, 711, 812, 914, 710, 811],
        7: [936, 937, 833, 832, 938, 834],
        8: [1036, 1037, 933, 932, 934, 830],
        9: [1032, 1033, 929, 928, 930, 826],
        10: [1028, 926, 925, 1027, 823, 822],
        11: [1025, 923, 922, 1024, 820, 819],
        12: [817, 715, 826, 918, 714, 815]
    };

    // Details section
    const detailsDiv = document.createElement('div');
    detailsDiv.style.marginBottom = '15px';
    detailsDiv.style.fontSize = '0.9em';
    detailsDiv.style.color = '#ccc';

    const sliceDetails = completedSlots.map(slotNum => {
        const slotHexes = slotPositions[slotNum];
        const realIds = [];

        // Get realIds from positions 1-5
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];
            if (hex && hex.realId) {
                realIds.push(hex.realId);
            }
        }

        return `<strong>Slot ${slotNum}:</strong> ${realIds.join(', ')}`;
    }).join('<br>');

    detailsDiv.innerHTML = sliceDetails;
    container.appendChild(detailsDiv);

    // Output string textarea
    const outputLabel = document.createElement('label');
    outputLabel.textContent = 'Copy this string for draft:';
    outputLabel.style.display = 'block';
    outputLabel.style.marginBottom = '5px';
    outputLabel.style.fontWeight = 'bold';
    container.appendChild(outputLabel);

    const outputTextarea = createStyledTextarea('outputStringTextarea', '', '80px');
    outputTextarea.value = outputString;
    outputTextarea.readOnly = true;
    outputTextarea.style.backgroundColor = '#2a2a2a';
    outputTextarea.style.border = '1px solid #444';
    container.appendChild(outputTextarea);

    // Auto-select text when focused
    outputTextarea.addEventListener('focus', () => {
        outputTextarea.select();
    });

    // Instructions
    const instructions = document.createElement('p');
    instructions.innerHTML = '<strong>Instructions:</strong> Click the textarea above to select all text, then Ctrl+C to copy.';
    instructions.style.fontSize = '0.85em';
    instructions.style.color = '#999';
    instructions.style.marginTop = '10px';
    instructions.style.marginBottom = '0';
    container.appendChild(instructions);

    // Auto-focus and select the textarea
    setTimeout(() => {
        outputTextarea.focus();
        outputTextarea.select();
    }, 100);

    return container;
}

/**
 * Creates a copy-to-clipboard action for output strings
 */
export function createCopyToClipboardAction(outputString) {
    return {
        text: 'Copy to Clipboard',
        handler: () => {
            if (outputString && outputString.length > 0) {
                navigator.clipboard.writeText(outputString).then(() => {
                    console.log('Output copied to clipboard');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        }
    };
}

/**
 * Creates a styled table element for data display
 */
export function createStyledTable(headers) {
    const table = document.createElement('table');
    table.style.cssText = `
        width: 100%; 
        font-size: 0.98em; 
        border-collapse: collapse; 
        border: 1px solid #444; 
        border-radius: 4px;
    `;

    if (headers && headers.length > 0) {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.cssText = 'background: #2196F3; color: white;';

        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.style.cssText = 'padding: 8px; border: 1px solid #444; text-align: left;';
            th.innerHTML = headerText;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);
    }

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    return { table, tbody };
}

/**
 * Creates a styled table row with specified background
 */
export function createStyledTableRow(cells, isEvenRow = false) {
    const row = document.createElement('tr');
    row.style.background = isEvenRow ? '#2a2a2a' : '#333';

    cells.forEach(cellContent => {
        const td = document.createElement('td');
        td.style.cssText = 'padding: 6px 8px; border: 1px solid #444;';
        if (typeof cellContent === 'string') {
            td.innerHTML = cellContent;
        } else {
            td.appendChild(cellContent);
        }
        row.appendChild(td);
    });

    return row;
}

/**
 * Creates a message container for empty states
 */
export function createEmptyStateMessage(message) {
    const p = document.createElement('p');
    p.textContent = message;
    p.style.cssText = 'color: #888; font-style: italic;';
    return p;
}

/**
 * Creates the draft values analysis table structure
 */
export function createDraftValuesAnalysisContainer() {
    const container = document.createElement('div');
    
    // Check if we have any draft slices with systems
    const slotPositions = {
        1: [836, 941, 837, 732, 942, 838],
        2: [624, 625, 521, 520, 626, 522],
        3: [724, 725, 621, 620, 622, 518],
        4: [617, 515, 514, 616, 412, 411],
        5: [510, 408, 509, 611, 407, 508],
        6: [813, 711, 812, 914, 710, 811],
        7: [936, 937, 833, 832, 938, 834],
        8: [1036, 1037, 933, 932, 934, 830],
        9: [1032, 1033, 929, 928, 930, 826],
        10: [1028, 926, 925, 1027, 823, 822],
        11: [1025, 923, 922, 1024, 820, 819],
        12: [817, 715, 826, 918, 714, 815]
    };

    let hasData = false;
    for (let slotNum = 1; slotNum <= 12; slotNum++) {
        const slotHexes = slotPositions[slotNum];
        if (!slotHexes) continue;

        // Check positions 1-5 (skip homesystem at position 0)
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];
            if (hex && (hex.realId || hex.planets?.length > 0)) {
                hasData = true;
                break;
            }
        }
        if (hasData) break;
    }

    if (!hasData) {
        const message = createEmptyStateMessage(
            "No draft slices with systems found. Load MiltyBuilder.json and populate some draft slots first."
        );
        container.appendChild(message);
        return { container, hasData: false };
    }

    // Create table with headers
    const headers = [
        'Draft Slot',
        'Planets', 
        'Techs', 
        'R/I<br><span style="font-weight:400;">Ideal</span>',
        'Wormholes',
        'Status'
    ];
    
    const { table, tbody } = createStyledTable(headers);
    container.appendChild(table);

    return { container, tbody, hasData: true, slotPositions };
}

/**
 * Formats tile labels for compact display in analysis table
 */
export function formatTileLabelsForDisplay(sliceHexLabels) {
    const tilesPerRow = Math.ceil(sliceHexLabels.length / 2);
    const tileRow1 = sliceHexLabels.slice(0, tilesPerRow).join(', ');
    const tileRow2 = sliceHexLabels.slice(tilesPerRow).join(', ');
    
    return sliceHexLabels.length > 0 ? `
        <div style="font-size:0.85em;color:#888;line-height:1.1;margin-top:3px;">
            ${tileRow1 || ''}<br>${tileRow2 || ''}
        </div>
    ` : '';
}
