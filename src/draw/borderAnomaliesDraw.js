//import { getOppositeSide } from '../utils/matrix.js'

const SVG_NS = 'http://www.w3.org/2000/svg';



export function drawBorderAnomaliesLayer(editor) {
    let layer = editor.svg.querySelector('#borderAnomalyLayer');
    if (layer) layer.remove();
    layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'borderAnomalyLayer';
    editor.svg.appendChild(layer);

    const drawnEdges = new Set();
    const INSET = 2; // px to move inward from each edge endpoint (tweak to taste)
    //const center = hex.center;

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
        for (const [sideStr, anomaly] of Object.entries(hex.borderAnomalies)) {
            const side = parseInt(sideStr, 10);
            const neighbor = getNeighborHex(editor, label, side);

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

            if (anomaly.type === "Spatial Tear") {
                drawEdgeLine(layer, p1, p2, "#e32b2b", 3);
                if (neighbor) {
                    const oppSide = getOppositeSide(side);
                    const nVerts = getHexVertices(neighbor.center, editor.hexRadius);
                    const np1 = insetPoint(nVerts[oppSide], neighbor.center, INSET);
                    const np2 = insetPoint(nVerts[(oppSide + 1) % 6], neighbor.center, INSET);
                    drawEdgeLine(layer, np1, np2, "#e32b2b", 3);
                }
            } else if (anomaly.type === "Gravity Wave") {
                drawEdgeLine(layer, p1, p2, "#19c67f", 4);
                if (neighbor) {
                    const oppSide = getOppositeSide(side);
                    const nVerts = getHexVertices(neighbor.center, editor.hexRadius);
                    const np1 = insetPoint(nVerts[oppSide], neighbor.center, INSET);
                    const np2 = insetPoint(nVerts[(oppSide + 1) % 6], neighbor.center, INSET);
                    drawEdgeLine(layer, np1, np2, "#e32b2b", 3);
                }
            }
        }
    }
}

function drawEdgeLine(layer, p1, p2, color, width) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width);
    line.setAttribute('opacity', '0.93');
    line.setAttribute('stroke-linecap', 'square');
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
        if (h.q === nq && h.r === nr) return h;
    }
    return null;
}

function getOppositeSide(side) {
    return (parseInt(side, 10) + 3) % 6;
}

