// /features/customLinksOverlay.js

export function showCustomLinksOverlay(editor) {
    const layer = editor.svg.querySelector('#customAdjacencyLayer');
    if (layer) layer.setAttribute('visibility', 'visible');
    editor.showCustomAdjacency = true;
}
export function hideCustomLinksOverlay(editor) {
    const layer = editor.svg.querySelector('#customAdjacencyLayer');
    if (layer) layer.setAttribute('visibility', 'hidden');
    editor.showCustomAdjacency = false;
}
export function toggleCustomLinksOverlay(editor) {
    const layer = editor.svg.querySelector('#customAdjacencyLayer');
    if (!layer) return;
    const now = layer.getAttribute('visibility') !== 'hidden';
    if (now) hideCustomLinksOverlay(editor);
    else showCustomLinksOverlay(editor);
}
