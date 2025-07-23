// src/features/miltyBuilder.js
// Milty Slice Designer core logic and UI hooks

export function showMiltyBuilderUI(container) {
    // Draft slot target positions (hex IDs for each slot, from annotated image)
    const slotPositions = {
        1: [836, 941, 837, 732, 942, 838],
        2: [624, 625, 521, 520, 626, 522],
        3: [724, 725, 621, 620, 622, 518],
        4: [617, 515,514, 616, 412, 411],
        5: [510, 408, 509, 611, 407 , 508],
        6: [813, 711, 812, 914, 710, 811],
        7: [936, 937, 833, 832, 938, 834],
        8: [1036, 1037, 933, 932, 934, 830],
        9: [1032, 1033, 929,928, 930, 826],
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
    let rotateNext = false;

    container.innerHTML = `
        <h2>Milty Slice Designer</h2>
        <p>Design and copy slices between the standard map (A–F) and draft slots (1–12).</p>
        <div style="margin: 12px 0;">
            <button id="loadMiltyJsonBtn" class="mode-button" style="font-size:15px;padding:8px 22px;">Load MiltyBuilder.json</button>
        </div>
        <div style="margin: 18px 0;">
            <b>Standard Map Slices:</b>
            <div id="miltyMapRow" style="display:flex;gap:10px;justify-content:center;margin:8px 0;">
                ${['A','B','C','D','E','F'].map(l => `<button class="milty-map-btn" id="sliceMapBtn_${l}" style="width:40px;height:40px;">${l}</button>`).join('')}
            </div>
        </div>
        <div style="margin: 18px 0;">
            <b>Draft Slice Slots:</b>
            <div id="miltySlotRow1" style="display:flex;gap:10px;justify-content:center;margin:8px 0;">
                ${Array.from({length:6},(_,i)=>`<button class="milty-slot-btn" id="sliceSlotBtn_${i+1}" style="width:40px;height:40px;">${i+1}</button>`).join('')}
            </div>
            <div id="miltySlotRow2" style="display:flex;gap:10px;justify-content:center;margin:8px 0;">
                ${Array.from({length:6},(_,i)=>`<button class="milty-slot-btn" id="sliceSlotBtn_${i+7}" style="width:40px;height:40px;">${i+7}</button>`).join('')}
            </div>
        </div>
        <div style="margin: 18px 0; text-align:center;">
            <button id="rotateSliceBtn" class="mode-button" style="font-size:14px;padding:6px 18px;">Rotate Next Copy</button>
        </div>
        <div id="miltyStatusMsg" style="margin:12px 0;color:#4a8a4a;font-weight:bold;text-align:center;"></div>
    `;

    // Load MiltyBuilder.json button logic
    setTimeout(() => {
        const btn = document.getElementById('loadMiltyJsonBtn');
        if (btn) {
            btn.onclick = async () => {
                try {
                    const { importFullState } = await import('../data/import.js');
                    const res = await fetch('public/data/MiltyBuilder.json');
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const jsonText = await res.text();
                    importFullState(window.editor, jsonText);
                    alert('MiltyBuilder.json loaded!');
                } catch (err) {
                    alert('Failed to load MiltyBuilder.json: ' + err);
                }
            };
        }

        // Map slice buttons (A-F)
        ['A','B','C','D','E','F'].forEach(l => {
            const b = document.getElementById(`sliceMapBtn_${l}`);
            if (b) {
                b.onclick = () => {
                    selectedMapSlice = l;
                    updateStatusMsg(`Selected map slice: ${l}. Now select a slot to copy into.`);
                    highlightSliceOnMap(sliceMap[l]);
                };
            }
        });

        // Slot buttons (1-12)
        for (let i=1; i<=12; ++i) {
            const b = document.getElementById(`sliceSlotBtn_${i}`);
            if (b) {
                b.onclick = () => {
                    selectedSlot = i-1;
                    if (selectedMapSlice) {
                        // Copy logic: copy actual slice data
                        let sliceData = sliceMap[selectedMapSlice];
                        if (rotateNext && Array.isArray(sliceData)) {
                            // Rotate: simple demo, reverse array
                            sliceData = [...sliceData].reverse();
                        }
                        sliceSlots[selectedSlot] = Array.isArray(sliceData) ? [...sliceData] : null;
                        // Assign slice contents to target hex positions for this slot
                        const targetHexes = slotPositions[i] || [];
                        if (Array.isArray(sliceData) && Array.isArray(targetHexes)) {
                            const { assignSystem } = window;
                            // Only move positions 1+ (not index 0, the homesystem)
                            const minLen = Math.min(sliceData.length, targetHexes.length);
                            for (let j = 1; j < minLen; ++j) {
                                const srcHexId = sliceData[j];
                                const tgtHexId = targetHexes[j];
                                if (srcHexId && tgtHexId) {
                                    const srcHex = window.editor?.hexes?.[srcHexId];
                                    if (srcHex && typeof assignSystem === 'function') {
                                        // Build a system object from srcHex for assignSystem
                                        const sys = {
                                            id: srcHex.realId,
                                            planets: Array.isArray(srcHex.planets) ? JSON.parse(JSON.stringify(srcHex.planets)) : [],
                                            wormholes: Array.isArray(srcHex.wormholes) ? [...srcHex.wormholes] : Array.from(srcHex.wormholes || []),
                                            effects: Array.isArray(srcHex.effects) ? [...srcHex.effects] : Array.from(srcHex.effects || []),
                                            isHyperlane: srcHex.isHyperlane,
                                            isNebula: srcHex.isNebula,
                                            isGravityRift: srcHex.isGravityRift,
                                            isSupernova: srcHex.isSupernova,
                                            isAsteroidField: srcHex.isAsteroidField
                                        };
                                        assignSystem(window.editor, sys, tgtHexId);
                                    }
                                }
                            }
                            // Now clear the source slice hexes (true MOVE, only positions 1+)
                            for (let j = 1; j < sliceData.length; ++j) {
                                const srcHexId = sliceData[j];
                                if (srcHexId && typeof assignSystem === 'function') {
                                    assignSystem(window.editor, {
                                        id: null,
                                        planets: [],
                                        wormholes: [],
                                        effects: [],
                                        isHyperlane: false,
                                        isNebula: false,
                                        isGravityRift: false,
                                        isSupernova: false,
                                        isAsteroidField: false
                                    }, srcHexId);
                                }
                            }
                            // Force full map redraw for immediate visual update
                            if (typeof window.editor?.redrawAllRealIDOverlays === 'function') window.editor.redrawAllRealIDOverlays(window.editor);
                            if (typeof window.renderSystemList === 'function') window.renderSystemList();
                        }
                        updateStatusMsg(`Copied slice ${selectedMapSlice} to slot ${i}${rotateNext ? ' (rotated)' : ''}.`);
                        rotateNext = false;
                        selectedMapSlice = null;
                        updateSlotIndicators();
                        clearSliceHighlights();
                    } else {
                        updateStatusMsg(`Select a map slice (A-F) first.`);
                    }
                };
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

        // Rotate button
        const rotateBtn = document.getElementById('rotateSliceBtn');
        if (rotateBtn) {
            rotateBtn.onclick = () => {
                rotateNext = true;
                updateStatusMsg('Next slice copy will be rotated.');
            };
        }

        // Slot indicators
        function updateSlotIndicators() {
            for (let i=1; i<=12; ++i) {
                const b = document.getElementById(`sliceSlotBtn_${i}`);
                if (b) {
                    const slotData = sliceSlots[i-1];
                    if (Array.isArray(slotData) && slotData.length) {
                        b.style.background = '#4a8a4a';
                        b.style.color = '#fff';
                        // Show hex IDs (or count)
                        b.innerHTML = `${slotData.length}⎔` + (JSON.stringify(slotData) === JSON.stringify(defaultSlices.A.reverse()) ? ' ⟳' : '');
                    } else {
                        b.style.background = '';
                        b.style.color = '';
                        b.innerHTML = i;
                    }
                }
            }
        }

        function updateStatusMsg(msg) {
            const status = document.getElementById('miltyStatusMsg');
            if (status) status.textContent = msg;
        }

        updateSlotIndicators();
    }, 0);
}