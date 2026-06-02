// ───────────────────────────────────────────────────────────────
// features/realIDsOverlays.js
//
// This module manages four SVG overlay layers for each hex tile:
//  1. Planet type icons (CULTURAL, INDUSTRIAL, etc. + tech specialties)
//  2. Resource/Influence text (e.g. 2/1, 1/2, etc.)
//  3. "Ideal R/I" (grouped resource/influence, e.g. 4/1+2)
//  4. RealID label (the "true" system ID from base game)
//
// It provides functions to (re)draw each layer, update layer
// visibility, and trigger full redraws when the map changes.
// ───────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Draws planet type icons (CULTURAL/INDUSTRIAL/HAZARDOUS) and tech specialties (Y/G/R/B)
 * as colored circles with a text label, one per planet, around the hex center.
 */
export function drawPlanetTypeLayer(editor) {
    let layer = editor.svg.querySelector('#planetTypeLayer');
    if (!layer) {
        layer = document.createElementNS(SVG_NS, 'g');
        layer.id = 'planetTypeLayer';
        editor.svg.appendChild(layer);
    }
    layer.innerHTML = '';

    const r = editor.hexRadius;
    for (const hex of Object.values(editor.hexes)) {
        if (!hex.planets) continue;
        // console.log('Drawing overlays, planet data:', hex.label, JSON.stringify(hex.planets));
        const { x: cx, y: cy } = hex.center;
        // Angles for planets (up, right, left)
        const angles = [-90, 0, 180];

        hex.planets.forEach((p, i) => {
            // Calculate position for each planet icon
            const θ = angles[i % 3] * Math.PI / 180;
            const x = cx + (r - 17) * Math.cos(θ);
            const y = cy + (r - 17) * Math.sin(θ);

            // Collect all planet types (support legacy single string and new array)
            const allTypes = [];
            if (typeof p.planetType === 'string' && p.planetType) {
                allTypes.push(p.planetType.toUpperCase());
            } else if (Array.isArray(p.planetTypes)) {
                p.planetTypes.forEach(t => { if (t) allTypes.push(t.toUpperCase()); });
            }

            const fillMap = { CULTURAL: 'blue', HAZARDOUS: 'red', INDUSTRIAL: 'green' };
            const getPlanetFill = t => fillMap[t] || 'gray';

            if (allTypes.length >= 2) {
                // Split circle: left half = first type, right half = second type
                const f0 = getPlanetFill(allTypes[0]);
                const f1 = getPlanetFill(allTypes[1]);
                // Left semicircle: arc counterclockwise from top to bottom
                const left = document.createElementNS(SVG_NS, 'path');
                left.setAttribute('d', `M ${x},${y - 10} A 10,10 0 0 0 ${x},${y + 10} Z`);
                left.setAttribute('fill', f0);
                left.setAttribute('stroke', 'none');
                layer.appendChild(left);
                // Right semicircle: arc clockwise from top to bottom
                const right = document.createElementNS(SVG_NS, 'path');
                right.setAttribute('d', `M ${x},${y - 10} A 10,10 0 0 1 ${x},${y + 10} Z`);
                right.setAttribute('fill', f1);
                right.setAttribute('stroke', 'none');
                layer.appendChild(right);
                // Outline ring
                const ring = document.createElementNS(SVG_NS, 'circle');
                ring.setAttribute('cx', x); ring.setAttribute('cy', y); ring.setAttribute('r', 10);
                ring.setAttribute('fill', 'none');
                ring.setAttribute('stroke', 'black'); ring.setAttribute('stroke-width', '1');
                layer.appendChild(ring);
            } else {
                // Single type — original circle
                const fill = getPlanetFill(allTypes[0]);
                const circ = document.createElementNS(SVG_NS, 'circle');
                circ.setAttribute('cx', x); circ.setAttribute('cy', y); circ.setAttribute('r', 10);
                circ.setAttribute('fill', fill);
                circ.setAttribute('stroke', 'black'); circ.setAttribute('stroke-width', '1');
                layer.appendChild(circ);
            }

            // Collect all tech specialties (allow duplicates for double-skip planets like Tiamat)
            const techMap = { CYBERNETIC: 'Y', BIOTIC: 'G', WARFARE: 'R', PROPULSION: 'B' };
            const allSpecialties = [];
            if (typeof p.techSpecialty === 'string' && p.techSpecialty) {
                allSpecialties.push(p.techSpecialty.toUpperCase());
            } else if (Array.isArray(p.techSpecialties)) {
                p.techSpecialties.forEach(s => { if (s) allSpecialties.push(s.toUpperCase()); });
            }
            const techStr = allSpecialties.map(s => techMap[s] || s.charAt(0)).join('');

            // Draw tech specialty letters (YY for double skip, GR for mixed, etc.)
            if (techStr) {
                const txt = document.createElementNS(SVG_NS, 'text');
                txt.setAttribute('x', x);
                txt.setAttribute('y', y + 4);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('font-size', techStr.length > 1 ? '7' : '10');
                txt.setAttribute('fill', (allTypes[0] === 'CULTURAL') ? 'white' : 'black');
                txt.setAttribute('stroke', 'none');
                txt.textContent = techStr;
                layer.appendChild(txt);
            }
        });
    }
}

/**
 * Draws a text overlay for each planet showing its resource/influence
 * value (e.g., "2/1"), arranged around the hex center.
 */
export function drawResourceInfluenceLayer(editor) {
    let layer = editor.svg.querySelector('#resInfLayer');
    if (!layer) {
        layer = document.createElementNS(SVG_NS, 'g');
        layer.id = 'resInfLayer';
        editor.svg.appendChild(layer);
    }
    layer.innerHTML = '';

    const r = editor.hexRadius;
    for (const hex of Object.values(editor.hexes)) {
        if (!hex.planets) continue;
        const { x: cx, y: cy } = hex.center;
        const angles = [-90, 0, 180];

        hex.planets.forEach((p, i) => {
            const θ = angles[i % 3] * Math.PI / 180;
            const x = cx + (r - 17) * Math.cos(θ);
            const y = cy + (r - 17) * Math.sin(θ) + 2; // Small Y offset for clarity

            const txt = document.createElementNS(SVG_NS, 'text');
            txt.setAttribute('x', x);
            txt.setAttribute('y', y);
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('font-size', '10');
            txt.setAttribute('fill', 'white');
            txt.textContent = `${p.resources}/${p.influence}`;
            layer.appendChild(txt);
        });
    }
}

/**
 * Draws the "ideal" Resource/Influence summary for each hex,
 * grouping matching planets (R=I) and showing a format like "4/2+1".
 */
export function drawIdealRILayer(editor) {
    let layer = editor.svg.querySelector('#idealRILayer');
    if (!layer) {
        layer = document.createElementNS(SVG_NS, 'g');
        layer.id = 'idealRILayer';
        editor.svg.appendChild(layer);
    }
    layer.innerHTML = '';

    const r = editor.hexRadius;
    for (const hex of Object.values(editor.hexes)) {
        if (!hex.planets || !hex.planets.length) continue;
        const { x: cx, y: cy } = hex.center;
        // Draw "ideal" value up above the hex
        const θ6 = 90 * Math.PI / 180;
        const x6 = cx + (r - 8) * Math.cos(θ6);
        const y6 = cy + (r - 8) * Math.sin(θ6);

        // Calculate ideal R/I groupings
        let a = 0, b = 0, c = 0;
        for (const p of hex.planets) {
            if (p.resources === p.influence) {
                c += p.resources;
            } else if (p.resources > p.influence) {
                a += p.resources;
            } else if (p.influence > p.resources) {
                b += p.influence;
            }
        }
        let ideal = `${a}/${b}`;
        if (c > 0) ideal += `+${c}`;

        // Draw text for the ideal R/I
        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', x6);
        txt.setAttribute('y', y6);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        txt.textContent = ideal;
        layer.appendChild(txt);
    }
}

/**
 * Draws the "real" ID label (the system's canonical tile ID)
 * for each hex that has one, placing it above the hex.
 */
export function drawRealIDLabelLayer(editor) {
    let layer = editor.svg.querySelector('#realIDLabelLayer');
    if (!layer) {
        layer = document.createElementNS(SVG_NS, 'g');
        layer.id = 'realIDLabelLayer';
        editor.svg.appendChild(layer);
    }
    layer.innerHTML = '';

    const r = editor.hexRadius;
    for (const hex of Object.values(editor.hexes)) {
        if (!hex.planets) continue;
        const { x: cx, y: cy } = hex.center;
        // Place above hex, a bit higher than other overlays
        const θ6 = 90 * Math.PI / 180;
        const x6 = cx + (r - 26) * Math.cos(θ6);
        const y6 = cy + (r - 26) * Math.sin(θ6);

        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', x6);
        txt.setAttribute('y', y6);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        if (hex.realId) txt.textContent = hex.realId;
        else continue; // Skip if no realId present
        layer.appendChild(txt);
    }
}

/**
 * Shows or hides a given SVG overlay layer.
 * @param {HexEditor} editor
 * @param {string} layerId
 * @param {boolean} visible
 */
export function updateLayerVisibility(editor, layerId, visible) {
    const layer = editor.svg.querySelector(`#${layerId}`);
    if (layer) layer.setAttribute('visibility', visible ? 'visible' : 'hidden');
}

/**
 * Convenience function: draws all four overlays and sets their default visibility.
 */
export function initRealIDFeatures(editor) {
    drawPlanetTypeLayer(editor);
    drawResourceInfluenceLayer(editor);
    drawIdealRILayer(editor);
    drawRealIDLabelLayer(editor);
    // Set up initial visibility flags (customize as needed)
    editor.showPlanetTypes = true;
    editor.showResInf = false;
    editor.showIdealRI = true;
    editor.showRealID = true;
    editor.showBorderAnomalies = true; // <-- Default to true
    editor.showCustomAdjacency = true; // <-- Default to true for custom links
}

/**
 * Triggers a redraw of all overlays, and updates layer visibility flags.
 * Call this whenever systems are assigned or overlays need to be refreshed.
 */
export function redrawAllRealIDOverlays(editor) {
    // Always remove any existing layers first!
    ["planetTypeLayer", "resInfLayer", "idealRILayer", "realIDLabelLayer"].forEach(id => {
        const old = editor.svg.querySelector(`#${id}`);
        if (old) old.remove();
    });

    console.log('redrawing ALL Overlays');
    drawPlanetTypeLayer(editor);
    drawResourceInfluenceLayer(editor);
    drawIdealRILayer(editor);
    drawRealIDLabelLayer(editor);

    updateLayerVisibility(editor, 'planetTypeLayer', editor.showPlanetTypes);
    updateLayerVisibility(editor, 'resInfLayer', editor.showResInf);
    updateLayerVisibility(editor, 'idealRILayer', editor.showIdealRI);
    updateLayerVisibility(editor, 'realIDLabelLayer', editor.showRealID);
}
