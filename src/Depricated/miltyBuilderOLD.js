// src/features/miltyBuilder.js
// Milty Slice Designer core logic and UI hooks

import { assignSystem } from './assignSystem.js';
import { removeWormholeOverlay } from './wormholes.js';
import { showPopup, hidePopup } from '../ui/popupUI.js';
import { wormholeTypes, planetTypeColors, techSpecialtyColors } from '../constants/constants.js';

// Draws red number overlays (1-12) in specified sectors
export function drawSlicePositionOverlays(editor) {
    if (!editor || !editor.hexes || !editor.svg) {
        console.log('drawSlicePositionOverlays: editor, hexes, or svg not available');
        return;
    }
    console.log('Drawing slice position overlays...');
    // Remove old overlays if any
    const oldLayer = editor.svg.querySelector('#sliceNumbersOverlayLayer');
    if (oldLayer) oldLayer.remove();
    // Create overlay layer
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('id', 'sliceNumbersOverlayLayer');
    editor.svg.appendChild(layer);
    // Sectors and numbers
    const sectors = [733, 417, 517, 513, 610, 913, 729, 829, 825, 924, 921, 917];
    for (let i = 0; i < sectors.length; ++i) {
        const hexId = sectors[i];
        const hex = editor.hexes[hexId];
        if (!hex || !hex.center) {
            console.log(`Hex ${hexId} not found or has no center`);
            continue;
        }
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', hex.center.x);
        text.setAttribute('y', hex.center.y + 8); // visually center
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '32');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', 'red');
        text.setAttribute('stroke', 'white');
        text.setAttribute('stroke-width', '1');
        text.setAttribute('pointer-events', 'none');
        text.setAttribute('class', 'milty-slice-pos-overlay');
        text.textContent = (i + 1).toString();
        layer.appendChild(text);
    }

    // Green A-F letters for slice positions
    const sliceLetters = [636, 504, 306, 311, 523, 632];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < sliceLetters.length; ++i) {
        const hexId = sliceLetters[i];
        const hex = editor.hexes[hexId];
        if (!hex || !hex.center) {
            console.log(`Hex ${hexId} not found or has no center`);
            continue;
        }
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', hex.center.x);
        text.setAttribute('y', hex.center.y + 8); // visually center
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '32');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', 'green');
        text.setAttribute('stroke', 'white');
        text.setAttribute('stroke-width', '1');
        text.setAttribute('pointer-events', 'none');
        text.setAttribute('class', 'milty-slice-letter-overlay');
        text.textContent = letters[i];
        layer.appendChild(text);
    }
    console.log(`Added ${sectors.length} slice position overlays and ${sliceLetters.length} slice letter overlays to layer`);
}

// Draws black borders around each slice (A-F) to show slice boundaries
export function drawSliceBordersOverlay(editor) {
    if (!editor || !editor.hexes || !editor.svg) {
        console.log('drawSliceBordersOverlay: editor, hexes, or svg not available');
        return;
    }

    // Remove old borders if any
    const oldLayer = editor.svg.querySelector('#sliceBordersOverlayLayer');
    if (oldLayer) oldLayer.remove();

    // Create overlay layer
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('id', 'sliceBordersOverlayLayer');
    editor.svg.appendChild(layer);

    // Default slice definitions
    const defaultSlices = {
        A: [530, 401, 424, 529, 301, 318],
        B: [403, 303, 302, 402, 202, 201],
        C: [204, 103, 102, 203, '000', 101],
        D: [208, 209, 105, 104, 210, 106],
        E: [419, 420, 315, 314, 316, 211],
        F: [527, 528, 422, 421, 423, 317]
    };

    const sliceColors = {
        A: '#ff0000', // Red
        B: '#00ff00', // Green  
        C: '#0000ff', // Blue
        D: '#ffff00', // Yellow
        E: '#ff00ff', // Magenta
        F: '#00ffff'  // Cyan
    };

    // First, draw colored overlays for each slice
    Object.entries(defaultSlices).forEach(([sliceName, hexIds]) => {
        hexIds.forEach(hexId => {
            const hex = editor.hexes[hexId];
            if (!hex || !hex.center) return;

            // Create a hexagon polygon for the overlay
            const verts = getHexVertices(hex.center, editor.hexRadius);
            const points = verts.map(v => `${v.x},${v.y}`).join(' ');

            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', points);
            polygon.setAttribute('fill', sliceColors[sliceName]);
            polygon.setAttribute('opacity', '0.1'); // 90% transparency (10% opacity)
            polygon.setAttribute('stroke', 'none');
            polygon.setAttribute('class', `slice-overlay slice-overlay-${sliceName}`);
            polygon.setAttribute('pointer-events', 'none'); // Don't interfere with hex interactions

            layer.appendChild(polygon);
        });
    });

    // Then draw borders on top of overlays
    Object.entries(defaultSlices).forEach(([sliceName, hexIds]) => {
        const sliceHexSet = new Set(hexIds.map(id => id.toString()));
        const drawnEdges = new Set();
        const INSET = 1; // px to move inward from each edge endpoint

        hexIds.forEach(hexId => {
            const hex = editor.hexes[hexId];
            if (!hex || !hex.center) return;

            // Check each side of this hex
            for (let side = 0; side < 6; side++) {
                const neighbor = getNeighborHex(editor, hexId.toString(), side);
                const neighborInSlice = neighbor && sliceHexSet.has(neighbor.label);

                // If neighbor is not in the same slice, this is an external edge
                if (!neighborInSlice) {
                    const edgeKey = `${hexId}-${side}`;
                    if (drawnEdges.has(edgeKey)) return;
                    drawnEdges.add(edgeKey);

                    // Get the hex vertices and draw the edge
                    const verts = getHexVertices(hex.center, editor.hexRadius);
                    const p1 = insetPoint(verts[side], hex.center, INSET);
                    const p2 = insetPoint(verts[(side + 1) % 6], hex.center, INSET);

                    drawSliceEdgeLine(layer, p1, p2, sliceColors[sliceName], 3);
                }
            }
        });
    });

    console.log('Slice borders and overlays drawn');
}

// Helper functions adapted from borderAnomaliesDraw.js
function drawSliceEdgeLine(layer, p1, p2, color, width) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width);
    line.setAttribute('opacity', '0.8');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', 'slice-border-line');
    layer.appendChild(line);
}

function getHexVertices(center, radius) {
    let pts = [];
    for (let i = 0; i < 6; ++i) {
        let angle = Math.PI / 180 * (60 * i - 120);
        pts.push({
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle)
        });
    }
    return pts;
}

function getNeighborHex(editor, label, side) {
    const hex = editor.hexes[label];
    if (!hex) return null;
    const { q, r } = hex;
    // Sides: 0=NW, 1=NE, 2=E, 3=SE, 4=SW, 5=W
    const dirs = [
        { q: 0, r: -1 }, // NW
        { q: 1, r: -1 }, // NE
        { q: 1, r: 0 },  // E
        { q: 0, r: 1 },  // SE
        { q: -1, r: 1 }, // SW
        { q: -1, r: 0 }, // W
    ];
    const nq = q + dirs[side].q;
    const nr = r + dirs[side].r;
    for (const [lab, h] of Object.entries(editor.hexes)) {
        if (h.q === nq && h.r === nr) return { ...h, label: lab };
    }
    return null;
}

function insetPoint(pt, center, inset) {
    const dx = center.x - pt.x;
    const dy = center.y - pt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    return {
        x: pt.x + dx / len * inset,
        y: pt.y + dy / len * inset
    };
}

export function showMiltyBuilderUI(container) {
    // Draft slot target positions (hex IDs for each slot, from annotated image)
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
    // Slice state
    // Each slice is an array of hex IDs (e.g. slice A = [530, 529, 424, 423, 318, 401, 301])
    // For demo, use hardcoded hex IDs for slice A (from your image)
    const defaultSlices = {
        A: [530, 401, 424, 529, 301, 318],
        B: [403, 303, 302, 402, 202, 201],
        C: [204, 103, 102, 203, '000', 101],
        D: [208, 209, 105, 104, 210, 106],
        E: [419, 420, 315, 314, 316, 211],
        F: [527, 528, 422, 421, 423, 317]
    };
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

    // Load MiltyBuilder.json button logic
    setTimeout(async () => {
        // Import updateHexWormholes for custom wormhole transfer
        const { updateHexWormholes } = await import('./wormholes.js');
        let sliceBordersVisible = false;
        let sliceNumbersVisible = false;

        const btn = document.getElementById('loadMiltyJsonBtn');
        if (btn) {
            btn.onclick = async () => {
                try {
                    const { importFullState } = await import('../data/import.js');
                    const res = await fetch('public/data/MiltyBuilder.json');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const jsonText = await res.text();
                    importFullState(window.editor, jsonText);

                    // Draw slice overlays after map is loaded
                    setTimeout(() => {
                        drawSlicePositionOverlays(window.editor);
                        sliceNumbersVisible = true; // Update state
                        const numbersBtn = document.getElementById('toggleSliceNumbersBtn');
                        if (numbersBtn) {
                            numbersBtn.textContent = 'Hide Slice Numbers';
                            numbersBtn.style.background = '#4a8a4a';
                            numbersBtn.style.color = '#fff';
                        }
                        updateSliceButtonColors(); // Update button colors based on current map state
                        console.log('Slice overlays drawn after MiltyBuilder.json load');
                    }, 500);

                    alert('MiltyBuilder.json loaded!');
                } catch (err) {
                    alert('Failed to load MiltyBuilder.json: ' + err);
                }
            };
        }

        // Toggle slice borders button
        const bordersBtn = document.getElementById('toggleSliceBordersBtn');
        if (bordersBtn) {
            bordersBtn.onclick = () => {
                if (sliceBordersVisible) {
                    // Hide borders
                    const layer = window.editor?.svg?.querySelector('#sliceBordersOverlayLayer');
                    if (layer) layer.remove();
                    sliceBordersVisible = false;
                    bordersBtn.textContent = 'Show Slice Borders';
                    bordersBtn.style.background = '';
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
        const numbersBtn = document.getElementById('toggleSliceNumbersBtn');
        if (numbersBtn) {
            numbersBtn.onclick = () => {
                if (sliceNumbersVisible) {
                    // Hide numbers
                    const layer = window.editor?.svg?.querySelector('#sliceNumbersOverlayLayer');
                    if (layer) layer.remove();
                    sliceNumbersVisible = false;
                    numbersBtn.textContent = 'Show Slice Numbers';
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
        const refreshBtn = document.getElementById('refreshOccupancyBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                updateSliceButtonColors();
                updateStatusMsg('Slice occupancy refreshed!');
                // Brief visual feedback
                refreshBtn.style.background = '#28a745';
                refreshBtn.style.color = '#fff';
                setTimeout(() => {
                    refreshBtn.style.background = '';
                    refreshBtn.style.color = '';
                }, 500);
            };
        }

        // Calculate draft values button
        const calcDraftBtn = document.getElementById('calcDraftValuesBtn');
        if (calcDraftBtn) {
            calcDraftBtn.onclick = () => {
                // Always use the top-level exported function
                if (typeof window.showDraftValuesPopup === 'function') {
                    window.showDraftValuesPopup();
                } else if (typeof showDraftValuesPopup === 'function') {
                    showDraftValuesPopup();
                }
            };
        }

        // Output copy button
        const outputBtn = document.getElementById('outputCopyBtn');
        if (outputBtn) {
            outputBtn.onclick = () => {
                // Always use the top-level exported function
                if (typeof window.showOutputCopyPopup === 'function') {
                    window.showOutputCopyPopup();
                } else if (typeof showOutputCopyPopup === 'function') {
                    showOutputCopyPopup();
                }
            };
        }

        // Function to generate output string for fully occupied draft slices
        function generateOutputString() {
            const fullyOccupiedSlices = [];
            const sliceDetails = [];

            for (let slotNum = 1; slotNum <= 12; slotNum++) {
                const slotHexes = slotPositions[slotNum];
                if (!slotHexes) continue;

                // Check if this slot is fully occupied with realId systems
                const realIds = [];
                let isFullyOccupied = true;

                // Skip position 0 (homesystem), check positions 1-5
                for (let i = 1; i < slotHexes.length; i++) {
                    const hexId = slotHexes[i];
                    const hex = window.editor?.hexes?.[hexId];
                    if (hex && hex.realId) {
                        realIds.push(hex.realId);
                    } else {
                        isFullyOccupied = false;
                        break;
                    }
                }

                // If all 5 positions have realId systems, include in output
                if (isFullyOccupied && realIds.length === 5) {
                    fullyOccupiedSlices.push(realIds.join(','));
                    sliceDetails.push({
                        slotNum: slotNum,
                        realIds: realIds
                    });
                }
            }

            return {
                outputString: fullyOccupiedSlices.join(';'),
                sliceDetails: sliceDetails
            };
        }

        // ...existing code...

        // Map slice buttons (A-F)
        ['A', 'B', 'C', 'D', 'E', 'F'].forEach(l => {
            const b = document.getElementById(`sliceMapBtn_${l}`);
            if (b) {
                b.onclick = () => {
                    // Always refresh occupancy when clicking slice buttons
                    updateSliceButtonColors();

                    if (selectedSource && selectedSourceType) {
                        // Move from source to this map slice
                        moveSlice(selectedSource, selectedSourceType, l, 'map');
                    } else {
                        // Select this map slice as source
                        selectedSource = l;
                        selectedSourceType = 'map';
                        selectedMapSlice = null; // Clear old selection
                        selectedSlot = null;
                        updateStatusMsg(`Selected slice ${l}. Now select a destination to move to.`);
                        highlightSliceOnMap(sliceMap[l]);
                        updateSliceButtonStyles();
                    }
                };
            }
        });

        // Update slice button colors based on occupancy
        function updateSliceButtonColors() {
            // Update standard map slices (A-F)
            ['A', 'B', 'C', 'D', 'E', 'F'].forEach(sliceLetter => {
                const btn = document.getElementById(`sliceMapBtn_${sliceLetter}`);
                if (!btn) return;

                const sliceHexes = defaultSlices[sliceLetter];
                if (!sliceHexes) return;

                const colors = analyzeSliceOccupancy(sliceHexes, sliceLetter);

                // Clear any old selection styling first, then apply new colors
                if (selectedSource !== sliceLetter || selectedSourceType !== 'map') {
                    btn.style.border = '';
                    btn.style.boxShadow = '';
                }

                // Apply the occupancy-based colors
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

                // Clear any old selection styling first, then apply new colors
                if (selectedSource !== slotNum || selectedSourceType !== 'slot') {
                    btn.style.border = '';
                    btn.style.boxShadow = '';
                }

                // Apply the occupancy-based colors, but preserve slot number display
                btn.style.backgroundColor = colors.backgroundColor;
                btn.style.color = colors.textColor;
                btn.title = colors.title;

                // Keep the slot number visible, but add occupancy indicator
                const occupancyIndicator = colors.backgroundColor === '#28a745' ? ' ✓' :
                    colors.backgroundColor === '#fd7e14' ? ' ◐' :
                        colors.backgroundColor === '#dc3545' ? ' ◑' : '';
                btn.textContent = slotNum + occupancyIndicator;
            }
        }

        // Helper function to analyze slice occupancy and return color scheme
        function analyzeSliceOccupancy(sliceHexes, sliceName) {
            // Analyze slice contents (skip position 0 - homesystem)
            let totalSlots = sliceHexes.length - 1; // 5 slots (positions 1-5)
            let filledWithRealId = 0;
            let filledWithOther = 0;

            for (let i = 1; i < sliceHexes.length; i++) {
                const hexId = sliceHexes[i];
                const hex = window.editor?.hexes?.[hexId];
                if (hex) {
                    if (hex.realId) {
                        filledWithRealId++;
                    } else if (hex.baseType || hex.isHyperlane || hex.isNebula || hex.isGravityRift ||
                        hex.isSupernova || hex.isAsteroidField || (hex.wormholes && hex.wormholes.length > 0)) {
                        filledWithOther++;
                    }
                }
            }

            // Determine colors based on occupancy
            let backgroundColor = '';
            let textColor = '';
            let title = '';

            if (filledWithRealId === totalSlots) {
                // All 5 slots filled with realId systems (async tiles)
                backgroundColor = '#28a745'; // Green
                textColor = '#fff';
                title = `${sliceName}: Complete (${filledWithRealId}/${totalSlots} systems)`;
            } else if (filledWithRealId + filledWithOther === totalSlots) {
                // All 5 slots filled but not all with realId (mixed content)
                backgroundColor = '#fd7e14'; // Orange
                textColor = '#fff';
                title = `${sliceName}: Full but mixed (${filledWithRealId} systems, ${filledWithOther} other)`;
            } else if (filledWithRealId + filledWithOther > 0) {
                // Partially filled
                backgroundColor = '#dc3545'; // Red
                textColor = '#fff';
                title = `${sliceName}: Partial (${filledWithRealId + filledWithOther}/${totalSlots} filled)`;
            } else {
                // Completely empty
                backgroundColor = '#f8f9fa'; // Light gray/white
                textColor = '#212529';
                title = `${sliceName}: Empty`;
            }

            return { backgroundColor, textColor, title };
        }

        // Slot buttons (1-12)
        for (let i = 1; i <= 12; ++i) {
            const b = document.getElementById(`sliceSlotBtn_${i}`);
            if (b) {
                b.onclick = () => {
                    // Always refresh occupancy when clicking slot buttons
                    updateSliceButtonColors();

                    if (selectedSource && selectedSourceType) {
                        // Move from source to this slot
                        moveSlice(selectedSource, selectedSourceType, i, 'slot');
                    } else {
                        // Select this slot as source
                        selectedSource = i;
                        selectedSourceType = 'slot';
                        selectedMapSlice = null;
                        selectedSlot = null;
                        updateStatusMsg(`Selected slot ${i}. Now select a destination to move to.`);
                        const slotData = sliceSlots[i - 1];
                        if (slotData) highlightSliceOnMap(slotData);
                        updateSliceButtonStyles();
                    }
                };
            }
        }

        // Move slice between any positions (A-F, 1-12, intermixed)
        function moveSlice(sourceId, sourceType, targetId, targetType) {
            // Get source hex positions first
            let sourceHexes = [];
            if (sourceType === 'map') {
                const sliceKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
                const sliceIndex = sliceKeys.indexOf(sourceId);
                if (sliceIndex >= 0) {
                    sourceHexes = Object.values(defaultSlices)[sliceIndex] || [];
                }
            } else if (sourceType === 'slot') {
                sourceHexes = slotPositions[sourceId] || [];
            }

            if (!sourceHexes.length) {
                updateStatusMsg(`Invalid source ${sourceType} ${sourceId}.`);
                return;
            }

            // Build sourceData from actual current hex states (not stored arrays)
            let sourceData = [];
            for (let i = 0; i < sourceHexes.length; i++) {
                const hexId = sourceHexes[i];
                if (hexId && window.editor?.hexes?.[hexId]) {
                    const hex = window.editor.hexes[hexId];
                    sourceData.push({
                        hexId: hexId,
                        realId: hex.realId,
                        baseType: hex.baseType, // Include baseType for special hexes
                        planets: Array.isArray(hex.planets) ? JSON.parse(JSON.stringify(hex.planets)) : [],
                        inherentWormholes: hex.inherentWormholes ? new Set(Array.from(hex.inherentWormholes)) : new Set(),
                        customWormholes: hex.customWormholes ? new Set(Array.from(hex.customWormholes)) : new Set(),
                        wormholes: hex.wormholes ? new Set(Array.from(hex.wormholes)) : new Set(),
                        effects: Array.isArray(hex.effects) ? [...hex.effects] : Array.from(hex.effects || []),
                        isHyperlane: hex.isHyperlane,
                        isNebula: hex.isNebula,
                        isGravityRift: hex.isGravityRift,
                        isSupernova: hex.isSupernova,
                        isAsteroidField: hex.isAsteroidField
                    });
                } else {
                    sourceData.push(null);
                }
            }

            // Get target hex positions
            let targetHexes = [];
            if (targetType === 'map') {
                // Moving to map slice A-F, use default slice positions
                const sliceKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
                const sliceIndex = sliceKeys.indexOf(targetId);
                if (sliceIndex >= 0) {
                    targetHexes = Object.values(defaultSlices)[sliceIndex] || [];
                }
            } else if (targetType === 'slot') {
                // Moving to draft slot 1-12
                targetHexes = slotPositions[targetId] || [];
            }

            if (!targetHexes.length) {
                updateStatusMsg(`Invalid target ${targetType} ${targetId}.`);
                return;
            }

            // First paste slice data to new positions and mark as used
            const minLen = Math.min(sourceData.length, targetHexes.length);
            const placedSystems = []; // Track which systems we place for marking

            for (let j = 1; j < minLen; ++j) {
                const srcData = sourceData[j];
                const tgtHexId = targetHexes[j];
                if (srcData && tgtHexId && (srcData.realId || srcData.baseType || srcData.isHyperlane || srcData.isNebula || srcData.isGravityRift || srcData.isSupernova || srcData.isAsteroidField)) {
                    const tgtHex = window.editor?.hexes?.[tgtHexId];
                    if (tgtHex) {
                        if (srcData.realId) {
                            // For systems with realId, follow importFullState pattern
                            // Direct assignment like importFullState does
                            tgtHex.realId = srcData.realId;

                            // Mark as used immediately like importFullState does
                            import('../ui/uiFilters.js').then(({ markRealIDUsed }) => {
                                markRealIDUsed(srcData.realId);
                            }).catch(err => {
                                console.warn('Could not mark realId as used:', err);
                            });

                            tgtHex.planets = Array.isArray(srcData.planets) ? JSON.parse(JSON.stringify(srcData.planets)) : [];

                            // Handle wormholes properly like importFullState does
                            // First, get system info to find inherent wormholes
                            const realIdKey = srcData.realId.toString().toUpperCase();
                            const info = window.editor?.sectorIDLookup?.[realIdKey] || {};

                            // Set inherent and custom wormholes separately
                            tgtHex.inherentWormholes = new Set((info.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
                            tgtHex.customWormholes = new Set(Array.from(srcData.customWormholes || []).filter(Boolean).map(w => w.toLowerCase()));
                            // Always update hex.wormholes as the union
                            tgtHex.wormholes = new Set([...tgtHex.inherentWormholes, ...tgtHex.customWormholes]);

                            tgtHex.isHyperlane = srcData.isHyperlane;
                            tgtHex.isNebula = srcData.isNebula;
                            tgtHex.isGravityRift = srcData.isGravityRift;
                            tgtHex.isSupernova = srcData.isSupernova;
                            tgtHex.isAsteroidField = srcData.isAsteroidField;

                            // Apply effects using editor.applyEffect like importFullState does
                            if (srcData.effects && srcData.effects.length > 0) {
                                srcData.effects.forEach(eff => {
                                    if (eff && typeof window.editor.applyEffect === 'function') {
                                        window.editor.applyEffect(tgtHexId, eff);
                                    }
                                });
                            }

                            // Use the same classification logic as importFullState
                            if (srcData.baseType === "void") {
                                window.editor.setSectorType(tgtHexId, 'void', { skipSave: true });
                            } else if (srcData.baseType === "homesystem" || (srcData.planets && srcData.planets.some(p => p.planetType === 'FACTION'))) {
                                window.editor.setSectorType(tgtHexId, 'homesystem', { skipSave: true });
                            } else if (srcData.baseType === "special" || (!srcData.planets?.length && (srcData.isAsteroidField || srcData.isSupernova || srcData.isNebula || srcData.isGravityRift))) {
                                window.editor.setSectorType(tgtHexId, 'special', { skipSave: true });
                            } else if (srcData.baseType === "legendary planet" || (srcData.planets && srcData.planets.some(p => p.legendaryAbilityName?.trim()))) {
                                window.editor.setSectorType(tgtHexId, 'legendary planet', { skipSave: true });
                            } else {
                                const planetCount = (srcData.planets || []).length;
                                if (planetCount >= 3 || srcData.baseType === "3 planet") {
                                    window.editor.setSectorType(tgtHexId, '3 planet', { skipSave: true });
                                } else if (planetCount >= 2 || srcData.baseType === "2 planet") {
                                    window.editor.setSectorType(tgtHexId, '2 planet', { skipSave: true });
                                } else if (planetCount >= 1 || srcData.baseType === "1 planet") {
                                    window.editor.setSectorType(tgtHexId, '1 planet', { skipSave: true });
                                } else {
                                    window.editor.setSectorType(tgtHexId, 'empty', { skipSave: true });
                                }
                            }

                            // Apply effects from SystemInfo like importFullState does
                            if (info.isNebula) window.editor.applyEffect(tgtHexId, 'nebula');
                            if (info.isGravityRift) window.editor.applyEffect(tgtHexId, 'rift');
                            if (info.isSupernova) window.editor.applyEffect(tgtHexId, 'supernova');
                            if (info.isAsteroidField) window.editor.applyEffect(tgtHexId, 'asteroid');

                            // Create wormhole overlays like importFullState does
                            tgtHex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
                            tgtHex.wormholeOverlays = [];
                            Array.from(tgtHex.wormholes).forEach((w, i) => {
                                const positions = window.editor.effectIconPositions;
                                const len = positions.length;
                                const reversedIndex = len - 1 - (i % len);
                                const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
                                import('../features/baseOverlays.js').then(({ createWormholeOverlay }) => {
                                    const overlay = createWormholeOverlay(tgtHex.center.x + pos.dx, tgtHex.center.y + pos.dy, w.toLowerCase());
                                    if (overlay) {
                                        const wormholeIconLayer = window.editor.svg.querySelector('#wormholeIconLayer');
                                        if (wormholeIconLayer) {
                                            wormholeIconLayer.appendChild(overlay);
                                        } else {
                                            window.editor.svg.appendChild(overlay);
                                        }
                                        tgtHex.wormholeOverlays.push(overlay);
                                    }
                                }).catch(err => {
                                    console.warn('Could not create wormhole overlay:', err);
                                });
                            });

                            placedSystems.push(srcData.realId);
                        } else if (srcData.baseType || srcData.isHyperlane || srcData.isNebula || srcData.isGravityRift || srcData.isSupernova || srcData.isAsteroidField) {
                            // For special hexes without realId, directly set properties
                            tgtHex.baseType = srcData.baseType;
                            tgtHex.planets = Array.isArray(srcData.planets) ? JSON.parse(JSON.stringify(srcData.planets)) : [];

                            // Handle wormholes for special hexes (these are usually custom only)
                            tgtHex.inherentWormholes = new Set(); // Special hexes usually don't have inherent wormholes
                            tgtHex.customWormholes = new Set(Array.from(srcData.customWormholes || []).filter(Boolean).map(w => w.toLowerCase()));
                            tgtHex.wormholes = new Set([...tgtHex.inherentWormholes, ...tgtHex.customWormholes]);

                            tgtHex.isHyperlane = srcData.isHyperlane;
                            tgtHex.isNebula = srcData.isNebula;
                            tgtHex.isGravityRift = srcData.isGravityRift;
                            tgtHex.isSupernova = srcData.isSupernova;
                            tgtHex.isAsteroidField = srcData.isAsteroidField;

                            // Apply effects using the proper editor method (like copy-paste wizard)
                            if (srcData.effects && srcData.effects.length > 0) {
                                srcData.effects.forEach(eff => {
                                    if (eff && typeof window.editor.applyEffect === 'function') {
                                        window.editor.applyEffect(tgtHexId, eff);
                                    }
                                });
                            }

                            // Update visual appearance for baseType hexes
                            if (srcData.baseType && typeof window.editor.setSectorType === 'function') {
                                window.editor.setSectorType(tgtHexId, srcData.baseType, { skipSave: true });
                            }

                            // Create wormhole overlays for special hexes too
                            if (tgtHex.wormholes && tgtHex.wormholes.size > 0) {
                                tgtHex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
                                tgtHex.wormholeOverlays = [];
                                Array.from(tgtHex.wormholes).forEach((w, i) => {
                                    const positions = window.editor.effectIconPositions;
                                    const len = positions.length;
                                    const reversedIndex = len - 1 - (i % len);
                                    const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
                                    import('../features/baseOverlays.js').then(({ createWormholeOverlay }) => {
                                        const overlay = createWormholeOverlay(tgtHex.center.x + pos.dx, tgtHex.center.y + pos.dy, w.toLowerCase());
                                        if (overlay) {
                                            const wormholeIconLayer = window.editor.svg.querySelector('#wormholeIconLayer');
                                            if (wormholeIconLayer) {
                                                wormholeIconLayer.appendChild(overlay);
                                            } else {
                                                window.editor.svg.appendChild(overlay);
                                            }
                                            tgtHex.wormholeOverlays.push(overlay);
                                        }
                                    }).catch(err => {
                                        console.warn('Could not create wormhole overlay:', err);
                                    });
                                });
                            }
                        }

                        // Move custom wormholes (this is separate from inherent/system wormholes)
                        if (srcData.customWormholes && srcData.customWormholes.size > 0) {
                            // For realId systems, we already handled wormholes above
                            // For special hexes, we might need to add custom wormholes on top
                            if (!srcData.realId) {
                                // Only for non-realId hexes, add custom wormholes directly
                                srcData.customWormholes.forEach(wh => {
                                    if (!tgtHex.customWormholes) tgtHex.customWormholes = new Set();
                                    tgtHex.customWormholes.add(wh);
                                });
                                // Update the union
                                if (!tgtHex.inherentWormholes) tgtHex.inherentWormholes = new Set();
                                tgtHex.wormholes = new Set([...tgtHex.inherentWormholes, ...tgtHex.customWormholes]);
                            }
                            // Update visual wormholes
                            import('./wormholes.js').then(({ updateHexWormholes }) => {
                                updateHexWormholes(tgtHex);
                            }).catch(err => {
                                console.warn('Could not update hex wormholes:', err);
                            });
                        }
                    }
                }
            }

            // Now clear source hexes (only positions 1-5, not homesystem at 0)
            // This will call unmarkRealIDUsed for each system
            for (let j = 1; j < sourceData.length; ++j) {
                const srcData = sourceData[j];
                if (srcData && srcData.hexId && window.editor) {
                    removeWormholeOverlay(window.editor, srcData.hexId);
                    const srcHex = window.editor.hexes?.[srcData.hexId];
                    if (srcHex && srcHex.customWormholes) {
                        srcHex.customWormholes = new Set();
                        import('./wormholes.js').then(({ updateHexWormholes }) => {
                            updateHexWormholes(srcHex);
                        }).catch(err => {
                            console.warn('Could not update hex wormholes:', err);
                        });
                    }

                    // Clear the hex using clearAll (this calls unmarkRealIDUsed)
                    if (typeof window.editor.clearAll === 'function') {
                        window.editor.clearAll(srcData.hexId);
                    }
                }
            }

            // Update data structures (store hex IDs for tracking)
            if (targetType === 'map') {
                sliceMap[targetId] = targetHexes.slice(); // Store hex IDs
            } else if (targetType === 'slot') {
                sliceSlots[targetId - 1] = targetHexes.slice(); // Store hex IDs
            }

            // Clear source data structures
            if (sourceType === 'map') {
                // Keep only homesystem (position 0), clear everything else  
                sliceMap[sourceId] = [sourceHexes[0], null, null, null, null, null];
            } else if (sourceType === 'slot') {
                sliceSlots[sourceId - 1] = null; // Clear slot completely
            }

            // Update UI
            if (typeof window.editor?.redrawAllRealIDOverlays === 'function') window.editor.redrawAllRealIDOverlays(window.editor);
            if (typeof window.renderSystemList === 'function') window.renderSystemList();

            // Update visual overlays for effects and wormholes
            import('../features/baseOverlays.js').then(({ updateWormholeVisibility }) => {
                updateWormholeVisibility(window.editor);
            }).catch(err => {
                console.warn('Could not update wormhole visibility:', err);
            });

            // Update tile image layer for visual consistency
            import('../features/imageSystemsOverlay.js').then(({ updateTileImageLayer }) => {
                updateTileImageLayer(window.editor);
            }).catch(err => {
                console.warn('Could not update tile image layer:', err);
            });

            // Update border anomalies overlay if active
            if (typeof window.editor?.redrawBorderAnomaliesOverlay === 'function') {
                window.editor.redrawBorderAnomaliesOverlay();
            }

            // Import and call the refreshSystemList function to update filter states
            import('../ui/uiFilters.js').then(({ refreshSystemList }) => {
                refreshSystemList();
            }).catch(err => {
                console.warn('Could not refresh system list filters:', err);
            });

            updateSlotIndicators();

            // Update slice button colors after move - this will show the new occupancy state
            // Source slice should now show as white/red (emptied), destination should show new state
            updateSliceButtonColors();

            // Clear selection after move - program forgets what was moved
            selectedSource = null;
            selectedSourceType = null;
            clearSliceHighlights();
            updateSliceButtonStyles(); // This will apply selection styling on top of the new colors

            updateStatusMsg(`Moved slice from ${sourceType} ${sourceId} to ${targetType} ${targetId}. Selection cleared.`);
        }

        // Update button styles to show selection
        function updateSliceButtonStyles() {
            // First update colors based on occupancy (this sets the base colors)
            updateSliceButtonColors();

            // Clear slot selection styles only
            for (let i = 1; i <= 12; ++i) {
                const b = document.getElementById(`sliceSlotBtn_${i}`);
                if (b) {
                    b.style.border = '';
                    b.style.boxShadow = '';
                }
            }

            // Apply selection styling on top of occupancy colors (don't clear backgrounds)
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

        // Clear selection button
        const clearBtn = document.getElementById('clearSelectionBtn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                selectedSource = null;
                selectedSourceType = null;
                selectedMapSlice = null;
                selectedSlot = null;
                clearSliceHighlights();
                updateSliceButtonStyles();
                updateStatusMsg('Selection cleared. Select a slice to move.');
            };
        }

        // Slot indicators - now works with occupancy colors
        function updateSlotIndicators() {
            // This function is now integrated into updateSliceButtonColors()
            // No need to set separate styles here as occupancy colors take precedence
            // Just ensure the slot numbers and indicators are set correctly
            console.log('Slot indicators updated via occupancy system');
        }

        function updateStatusMsg(msg) {
            const status = document.getElementById('miltyStatusMsg');
            if (status) status.textContent = msg;
        }

        updateSlotIndicators();

        // Initialize slice button colors
        setTimeout(() => {
            updateSliceButtonColors();
        }, 100);

        // Note: Slice overlays are only drawn when MiltyBuilder.json is loaded
    }, 0);
}

// Function to show output copy popup (top-level, and also assign to window for global reference)
export function showOutputCopyPopup() {
    // Make available globally for popupUI.js event context
    window.showOutputCopyPopup = showOutputCopyPopup;
    // Helper to generate output string for fully occupied draft slices
    function generateOutputString() {
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
        const fullyOccupiedSlices = [];
        const sliceDetails = [];
        for (let slotNum = 1; slotNum <= 12; slotNum++) {
            const slotHexes = slotPositions[slotNum];
            if (!slotHexes) continue;
            const realIds = [];
            let isFullyOccupied = true;
            for (let i = 1; i < slotHexes.length; i++) {
                const hexId = slotHexes[i];
                const hex = window.editor?.hexes?.[hexId];
                if (hex && hex.realId) {
                    realIds.push(hex.realId);
                } else {
                    isFullyOccupied = false;
                    break;
                }
            }
            if (isFullyOccupied && realIds.length === 5) {
                fullyOccupiedSlices.push(realIds.join(','));
                sliceDetails.push({ slotNum: slotNum, realIds: realIds });
            }
        }
        return {
            outputString: fullyOccupiedSlices.join(';'),
            sliceDetails: sliceDetails
        };
    }

    const result = generateOutputString();
    const outputString = result.outputString;
    const sliceDetails = result.sliceDetails;

    // Create slice details HTML
    let sliceDetailsHtml = '';
    if (sliceDetails.length > 0) {
        sliceDetailsHtml = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: #ffe066; margin-bottom: 8px;">Included Draft Slices:</h4>
                <div style="background: #3a3a3a; padding: 10px; border-radius: 4px; border: 1px solid #666;">
                    ${sliceDetails.map(slice => `
                        <div style="margin-bottom: 6px; color: #ccc;">
                            <strong style="color: #4CAF50;">Slot ${slice.slotNum}:</strong> 
                            <span style="font-family: monospace; font-size: 11px; color: #fff;">${slice.realIds.join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Create content for the popup
    const content = `
        <h3 style="margin-top: 0; color: #ffe066;">Draft Slice Output</h3>
        <p style="color: #ccc; margin-bottom: 15px;">
            Output string for fully occupied draft slices (5 async tiles each):
        </p>
        ${sliceDetailsHtml}
        <div style="margin-bottom: 15px;">
            <label for="outputText" style="display: block; margin-bottom: 5px; font-weight: bold; color: #ffe066;">
                Output String:
            </label>
            <textarea
                id="outputText"
                readonly
                style="
                    width: 100%;
                    height: 120px;
                    padding: 10px;
                    border: 1px solid #666;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                    resize: vertical;
                    background: #2a2a2a;
                    color: #fff;
                    box-sizing: border-box;
                "
            >${outputString}</textarea>
        </div>
        ${outputString ? '' : '<p style="color: #ff6b6b; margin-top: 10px; font-style: italic;">No fully occupied draft slices found. Complete some slices with 5 async tiles each.</p>'}
    `;

    // Define actions for the popup
    const actions = [
        {
            label: 'Copy to Clipboard',
            action: async (btn) => {
                const textArea = document.querySelector('#outputText');
                try {
                    await navigator.clipboard.writeText(outputString);
                    btn.textContent = 'Copied!';
                    btn.style.background = '#28a745';
                    btn.style.color = '#fff';
                    setTimeout(() => {
                        btn.textContent = 'Copy to Clipboard';
                        btn.style.background = '';
                        btn.style.color = '';
                    }, 2000);
                } catch (err) {
                    // Fallback for older browsers
                    if (textArea) {
                        textArea.select();
                        textArea.setSelectionRange(0, 99999);
                        document.execCommand('copy');
                        btn.textContent = 'Copied!';
                        btn.style.background = '#28a745';
                        btn.style.color = '#fff';
                        setTimeout(() => {
                            btn.textContent = 'Copy to Clipboard';
                            btn.style.background = '';
                            btn.style.color = '';
                        }, 2000);
                    }
                }
            }
        }
    ];

    // Help function for the popup
    function outputHelpFunction() {
        showMiltyHelp();
    }

    // Show the popup using PopupUI
    const popup = showPopup({
        content: content,
        actions: actions,
        title: 'Draft Slice Output',
        id: 'milty-output-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: outputHelpFunction,
        style: {
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh'
        }
    });

    // Auto-select text for easy copying
    setTimeout(() => {
        const textArea = popup.querySelector('#outputText');
        if (textArea) {
            textArea.select();
        }
    }, 100);
}

// Function to show draft values popup (top-level, and also assign to window for global reference)
export function showDraftValuesPopup() {
    window.showDraftValuesPopup = showDraftValuesPopup;

    // Create a container for the analysis
    const container = document.createElement('div');
    renderDraftValuesAnalysis(container);

    // Help function for the popup
    function draftValuesHelpFunction() {
        showMiltyHelp();
    }

    // Show the popup using PopupUI
    const popup = showPopup({
        content: container,
        actions: [],
        title: 'Calculate Draft Values',
        id: 'milty-draft-values-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: draftValuesHelpFunction,
        style: {
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh'
        }
    });
}



// Function to render draft values analysis
function renderDraftValuesAnalysis(container) {
    container.innerHTML = '';

    // Draft slot target positions (same as in showMiltyBuilderUI)
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

    // Check if we have any draft slices with systems
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
        const p = document.createElement('p');
        p.textContent = "No draft slices with systems found. Load MiltyBuilder.json and populate some draft slots first.";
        p.style.color = '#888';
        p.style.fontStyle = 'italic';
        container.appendChild(p);
        return;
    }

    // Table structure
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '0.98em';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Draft Slot</th>
                <th>Planets</th>
                <th>Techs</th>
                <th>R/I<br><span style="font-weight:400;">Ideal</span></th>
                <th>Wormholes</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    // Analyze each draft slot
    for (let slotNum = 1; slotNum <= 12; slotNum++) {
        const slotHexes = slotPositions[slotNum];
        if (!slotHexes) continue;

        // Analyze slice hexes (positions 1-5, skip homesystem at 0)
        const sliceHexes = [];
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];
            if (hex) {
                sliceHexes.push({ ...hex, label: hexId });
            }
        }

        let planetCount = 0, res = 0, inf = 0;
        let typeCounts = { INDUSTRIAL: 0, CULTURAL: 0, HAZARDOUS: 0 };
        let techs = new Set();
        let wormholes = new Set();
        let a = 0, b = 0, c = 0;
        let realIdCount = 0;

        sliceHexes.forEach(hex => {
            if (hex.realId) realIdCount++;
            if (!hex.planets || !Array.isArray(hex.planets)) return;

            planetCount += hex.planets.length;
            hex.planets.forEach(p => {
                res += p.resources || 0;
                inf += p.influence || 0;
                let pt = (p.planetType || (Array.isArray(p.planetTypes) && p.planetTypes[0]) || '').toUpperCase();
                if (pt && typeCounts[pt] !== undefined) typeCounts[pt]++;
                if (p.techSpecialty) techs.add(p.techSpecialty);
                if (Array.isArray(p.techSpecialties)) p.techSpecialties.forEach(t => techs.add(t));
                if (p.resources === p.influence) c += p.resources;
                else if (p.resources > p.influence) a += p.resources;
                else if (p.influence > p.resources) b += p.influence;
            });

            // Collect wormholes (no hopping between draft slices)
            if (hex.wormholes && hex.wormholes.size > 0) {
                hex.wormholes.forEach(w => wormholes.add(w));
            }
        });

        // Build color-coded breakdowns (same as calcSlice)
        const typeHtml = Object.entries(typeCounts)
            .filter(([_, count]) => count > 0)
            .map(([type, count]) =>
                `<span style="color:${planetTypeColors[type] || 'inherit'};margin-right:2px;">${count}${type[0]}</span>`
            ).join('');

        const techHtml = Array.from(techs)
            .filter(Boolean)
            .map(t =>
                `<span style="color:${techSpecialtyColors[t.toUpperCase()] || 'inherit'};font-weight:600;margin-right:2px;">${capitalizeTech(t)[0]}</span>`
            ).join('');

        const wormholeHtml = Array.from(wormholes)
            .map(w => {
                const key = w.toLowerCase();
                const whType = wormholeTypes[key];
                const color = whType?.color || 'gray';
                const label = whType?.label ? whType.label[0] : key[0].toUpperCase();
                return `<span style="background:${color};color:white;font-weight:600;padding:1px 6px;border-radius:7px;margin-right:2px;display:inline-block;">${label}</span>`;
            }).join(' ');

        // Status indicator
        let statusHtml = '';
        let statusColor = '';
        if (realIdCount === 5) {
            statusHtml = 'Complete';
            statusColor = '#28a745';
        } else if (realIdCount > 0) {
            statusHtml = `${realIdCount}/5`;
            statusColor = '#fd7e14';
        } else {
            statusHtml = 'Empty';
            statusColor = '#6c757d';
        }

        const sliceHexLabels = sliceHexes.filter(h => h.realId).map(h => h.realId || h.label);

        // Compact tile labels display
        const tilesPerRow = Math.ceil(sliceHexLabels.length / 2);
        const tileRow1 = sliceHexLabels.slice(0, tilesPerRow).join(', ');
        const tileRow2 = sliceHexLabels.slice(tilesPerRow).join(', ');
        const tilesBlock = sliceHexLabels.length > 0 ? `
            <div style="font-size:0.85em;color:#888;line-height:1.1;margin-top:3px;">
                ${tileRow1 || ''}<br>${tileRow2 || ''}
            </div>
        ` : '';

        const slotHeader = `<b>Slot ${slotNum}</b>`;
        const idealRI = c > 0 ? `${a}/${b}+${c}` : `${a}/${b}`;

        // Only show rows for slots that have some content
        if (realIdCount > 0 || planetCount > 0) {
            // Add main row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${slotHeader}</td>
                <td>${planetCount} ${typeHtml}</td>
                <td>${techHtml || '-'}</td>
                <td>${res}/${inf}<br><span style="font-size:0.88em;color:#aaa;">${idealRI}</span></td>
                <td style="min-width:80px;">${wormholeHtml || '-'}</td>
                <td><span style="color:${statusColor};font-weight:600;">${statusHtml}</span></td>
            `;
            tbody.appendChild(row);

            // Add tile labels row if we have systems
            if (tilesBlock) {
                const tileRow = document.createElement('tr');
                tileRow.innerHTML = `
                    <td colspan="6" style="padding-bottom:7px;padding-top:1px;">
                        ${tilesBlock}
                    </td>
                `;
                tbody.appendChild(tileRow);
            }
        }
    }

    container.appendChild(table);
}

// Helper function for tech display (same as calcSlice)
function capitalizeTech(tech) {
    if (!tech) return '';
    const map = {
        CYBERNETIC: "Cybernetic",
        BIOTIC: "Biotic",
        WARFARE: "Warfare",
        PROPULSION: "Propulsion"
    };
    return map[tech.toUpperCase()] || (tech[0].toUpperCase() + tech.slice(1).toLowerCase());
}

// Help popup function - shows comprehensive help for Milty Slice Designer
export function showMiltyHelp() {
    const helpContent = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 15px; line-height: 1.5;">
            <h2 style="color: #ffe066; margin-top: 0;">Milty Slice Designer Help</h2>
            
            <h3 style="color: #4CAF50;">Overview</h3>
            <p>The Milty Slice Designer is a tool for creating, managing, and analyzing slices for Twilight Imperium 4th Edition draft formats. Work with both the standard map layout (slices A-F) and draft slots (1-12) for competitive play.</p>
            
            <h3 style="color: #4CAF50;">Getting Started</h3>
            <ol>
                <li><strong>Load MiltyBuilder.json Map</strong> - Loads the standard 6-player map layout</li>
                <li><strong>Show Slice Borders</strong> - Visual overlay showing slice boundaries (A-F)</li>
                <li><strong>Show Slice Numbers</strong> - Visual overlay showing draft slot positions (1-12)</li>
            </ol>
            
            <h3 style="color: #4CAF50;">Color Coding System</h3>
            <ul>
                <li><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px;">Green ✓</span> Complete slice (all 5 non-home systems filled with async tiles)</li>
                <li><span style="background: #fd7e14; color: white; padding: 2px 6px; border-radius: 3px;">Orange ◐</span> Mixed content (filled but not all async tiles)</li>
                <li><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px;">Red ◑</span> Partially filled</li>
                <li><span style="background: #f8f9fa; color: #212529; padding: 2px 6px; border-radius: 3px; border: 1px solid #ccc;">White/Gray</span> Empty</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Basic Workflow</h3>
            <ol>
                <li><strong>Select Source:</strong> Click any slice button (A-F or 1-12)
                    <ul><li>Button highlights with orange border</li></ul>
                </li>
                <li><strong>Select Destination:</strong> Click target slice button
                    <ul><li>Systems move from source to destination</li>
                    <li>Source is cleared (except home system for A-F slices)</li></ul>
                </li>
                <li><strong>Selection clears automatically</strong> after each move</li>
            </ol>
            
            <h3 style="color: #4CAF50;">Standard Map Slices (A-F)</h3>
            <ul>
                <li>Pre-loaded with default competitive slice layouts</li>
                <li>Home systems (position 0) never move or clear</li>
                <li>Only positions 1-5 (regular systems) are affected by moves</li>
                <li>Perfect for modifying the base competitive map</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Draft Slots (1-12)</h3>
            <ul>
                <li>Start empty and can be populated from A-F slices or other slots</li>
                <li>All 6 positions can be filled (including home system)</li>
                <li>Perfect for creating tournament draft pools</li>
                <li>Can store variations and alternatives</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Control Buttons</h3>
            <ul>
                <li><strong>Load MiltyBuilder.json Map:</strong> Loads standard 6-player layout</li>
                <li><strong>Show Slice Borders:</strong> Toggles colored slice boundary overlays</li>
                <li><strong>Show Slice Numbers:</strong> Toggles numbered draft position overlays</li>
                <li><strong>Refresh Occupancy:</strong> Updates color coding of all slice buttons</li>
                <li><strong>Calculate Draft Values:</strong> Opens detailed analysis of all draft slices</li>
                <li><strong>Output Copy:</strong> Generates formatted output for completed draft slices</li>
                <li><strong>Clear Selection:</strong> Cancels current selection</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Analysis Tools</h3>
            <p><strong>Calculate Draft Values</strong> provides detailed analysis:</p>
            <ul>
                <li>Planet counts and resource/influence totals</li>
                <li>Tech specialties (color-coded)</li>
                <li>Planet types (Industrial/Cultural/Hazardous)</li>
                <li>Wormhole types present</li>
                <li>Completion status indicators</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Output Generation</h3>
            <p><strong>Output Copy</strong> creates tournament-ready strings:</p>
            <ul>
                <li>Only includes completed slices (5 async tiles each)</li>
                <li>Format: realId,realId,realId,realId,realId;nextSlice...</li>
                <li>Copy-to-clipboard functionality</li>
                <li>Detailed breakdown of included slices</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Tips & Best Practices</h3>
            <ul>
                <li><strong>Use Color Coding:</strong> Let the color system guide your decisions</li>
                <li><strong>Check Values Frequently:</strong> Use "Calculate Draft Values" often</li>
                <li><strong>Work Incrementally:</strong> Make small changes and test</li>
                <li><strong>Save Variations:</strong> Use draft slots to store alternatives</li>
                <li><strong>Verify Completion:</strong> All draft slices should be green with ✓</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Troubleshooting</h3>
            <ul>
                <li><strong>Colors seem wrong:</strong> Use "Refresh Occupancy" button</li>
                <li><strong>Unsure of selection:</strong> Use "Clear Selection" button</li>
                <li><strong>Need to reset:</strong> Use "Load MiltyBuilder.json Map" to restore defaults</li>
                <li><strong>Performance issues:</strong> Disable visual overlays temporarily</li>
            </ul>
            
            <h3 style="color: #4CAF50;">Quick Reference</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr style="background: #3a3a3a;">
                    <th style="border: 1px solid #666; padding: 8px; text-align: left;">Action</th>
                    <th style="border: 1px solid #666; padding: 8px; text-align: left;">Steps</th>
                </tr>
                <tr>
                    <td style="border: 1px solid #666; padding: 6px;">Move Slice</td>
                    <td style="border: 1px solid #666; padding: 6px;">1. Click source → 2. Click destination</td>
                </tr>
                <tr style="background: #2a2a2a;">
                    <td style="border: 1px solid #666; padding: 6px;">Check Status</td>
                    <td style="border: 1px solid #666; padding: 6px;">Use color coding or "Calculate Draft Values"</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #666; padding: 6px;">Reset Selection</td>
                    <td style="border: 1px solid #666; padding: 6px;">Click "Clear Selection"</td>
                </tr>
                <tr style="background: #2a2a2a;">
                    <td style="border: 1px solid #666; padding: 6px;">Generate Output</td>
                    <td style="border: 1px solid #666; padding: 6px;">Click "Output Copy" → Copy string</td>
                </tr>
            </table>
        </div>
    `;

    // Show the help popup
    showPopup({
        content: helpContent,
        actions: [],
        title: 'Milty Slice Designer Help',
        id: 'milty-help-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: false, // No help button on the help popup itself
        style: {
            width: '700px',
            maxWidth: '95vw',
            maxHeight: '85vh'
        }
    });
}