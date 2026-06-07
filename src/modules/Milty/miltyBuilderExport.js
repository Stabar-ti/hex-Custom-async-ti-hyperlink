// src/modules/Milty/miltyBuilderExport.js
// Per-slice PNG export for the Milty Slice Designer

import { showPopup } from '../../ui/popupUI.js';
import { slotPositions, analyzeSliceOccupancy } from './miltyBuilderCore.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Layers always stripped from exports — purely UI chrome
const ALWAYS_REMOVE = [
    'sliceNumbersOverlayLayer', // always stripped — label is synthesised per-slot instead
    'sliceBordersOverlayLayer',
    'valueOverlayLayer',
    'valueTargetLayer',
    'lore-overlay',
    'calcSliceResults',
    'customAdjacencyLayer',
    'borderAnomalyLayer',
    'spinToWinOverlay',
    'spinToWinSimOverlay',
    'resInfLayer',
    'idealRILayer',
    'planetTypeLayer',
];

// ── Core export function ──────────────────────────────────────────────────────

async function exportSliceAsPng(slotNum, options) {
    const {
        showHomeOverlay = true,
        showMiltyScore = false,
        showTileImages = true,
        fullHexCoverage = false,
        showSystemIds = false,
        showWormholes = false,
        showSliceNumbers = true,
        sliceTitle    = '',
        titlePosition = 'bottom',
        fontFamily    = 'Arial, Helvetica, sans-serif',
        exportWidth   = 1000,
    } = options;

    const editor = window.editor;
    if (!editor?.svg) throw new Error('Editor not available');

    const hexIds = slotPositions[slotNum];
    if (!hexIds?.length) throw new Error(`No hex positions for slot ${slotNum}`);

    const R = editor.hexRadius || 40;

    // ── 1. Bounding box from hex centres ─────────────────────────────────────
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const rawId of hexIds) {
        const hex = editor.hexes[String(rawId)];
        if (!hex?.center) continue;
        const { x, y } = hex.center;
        minX = Math.min(minX, x - R * 1.2);
        maxX = Math.max(maxX, x + R * 1.2);
        minY = Math.min(minY, y - R * 1.2);
        maxY = Math.max(maxY, y + R * 1.2);
    }
    if (minX === Infinity) throw new Error(`No renderable hexes for slot ${slotNum}`);

    const pad = R * 0.15;
    const titlePad = sliceTitle ? R * 0.9 : 0;
    const vx = minX - pad;
    const vy = minY - pad - (titlePosition === 'top' ? titlePad : 0);
    const vw = maxX - minX + pad * 2;
    const vh = maxY - minY + pad * 2 + titlePad;
    // Hex cluster bounds within the viewBox — used to anchor elements that must
    // stay fixed relative to the hexes regardless of title padding.
    const hexVy = titlePosition === 'top' ? vy + titlePad : vy;
    const hexVh = maxY - minY + pad * 2;
    const height = Math.round(exportWidth * vh / vw);

    // ── 2. Clone and configure the SVG ───────────────────────────────────────
    const clone = editor.svg.cloneNode(true);

    // Override any inline dimensions/positioning from the live editor
    clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    clone.setAttribute('width', String(exportWidth));
    clone.setAttribute('height', String(height));
    clone.removeAttribute('style');

    // Dark background rect behind everything
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', vx); bgRect.setAttribute('y', vy);
    bgRect.setAttribute('width', vw); bgRect.setAttribute('height', vh);
    bgRect.setAttribute('fill', '#1a1a2e');
    clone.insertBefore(bgRect, clone.firstChild);

    // ── 3. Strip UI layers ────────────────────────────────────────────────────
    ALWAYS_REMOVE.forEach(id => clone.querySelector(`#${id}`)?.remove());

    if (!showTileImages) {
        clone.querySelector('#tileImageLayer')?.remove();
    } else if (fullHexCoverage) {
        // Scale each tile image up so it fills the full hex bounding box (2R wide).
        // The live layer renders at 1.9R; 2.0R covers the hex with a small bleed
        // that the per-slice clip path will trim cleanly at the hex edges.
        const newSize = R * 2.0;
        clone.querySelectorAll('#tileImageLayer image').forEach(img => {
            const x = parseFloat(img.getAttribute('x') || 0);
            const y = parseFloat(img.getAttribute('y') || 0);
            const w = parseFloat(img.getAttribute('width') || R * 1.9);
            const h = parseFloat(img.getAttribute('height') || R * 1.9);
            const cx = x + w / 2;
            const cy = y + h / 2;
            img.setAttribute('x', cx - newSize / 2);
            img.setAttribute('y', cy - newSize / 2);
            img.setAttribute('width', newSize);
            img.setAttribute('height', newSize);
        });
    }
    if (!showSystemIds) clone.querySelector('#realIDLabelLayer')?.remove();
    if (!showWormholes) clone.querySelector('#wormholeIconLayer')?.remove();
    if (!showHomeOverlay) {
        clone.querySelector('#miltyHomeOverlayLayer')?.remove();
    } else if (!showMiltyScore) {
        clone.querySelectorAll('.milty-score-badge').forEach(el => el.remove());
    }

    // Always strip the original numbers layer — it places labels at positions shared
    // across slots, causing leakage when neighbouring slots' labels fall inside the viewBox.
    clone.querySelector('#sliceNumbersOverlayLayer')?.remove();

    // ── 4. Hex clip path — clips all content to the exact shapes of the 6 hexes ──
    let clipGroup; // declared here so we can append the synthesised label below
    {
        let defs = clone.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            clone.appendChild(defs);
        }

        const clipPath = document.createElementNS(SVG_NS, 'clipPath');
        clipPath.setAttribute('id', 'export-slice-clip');
        for (const rawId of hexIds) {
            const hex = editor.hexes[String(rawId)];
            if (!hex?.center) continue;
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const a = Math.PI / 180 * (60 * i - 120);
                pts.push(`${(hex.center.x + (R + 1) * Math.cos(a)).toFixed(2)},` +
                    `${(hex.center.y + (R + 1) * Math.sin(a)).toFixed(2)}`);
            }
            const poly = document.createElementNS(SVG_NS, 'polygon');
            poly.setAttribute('points', pts.join(' '));
            clipPath.appendChild(poly);
        }
        defs.appendChild(clipPath);

        clipGroup = document.createElementNS(SVG_NS, 'g');
        clipGroup.setAttribute('clip-path', 'url(#export-slice-clip)');
        Array.from(clone.childNodes)
            .filter(n => n.nodeType === 1 && n !== bgRect && n.tagName?.toLowerCase() !== 'defs')
            .forEach(n => clipGroup.appendChild(n));
        clone.appendChild(clipGroup);
    }

    // ── 5. Synthesised slot label — floats in the padding area above the slice ──
    // Appended to the SVG root (NOT inside clipGroup) so it is never clipped.
    // Only this slot's number is drawn — zero leakage risk.
    if (showSliceNumbers) {
        const S = R / 40;
        // Top-right gap: ~77% across, ~36% into the hex cluster — anchored to the
        // hex area so title padding doesn't shift the badge.
        const labelX = vx + vw * 0.77;
        const labelY = hexVy + hexVh * 0.36;
        const bw = 24 * S, bh = 14 * S, br = 4 * S;

        const badge = document.createElementNS(SVG_NS, 'g');

        const bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('x', labelX - bw / 2);
        bg.setAttribute('y', labelY - bh / 2);
        bg.setAttribute('width', bw);
        bg.setAttribute('height', bh);
        bg.setAttribute('rx', br);
        bg.setAttribute('fill', 'rgba(210,40,40,0.92)');
        bg.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        bg.setAttribute('stroke-width', 0.7 * S);
        badge.appendChild(bg);

        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', labelX);
        txt.setAttribute('y', labelY + bh * 0.23);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', 10 * S);
        txt.setAttribute('font-weight', 'bold');
        txt.setAttribute('fill', '#ffffff');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.4)');
        txt.setAttribute('stroke-width', 0.6 * S);
        txt.setAttribute('paint-order', 'stroke fill');
        txt.textContent = String(slotNum);
        badge.appendChild(txt);

        clone.appendChild(badge); // root level — always on top, never clipped
    }

    // ── 6. Slice title — centred in the dedicated title padding band ──────────
    if (sliceTitle) {
        const titleX = vx + vw / 2;
        const titleY = titlePosition === 'bottom'
            ? hexVy + hexVh + titlePad * 0.45  // just below the hex cluster
            : hexVy - titlePad * 0.35;          // just above the hex cluster

        const titleEl = document.createElementNS(SVG_NS, 'text');
        titleEl.setAttribute('x', titleX);
        titleEl.setAttribute('y', titleY);
        titleEl.setAttribute('text-anchor', 'middle');
        titleEl.setAttribute('font-size', R * 0.4);
        titleEl.setAttribute('font-weight', 'bold');
        titleEl.setAttribute('fill', '#ffffff');
        titleEl.setAttribute('stroke', 'rgba(0,0,0,0.65)');
        titleEl.setAttribute('stroke-width', R * 0.05);
        titleEl.setAttribute('paint-order', 'stroke fill');
        titleEl.textContent = sliceTitle;
        clone.appendChild(titleEl); // root level, outside clip
    }

    // ── 7. Apply chosen font via <style> element ─────────────────────────────────
    // Using a <style> tag avoids XML-escaping single quotes in font names (e.g.
    // 'Comic Sans MS') — XMLSerializer would turn them into &apos; which breaks
    // font resolution in some SVG-to-canvas renderers.
    {
        let defs = clone.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            clone.insertBefore(defs, clone.firstChild);
        }
        const styleEl = document.createElementNS(SVG_NS, 'style');
        styleEl.textContent = `text { font-family: ${fontFamily} !important; }`;
        defs.appendChild(styleEl);
    }

    // ── 8. Inline tile images as base64 so they survive the SVG sandbox ─────────
    // When SVG is loaded via <img>, the browser blocks external resource loads.
    // Pre-fetching and embedding as data: URLs is the only way to include them.
    if (showTileImages) {
        await embedExternalImages(clone);
    }

    // ── 5. Serialize SVG → data: URL (blob: URLs blocked by CSP img-src) ──────
    const svgStr = new XMLSerializer().serializeToString(clone);
    // TextEncoder handles full Unicode correctly; btoa requires a binary string
    const bytes = new TextEncoder().encode(svgStr);
    const base64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    const svgDataUrl = 'data:image/svg+xml;base64,' + base64;

    // ── 6. Render to canvas → PNG download ───────────────────────────────────
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = exportWidth;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, exportWidth, height);
                ctx.drawImage(img, 0, 0, exportWidth, height);

                canvas.toBlob(blob => {
                    if (!blob) { reject(new Error('Canvas produced no blob')); return; }
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `milty_slot_${slotNum}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
                    resolve();
                }, 'image/png');
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => reject(new Error(`Failed to load SVG for slot ${slotNum}`));

        img.src = svgDataUrl;
    });
}

// ── Image inlining ────────────────────────────────────────────────────────────

/**
 * Fetches every <image> element's href and replaces it with a base64 data URL.
 * This is required because SVG loaded via <img> cannot fetch external resources.
 */
async function embedExternalImages(svgEl) {
    const imageEls = Array.from(svgEl.querySelectorAll('image'));
    if (!imageEls.length) return;

    const cache = new Map(); // avoid re-fetching the same URL

    await Promise.allSettled(imageEls.map(async el => {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        if (!href || href.startsWith('data:')) return; // already inlined

        // Resolve relative URLs against the current page origin
        const resolved = new URL(href, window.location.href).href;

        try {
            let dataUrl = cache.get(resolved);
            if (!dataUrl) {
                const resp = await fetch(resolved, { credentials: 'same-origin' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const blob = await resp.blob();
                dataUrl = await blobToDataUrl(blob);
                cache.set(resolved, dataUrl);
            }
            el.setAttribute('href', dataUrl);
            el.removeAttribute('xlink:href');
        } catch (e) {
            // Non-fatal: image stays blank rather than breaking the whole export
            console.warn(`[Export] Could not inline image ${href}:`, e.message);
        }
    }));
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ── Popup ─────────────────────────────────────────────────────────────────────

export function showSliceExportPopup() {
    const container = document.createElement('div');
    container.style.cssText = 'padding:15px; min-width:400px;';

    container.innerHTML = `
        <h3 style="margin:0 0 14px; color:#ffe066;">Download Slices as PNG</h3>

        <!-- Slot selection -->
        <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-weight:bold; color:#ccc;">Slots to export</span>
                <span style="display:flex; gap:6px;">
                    <button id="selectCompletedBtn" class="mode-button" style="font-size:11px; padding:3px 8px;">Completed only</button>
                    <button id="selectAllBtn"       class="mode-button" style="font-size:11px; padding:3px 8px;">All</button>
                    <button id="selectNoneBtn"      class="mode-button" style="font-size:11px; padding:3px 8px;">None</button>
                </span>
            </div>
            <div id="slotCheckboxGrid" style="display:grid; grid-template-columns:repeat(6,1fr); gap:5px;">
                ${Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const occ = analyzeSliceOccupancy(slotPositions[n] || [], `Slot ${n}`);
        const complete = occ.backgroundColor === '#28a745';
        return `<label style="display:flex; align-items:center; gap:4px; font-size:13px;
                                         color:${complete ? '#4CAF50' : '#aaa'}; cursor:pointer;"
                                   title="${occ.title}">
                        <input type="checkbox" class="slot-cb" data-slot="${n}" ${complete ? 'checked' : ''}>
                        ${n}${complete ? ' ✓' : ''}
                    </label>`;
    }).join('')}
            </div>
        </div>

        <!-- Overlay options -->
        <div style="margin-bottom:14px; padding:10px; background:#2a2a2a; border-radius:6px; border:1px solid #444;">
            <div style="font-weight:bold; color:#ccc; margin-bottom:8px;">Include in export</div>

            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:#ddd;">
                <input type="checkbox" id="opt_homeOverlay" checked>
                Home info overlay (R/I rows, planet balls, tech &amp; wormhole icons)
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:#ddd; padding-left:22px;" id="opt_scoreLabel">
                <input type="checkbox" id="opt_miltyScore">
                Milty score badge
            </label>

            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:#ddd;">
                <input type="checkbox" id="opt_tileImages" checked>
                Tile images
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:#ddd; padding-left:22px;" id="opt_fullCoverageLabel">
                <input type="checkbox" id="opt_fullHexCoverage" checked>
                Full hex coverage
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:#ddd;">
                <input type="checkbox" id="opt_wormholes">
                Wormhole icons
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:#ddd;">
                <input type="checkbox" id="opt_systemIds">
                System ID labels
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#ddd;">
                <input type="checkbox" id="opt_sliceNumbers" checked>
                Slot number label
            </label>
        </div>

        <!-- Slice titles -->
        <div style="margin-bottom:14px; padding:10px; background:#2a2a2a; border-radius:6px; border:1px solid #444;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#ccc; font-weight:bold;">
                    <input type="checkbox" id="opt_showTitles">
                    Slice titles
                </label>
                <span style="display:flex; align-items:center; gap:10px; font-size:12px; color:#aaa;" id="opt_titlePosRow">
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                        <input type="radio" name="titlePos" id="opt_titleTop" value="top"> Top
                    </label>
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                        <input type="radio" name="titlePos" id="opt_titleBottom" value="bottom" checked> Bottom
                    </label>
                </span>
            </div>
            <div id="titleInputsGrid" style="display:none; grid-template-columns:1fr 1fr; gap:4px 10px;">
                ${Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        return `<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#bbb;">
                        <span style="min-width:18px;text-align:right;color:#888;">${n}:</span>
                        <input type="text" id="title_slot_${n}" placeholder="e.g. Player name"
                               style="flex:1;padding:3px 6px;background:#333;border:1px solid #555;
                                      border-radius:3px;color:#fff;font-size:12px;">
                    </label>`;
    }).join('')}
            </div>
        </div>

        <!-- Font -->
        <div style="margin-bottom:14px; display:flex; align-items:center; gap:10px; color:#ccc; font-size:13px;">
            <label for="opt_font" style="white-space:nowrap;">Font:</label>
            <select id="opt_font" style="flex:1; padding:4px; border:1px solid #555; border-radius:3px;
                                         background:#2a2a2a; color:#fff; font-size:13px;">
                <option value="Arial, Helvetica, sans-serif"         style="font-family:Arial;">Default (Arial)</option>
                <option value="'Segoe UI', Tahoma, sans-serif"       style="font-family:'Segoe UI';">Modern (Segoe UI)</option>
                <option value="Georgia, 'Times New Roman', serif"    style="font-family:Georgia;">Serif (Georgia)</option>
                <option value="'Courier New', Courier, monospace"    style="font-family:'Courier New';">Technical (Courier)</option>
                <option value="Impact, 'Arial Narrow', sans-serif"   style="font-family:Impact;">Bold Condensed (Impact)</option>
                <option value="'Comic Sans MS', cursive"             style="font-family:'Comic Sans MS';">Silly (Comic Sans)</option>
                <option value="Papyrus, fantasy"                     style="font-family:Papyrus;">Ancient (Papyrus)</option>
                <option value="Wingdings"                            style="font-family:Wingdings;">☠ Chaos (Wingdings — unreadable)</option>
            </select>
        </div>

        <!-- Export width -->
        <div style="margin-bottom:14px; display:flex; align-items:center; gap:10px; color:#ccc; font-size:13px;">
            <label for="opt_width" style="white-space:nowrap;">Export width:</label>
            <input id="opt_width" type="number" min="400" max="2400" step="100" value="1000"
                   style="width:80px; padding:4px; border:1px solid #555; border-radius:3px;
                          background:#2a2a2a; color:#fff;">
            <span>px</span>
        </div>

        <!-- Status -->
        <div id="exportStatusMsg" style="min-height:20px; font-size:13px; color:#4CAF50; margin-bottom:8px;"></div>
    `;

    // ── Wire up controls ──────────────────────────────────────────────────────

    const popup = showPopup({
        content: container,
        title: 'Download Slices as PNG',
        id: 'milty-export-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        actions: [
            { label: 'Download Selected', action: () => runExport(container) },
        ],
        style: { width: '480px', maxWidth: '95vw' },
    });

    // Score option disabled when home overlay is off
    const homeOverlayCb = container.querySelector('#opt_homeOverlay');
    const scoreCb = container.querySelector('#opt_miltyScore');
    const scoreLabel = container.querySelector('#opt_scoreLabel');

    homeOverlayCb.addEventListener('change', () => {
        const enabled = homeOverlayCb.checked;
        scoreCb.disabled = !enabled;
        scoreLabel.style.opacity = enabled ? '1' : '0.4';
    });

    // Full hex coverage disabled when tile images is off
    const tileImagesCb = container.querySelector('#opt_tileImages');
    const fullCoverageCb = container.querySelector('#opt_fullHexCoverage');
    const fullCoverageLabel = container.querySelector('#opt_fullCoverageLabel');

    tileImagesCb.addEventListener('change', () => {
        const enabled = tileImagesCb.checked;
        fullCoverageCb.disabled = !enabled;
        fullCoverageLabel.style.opacity = enabled ? '1' : '0.4';
    });

    // Slice titles: show input grid when toggled on
    const showTitlesCb = container.querySelector('#opt_showTitles');
    const titleInputsGrid = container.querySelector('#titleInputsGrid');
    const titlePosRow = container.querySelector('#opt_titlePosRow');

    showTitlesCb.addEventListener('change', () => {
        const on = showTitlesCb.checked;
        titleInputsGrid.style.display = on ? 'grid' : 'none';
        titlePosRow.style.opacity = on ? '1' : '0.4';
    });
    titlePosRow.style.opacity = '0.4'; // greyed out until enabled

    // Slot selection helpers
    container.querySelector('#selectCompletedBtn').onclick = () => {
        container.querySelectorAll('.slot-cb').forEach(cb => {
            const n = Number(cb.dataset.slot);
            const occ = analyzeSliceOccupancy(slotPositions[n] || [], `Slot ${n}`);
            cb.checked = occ.backgroundColor === '#28a745';
        });
    };
    container.querySelector('#selectAllBtn').onclick = () =>
        container.querySelectorAll('.slot-cb').forEach(cb => { cb.checked = true; });
    container.querySelector('#selectNoneBtn').onclick = () =>
        container.querySelectorAll('.slot-cb').forEach(cb => { cb.checked = false; });

    return popup;
}

// ── Export runner (called by the action button) ───────────────────────────────

async function runExport(container) {
    const status = container.querySelector('#exportStatusMsg');

    const selectedSlots = [...container.querySelectorAll('.slot-cb:checked')]
        .map(cb => Number(cb.dataset.slot));

    if (selectedSlots.length === 0) {
        status.style.color = '#f44336';
        status.textContent = 'No slots selected.';
        return;
    }

    const showTitles = container.querySelector('#opt_showTitles').checked;
    const titlePos = container.querySelector('#opt_titleBottom').checked ? 'bottom' : 'top';
    const sliceTitles = {};
    for (let n = 1; n <= 12; n++) {
        sliceTitles[n] = container.querySelector(`#title_slot_${n}`)?.value?.trim() ?? '';
    }

    const baseOptions = {
        showHomeOverlay: container.querySelector('#opt_homeOverlay').checked,
        showMiltyScore: container.querySelector('#opt_miltyScore').checked,
        showTileImages: container.querySelector('#opt_tileImages').checked,
        fullHexCoverage: container.querySelector('#opt_fullHexCoverage').checked,
        showSystemIds: container.querySelector('#opt_systemIds').checked,
        showWormholes: container.querySelector('#opt_wormholes').checked,
        showSliceNumbers: container.querySelector('#opt_sliceNumbers').checked,
        titlePosition: titlePos,
        fontFamily:    container.querySelector('#opt_font').value,
        exportWidth:   Math.max(400, Math.min(2400,
                           Number(container.querySelector('#opt_width').value) || 1000)),
    };

    status.style.color = '#ffe066';
    status.textContent = `Exporting 0 / ${selectedSlots.length}…`;

    let done = 0, errors = 0;
    for (const slotNum of selectedSlots) {
        const options = {
            ...baseOptions,
            sliceTitle: showTitles ? (sliceTitles[slotNum] ?? '') : '',
        };
        try {
            await exportSliceAsPng(slotNum, options);
            done++;
            status.textContent = `Exporting ${done} / ${selectedSlots.length}…`;
            // Small pause between downloads so the browser doesn't suppress them
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            errors++;
            console.error(`Export failed for slot ${slotNum}:`, err);
            // If tainted canvas (cross-origin image), retry without tile images
            if (err.message?.includes('tainted') || err.name === 'SecurityError') {
                try {
                    await exportSliceAsPng(slotNum, { ...options, showTileImages: false });
                    done++;
                    status.textContent = `Slot ${slotNum}: exported without tile images (cross-origin).`;
                } catch {
                    status.style.color = '#f44336';
                    status.textContent = `Slot ${slotNum}: export failed.`;
                }
            }
        }
    }

    if (errors === 0) {
        status.style.color = '#4CAF50';
        status.textContent = `Done — ${done} PNG${done === 1 ? '' : 's'} downloaded.`;
    } else {
        status.style.color = '#FF9800';
        status.textContent = `Completed with ${errors} error${errors === 1 ? '' : 's'}. Check console.`;
    }
}
