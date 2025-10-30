import { getBorderAnomalyTypes } from '../constants/borderAnomalies.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function drawBorderAnomaliesLayer(editor) {
    let layer = editor.svg.querySelector('#borderAnomalyLayer');
    if (layer) layer.remove();
    layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'borderAnomalyLayer';
    layer.setAttribute('visibility', 'visible'); // Explicitly set visibility
    editor.svg.appendChild(layer);

    const drawnEdges = new Set();
    const INSET = 2; // px to move inward from each edge endpoint (tweak to taste)
    //const center = hex.center;

    console.log('drawBorderAnomaliesLayer called');
    console.log('Available hexes:', Object.keys(editor.hexes).length);

    let totalAnomalies = 0;
    for (const hex of Object.values(editor.hexes)) {
        if (hex.borderAnomalies) {
            totalAnomalies += Object.keys(hex.borderAnomalies).length;
        }
    }
    console.log('Total border anomalies found:', totalAnomalies);

    function insetPoint(pt, center, inset) {
        const dx = center.x - pt.x;
        const dy = center.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return {
            x: pt.x + dx / len * inset,
            y: pt.y + dy / len * inset
        };
    }

    for (const [label, hex] of Object.entries(editor.hexes)) {
        if (!hex.borderAnomalies) continue;

        console.log(`Processing hex ${label} with border anomalies:`, hex.borderAnomalies);

        for (const [sideStr, anomaly] of Object.entries(hex.borderAnomalies)) {
            const side = parseInt(sideStr, 10);
            const neighbor = getNeighborHex(editor, label, side);

            console.log(`Processing anomaly: ${anomaly.type} on side ${side} of hex ${label}`);

            // Only draw this edge once (see previous answer for edgeKey logic)
            let edgeKey = label < (neighbor?.label ?? "") ?
                `${label}-${side}-${neighbor?.label}` :
                `${neighbor?.label}-${getOppositeSide(side)}-${label}`;
            if (drawnEdges.has(edgeKey)) continue;
            drawnEdges.add(edgeKey);

            // Get the hex vertices
            const verts = getHexVertices(hex.center, editor.hexRadius);
            const p1 = insetPoint(verts[side], hex.center, INSET);
            const p2 = insetPoint(verts[(side + 1) % 6], hex.center, INSET);

            // Get anomaly type configuration
            const borderTypes = getBorderAnomalyTypes();

            // Since anomaly.type is now always the ID (e.g., "ASTEROID"), try direct match first
            let anomalyTypeId = anomaly.type.toUpperCase();
            let anomalyConfig = borderTypes[anomalyTypeId];

            // Fallback: try with spaces removed (for backward compatibility with old data)
            if (!anomalyConfig) {
                anomalyTypeId = anomaly.type.toUpperCase().replace(/\s+/g, '');
                anomalyConfig = borderTypes[anomalyTypeId];
            }

            // Fallback: try without the word "FIELD" suffix
            if (!anomalyConfig && anomalyTypeId.endsWith('FIELD')) {
                const withoutField = anomalyTypeId.replace(/FIELD$/, '');
                anomalyConfig = borderTypes[withoutField];
                if (anomalyConfig) {
                    anomalyTypeId = withoutField;
                }
            }

            console.log(`Looking for anomaly config for '${anomalyTypeId}' (original: '${anomaly.type}'):`, anomalyConfig);
            console.log('Available border types:', Object.keys(borderTypes));
            console.log('Anomaly config enabled?', anomalyConfig?.enabled);

            if (anomalyConfig && anomalyConfig.enabled) {
                const style = anomalyConfig.drawStyle;
                console.log(`Drawing ${anomalyTypeId} with style:`, style);
                console.log(`Drawing edge from (${p1.x}, ${p1.y}) to (${p2.x}, ${p2.y})`);

                // Draw primary edge
                drawStyledEdgeLine(layer, p1, p2, style);
                console.log(`Drew styled edge line for ${anomalyTypeId}`);

                // Draw on neighbor side if bidirectional
                if (anomalyConfig.bidirectional && neighbor) {
                    const oppSide = getOppositeSide(side);
                    const nVerts = getHexVertices(neighbor.center, editor.hexRadius);
                    const np1 = insetPoint(nVerts[oppSide], neighbor.center, INSET);
                    const np2 = insetPoint(nVerts[(oppSide + 1) % 6], neighbor.center, INSET);
                    drawStyledEdgeLine(layer, np1, np2, style);
                }
            }
        }
    }
}

function drawStyledEdgeLine(layer, p1, p2, style) {
    console.log(`drawStyledEdgeLine called with:`, { p1, p2, style });
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', style.color);
    line.setAttribute('stroke-width', style.width);
    line.setAttribute('opacity', '0.93');
    line.setAttribute('stroke-linecap', 'square');

    // Apply pattern styles
    if (style.pattern === 'dashed') {
        line.setAttribute('stroke-dasharray', '5,5');
    } else if (style.pattern === 'dotted') {
        line.setAttribute('stroke-dasharray', '2,3');
    }

    layer.appendChild(line);
    console.log(`Added line element to layer:`, line);
    console.log(`Line attributes:`, {
        x1: line.getAttribute('x1'),
        y1: line.getAttribute('y1'),
        x2: line.getAttribute('x2'),
        y2: line.getAttribute('y2'),
        stroke: line.getAttribute('stroke'),
        'stroke-width': line.getAttribute('stroke-width')
    });
}

// Backward compatibility function
function drawEdgeLine(layer, p1, p2, color, width) {
    drawStyledEdgeLine(layer, p1, p2, { color, width, pattern: 'solid' });
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
        if (h.q === nq && h.r === nr) return h;
    }
    return null;
}

function getOppositeSide(side) {
    return (parseInt(side, 10) + 3) % 6;
}

