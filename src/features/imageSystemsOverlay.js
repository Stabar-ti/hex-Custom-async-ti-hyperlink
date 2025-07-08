// imageSystemsOverlay.js

/**
 * Adds/removes the tile image overlay layer in the SVG map.
 * Call after map changes or when toggling showTileImages.
 * 
 * @param {HexEditor} editor
 */
export function updateTileImageLayer(editor) {
    // Remove old layer if present
    let layer = editor.svg.querySelector('#tileImageLayer');
    if (layer) editor.svg.removeChild(layer);

    // Only show if enabled
    if (!editor.showTileImages) return;

    // Create new SVG group for images
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('id', 'tileImageLayer');

    for (const hex of Object.values(editor.hexes)) {
        if (!hex.realId) continue;
        const sys = editor.sectorIDLookup?.[hex.realId.toString().toUpperCase()];
        if (!sys || !sys.imagePath) continue;
        if (!hex.center) continue;
        const imgHref = `public/data/tiles/${sys.imagePath}`;

        const r = editor.hexRadius * 1.9; // Or tweak as needed
        const x = hex.center.x - r / 2;
        const y = hex.center.y - r / 2;

        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imgHref);
        image.setAttribute('x', x);
        image.setAttribute('y', y);
        image.setAttribute('width', r);
        image.setAttribute('height', r);
        image.setAttribute('opacity', 0.95); // Or tweak
        image.setAttribute('pointer-events', 'none'); // Does not block map clicks
        layer.appendChild(image);
    }

    editor.svg.appendChild(layer);
}