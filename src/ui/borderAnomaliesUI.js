import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { toggleBorderAnomaliesOverlay } from '../features/borderAnomaliesOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { showPopup, hidePopup } from './popupUI.js';

export function installBorderAnomaliesUI(editor) {
    function showBorderAnomaliesPopup() {
        if (document.getElementById('borderAnomaliesPopup')) return;

        // Build content
        const content = document.createElement('div');
        // Tool label
        const label = document.createElement('div');
        label.textContent = "Border Anomaly Tools:";
        label.classList.add('popup-tool-label');
        content.appendChild(label);

        // Tool buttons
        const btnRow = document.createElement('div');
        btnRow.style.margin = '8px 0 0 0';
        btnRow.style.display = 'flex';
        btnRow.style.flexWrap = 'wrap';

        function toolBtn(text, mode, title) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'mode-button border-anomaly-tool-btn';
            btn.title = title;
            btn.style.margin = '2px 4px 2px 0';
            btn.onclick = () => {
                Array.from(btnRow.querySelectorAll('.border-anomaly-tool-btn')).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                editor.setMode(mode);
                if (editor._pendingBorderAnomaly) {
                    editor.hexes[editor._pendingBorderAnomaly]?.polygon?.classList.remove('selected');
                }
                editor._pendingBorderAnomaly = null;
            };
            return btn;
        }
        btnRow.appendChild(toolBtn('Spatial Tear', 'border-anomaly-double', 'Double block (both ways)'));
        btnRow.appendChild(toolBtn('Gravity Wave', 'border-anomaly-single', 'One-way block'));
        btnRow.appendChild(toolBtn('Remove', 'border-anomaly-remove', 'Remove all anomalies from hex'));
        content.appendChild(btnRow);

        showPopup({
            id: 'borderAnomaliesPopup',
            className: 'popup-ui border-anomalies-popup', // Add popup-ui for transparency
            title: 'Border Anomalies',
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
                // background intentionally omitted to allow .popup-ui CSS to apply transparency
                // color intentionally omitted to allow .popup-ui CSS to apply
                border: '2px solid #ffe066',
                boxShadow: '0 8px 40px #000a',
                padding: '18px 0 18px 0'
            },
            showHelp: true,
            onHelp: () => {
                showPopup({
                    id: 'borderAnomaliesHelpPopup',
                    className: 'popup-ui popup-ui-info',
                    title: 'Border Anomaly Tools Help',
                    content:
                        "1. Click a primary hex, then a neighbor to select the edge.<br>" +
                        "2. Choose type (Spatial Tear = double, Gravity Wave = single).<br>" +
                        "3. Remove: Click a hex to remove all its border anomalies.",
                    draggable: true,
                    dragHandleSelector: '.popup-ui-titlebar',
                    scalable: true,
                    rememberPosition: true,
                    style: {
                        // background intentionally omitted
                        // color intentionally omitted
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

    // --- Error popup utility using popupUI ---
    function showErrorPopup(message) {
        showPopup({
            id: 'borderAnomaliesErrorPopup',
            title: 'Error',
            content: `<div style="margin-bottom:14px;font-size:1.1em;color:#ff9800;">${message}</div>`,
            actions: [
                {
                    label: 'OK',
                    action: (btn) => hidePopup('borderAnomaliesErrorPopup')
                }
            ],
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            style: {
                //    background: '#222',
                color: '#fff',
                border: '2px solid #ff9800',
                borderRadius: '12px',
                boxShadow: '0 8px 40px #000a',
                minWidth: '320px',
                maxWidth: '600px',
                minHeight: '120px',
                maxHeight: '400px',
                padding: '24px'
            }
        });
    }

    // Setup UI after DOM is ready - removed old button launcher
    // The Border Anomalies button is now in the sector controls popup

    // --- CLICK LOGIC MIRRORING CUSTOM LINKS ---
    const oldClickHandler = editor._onHexClick;

    editor._onHexClick = function (e, label) {
        // Add double border anomaly (Spatial Tear)
        if (this.mode === 'border-anomaly-double') {
            if (!this._pendingBorderAnomaly) {
                this._pendingBorderAnomaly = label;
                this.hexes[label].polygon.classList.add('selected');
            } else if (this._pendingBorderAnomaly && this._pendingBorderAnomaly !== label) {
                const primary = this._pendingBorderAnomaly, secondary = label;
                editor.beginUndoGroup();
                editor.saveState(primary);
                editor.saveState(secondary);
                const side = getSideBetween(this.hexes, primary, secondary);
                if (side === undefined) {
                    hidePopup('borderAnomaliesErrorPopup');
                    showErrorPopup('Tiles are not neighbors!');
                    this.hexes[primary].polygon.classList.remove('selected');
                    this._pendingBorderAnomaly = null;
                    return;
                }
                if (!this.hexes[primary].borderAnomalies) this.hexes[primary].borderAnomalies = {};
                if (!this.hexes[secondary].borderAnomalies) this.hexes[secondary].borderAnomalies = {};
                this.hexes[primary].borderAnomalies[side] = { type: "Spatial Tear" };
                this.hexes[secondary].borderAnomalies[getOppositeSide(side)] = { type: "Spatial Tear" };
                editor.commitUndoGroup();
                this.hexes[primary].polygon.classList.remove('selected');
                this._pendingBorderAnomaly = null;
                drawBorderAnomaliesLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // Add single border anomaly (Gravity Wave)
        if (this.mode === 'border-anomaly-single') {
            if (!this._pendingBorderAnomaly) {
                this._pendingBorderAnomaly = label;
                this.hexes[label].polygon.classList.add('selected');
            } else if (this._pendingBorderAnomaly && this._pendingBorderAnomaly !== label) {
                const primary = this._pendingBorderAnomaly, secondary = label;
                editor.saveState(primary);
                const side = getSideBetween(this.hexes, primary, secondary);
                if (side === undefined) {
                    hidePopup('borderAnomaliesErrorPopup');
                    showErrorPopup('Tiles are not neighbors!');
                    this.hexes[primary].polygon.classList.remove('selected');
                    this._pendingBorderAnomaly = null;
                    return;
                }
                if (!this.hexes[primary].borderAnomalies) this.hexes[primary].borderAnomalies = {};
                this.hexes[primary].borderAnomalies[side] = { type: "Gravity Wave" };
                this.hexes[primary].polygon.classList.remove('selected');
                this._pendingBorderAnomaly = null;
                drawBorderAnomaliesLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // Remove all border anomalies from a tile
        if (this.mode === 'border-anomaly-remove') {
            const hex = this.hexes[label];
            if (hex.borderAnomalies) {
                editor.saveState(label);
                for (const [side, anomaly] of Object.entries(hex.borderAnomalies)) {
                    if (anomaly.type === "Spatial Tear") {
                        const neighbor = getNeighborHex(this.hexes, label, side);
                        if (neighbor && neighbor.borderAnomalies) {
                            delete neighbor.borderAnomalies[getOppositeSide(side)];
                            if (Object.keys(neighbor.borderAnomalies).length === 0)
                                delete neighbor.borderAnomalies;
                        }
                    }
                }
                delete hex.borderAnomalies;
                drawBorderAnomaliesLayer(this);
                enforceSvgLayerOrder(editor.svg);
            }
            return;
        }

        // Fallback
        if (typeof oldClickHandler === "function") oldClickHandler.call(this, e, label);
    };

    function getSideBetween(hexes, a, b) {
        const dq = hexes[b].q - hexes[a].q;
        const dr = hexes[b].r - hexes[a].r;
        for (let i = 0; i < 6; ++i) {
            const dir = [
                { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
            ][i];
            if (dir.q === dq && dir.r === dr) return i;
        }
        return undefined;
    }
    function getNeighborHex(hexes, label, side) {
        const hex = hexes[label];
        if (!hex) return null;
        const { q, r } = hex;
        const dirs = [
            { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
            { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
        ];
        const nq = q + dirs[side].q, nr = r + dirs[side].r;
        for (const h of Object.values(hexes)) if (h.q === nq && h.r === nr) return h;
        return null;
    }
    function getOppositeSide(side) { return (parseInt(side, 10) + 3) % 6; }

    // Redraw after map (re)generation
    const oldGenerateMap = editor.generateMap;
    editor.generateMap = function () {
        oldGenerateMap.call(this);
        drawBorderAnomaliesLayer(this);
        let layer = this.svg.querySelector('#borderAnomalyLayer');
        if (layer) layer.setAttribute('visibility', this.showBorderAnomalies ? 'visible' : 'hidden');
        const btn = document.getElementById('toggleBorderAnomalies');
        if (btn) btn.classList.toggle('active', this.showBorderAnomalies);
    };

    editor.redrawBorderAnomaliesOverlay = () => {
        drawBorderAnomaliesLayer(editor);
        let layer = editor.svg.querySelector('#borderAnomalyLayer');
        if (layer) layer.setAttribute('visibility', editor.showBorderAnomalies ? 'visible' : 'hidden');
        const btn = document.getElementById('toggleBorderAnomalies');
        if (btn) btn.classList.toggle('active', editor.showBorderAnomalies);
    };
    
    // Expose popup function globally for sector controls
    window.showBorderAnomaliesPopup = showBorderAnomaliesPopup;
}
