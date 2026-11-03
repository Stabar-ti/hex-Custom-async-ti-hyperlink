import { effectIconPositions, effectEmojiMap, fallbackEffectEmoji, wormholeInfo, parseWormholeKey } from '../constants/constants.js';
import { COLORS } from '../constants/designTokens.js';
import { hexPoints } from '../utils/hexGeometry.js';


/** Ring colours of a one-way wormhole, as the bot draws them (OneWayWormholeIcon). */
const ONE_WAY_RING = { in: '#3cc85a', out: '#e13c37' };

/**
 * Creates a single SVG overlay for a wormhole token.
 * Renders a colored circle with the wormhole's symbol (α, β, ...).
 *
 * A one-way wormhole ('alpha:in' / 'alpha:out') gets the bot's marking around the badge: a
 * ring of three arrows, green and counter-clockwise for entry-only (IN), red and clockwise
 * for exit-only (OUT), and a small IN/OUT tag.
 *
 * @param {number} x    - X coordinate (center of hex + offset)
 * @param {number} y    - Y coordinate (center of hex + offset)
 * @param {string} type - Wormhole key ('alpha', 'beta', 'alpha:in', ...)
 * @returns {SVGGElement} - SVG group containing circle and label
 */
export function createWormholeOverlay(x, y, type) {
  const { color, symbol, label } = wormholeInfo(type);
  const { dir } = parseWormholeKey(type);

  const svgns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(svgns, 'g');

  // Set initial visibility to visible
  group.setAttribute('visibility', 'visible');

  if (dir) group.appendChild(oneWayRing(svgns, x, y, dir));

  // Draw the colored circle
  const circle = document.createElementNS(svgns, 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 10);
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', 2);

  // Draw the wormhole symbol (α, β, etc.)
  const text = document.createElementNS(svgns, 'text');
  text.setAttribute('x', x);
  text.setAttribute('y', y + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '10');
  text.classList.add('hex-wormhole-label');
  text.textContent = symbol;

  group.appendChild(circle);
  group.appendChild(text);

  if (dir) {
    group.appendChild(oneWayTag(svgns, x, y, dir));
    const title = document.createElementNS(svgns, 'title');
    title.textContent = `${label} wormhole, ${dir === 'in' ? 'entry-only (IN): ships can leave through it' : 'exit-only (OUT): ships can arrive through it'}`;
    group.appendChild(title);
  }

  return group;
}

/** Three arrows round the badge: counter-clockwise for IN, clockwise for OUT. */
function oneWayRing(svgns, x, y, dir) {
  const ring = document.createElementNS(svgns, 'g');
  const color = ONE_WAY_RING[dir];
  const ccw = dir === 'in';
  const R = 14;
  const extent = 88;
  const at = deg => {
    const a = deg * Math.PI / 180;
    return { x: x + R * Math.cos(a), y: y - R * Math.sin(a) };
  };
  for (let i = 0; i < 3; i++) {
    const start = 90 + i * 120 + (120 - extent) / 2;
    const from = ccw ? start : start + extent;
    const to = ccw ? start + extent : start;
    const p0 = at(from);
    const p1 = at(to);
    const arc = document.createElementNS(svgns, 'path');
    // Counter-clockwise on screen is sweep-flag 0 (SVG's y axis points down).
    arc.setAttribute('d', `M${p0.x},${p0.y} A${R},${R} 0 0 ${ccw ? 0 : 1} ${p1.x},${p1.y}`);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', color);
    arc.setAttribute('stroke-width', 2.5);
    ring.appendChild(arc);

    // Arrowhead at the end of the arc, along the direction of travel.
    const a = to * Math.PI / 180;
    const tx = ccw ? -Math.sin(a) : Math.sin(a);
    const ty = ccw ? -Math.cos(a) : Math.cos(a);
    const nx = Math.cos(a);
    const ny = -Math.sin(a);
    const head = document.createElementNS(svgns, 'polygon');
    head.setAttribute('points', [
      [p1.x + tx * 5, p1.y + ty * 5],
      [p1.x + nx * 3.5, p1.y + ny * 3.5],
      [p1.x - nx * 3.5, p1.y - ny * 3.5],
    ].map(([px, py]) => `${px},${py}`).join(' '));
    head.setAttribute('fill', color);
    ring.appendChild(head);
  }
  return ring;
}

/** The IN / OUT tag at the lower right of the badge. */
function oneWayTag(svgns, x, y, dir) {
  const g = document.createElementNS(svgns, 'g');
  const text = dir === 'in' ? 'IN' : 'OUT';
  const w = dir === 'in' ? 11 : 15;
  const rect = document.createElementNS(svgns, 'rect');
  rect.setAttribute('x', x + 16 - w);
  rect.setAttribute('y', y + 8);
  rect.setAttribute('width', w);
  rect.setAttribute('height', 7);
  rect.setAttribute('rx', 2);
  rect.setAttribute('fill', ONE_WAY_RING[dir]);
  rect.setAttribute('stroke', '#111');
  rect.setAttribute('stroke-width', 0.75);
  const label = document.createElementNS(svgns, 'text');
  label.setAttribute('x', x + 16 - w / 2);
  label.setAttribute('y', y + 13.7);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('fill', 'white');
  label.setAttribute('font-size', '6');
  label.setAttribute('font-weight', 'bold');
  label.textContent = text;
  g.append(rect, label);
  return g;
}

/**
 * Shows or hides all wormhole overlays depending on
 * the value of editor.showWormholes.
 *
 * @param {HexEditor} editor - The map editor instance.
 */
export function updateWormholeVisibility(editor) {
  const visible = editor.showWormholes;

  // Ensure the wormholeIconLayer itself is visible/hidden
  const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
  if (wormholeIconLayer) {
    wormholeIconLayer.setAttribute('visibility', visible ? 'visible' : 'hidden');
  }

  // Update individual overlay visibility
  Object.values(editor.hexes).forEach(hex => {
    if (hex.wormholeOverlays && hex.wormholeOverlays.length > 0) {
      hex.wormholeOverlays.forEach((o) => {
        o.setAttribute('visibility', visible ? 'visible' : 'hidden');
      });
    }
  });
}

/**
 * Shows or hides all effect overlays on the map depending on editor.showEffects.
 *
 * @param {HexEditor} editor
 */
export function updateEffectsVisibility(editor) {
  const show = editor.showEffects;
  Object.values(editor.hexes).forEach(hex => {
    if (!hex.overlays) return;
    hex.overlays.forEach(o => o.setAttribute('visibility', show ? 'visible' : 'hidden'));
  });
}

/**
 * Helper to create a single SVG text emoji overlay for an effect.
 * Places the emoji in a visually spaced position (using effectIconPositions).
 *
 * @param {string} type     - Effect type/key ("nebula", etc.)
 * @param {object} center   - {x, y} object (hex center coords)
 * @param {number} index    - Effect's index among overlays (for spacing)
 * @param {HexEditor} editor- The map editor (unused here but could be used)
 * @returns {SVGTextElement}
 */
export function createEffectsOverlay(type, center, index, editor) {
  // Pick a position for this overlay (e.g., above, right, left)
  const off = effectIconPositions[index % effectIconPositions.length];
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  icon.setAttribute('x', center.x + off.dx);
  icon.setAttribute('y', center.y + off.dy + 5); // +5 to visually center text
  icon.setAttribute('text-anchor', 'middle');
  icon.classList.add('hex-overlay');
  icon.textContent = effectEmojiMap[type] ?? fallbackEffectEmoji;
  return icon;
}

// ────────────── Distance Overlay Utilities ──────────────

//
// These used to be loose <text> nodes appended to the SVG root, 24px gold text at the top
// of each hex. Two things made them hard to see. They sat over the hex label, gold on the
// pale and yellow tile fills. And enforceSvgLayerOrder, which runs on most redraws, moves
// every named layer to the top — so the first redraw after a calculation put the tile
// images and every other overlay on top of the numbers.
//
// Now they are one layer, last in SVG_LAYER_ORDER, drawn as dark badges in the middle of
// each hex with the source ringed.

const DISTANCE_LAYER_ID = 'distanceLayer';

/**
 * Show the result of a distance calculation.
 *
 * @param {HexEditor} editor
 * @param {Object<string, number>} result  label → distance; the source is the one at 0
 */
export function showDistanceOverlays(editor, result) {
  const svg = editor.svg || document.getElementById('hexMap');
  if (!svg) return;
  clearDistanceOverlays(editor);

  const svgns = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(svgns, 'g');
  layer.id = DISTANCE_LAYER_ID;
  // Which hex the reading is from, so clicking it again can put the reading away.
  const source = Object.keys(result).find(label => result[label] === 0);
  if (source) layer.dataset.source = source;
  // It is a reading of the map, not part of it: clicks go through to the tile underneath.
  layer.style.pointerEvents = 'none';

  const radius = editor.hexRadius || 40;
  const badgeR = radius * 0.34;

  for (const [label, dist] of Object.entries(result)) {
    const hex = editor.hexes[label];
    if (!hex?.center) continue;
    const { x, y } = hex.center;

    if (dist === 0) {
      // The source gets a ring rather than a "0" — it is where you are, not a distance.
      const ring = document.createElementNS(svgns, 'polygon');
      ring.setAttribute('points', hexPoints(hex.center, radius * 0.9));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', COLORS.distanceNumber);
      ring.setAttribute('stroke-width', '4');
      ring.setAttribute('stroke-dasharray', '10 6');
      layer.appendChild(ring);
      continue;
    }

    const badge = document.createElementNS(svgns, 'g');
    badge.classList.add('distance-overlay');
    badge.dataset.label = label;

    const disc = document.createElementNS(svgns, 'circle');
    disc.setAttribute('cx', String(x));
    disc.setAttribute('cy', String(y));
    disc.setAttribute('r', String(badgeR));
    disc.setAttribute('fill', COLORS.distanceStroke);
    disc.setAttribute('fill-opacity', '0.88');
    disc.setAttribute('stroke', COLORS.distanceNumber);
    disc.setAttribute('stroke-width', '2');

    const text = document.createElementNS(svgns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', String(Math.round(badgeR * 1.25)));
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', COLORS.distanceNumber);
    text.textContent = String(dist);

    badge.append(disc, text);
    layer.appendChild(badge);
  }

  svg.appendChild(layer);
}

/**
 * The hex the distances on screen are measured from, or null when none are showing.
 * @param {HexEditor} editor
 * @returns {string|null}
 */
export function distanceOverlaySource(editor) {
  const svg = editor.svg || document.getElementById('hexMap');
  const layer = /** @type {SVGGElement|null} */ (svg?.querySelector('#' + DISTANCE_LAYER_ID));
  return layer?.dataset.source ?? null;
}

/**
 * Remove the distance overlays from the map.
 * @param {HexEditor} editor
 */
export function clearDistanceOverlays(editor) {
  const svg = editor.svg || document.getElementById('hexMap');
  svg?.querySelector('#' + DISTANCE_LAYER_ID)?.remove();
}