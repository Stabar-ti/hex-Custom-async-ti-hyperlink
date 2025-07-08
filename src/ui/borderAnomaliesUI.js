import { drawBorderAnomaliesLayer } from '../draw/borderAnomaliesDraw.js';
import { toggleBorderAnomaliesOverlay } from '../features/borderAnomaliesOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

export function installBorderAnomaliesUI(editor) {
    function addPopupLauncher() {
        const container = document.getElementById('sectorControlsContainer');
        if (!container) return;
        if (document.getElementById('borderAnomaliesPopupLauncher')) return;
        const launcher = document.createElement('button');
        launcher.id = 'borderAnomaliesPopupLauncher';
        launcher.className = 'mode-button';
        launcher.textContent = 'Border Anomalies...';
        launcher.style.marginTop = '24px';
        launcher.onclick = () => {
            document.getElementById('borderAnomaliesPopup').style.display = 'block';
        };
        container.appendChild(launcher);
    }

    function createPopup() {
        if (document.getElementById('borderAnomaliesPopup')) return;
        const popup = document.createElement('div');
        popup.id = 'borderAnomaliesPopup';
        popup.classList.add('border-anomalies-popup');
        popup.style.left = '520px';
        popup.style.top = '80px';
        popup.style.display = 'none';

        // Drag logic
        popup.onmousedown = function (e) {
            if (e.target !== popup) return;
            let shiftX = e.clientX - popup.getBoundingClientRect().left;
            let shiftY = e.clientY - popup.getBoundingClientRect().top;
            function move(e) {
                popup.style.left = e.pageX - shiftX + 'px';
                popup.style.top = e.pageY - shiftY + 'px';
            }
            document.onmousemove = move;
            document.onmouseup = () => {
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = "✕";
        closeBtn.classList.add('popup-close-btn');
        closeBtn.onclick = () => popup.style.display = 'none';
        popup.appendChild(closeBtn);

        // Help button (green)
        const helpBtn = document.createElement('button');
        helpBtn.textContent = "Help";
        helpBtn.classList.add('popup-help-btn');
        helpBtn.onclick = () => {
            alert(
                "Border Anomaly Tools:\n\n" +
                "1. Click a primary hex, then a neighbor to select the edge.\n" +
                "2. Choose type (Spatial Tear = double, Gravity Wave = single).\n" +
                "3. Remove: Click a hex to remove all its border anomalies."
            );
        };
        popup.appendChild(helpBtn);

        // Tool label
        const label = document.createElement('div');
        label.textContent = "Border Anomaly Tools:";
        label.classList.add('popup-tool-label');
        popup.appendChild(label);

        // Tool button generator
        function toolBtn(text, mode, title) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'mode-button border-anomaly-tool-btn'; // Add extra class!
            btn.title = title;
            btn.style.margin = '2px 4px 2px 0';
            btn.onclick = () => {
                // Only clear .active from tool buttons, not overlay toggle
                Array.from(popup.querySelectorAll('.border-anomaly-tool-btn')).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                editor.setMode(mode);
                // Clear UI state
                if (editor._pendingBorderAnomaly) {
                    editor.hexes[editor._pendingBorderAnomaly]?.polygon?.classList.remove('selected');
                }
                editor._pendingBorderAnomaly = null;
            };
            return btn;
        }
        popup.appendChild(toolBtn('Spatial Tear', 'border-anomaly-double', 'Double block (both ways)'));
        popup.appendChild(toolBtn('Gravity Wave', 'border-anomaly-single', 'One-way block'));
        popup.appendChild(toolBtn('Remove', 'border-anomaly-remove', 'Remove all anomalies from hex'));


        // Overlay toggle button (persistent)
        /*const overlayToggle = document.createElement('button');
        overlayToggle.textContent = "Toggle Overlay";
        overlayToggle.className = 'mode-button overlay-toggle-btn';
        overlayToggle.id = 'toggleBorderAnomalies'; // Important for bindUI!
        overlayToggle.style.marginTop = '14px';
        popup.appendChild(document.createElement('br'));
        popup.appendChild(overlayToggle);
        */

        document.body.appendChild(popup);


        // Set initial visibility on SVG layer directly if needed:
        if (typeof editor.showBorderAnomalies === 'undefined') {
            editor.showBorderAnomalies = true;
        }
        drawBorderAnomaliesLayer(editor);
        let layer = editor.svg.querySelector('#borderAnomalyLayer');
        if (layer) layer.setAttribute('visibility', editor.showBorderAnomalies ? 'visible' : 'hidden');

    }

    // DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            addPopupLauncher();
            createPopup();
        });
    } else {
        addPopupLauncher();
        createPopup();
    }

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
                    alert('Tiles are not neighbors!');
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
                    alert('Tiles are not neighbors!');
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
                editor.saveState(label); // <--- Add
                // Clean up any reciprocal double blockers
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
        // Respect visibility flag on redraw
        let layer = this.svg.querySelector('#borderAnomalyLayer');
        if (layer) layer.setAttribute('visibility', this.showBorderAnomalies ? 'visible' : 'hidden');
        // Also sync button
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
}
