// ui/HexHoverInfo2.js
// New approach: decoupled from overlays popup, robust to dynamic UI

/**
 * Attach tile hover info logic to the editor.
 * - Always attaches to the button in the overlays popup (if present).
 * - Reattaches handlers every time the overlays popup is opened.
 * - No global state, no recursion, no MutationObserver.
 * - Uses the same info formatting as the original.
 */
export function setupHexHoverInfo(editor) {
    // Called every time overlays popup is opened
    function bindHoverToggleButton() {
        const infoDiv = document.getElementById('hexHoverInfo');
        const overlaysPopup = document.getElementById('overlayOptionsPopup');
        if (!infoDiv || !overlaysPopup) return;

        const toggleBtn = overlaysPopup.querySelector('#toggleHoverInfoBtn');
        if (!toggleBtn) return;

        // Set initial state: default OFF
        let hoverInfoEnabled = editor.showHoverInfo === true; // Only true if explicitly set
        editor.showHoverInfo = hoverInfoEnabled; // Ensure editor property is set
        toggleBtn.classList.toggle('active', hoverInfoEnabled);

        // Remove previous event listeners (if any)
        toggleBtn.onclick = null;

        // Toggle logic
        toggleBtn.addEventListener('click', () => {
            hoverInfoEnabled = !hoverInfoEnabled;
            editor.showHoverInfo = hoverInfoEnabled;
            toggleBtn.classList.toggle('active', hoverInfoEnabled);
            if (!hoverInfoEnabled) infoDiv.style.display = 'none';
        });

        // Attach handlers to all hex polygons
        function attachHexHoverHandlers() {
            Object.values(editor.hexes).forEach(hex => {
                if (!hex.polygon) return;
                hex.polygon.onmouseenter = null;
                hex.polygon.onmousemove = null;
                hex.polygon.onmouseleave = null;
                hex.polygon.onmouseenter = (e) => {
                    if (!hoverInfoEnabled) return;
                    showHexHoverInfo(hex, e);
                };
                hex.polygon.onmousemove = (e) => {
                    if (!hoverInfoEnabled) return;
                    positionHoverInfo(e);
                };
                hex.polygon.onmouseleave = () => {
                    infoDiv.style.display = 'none';
                };
            });
        }

        function showHexHoverInfo(hex, evt) {
            infoDiv.innerHTML = formatHexInfo(hex);
            positionHoverInfo(evt);
            infoDiv.style.display = 'block';
        }
        function positionHoverInfo(evt) {
            const pad = 18;
            infoDiv.style.left = `${evt.clientX + pad}px`;
            infoDiv.style.top = `${evt.clientY + pad}px`;
        }
        function formatHexInfo(hex) {
            if (!hex) return "<i>No data</i>";
            const { realId, baseType, effects, wormholes, planets, matrix, customAdjacents, borderAnomalies, adjacencyOverrides } = hex;
            let html = `<b>Tile Info</b><hr>`;
            html += `<b>Real ID:</b> ${realId ?? '-'}<br>`;
            html += `<b>Base Type:</b> ${baseType ?? '-'}<br>`;
            html += `<b>Effects:</b> ${(effects && effects.size) ? Array.from(effects).join(', ') : '-'}<br>`;
            html += `<b>Wormholes:</b> ${(wormholes && wormholes.size) ? Array.from(wormholes).join(', ') : '-'}<br>`;
            if (customAdjacents && Object.keys(customAdjacents).length) {
                html += `<b>Custom Links:</b><ul>`;
                Object.entries(customAdjacents).forEach(([target, adj]) => {
                    html += `<li>${target} ${adj.twoWay ? '(2-way)' : '(1-way)'}</li>`;
                });
                html += `</ul>`;
            } else {
                html += `<b>Custom Links:</b> -<br>`;
            }
            if (adjacencyOverrides && Object.keys(adjacencyOverrides).length) {
                html += `<b>Adjacency Overrides:</b><ul>`;
                Object.entries(adjacencyOverrides).forEach(([side, target]) => {
                    html += `<li>Side ${side}: ${target}</li>`;
                });
                html += `</ul>`;
            } else {
                html += `<b>Adjacency Overrides:</b> -<br>`;
            }
            if (borderAnomalies && Object.keys(borderAnomalies).length) {
                html += `<b>Border Anomalies:</b><ul>`;
                Object.entries(borderAnomalies).forEach(([side, anomaly]) => {
                    html += `<li>Side ${side}: <b>${anomaly.type}</b></li>`;
                });
                html += `</ul>`;
            } else {
                html += `<b>Border Anomalies:</b> -<br>`;
            }
            if (planets && planets.length) {
                html += `<b>Planets:</b><ul>`;
                planets.forEach((p, i) => {
                    html += `<li><b>${p.name || 'Planet ' + (i + 1)}</b>: 
          <i>${p.planetType || (p.planetTypes ? p.planetTypes.join(', ') : '')}</i>, 
          <span>R/I ${p.resources}/${p.influence}</span>
          ${p.legendaryAbilityName ? `<span>, <b>Legendary:</b> ${p.legendaryAbilityName}</span>` : ''}
          ${p.techSpecialty || (p.techSpecialties?.length ? ', Tech: ' + p.techSpecialties.join(', ') : '')}
        </li>`;
                });
                html += `</ul>`;
            } else {
                html += `<b>Planets:</b> -<br>`;
            }
            if (matrix && matrix.length) {
                html += `<b>Hyperlane Matrix:</b><pre>${matrix.map(row => row.join(' ')).join('\n')}</pre>`;
            }
            return html;
        }

        // Attach handlers now and after every map redraw
        attachHexHoverHandlers();
        const origGenMap = editor.generateMap.bind(editor);
        editor.generateMap = function (...args) {
            origGenMap(...args);
            attachHexHoverHandlers();
        };
    }

    // Listen for overlays popup opening and rebind every time
    const observer = new MutationObserver(() => {
        const overlaysPopup = document.getElementById('overlayOptionsPopup');
        if (overlaysPopup && overlaysPopup.querySelector('#toggleHoverInfoBtn')) {
            bindHoverToggleButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // If overlays popup is already open, bind immediately
    if (document.getElementById('overlayOptionsPopup')?.querySelector('#toggleHoverInfoBtn')) {
        bindHoverToggleButton();
    }
}
