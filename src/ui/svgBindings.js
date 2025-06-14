// ─────────────── ui/svgBindings.js ───────────────
export function bindSvgHandlers(editor) {
  const svg = document.getElementById('hexMap');
  svg.setAttribute('tabindex', '0');

  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  window.shiftDActive = false;
  editor._currentViewBox = [0, 0, 1000, 1000];

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

  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();

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
      Object.values(editor.hexes).forEach(hex => {
        if (hex?.polygon) hex.polygon.classList.remove('selected');
      });
      editor.selectedPath = [];
      editor.linking = true;
      editor.unlinking = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && e.shiftKey && editor.hoveredHexLabel) {
      editor.clearAll(editor.hoveredHexLabel);
    }
    if (e.key === 'Escape') {
      clearDistanceOverlays(editor);
    }
  });

  svg.addEventListener('click', () => svg.focus());

  // Zoom and pan handlers
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y, w, h] = editor._currentViewBox;
    const factor = 1.1;
    const zoomIn = e.deltaY < 0;
    const dw = zoomIn ? w / factor : w * factor;
    const dh = zoomIn ? h / factor : h * factor;
    const mx = e.offsetX / svg.clientWidth;
    const my = e.offsetY / svg.clientHeight;
    const nx = x + (w - dw) * mx;
    const ny = y + (h - dh) * my;
    editor._currentViewBox = [nx, ny, dw, dh];
    svg.setAttribute('viewBox', editor._currentViewBox.join(' '));
  });

  svg.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const [x, y, w, h] = editor._currentViewBox;
    const dx = (e.clientX - panStart.x) * w / svg.clientWidth;
    const dy = (e.clientY - panStart.y) * h / svg.clientHeight;
    editor._currentViewBox[0] -= dx;
    editor._currentViewBox[1] -= dy;
    panStart = { x: e.clientX, y: e.clientY };
    svg.setAttribute('viewBox', editor._currentViewBox.join(' '));
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
  });

  function showDistanceOverlays(editor, result) {
    editor._distanceOverlays = editor._distanceOverlays || [];
    for (const [label, dist] of Object.entries(result)) {
      if (dist === 0) continue;
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

  function clearDistanceOverlays(editor) {
    const overlays = editor._distanceOverlays || [];
    overlays.forEach(el => {
      if (el.parentNode === svg) {
        svg.removeChild(el);
      }
    });
    editor._distanceOverlays = [];
  }
}
