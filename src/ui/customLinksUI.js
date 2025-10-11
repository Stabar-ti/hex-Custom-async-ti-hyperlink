import { drawCustomAdjacencyLayer } from '../draw/customLinksDraw.js';
import { toggleCustomLinksOverlay } from '../features/customLinksOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { showPopup, hidePopup } from './popupUI.js'; // <-- Add hidePopup import

export function installCustomLinksUI(editor) {
    // --- Main Custom Links popup using PopupUI ---
    function showCustomLinksPopup() {
        // Only one instance
        if (document.getElementById('customLinksPopup')) return;

        // Build content
        const content = document.createElement('div');
        // Tool label
        const label = document.createElement('div');
        label.textContent = "Custom Link Tools:";
        label.classList.add('popup-tool-label');
        content.appendChild(label);

        // --- Bug warning toggle ---
        const bugToggleLabel = document.createElement('label');
        bugToggleLabel.style.display = 'block';
        bugToggleLabel.style.margin = '10px 0 4px 0';

        const bugToggle = document.createElement('input');
        bugToggle.type = 'checkbox';
        bugToggle.checked = true;
        bugToggle.id = 'customLinkWarnToggle';

        bugToggleLabel.appendChild(bugToggle);
        bugToggleLabel.appendChild(document.createTextNode(' Warn if mixing single/double custom links (async bot bug workaround)'));
        content.appendChild(bugToggleLabel);

        // Tool buttons
        const btnRow = document.createElement('div');
        btnRow.style.margin = '8px 0 0 0';
        btnRow.style.display = 'flex';
        btnRow.style.flexWrap = 'wrap';

        function toolBtn(text, mode, title) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'mode-button';
            btn.title = title;
            btn.style.margin = '2px 4px 2px 0';
            btn.onclick = () => {
                Array.from(btnRow.querySelectorAll('.mode-button')).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (editor._pendingCustomAdj) {
                    const prev = editor._pendingCustomAdj;
                    if (editor.hexes[prev] && editor.hexes[prev].polygon)
                        editor.hexes[prev].polygon.classList.remove('selected');
                }
                editor._pendingCustomAdj = null;

                if (overrideState && overrideState.start) {
                    if (editor.hexes[overrideState.start] && editor.hexes[overrideState.start].polygon)
                        editor.hexes[overrideState.start].polygon.classList.remove('selected');
                }
                if (overrideState && overrideState.dir) {
                    if (editor.hexes[overrideState.dir] && editor.hexes[overrideState.dir].polygon)
                        editor.hexes[overrideState.dir].polygon.classList.remove('selected');
                }
                overrideState = { step: 0, start: null, dir: null };

                editor.setMode(mode);
            };
            return btn;
        }
        btnRow.appendChild(toolBtn('Single Link', 'custom-adj-single', 'One-way custom link'));
        btnRow.appendChild(toolBtn('Double Link', 'custom-adj-double', 'Two-way custom link'));
        btnRow.appendChild(toolBtn('Adj Override', 'custom-adj-override', '3 clicks: PRIMARY, DIRECTION, SECONDARY'));
        btnRow.appendChild(toolBtn('Remove Links', 'custom-adj-remove', 'Click hex to remove its custom links'));
        content.appendChild(btnRow);

        showPopup({
            id: 'customLinksPopup',
            className: 'border-anomalies-popup',
            title: 'Custom Links',
            content,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                left: '520px',
                top: '80px',
                minWidth: '340px',
                maxWidth: '800px',
                minHeight: '200px',
                maxHeight: '800px',
                //background: '#222',
                color: '#fff',
                border: '2px solid #ffe066',
                boxShadow: '0 8px 40px #000a',
                padding: '18px 0 18px 0'
            },
            showHelp: true,
            onHelp: () => {
                showPopup({
                    id: 'customLinksHelpPopup',
                    title: 'Custom Link Tools Help',
                    content:
                        "Single Link: Click two hexes to create a dark yellow one-way link. (No labels)<br>" +
                        "Double Link: Click two hexes for a blue bidirectional link. (No labels)<br>" +
                        "Adj Override: Click PRIMARY hex, then a DIRECTION hex (neighbor), then SECONDARY hex. This draws a magenta label on the PRIMARY hex (edge facing DIRECTION, showing SECONDARY label) and on the SECONDARY hex (opposite edge, showing PRIMARY label). No lines.<br>" +
                        "Remove: Click a hex to remove ALL its custom links and overrides.",
                    draggable: true,
                    dragHandleSelector: '.popup-ui-titlebar',
                    scalable: true,
                    rememberPosition: true,
                    style: {
                        //       background: '#222',
                        color: '#fff',
                        border: '2px solid #2ecc40',
                        borderRadius: '10px',
                        boxShadow: '0 8px 40px #000a',
                        minWidth: '340px',
                        maxWidth: '800px',
                        minHeight: '200px',
                        maxHeight: '800px',
                        padding: '24px'
                    }
                });
            }
        });
    }

    // --- Custom link warning popup utility ---
    function showCustomLinkWarning(confirmCallback, cancelCallback) {
        showPopup({
            id: 'customLinkWarningPopup',
            className: '',
            modal: true,
            title: 'Custom Link Type Conflict',
            content: `
                <div style="margin-bottom:18px;font-size:1.08em;">
                    <span style="font-size:1.3em;color:#ff9800;font-weight:bold;">⚠️ Warning</span><br><br>
                    The async bot only allows <b>one type</b> of custom link (single or double) per hex.<br>
                    <span style="color:#ffe066;">Creating this link will <b>remove all previous custom links of the other type</b> for both involved hexes.</span>
                    <br><br>
                    Are you sure you want to continue?
                </div>
            `,
            actions: [
                {
                    label: 'Confirm',
                    action: (btn) => {
                        hidePopup('customLinkWarningPopup');
                        if (typeof confirmCallback === 'function') confirmCallback();
                    }
                },
                {
                    label: 'Cancel',
                    action: (btn) => {
                        hidePopup('customLinkWarningPopup');
                        if (typeof cancelCallback === 'function') cancelCallback();
                    }
                }
            ],
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                //     background: '#222',
                color: '#fff',
                border: '2px solid #ff9800',
                borderRadius: '14px',
                boxShadow: '0 8px 40px #000a',
                minWidth: '340px',
                maxWidth: '800px',
                minHeight: '200px',
                maxHeight: '800px',
                padding: '24px'
            }
        });
    }

    // --- Per-hex global type-mixing conflict detection ---
    function customLinkTypeConflict(mode, hexA, hexB) {
        // Does hexA or hexB have any links of the *other* type?
        // If adding single, warn if either has a double anywhere.
        // If adding double, warn if either has a single anywhere.
        let hexAHasSingle = false, hexAHasDouble = false;
        let hexBHasSingle = false, hexBHasDouble = false;

        if (hexA.customAdjacents) {
            for (const adj of Object.values(hexA.customAdjacents)) {
                if (adj.twoWay) hexAHasDouble = true;
                else hexAHasSingle = true;
            }
        }
        if (hexB.customAdjacents) {
            for (const adj of Object.values(hexB.customAdjacents)) {
                if (adj.twoWay) hexBHasDouble = true;
                else hexBHasSingle = true;
            }
        }
        if (mode === 'custom-adj-single') {
            return hexAHasDouble || hexBHasDouble;
        }
        if (mode === 'custom-adj-double') {
            return hexAHasSingle || hexBHasSingle;
        }
        return false;
    }

    // Setup UI after DOM is ready - removed old button launcher
    // The Custom Links button is now in the sector controls popup

    // ---- CLICK LOGIC FOR ALL TOOLS ----
    const oldClickHandler = editor._onHexClick;
    let overrideState = { step: 0, start: null, dir: null };

    // Helper for creating custom links (single/double) after removing existing ones
    function doCreateLink(mode, a, b) {
        if (mode === 'custom-adj-single') {
            editor.saveState(a);
            if (!editor.hexes[a].customAdjacents) editor.hexes[a].customAdjacents = {};
            editor.hexes[a].customAdjacents[b] = { twoWay: false };
            editor.hexes[a].polygon.classList.remove('selected');
            editor._pendingCustomAdj = null;
            drawCustomAdjacencyLayer(editor);
            enforceSvgLayerOrder(editor.svg);
        } else if (mode === 'custom-adj-double') {
            editor.beginUndoGroup();
            editor.saveState(a);
            editor.saveState(b);
            if (!editor.hexes[a].customAdjacents) editor.hexes[a].customAdjacents = {};
            if (!editor.hexes[b].customAdjacents) editor.hexes[b].customAdjacents = {};
            editor.hexes[a].customAdjacents[b] = { twoWay: true };
            editor.hexes[b].customAdjacents[a] = { twoWay: true };
            editor.commitUndoGroup();
            editor.hexes[a].polygon.classList.remove('selected');
            editor.hexes[b].polygon.classList.remove('selected');
            editor._pendingCustomAdj = null;
            drawCustomAdjacencyLayer(editor);
            enforceSvgLayerOrder(editor.svg);
        }
    }

    editor._onHexClick = function (e, label) {
        // ---- Single/Double Link ----
        if (this.mode === 'custom-adj-single' || this.mode === 'custom-adj-double') {
            if (!this._pendingCustomAdj) {
                this._pendingCustomAdj = label;
                this.hexes[label].polygon.classList.add('selected');
            } else if (this._pendingCustomAdj && this._pendingCustomAdj !== label) {
                const a = this._pendingCustomAdj, b = label;
                const hexA = this.hexes[a], hexB = this.hexes[b];

                const warnOnMixing = document.getElementById('customLinkWarnToggle')?.checked !== false;
                const existsOtherType = customLinkTypeConflict(this.mode, hexA, hexB);

                if (warnOnMixing && existsOtherType) {
                    showCustomLinkWarning(() => {
                        // Remove all links of the opposite type from both hexes
                        if (this.mode === 'custom-adj-single') {
                            // Remove all double links from hexA and hexB
                            if (hexA.customAdjacents) {
                                for (const key of Object.keys(hexA.customAdjacents)) {
                                    if (hexA.customAdjacents[key].twoWay) {
                                        if (editor.hexes[key]?.customAdjacents) delete editor.hexes[key].customAdjacents[a];
                                        delete hexA.customAdjacents[key];
                                    }
                                }
                            }
                            if (hexB.customAdjacents) {
                                for (const key of Object.keys(hexB.customAdjacents)) {
                                    if (hexB.customAdjacents[key].twoWay) {
                                        if (editor.hexes[key]?.customAdjacents) delete editor.hexes[key].customAdjacents[b];
                                        delete hexB.customAdjacents[key];
                                    }
                                }
                            }
                        } else if (this.mode === 'custom-adj-double') {
                            // Remove all single links from hexA and hexB
                            if (hexA.customAdjacents) {
                                for (const key of Object.keys(hexA.customAdjacents)) {
                                    if (!hexA.customAdjacents[key].twoWay) {
                                        if (editor.hexes[key]?.customAdjacents) delete editor.hexes[key].customAdjacents[a];
                                        delete hexA.customAdjacents[key];
                                    }
                                }
                            }
                            if (hexB.customAdjacents) {
                                for (const key of Object.keys(hexB.customAdjacents)) {
                                    if (!hexB.customAdjacents[key].twoWay) {
                                        if (editor.hexes[key]?.customAdjacents) delete editor.hexes[key].customAdjacents[b];
                                        delete hexB.customAdjacents[key];
                                    }
                                }
                            }
                        }
                        doCreateLink.call(this, this.mode, a, b);
                    }, () => {
                        hexA.polygon.classList.remove('selected');
                        hexB.polygon.classList.remove('selected');
                        this._pendingCustomAdj = null;
                    });
                    return;
                }
                doCreateLink.call(this, this.mode, a, b);
            }
            return;
        }

        // ---- OVERRIDE TOOL: 3 clicks: PRIMARY, DIRECTION, SECONDARY ----
        if (this.mode === 'custom-adj-override') {
            if (overrideState.step === 0) {
                overrideState.start = label; // first hex (PRIMARY)
                overrideState.step = 1;
                this.hexes[label].polygon.classList.add('selected');
            } else if (overrideState.step === 1) {
                overrideState.dir = label; // direction hex (neighbor)
                overrideState.step = 2;
                this.hexes[overrideState.start].polygon.classList.remove('selected');
                this.hexes[label].polygon.classList.add('selected');
            } else if (overrideState.step === 2) {
                const primary = overrideState.start;
                const dirHex = overrideState.dir;
                const secondary = label;

                const startHex = this.hexes[primary];
                const directionHex = this.hexes[dirHex];
                const targetHex = this.hexes[secondary];

                editor.saveState(primary);
                editor.saveState(secondary);

                // 1. Calculate direction index (side 0-5) from PRIMARY to DIRECTION
                const dq = directionHex.q - startHex.q, dr = directionHex.r - startHex.r;
                const sideIdx = getSideFromDelta(editor, dq, dr);
                if (!isFinite(sideIdx)) {
                    alert('Direction must be a direct neighbor of the primary hex!');
                    this.hexes[dirHex].polygon.classList.remove('selected');
                    overrideState = { step: 0, start: null, dir: null };
                    return;
                }

                // 2. Store on primary: overrides[sideIdx] = secondary
                if (!startHex.adjacencyOverrides) startHex.adjacencyOverrides = {};
                startHex.adjacencyOverrides[sideIdx] = secondary;

                // 3. Store on secondary: overrides[oppositeSide] = primary
                const opp = oppositeSide(sideIdx);
                if (!targetHex.adjacencyOverrides) targetHex.adjacencyOverrides = {};
                targetHex.adjacencyOverrides[opp] = primary;

                // 4. Clean up UI state
                this.hexes[dirHex].polygon.classList.remove('selected');
                overrideState = { step: 0, start: null, dir: null };

                drawCustomAdjacencyLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // ---- Remove all links from this hex (both ends) ----
        if (this.mode === 'custom-adj-remove') {
            editor.saveState(label);
            const hex = this.hexes[label];
            if (hex.customAdjacents) {
                const others = Object.keys(hex.customAdjacents);
                for (const other of others) {
                    const neighbor = this.hexes[other];
                    if (neighbor && neighbor.customAdjacents) {
                        delete neighbor.customAdjacents[label];
                        if (Object.keys(neighbor.customAdjacents).length === 0) delete neighbor.customAdjacents;
                    }
                }
                delete hex.customAdjacents;
            }

            if (hex.adjacencyOverrides) {
                for (const [side, neighbor] of Object.entries(hex.adjacencyOverrides)) {
                    const nhex = this.hexes[neighbor];
                    if (nhex && nhex.adjacencyOverrides) {
                        for (const [s2, n2] of Object.entries(nhex.adjacencyOverrides)) {
                            if (n2 === label) delete nhex.adjacencyOverrides[s2];
                        }
                    }
                }
                delete hex.adjacencyOverrides;
            }

            drawCustomAdjacencyLayer(this);
            for (const k of Object.keys(this.hexes)) {
                if (this.hexes[k].customAdjacents)
                    console.log("HEX", k, "customAdjacents", this.hexes[k].customAdjacents);
            }
            return;
        }

        // Fallback to previous click handler for other tools
        if (typeof oldClickHandler === "function") oldClickHandler.call(this, e, label);
    };

    // Utility: get direction index for a delta (q,r)
    function getSideFromDelta(editor, dq, dr) {
        for (let i = 0; i < 6; ++i) {
            const dir = editor.edgeDirections[i];
            if (dir.q === dq && dir.r === dr) return i;
        }
        return undefined;
    }
    function oppositeSide(side) { return (parseInt(side) + 3) % 6; }

    // Redraw after map (re)generation
    const oldGenerateMap = editor.generateMap;
    editor.generateMap = function () {
        oldGenerateMap.call(this);
        drawCustomAdjacencyLayer(this);
        enforceSvgLayerOrder(editor.svg);
    };

    // Expose redraw method
    editor.redrawCustomAdjacencyOverlay = () => drawCustomAdjacencyLayer(editor);

    // Expose popup function globally for sector controls
    window.showCustomLinksPopup = showCustomLinksPopup;
}
