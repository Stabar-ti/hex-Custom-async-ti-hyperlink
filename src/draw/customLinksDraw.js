const SVG_NS = 'http://www.w3.org/2000/svg';

function edgeCoord(center, angle, radius, shrink = 0) {
    return {
        x: center.x + (radius - shrink) * Math.cos(angle),
        y: center.y + (radius - shrink) * Math.sin(angle)
    };
}

export function drawCustomAdjacencyLayer(editor) {
    let layer = editor.svg.querySelector('#customAdjacencyLayer');
    if (layer) layer.remove();
    layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'customAdjacencyLayer';
    editor.svg.appendChild(layer);

    // --- GLOBAL DEBUG: SHOW ALL HEXES WITH customAdjacents ---
    console.log("DEBUG DRAW: HEXES WITH customAdjacents:");
    for (const label in editor.hexes) {
        if (editor.hexes[label].customAdjacents) {
            console.log(label, editor.hexes[label].customAdjacents);
        }
    }

    const drawnPairs = new Set();
    for (const [hexLabel, hex] of Object.entries(editor.hexes)) {
        if (!hex.customAdjacents) continue;

        for (const [other, info] of Object.entries(hex.customAdjacents)) {
            const h2 = editor.hexes[other];
            if (!h2 || !hex.center || !h2.center) continue;

            if (info.twoWay) {
                const pairKey = [hexLabel, other].sort().join('-');
                if (drawnPairs.has(pairKey)) {
                    console.log("SKIPPING duplicate double link", hexLabel, other, pairKey);
                    continue;
                }
                drawnPairs.add(pairKey);
                console.log("DRAWING double link", hexLabel, other, pairKey);

                // Draw just one line
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', hex.center.x);
                line.setAttribute('y1', hex.center.y);
                line.setAttribute('x2', h2.center.x);
                line.setAttribute('y2', h2.center.y);
                line.setAttribute('stroke', "#00f");
                line.setAttribute('stroke-width', '3.5');
                line.setAttribute('stroke-dasharray', '6,7');
                line.setAttribute('opacity', '0.65');
                layer.appendChild(line);
            } else {
                // SINGLE: draw only if NOT stored in the other direction (prevents two lines)
                if (h2.customAdjacents && h2.customAdjacents[hex.label] && !h2.customAdjacents[hex.label].twoWay) continue;

                console.log("DRAW SINGLE LINK", hex.label, h2.label);
                // Draw line from hex to h2
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', hex.center.x);
                line.setAttribute('y1', hex.center.y);
                line.setAttribute('x2', h2.center.x);
                line.setAttribute('y2', h2.center.y);
                line.setAttribute('stroke', "#c4b800");
                line.setAttribute('stroke-width', '3.5');
                line.setAttribute('stroke-dasharray', '2,9');
                line.setAttribute('opacity', '0.88');
                layer.appendChild(line);

                drawArrowhead(layer, hex.center, h2.center, "#c4b800");
            }
        }
    }



    // --- OVERRIDE LABELS (as in previous answer) ---
    for (const hex of Object.values(editor.hexes)) {
        if (!hex.adjacencyOverrides) continue;
        for (const [side, neighbor] of Object.entries(hex.adjacencyOverrides)) {
            const h2 = editor.hexes[neighbor];
            if (!h2 || !hex.center || !h2.center) continue;
            const angle = ((side - 1) * 60 - 30) * Math.PI / 180;
            const r = editor.hexRadius;
            const labelCenter = {
                x: hex.center.x + r * Math.cos(angle),
                y: hex.center.y + r * Math.sin(angle)
            };

            // Draw a line from center to label
            const l = document.createElementNS(SVG_NS, 'line');
            l.setAttribute('x1', hex.center.x);
            l.setAttribute('y1', hex.center.y);
            l.setAttribute('x2', labelCenter.x);
            l.setAttribute('y2', labelCenter.y);
            l.setAttribute('stroke', '#00f');
            l.setAttribute('stroke-width', '3');
            l.setAttribute('opacity', '0.8');
            l.setAttribute('pointer-events', 'none');
            layer.appendChild(l);

            drawEdgeLabel(layer, labelCenter, neighbor, "#e049c9");
        }
    }
}

function drawEdgeLabel(layer, pt, label, color = "#00f") {
    const boxWidth = 20, boxHeight = 13;
    // Center box at pt.x, pt.y
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', pt.x - boxWidth / 2);
    rect.setAttribute('y', pt.y - boxHeight / 2);
    rect.setAttribute('width', boxWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('fill', '#101010');
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('rx', '3');
    rect.setAttribute('opacity', '0.97');
    layer.appendChild(rect);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', pt.x);
    text.setAttribute('y', pt.y + 4); // better centering for smaller box
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-family', 'monospace');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = label;
    layer.appendChild(text);
}


function drawArrowhead(layer, from, to, color) {
    // Arrowhead at 'from' pointing toward 'to'
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const ax = to.x - 18 * Math.cos(angle); // Arrow at the target end
    const ay = to.y - 18 * Math.sin(angle);
    const size = 11;
    const points = [
        [ax, ay],
        [ax - size * Math.cos(angle - 0.36), ay - size * Math.sin(angle - 0.36)],
        [ax - size * Math.cos(angle + 0.36), ay - size * Math.sin(angle + 0.36)]
    ].map(([x, y]) => `${x},${y}`).join(' ');
    const arrow = document.createElementNS(SVG_NS, 'polygon');
    arrow.setAttribute('points', points);
    arrow.setAttribute('fill', color);
    arrow.setAttribute('stroke', color);
    arrow.setAttribute('stroke-width', '1.7');
    arrow.setAttribute('opacity', '0.92');
    layer.appendChild(arrow);
}