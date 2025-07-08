import { SVG_LAYER_ORDER } from '../constants/constants.js';

/**
 * Reorders SVG <g> layers in the given order. Layers missing are skipped.
 * @param {SVGSVGElement} svg
 */
export function enforceSvgLayerOrder(svg) {
    SVG_LAYER_ORDER.forEach(layerId => {
        const node = svg.querySelector(`#${layerId}`);
        if (node) {
            console.log(`[enforceSvgLayerOrder] Moving layer: #${layerId}`);
            svg.appendChild(node); // Moves to top, but since we go bottom-to-top, correct order is enforced
        } else {
            console.warn(`[enforceSvgLayerOrder] Layer missing: #${layerId}`);
        }
    });
    console.log('[enforceSvgLayerOrder] Done reordering layers.');
}