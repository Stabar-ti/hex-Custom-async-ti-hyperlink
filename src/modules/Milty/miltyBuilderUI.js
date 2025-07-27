// src/modules/Milty/miltyBuilderUI.js
// User interface generation and event handling for Milty Slice Designer
// Restored from original miltyBuilderOLD.js

import { defaultSlices, slotPositions, moveSlice, analyzeSliceOccupancy, generateOutputString, capitalizeTech } from './miltyBuilderCore.js';
import { drawSlicePositionOverlays, drawSliceBordersOverlay } from './miltyBuilderDraw.js';
import { showOutputCopyPopup, showDraftValuesPopup } from './miltyBuilderPopups.js';
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
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px;">
                    <button id="loadMiltyJsonBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Load Map</button>
                    <button id="toggleSliceBordersBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Slice Borders</button>
                    <button id="toggleSliceNumbersBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Slice Numbers</button>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
                    <button id="refreshOccupancyBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Refresh</button>
                    <button id="calcDraftValuesBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Analysis</button>
                    <button id="outputCopyBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Output</button>
                    <button id="importSlicesBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Import</button>
                    <button id="sanityCheckBtn" class="mode-button" style="font-size:13px;padding:6px 12px;">Sanity Check</button>
                    <label style="display:inline-flex;align-items:center;font-size:13px;margin-left:10px;cursor:pointer;gap:4px;">
                        <input type="checkbox" id="liveSliceAnalysisToggle" style="margin-right:4px;"> Live Slice Analysis
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

        // Sanity Check button
        const sanityCheckBtn = container.querySelector('#sanityCheckBtn');
        if (sanityCheckBtn) {
            sanityCheckBtn.onclick = () => {
                import('../../features/sanityCheck.js').then(mod => {
                    if (mod.showSanityCheckPopup) mod.showSanityCheckPopup();
                });
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
