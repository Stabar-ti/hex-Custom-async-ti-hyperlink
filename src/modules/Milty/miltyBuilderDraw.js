// src/modules/Milty/miltyBuilderDraw.js
// Drawing and visual overlay functions for Milty Slice Designer

// Draws red number overlays (1-12) in specified sectors
export function drawSlicePositionOverlays(editor, show = true) {
    if (!editor || !editor.hexes || !editor.svg) {
        console.log('drawSlicePositionOverlays: editor, hexes, or svg not available');
        return;
    }
    
    // Remove old overlays if any
    const oldLayer = editor.svg.querySelector('#sliceNumbersOverlayLayer');
    if (oldLayer) oldLayer.remove();
    
    // If show is false, just remove and return
    if (!show) {
        console.log('Slice position overlays hidden');
        return;
    }
    
    console.log('Drawing slice position overlays...');
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
export function drawSliceBordersOverlay(editor, show = true) {
    if (!editor || !editor.hexes || !editor.svg) {
        console.log('drawSliceBordersOverlay: editor, hexes, or svg not available');
        return;
    }

    // Remove old borders if any
    const oldLayer = editor.svg.querySelector('#sliceBordersOverlayLayer');
    if (oldLayer) oldLayer.remove();
    
    // If show is false, just remove and return
    if (!show) {
        console.log('Slice borders overlay hidden');
        return;
    }

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

// Helper functions for drawing
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

// Highlight hexes for a slice on the map
export function highlightSliceOnMap(hexIds) {
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
export function clearSliceHighlights() {
    document.querySelectorAll('.milty-slice-highlight').forEach(el => {
        el.classList.remove('milty-slice-highlight');
    });
}

// Add CSS for highlight if not present
export function ensureHighlightStyles() {
    if (!document.getElementById('miltySliceHighlightStyle')) {
        const style = document.createElement('style');
        style.id = 'miltySliceHighlightStyle';
        style.textContent = `.milty-slice-highlight { outline: 3px solid red !important; z-index: 10002 !important; }`;
        document.head.appendChild(style);
    }
}
