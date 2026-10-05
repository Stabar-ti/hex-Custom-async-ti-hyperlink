// imageSystemsOverlay.js

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * Adds/removes the tile image overlay layer in the SVG map.
 * Call after map changes or when toggling showTileImages.
 *
 * Updated in place rather than rebuilt. It used to remove the layer and draw a new one, and
 * each image only went in once it had loaded — a frame or more later even from cache — so
 * every tile image on the map blinked out whenever any one tile changed. Now an image that
 * is still right stays where it is (moved, if the map was resized), and only the tiles that
 * changed gain or lose theirs.
 *
 * @param {HexEditor} editor
 */
export function updateTileImageLayer(editor) {
    let layer = editor.svg.querySelector('#tileImageLayer');

    // Only show if enabled
    if (!editor.showTileImages) {
        layer?.remove();
        return;
    }

    if (!layer) {
        layer = document.createElementNS(SVG_NS, 'g');
        layer.setAttribute('id', 'tileImageLayer');
        editor.svg.appendChild(layer);
    }

    /** @type {Map<string, Element>} existing images by hex label */
    const existing = new Map();
    for (const img of [...layer.children]) {
        const label = img.getAttribute('data-label');
        // One image per hex. A duplicate, or one from before images carried a label, goes.
        if (!label || existing.has(label)) img.remove();
        else existing.set(label, img);
    }

    const r = editor.hexRadius * 1.9;
    for (const hex of Object.values(editor.hexes)) {
        const href = tileImageHref(editor, hex);
        if (!href) continue;
        const x = hex.center.x - r / 2;
        const y = hex.center.y - r / 2;

        const img = existing.get(hex.label);
        if (img && img.getAttributeNS(XLINK_NS, 'href') === href) {
            existing.delete(hex.label);
            img.setAttribute('x', x);
            img.setAttribute('y', y);
            img.setAttribute('width', r);
            img.setAttribute('height', r);
            continue;
        }

        // A new or changed tile. The old image stays up until the new one has loaded, so a
        // swap goes straight from one picture to the other.
        const label = hex.label;
        const htmlImg = new window.Image();
        htmlImg.src = href;
        htmlImg.onload = () => {
            // The map may have moved on while this loaded: the overlay switched off, the svg
            // rebuilt, or this tile cleared or given another system.
            if (!layer.isConnected || tileImageHref(editor, editor.hexes[label]) !== href) return;
            const current = editor.hexes[label];
            const image = document.createElementNS(SVG_NS, 'image');
            image.setAttributeNS(XLINK_NS, 'href', href);
            image.setAttribute('data-label', label);
            image.setAttribute('x', current.center.x - r / 2);
            image.setAttribute('y', current.center.y - r / 2);
            image.setAttribute('width', r);
            image.setAttribute('height', r);
            image.setAttribute('opacity', 0.95);
            image.setAttribute('pointer-events', 'none');
            layer.querySelector(`image[data-label="${label}"]`)?.remove();
            layer.appendChild(image);
        };
        // Do nothing on error. A tile that changed to a system with no loadable image still
        // loses the old one.
        htmlImg.onerror = () => {
            if (!layer.isConnected || tileImageHref(editor, editor.hexes[label]) !== href) return;
            layer.querySelector(`image[data-label="${label}"]`)?.remove();
        };
        existing.delete(hex.label);
    }

    // Tiles that no longer have an image: cleared, or no longer on the map.
    for (const img of existing.values()) img.remove();
}

/**
 * The image a hex should show, or null.
 *
 * @param {HexEditor} editor
 * @param {any} hex
 * @returns {string|null}
 */
function tileImageHref(editor, hex) {
    if (!hex?.realId || !hex.center) return null;
    const sys = editor.sectorIDLookup?.[hex.realId.toString().toUpperCase()];
    if (!sys || !sys.imagePath) return null;
    return `public/data/tiles/${sys.imagePath}`;
}
