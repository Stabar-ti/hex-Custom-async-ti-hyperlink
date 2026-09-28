// ───────────────────────────────────────────────────────────────
// ui/svgBindings.js
//
// This module attaches all interactive handlers to the main SVG map.
// It enables panning, zooming, keyboard shortcuts, and special map
// overlays (like distance calculations). It also adds logic for
// custom right-click actions and manages how the SVG canvas responds
// to user input. Used by HexEditor to make the map feel like a real app.
// ───────────────────────────────────────────────────────────────
import { showDistanceOverlays, clearDistanceOverlays } from '../features/baseOverlays.js';
import { startSwapMode, isSwapModeActive } from '../features/tileSwap.js';
import { disarmAll } from '../features/disarm.js';
import { isSelectMode, beginSelectionStroke } from '../features/hexSelection.js';
import { isGhostArmed } from '../features/pasteGhost.js';
import { activeMode } from '../core/registry.js';

// How far a press has to travel before it is a drag rather than a click. Without one, the
// pixel or two a hand wobbles while clicking quickly turned the click into a pan, and the
// pan then swallowed the click.
const DRAG_THRESHOLD_PX = 5;

export function bindSvgHandlers(editor) {
  // Reference to the main SVG map element
  const svg = document.getElementById('hexMap');
  // Make the SVG focusable for keyboard shortcuts
  svg.setAttribute('tabindex', '0');

  // Variables for handling panning (drag-to-move)
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let pendingPan = null; // NEW: For smooth pan with requestAnimationFrame

  // Held-key flags. They were on window, which made them look like an interface;
  // nothing outside this file has ever read either one.
  let shiftDActive = false;
  let shiftSActive = false;
  // Initialize viewBox (SVG visible region); controls zoom/pan
  editor._currentViewBox = [0, 0, 1000, 1000];

  // ────────────── Keyboard Shortcuts (global) ──────────────

  // Track if Shift+D is being held (for special distance tool)
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key.toLowerCase() === 'd') {
      shiftDActive = true;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'd' || e.key === 'Shift') {
      shiftDActive = false;
    }
  });

  // Shift+S+click — one-shot swap: the Shift+S+click selects the first hex,
  // the next plain click selects the second hex, swap executes and mode exits.
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
      shiftSActive = true;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 's' || e.key === 'Shift') {
      shiftSActive = false;
    }
  });

  // Capture phase — fires before the polygon's own click handler.
  // When Shift+S is held and the user clicks a hex, pre-select it as the
  // first swap tile and start one-shot mode, preventing the normal click action.
  svg.addEventListener('click', (e) => {
    if (!shiftSActive) return;
    if (isSwapModeActive()) return; // already waiting for second click — let it through
    const label = e.target.closest('polygon')?.dataset?.label;
    if (!label) return;
    e.stopPropagation(); // prevent the polygon's editor._onHexClick from firing
    // The status callback used to be the wizard popup's; that popup is gone and the
    // shortcut is the one path that still has nowhere to report to. It swaps silently.
    startSwapMode(editor, () => {}, { oneShot: true, firstLabel: label });
  }, true); // true = capture phase

  // ────────────── SVG Mouse Handlers ──────────────

  // Right-click on map: special modes!
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Prevent the default context menu

    // If Shift+D is active, show distance overlays from clicked hex
    if (shiftDActive) {
      const target = e.target.closest('polygon');
      if (!target) return;
      const label = target.dataset?.label;
      if (!label) return;

      if (typeof editor.calculateDistancesFrom === 'function') {
        const result = editor.calculateDistancesFrom(label, editor.maxDistance);
        clearDistanceOverlays(editor);
        showDistanceOverlays(editor, result);
      } else {
        console.warn("editor.calculateDistancesFrom is not a function");
      }
    } else {
      // Otherwise right-click means "put everything down": the paste ghost if one is up,
      // else every armed tool — which returns the map to select mode and to panning.
      disarmAll(editor);

      // And in every case it abandons a half-drawn hyperlane link.
      Object.values(editor.hexes).forEach(hex => {
        if (hex?.polygon) hex.polygon.classList.remove('selected');
      });
      editor.selectedPath = [];
      editor.linking = true;
      editor.unlinking = false;
    }
  });

  // ────────────── Keyboard: Clear, Delete, and Overlays ──────────────

  // Shift+R over a hovered hex: clear all content from that hex
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && e.shiftKey && editor.hoveredHexLabel) {
      editor.clearAll(editor.hoveredHexLabel);
      editor.clearCustomAdjacenciesBothSides(editor.hoveredHexLabel);
      // Optionally, redraw overlays if needed:
      if (typeof editor.redrawCustomAdjacencyOverlay === 'function') editor.redrawCustomAdjacencyOverlay();
      if (typeof editor.redrawBorderAnomaliesOverlay === 'function') editor.redrawBorderAnomaliesOverlay();
    }
    // Escape always clears any distance overlays
    if (e.key === 'Escape') {
      clearDistanceOverlays(editor);
    }
  });

  // Always re-focus SVG after a click (for keyboard shortcuts)
  svg.addEventListener('click', () => svg.focus());

  // ────────────── Mouse Wheel Zoom ──────────────
  svg.addEventListener('wheel', (e) => {
    // Only zoom if Ctrl is held or no modifier (not Alt/Shift)
    if (e.altKey || e.shiftKey) return;
    e.preventDefault();
    const [x, y, w, h] = editor._currentViewBox;
    const factor = 1.1;
    const zoomIn = e.deltaY < 0;
    // Calculate new zoom dimensions
    const dw = zoomIn ? w / factor : w * factor;
    const dh = zoomIn ? h / factor : h * factor;
    // Mouse position as a percentage of SVG box
    const mx = e.offsetX / svg.clientWidth;
    const my = e.offsetY / svg.clientHeight;
    // Adjust origin so zoom is centered at mouse location
    const nx = x + (w - dw) * mx;
    const ny = y + (h - dh) * my;
    editor._currentViewBox = [nx, ny, dw, dh];
    svg.setAttribute('viewBox', editor._currentViewBox.join(' '));
  }, { passive: false }); // Fix: explicitly mark as not passive

  // ────────────── Middle Mouse Button Panning (SMOOTH/THROTTLED) ──────────────

  // Left-drag and middle-drag both pan. This used to be behind a mode, which meant a
  // trackpad — no middle button — could lose panning entirely; and a drag that moves the
  // map never competed with anything, because the click that follows a drag is suppressed
  // below, so a click still reaches the hex under it.
  //
  // A press only becomes a pan once it has moved DRAG_THRESHOLD_PX. Shift+press never
  // pans at all: it is how you build a selection, and a shift-click that slipped into a pan
  // was the commonest way to lose one.
  let pressButton = -1;
  let pressOrigin = { x: 0, y: 0 };
  let panEngaged = false;
  let cursorBeforePan = '';
  /** @type {ReturnType<typeof beginSelectionStroke> | null} */
  let stroke = null;
  let cursorBeforeStroke = '';
  // Set when a press turned out to be a drag, so the click it ends with is not also a
  // click on the hex under it. Reset by the next press, in case that click never came
  // (a drag released outside the map does not produce one).
  let swallowClick = false;

  /** The hex under a point, looking through the overlays drawn on top of the tiles. */
  function hexLabelAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el instanceof SVGPolygonElement && el.dataset.label) return el.dataset.label;
    }
    return null;
  }

  // Painting a selection is what shift-drag does when a click would select. Anything
  // armed — a paint mode, the distance tool, the paste ghost, a Shift+S swap — owns the
  // click instead, and shift keeps whatever meaning it has there.
  function canPaintSelection() {
    return isSelectMode(editor.mode) && !activeMode() && !isGhostArmed()
      && !isSwapModeActive() && !shiftSActive && !shiftDActive;
  }

  svg.addEventListener('mousedown', (e) => {
    swallowClick = false;
    if (e.button === 0 && e.shiftKey) {
      e.preventDefault();
      if (canPaintSelection()) {
        stroke = beginSelectionStroke(editor, hexLabelAt(e.clientX, e.clientY));
        cursorBeforeStroke = svg.style.cursor;
        svg.style.cursor = 'crosshair';
      }
      return;
    }
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      isPanning = true;
      panEngaged = false;
      pressButton = e.button;
      pressOrigin = { x: e.clientX, y: e.clientY };
      panStart = pressOrigin;
    }
  });

  svg.addEventListener('click', (e) => {
    if (swallowClick) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick = false;
    }
  }, true);

  window.addEventListener('mousemove', (e) => {
    if (stroke) {
      stroke.enter(hexLabelAt(e.clientX, e.clientY));
      return;
    }
    if (!isPanning) return;
    if (!panEngaged) {
      const moved = Math.hypot(e.clientX - pressOrigin.x, e.clientY - pressOrigin.y);
      if (moved < DRAG_THRESHOLD_PX) return;
      // panStart is still the press point, so the map catches up with the pointer rather
      // than lagging five pixels behind it for the rest of the drag.
      panEngaged = true;
      cursorBeforePan = svg.style.cursor;
      if (pressButton === 0) svg.style.cursor = 'grabbing';
    }
    pendingPan = e; // Store event for the next animation frame
  });

  window.addEventListener('mouseup', () => {
    if (stroke) {
      swallowClick = stroke.painted;
      stroke = null;
      svg.style.cursor = cursorBeforeStroke;
    }
    if (isPanning && panEngaged) {
      // The last movement may not have been drawn yet. It used to be dropped here, so a
      // quick flick landed a few pixels short of where it was let go.
      applyPendingPan();
      // Put back what was there — a crosshair from an armed tool, say — rather than
      // assuming the map's own cursor. Only a left press is followed by a click event.
      svg.style.cursor = cursorBeforePan;
      swallowClick = pressButton === 0;
    }
    isPanning = false;
    panEngaged = false;
    pendingPan = null;
  });

  function applyPendingPan() {
    if (!pendingPan) return;
    const [, , w, h] = editor._currentViewBox;
    // Convert mouse delta to SVG units (based on viewBox size)
    const dx = (pendingPan.clientX - panStart.x) * w / svg.clientWidth;
    const dy = (pendingPan.clientY - panStart.y) * h / svg.clientHeight;
    editor._currentViewBox[0] -= dx;
    editor._currentViewBox[1] -= dy;
    panStart = { x: pendingPan.clientX, y: pendingPan.clientY };
    svg.setAttribute('viewBox', editor._currentViewBox.join(' '));
    pendingPan = null;
  }

  // ---- Smooth pan loop using requestAnimationFrame ----
  function panLoop() {
    if (isPanning) applyPendingPan();
    requestAnimationFrame(panLoop);
  }
  panLoop();

  // ────────────── Distance Overlay Utilities ──────────────

  /**
   * Render distance overlays (numbers) on each hex, except the origin.
   * @param {HexEditor} editor 
   * @param {object} result  Map of label → distance
   */
  /*  function showDistanceOverlays(editor, result) {
      editor._distanceOverlays = editor._distanceOverlays || [];
      for (const [label, dist] of Object.entries(result)) {
        if (dist === 0) continue; // Don't overlay on the source hex
        const hex = editor.hexes[label];
        if (!hex || !hex.center) continue;
  
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', hex.center.x);
        text.setAttribute('y', hex.center.y - 15);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '24');
        text.setAttribute('fill', 'red');
        text.textContent = dist;
        text.classList.add('distance-overlay');
  
        svg.appendChild(text);
        editor._distanceOverlays.push(text);
      }
    }
  
    /**
     * Remove all distance overlays from the SVG map.
     * @param {HexEditor} editor 
     */
  /*function clearDistanceOverlays(editor) {
    const overlays = editor._distanceOverlays || [];
    overlays.forEach(el => {
      if (el.parentNode === svg) {
        svg.removeChild(el);
      }
    });
    editor._distanceOverlays = [];
  }
    */
}
