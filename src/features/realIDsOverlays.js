// features/realIDsOverlays.js
// Draws four independent overlay layers: planet types, resource/influence, ideal R/I, and RealID labels

const SVG_NS = 'http://www.w3.org/2000/svg';

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
        const { x: cx, y: cy } = hex.center;
        const angles = [-90, 0, 180];

        hex.planets.forEach((p, i) => {
            const θ = angles[i % 3] * Math.PI / 180;
            const x = cx + (r - 17) * Math.cos(θ);
            const y = cy + (r - 17) * Math.sin(θ);

            // Support both 'planetType' (string) and 'planetTypes' (array)
            let type;
            if (typeof p.planetType === "string" && p.planetType) {
                type = p.planetType;
            } else if (Array.isArray(p.planetTypes) && p.planetTypes.length > 0) {
                type = p.planetTypes[0];
            } else {
                type = undefined;
            }

            // (Optional: debugging)
            //console.log('Chosen type:', type);

            const fillMap = {
                CULTURAL: 'blue',
                HAZARDOUS: 'red',
                INDUSTRIAL: 'green'
            };
            // If your data might be lowercase:
            const fill = fillMap[type && type.toUpperCase()] || 'gray';

            const circ = document.createElementNS(SVG_NS, 'circle');
            circ.setAttribute('cx', x);
            circ.setAttribute('cy', y);
            circ.setAttribute('r', 10);
            circ.setAttribute('fill', fill);
            circ.setAttribute('stroke', 'black');
            circ.setAttribute('stroke-width', '1');
            layer.appendChild(circ);

            // ... inside your hex.planets.forEach:
            const techMap = { CYBERNETIC: 'Y', BIOTIC: 'G', WARFARE: 'R', PROPULSION: 'B' };

            // Support both 'techSpecialty' and 'techSpecialties'
            let specialty;
            if (typeof p.techSpecialty === "string" && p.techSpecialty) {
                specialty = p.techSpecialty;
            } else if (Array.isArray(p.techSpecialties) && p.techSpecialties.length > 0) {
                specialty = p.techSpecialties[0];
            }

            const letter = techMap[specialty] || (specialty ? 'S' : '');

            if (letter) {
                const txt = document.createElementNS(SVG_NS, 'text');
                txt.setAttribute('x', x);
                txt.setAttribute('y', y + 4);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('font-size', '10');
                if (fill === 'blue') {
                    txt.setAttribute('fill', 'white');
                }
                txt.textContent = letter;
                layer.appendChild(txt);
            }
        });
    }
}

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
            const y = cy + (r - 17) * Math.sin(θ) + 2;

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
        const θ6 = 90 * Math.PI / 180;
        const x6 = cx + (r - 8) * Math.cos(θ6);
        const y6 = cy + (r - 8) * Math.sin(θ6);

        let a = 0, b = 0, c = 0;
        for (const p of hex.planets) {
            if (p.resources === p.influence) {
                c += p.resources;
            } else if (p.resources > p.influence) {
                a += p.resources;
                // b += 0; // not needed, just for clarity
            } else if (p.influence > p.resources) {
                b += p.influence;
                // a += 0;
            }
        }
        let ideal = `${a}/${b}`;
        if (c > 0) ideal += `+${c}`;

        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', x6);
        txt.setAttribute('y', y6);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        txt.textContent = ideal;
        layer.appendChild(txt);
    }
}


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
        const θ6 = 90 * Math.PI / 180;
        const x6 = cx + (r - 26) * Math.cos(θ6);
        const y6 = cy + (r - 26) * Math.sin(θ6);

        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', x6);
        txt.setAttribute('y', y6);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '10');
        if (hex.realId) txt.textContent = hex.realId;
        else continue; // skip drawing if no realId
        layer.appendChild(txt);
    }
}

export function updateLayerVisibility(editor, layerId, visible) {
  //  console.log(`updateLayerVisibility(${layerId}, ${visible})`);
    const layer = editor.svg.querySelector(`#${layerId}`);
 //   console.log('  found layer?', layer);
    if (layer) layer.setAttribute('visibility', visible ? 'visible' : 'hidden');
}

// Convenience: initial draw of all four
export function initRealIDFeatures(editor) {
    drawPlanetTypeLayer(editor);
    drawResourceInfluenceLayer(editor);
    drawIdealRILayer(editor);
    drawRealIDLabelLayer(editor);
    // default visibility
    editor.showPlanetTypes = true;
    editor.showResInf = false;
    editor.showIdealRI = true;
    editor.showRealID = true;
}


export function redrawAllRealIDOverlays(editor) {
    console.log('redrawing ALL Overlays')
    drawPlanetTypeLayer(editor);
    drawResourceInfluenceLayer(editor);
    drawIdealRILayer(editor);
    drawRealIDLabelLayer(editor);

    updateLayerVisibility(editor, 'planetTypeLayer', editor.showPlanetTypes);
    updateLayerVisibility(editor, 'resInfLayer', editor.showResInf);
    updateLayerVisibility(editor, 'idealRILayer', editor.showIdealRI);
    updateLayerVisibility(editor, 'realIDLabelLayer', editor.showRealID);
}