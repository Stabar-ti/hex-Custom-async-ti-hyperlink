// ─────────────── draw/drawHexes.js ───────────────
import { ringDirections, sectorColors } from '../constants/constants.js';

export function drawHexGrid(editor) {
  const rings = 6; // Placeholder until UI input wired
  const layout = generateRings(rings);
  const svg = document.getElementById('hexMap');

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  editor.hexes = {};

  layout.forEach(({ q, r, label }) => {
    drawHex(editor, q, r, label);
  });

  drawSpecialHexes(editor);

  const wormholeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wormholeLayer.setAttribute('id', 'wormholeLineLayer');
  svg.appendChild(wormholeLayer);

  autoscaleView(editor);
}

export function drawHex(editor, q, r, label) {
  const svg = document.getElementById('hexMap');
  const center = hexToPixel(editor, q, r);

  const pts = Array.from({ length: 6 }, (_, i) => {
    const ang = Math.PI / 180 * 60 * i;
    return `${center.x + editor.hexRadius * Math.cos(ang)},${center.y + editor.hexRadius * Math.sin(ang)}`;
  });

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', sectorColors['']);
  poly.setAttribute('data-label', label);
  poly.classList.add('hex');
  poly.addEventListener('click', e => editor._onHexClick?.(e, label));
  poly.addEventListener('mouseenter', () => editor.hoveredHexLabel = label);
  poly.addEventListener('mouseleave', () => editor.hoveredHexLabel = null);
  svg.appendChild(poly);

  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', center.x);
  txt.setAttribute('y', center.y + 5);
  txt.setAttribute('text-anchor', 'middle');
  txt.textContent = label;
  svg.appendChild(txt);

  editor.hexes[label] = {
    q, r, center, polygon: poly, baseType: '',
    effects: new Set(), overlays: [], matrix: Array.from({ length: 6 }, () => Array(6).fill(0)),
    wormholes: new Set(), wormholeOverlays: []
  };
}

export function generateRings(n, fillCorners = false) {
  const layout = [{ q: 0, r: 0, label: '000' }];

  for (let ring = 1; ring <= n; ring++) {
    let q = 0, r = -ring, c = 1;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        const label = `${ring}${String(c).padStart(2, '0')}`;

        if (fillCorners) {
          const off = axialToOffset(q, r);
          if (off.col < -9 || off.col > 9 || off.row < -9 || off.row > 9) {
            q += ringDirections[side].q;
            r += ringDirections[side].r;
            c++;
            continue;
          }
        }

        layout.push({ q, r, label });
        c++;
        q += ringDirections[side].q;
        r += ringDirections[side].r;
      }
    }
  }

  return layout;
}

function axialToOffset(q, r) {
  return { col: q, row: r + Math.floor(q / 2) };
}


export function hexToPixel(editor, q, r) {
  return {
    x: editor.hexRadius * 1.5 * q + 500,
    y: editor.hexRadius * editor.sqrt3 * (r + q / 2) + 500
  };
}

export function drawSpecialHexes(editor) {
  const pts = Object.values(editor.hexes).map(h => h.center);
  if (!pts.length) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const off = editor.hexRadius * 2;

  ['TL', 'TR', 'BL', 'BR'].forEach((lbl, i) => {
    const x = i % 2 === 0 ? minX - off : maxX + off;
    const y = i < 2 ? minY - off : maxY + off;
    drawCornerHex(editor, x, y, lbl);
  });
}

export function drawCornerHex(editor, x, y, label) {
  const svg = document.getElementById('hexMap');
  const pts = Array.from({ length: 6 }, (_, i) => {
    const ang = Math.PI / 180 * 60 * i;
    return `${x + editor.hexRadius * Math.cos(ang)},${y + editor.hexRadius * Math.sin(ang)}`;
  });

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', sectorColors['']);
  poly.setAttribute('data-label', label); 
  poly.classList.add('hex');
 poly.addEventListener('click', e => editor._onHexClick?.(e, label));

 // poly.addEventListener('click', (e) => {
 //   console.log("🖱 Polygon clicked", e.target.dataset.label);
 // });

  poly.addEventListener('mouseenter', () => editor.hoveredHexLabel = label);
  poly.addEventListener('mouseleave', () => editor.hoveredHexLabel = null);
  svg.appendChild(poly);

  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', x);
  txt.setAttribute('y', y + 5);
  txt.setAttribute('text-anchor', 'middle');
  txt.textContent = label;
  svg.appendChild(txt);

  editor.hexes[label] = {
    q: null,
    r: null,
    center: { x, y },
    polygon: poly,
    baseType: '',
    effects: new Set(),
    overlays: [],
    matrix: Array.from({ length: 6 }, () => Array(6).fill(0)),
    wormholes: new Set(),
    wormholeOverlays: [],
    isCorner: true
  };
}

export function autoscaleView(editor) {
  const svg = document.getElementById('hexMap');
  const pts = Object.values(editor.hexes).map(h => h.center);
  if (!pts.length) return;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);

  const margin = editor.hexRadius * 1.5;

  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;

  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
}