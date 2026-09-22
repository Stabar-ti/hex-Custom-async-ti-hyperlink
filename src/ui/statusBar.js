// @ts-check
/**
 * The status line along the bottom of the shell.
 *
 * It answers the three questions the interface could not previously answer without
 * guessing: which tool is armed, which hex the pointer is over, and how far the map is
 * zoomed. All three were state you had to infer — from which button looked lit, from the
 * label under the cursor, and from how big the hexes had got.
 *
 * Nothing here polls. The mode is pushed by a wrapper around `editor.setMode`, the hex
 * comes from pointer movement over the map, and the zoom is read from the SVG's own
 * viewBox whenever it changes.
 */

/**
 * The viewBox width that counts as 100%.
 *
 * Not the 1400 in the markup: the editor autoscales the view to fit the grid as soon as it
 * has drawn one, so measuring against the authored value reported 140% on a map nobody had
 * zoomed. The baseline is captured once the fitted view exists, which makes 100% mean "the
 * whole map, as first shown" — the only reading a user can act on.
 */
let baseViewBoxWidth = 0;

/**
 * @param {string} id
 * @param {string} text
 */
function setField(id, text) {
    const host = document.getElementById(id);
    const slot = host?.querySelector('b');
    if (slot) slot.textContent = text;
}

/** Turn an internal mode string into something worth reading. */
function modeLabel(mode) {
    if (!mode || mode === 'none' || mode === '' || mode === 'select') return 'none';
    if (mode === 'token-selection') return 'token placement';
    // 'custom-adj-single' → 'custom adj single'
    return String(mode).replace(/[-_]/g, ' ');
}

/**
 * @param {SVGSVGElement} svg
 * @returns {number} the viewBox width, or 0 when it cannot be read
 */
function viewBoxWidth(svg) {
    const vb = svg.getAttribute('viewBox');
    if (!vb) return 0;
    const width = parseFloat(vb.trim().split(/[\s,]+/)[2]);
    return width && isFinite(width) ? width : 0;
}

/**
 * @param {SVGSVGElement} svg
 * @returns {number} percent, rounded
 */
function zoomPercent(svg) {
    const width = viewBoxWidth(svg);
    if (!width) return 100;
    // Self-heal: if the deferred capture has not run yet, the view we are looking at is
    // the best baseline available. Better a correct 100% now than a wrong number forever.
    if (!baseViewBoxWidth) baseViewBoxWidth = width;
    return Math.round((baseViewBoxWidth / width) * 100);
}

/**
 * Wire the status bar to an editor. Safe to call when the markup is absent — the bar is
 * part of the app shell, and nothing else should fail because it is missing.
 *
 * @param {any} editor
 */
export function installStatusBar(editor) {
    const bar = document.getElementById('statusBar');
    const svg = /** @type {SVGSVGElement|null} */ (/** @type {unknown} */ (editor?.svg));
    if (!bar || !svg) return;

    // ── Tool ──
    // setMode is the one funnel every paint/link/wormhole tool goes through, so wrapping
    // it once is enough; the alternative is polling, or touching every call site.
    setField('statusTool', modeLabel(editor.mode));
    if (typeof editor.setMode === 'function' && !editor._statusBarWrapped) {
        const original = editor.setMode.bind(editor);
        editor.setMode = (mode, ...rest) => {
            const result = original(mode, ...rest);
            setField('statusTool', modeLabel(editor.mode));
            return result;
        };
        editor._statusBarWrapped = true;
    }

    // Token placement bypasses setMode and assigns editor.mode directly, so catch the
    // pointer leaving the map as a cheap resync point rather than letting it go stale.
    svg.addEventListener('mouseleave', () => setField('statusTool', modeLabel(editor.mode)));

    // ── Hex ──
    svg.addEventListener('mousemove', (ev) => {
        const target = /** @type {Element|null} */ (ev.target);
        const hex = target?.closest?.('[data-label]');
        const label = hex?.getAttribute('data-label') || editor.hoveredHexLabel;
        setField('statusHex', label || '—');
    });
    svg.addEventListener('mouseleave', () => setField('statusHex', '—'));

    // ── Zoom ──
    const syncZoom = () => setField('statusZoom', zoomPercent(svg) + '%');

    // Take the baseline after the editor has drawn and autoscaled, not from the authored
    // viewBox — otherwise an untouched map opens reading 140%.
    //
    // A timer, not requestAnimationFrame: rAF does not run while the document is hidden,
    // so loading the app in a background tab left the baseline unset and every reading
    // pinned at 100% until the tab was focused. Timers fire either way (throttled, which
    // does not matter for a one-off capture). The draw and autoscale are synchronous, so
    // by the time this runs the fitted view exists.
    setTimeout(() => {
        baseViewBoxWidth = viewBoxWidth(svg) || 1400;
        syncZoom();
    }, 0);
    // Pan and zoom both rewrite the viewBox attribute, and so does generateMap. Watching
    // the attribute catches all of them without knowing which code did it.
    new MutationObserver(syncZoom).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
}
