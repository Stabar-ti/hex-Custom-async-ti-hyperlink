// ───────────────────────────────────────────────────────────────
// ui/svgBindings.js
//
// This module attaches all interactive handlers to the main SVG map.
// It enables panning, zooming, keyboard shortcuts, and special map
// overlays (like distance calculations). It also adds logic for
// custom right-click actions and manages how the SVG canvas responds
// to user input. Used by HexEditor to make the map feel like a real app.
// ───────────────────────────────────────────────────────────────
import { showDistanceOverlays, clearDistanceOverlays } from '../features/baseOverlays.js'; // adjust path as needed

export function bindSvgHandlers(editor) {
  // Reference to the main SVG map element
  const svg = document.getElementById('hexMap');
  // Make the SVG focusable for keyboard shortcuts
  svg.setAttribute('tabindex', '0');

  // Variables for handling panning (drag-to-move)
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let pendingPan = null; // NEW: For smooth pan with requestAnimationFrame

  // Custom "Shift+D" keyboard tracking for distance overlay
  window.shiftDActive = false;
  // Initialize viewBox (SVG visible region); controls zoom/pan
  editor._currentViewBox = [0, 0, 1000, 1000];

  // ────────────── Keyboard Shortcuts (global) ──────────────

  // Track if Shift+D is being held (for special distance tool)
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key.toLowerCase() === 'd') {
      window.shiftDActive = true;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'd' || e.key === 'Shift') {
      window.shiftDActive = false;
    }
  });

  // ────────────── SVG Mouse Handlers ──────────────

  // Right-click on map: special modes!
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Prevent the default context menu

    // If Shift+D is active, show distance overlays from clicked hex
    if (window.shiftDActive) {
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
      // Otherwise: right-click cancels any linking/selection
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

  svg.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Only respond to middle mouse button
      e.preventDefault();
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    pendingPan = e; // Store event for the next animation frame
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    pendingPan = null;
  });

  // ---- Smooth pan loop using requestAnimationFrame ----
  function panLoop() {
    if (isPanning && pendingPan) {
      const [x, y, w, h] = editor._currentViewBox;
      // Convert mouse delta to SVG units (based on viewBox size)
      const dx = (pendingPan.clientX - panStart.x) * w / svg.clientWidth;
      const dy = (pendingPan.clientY - panStart.y) * h / svg.clientHeight;
      editor._currentViewBox[0] -= dx;
      editor._currentViewBox[1] -= dy;
      panStart = { x: pendingPan.clientX, y: pendingPan.clientY };
      svg.setAttribute('viewBox', editor._currentViewBox.join(' '));
      pendingPan = null;
    }
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
