/**
 * The distance engine.
 *
 * A layered breadth-first search over the map, where "adjacent" is whatever the
 * neighbour providers say it is (grid edges, wormholes, custom links, adjacency
 * overrides) minus whatever the movement blockers veto (border anomalies,
 * nebulae, void). Hyperlane conduits and gravity rifts both break the uniform
 * cost assumption and are handled by their own modules.
 */
import { dbg } from './debug.js';
import { oppositeSide } from '../utils/hexGrid.js';
import { resolveOptions } from './options.js';
import { buildMapIndex } from './mapIndex.js';
import { defaultRuleset } from './ruleset.js';
import { makeAnomalyRules } from './borderAnomalyRules.js';
import { collectNeighbors } from './neighborProviders.js';
import { isBlocked, isPassable, isHyperlaneConduit, hasAnomaly } from './movementRules.js';
import { expandHyperlaneEndpoints } from './hyperlaneTraversal.js';
import {
  floodRiftCluster, expandFromFloodedRifts, riftOneStepOut, applyRiftSourceShift,
} from './riftRules.js';

/**
 * Shortest-path distance from `sourceLabel` to every hex within `maxDist`.
 *
 * @param {object} editor      - needs `hexes`, `edgeDirections`, `options`
 * @param {string} sourceLabel
 * @param {number} [maxDist=3]
 * @param {object} [opts]      - option overrides, plus an optional `ruleset`
 * @returns {Object<string, number>} `{ label: distance }`, source included at 0.
 *   Hexes that cannot be reached are simply absent.
 */
export function calculateDistancesFrom(editor, sourceLabel, maxDist = 3, opts = {}) {
  dbg('\n========== DISTANCE CALCULATION BEGIN ==========');

  const resolved = resolveOptions(editor, opts);
  const ctx = {
    editor,
    opts: resolved,
    index: buildMapIndex(editor),
    ruleset: opts.ruleset ?? defaultRuleset(),
    // `anomalyTypes` is the live border-anomaly registry when the browser passes
    // it in (HexEditor does); omitted, the built-in defaults apply.
    anomalyRules: makeAnomalyRules(resolved.anomalyTypes),
  };

  const visited = new Map();
  const state = { visited };
  visited.set(sourceLabel, 0);

  // A source sitting on a rift gets +1 movement on every path, so search one
  // layer deeper and shift the answers back down at the end.
  const sourceHex = editor.hexes[sourceLabel];
  const shouldShift = !!(resolved.useRift && hasAnomaly(sourceHex, 'rift'));
  const effectiveMaxDist = shouldShift ? maxDist + 1 : maxDist;

  let currentLayer = new Set([sourceLabel]);

  for (let dist = 1; dist <= effectiveMaxDist; dist++) {
    dbg(`\n-- BFS Distance ${dist} --`);
    const nextLayer = new Set();
    const riftToFlood = new Set();

    for (const label of currentLayer) {
      const current = editor.hexes[label];
      const isSource = (label === sourceLabel);
      dbg(`[Expand] At ${label} (source: ${isSource})`);

      for (const { label: nLabel, hex: neighbor, dirIdx } of collectNeighbors(ctx, current, label)) {
        if (visited.has(nLabel)) continue;

        // Blockers run before rift detection, so that e.g. a spatial tear stops
        // a rift cluster being flooded through it.
        const edge = { dirIdx, isSource, fromLabel: label, toLabel: nLabel };
        if (isBlocked(ctx, current, neighbor, edge)) {
          dbg(` [Blocked] from ${label} to ${nLabel} (dir ${dirIdx})`);
          continue;
        }

        // Rifts are not visited here — the whole cluster is flooded together
        // once this layer has been walked.
        if (resolved.useRift && hasAnomaly(neighbor, 'rift') && isPassable(neighbor, resolved)) {
          dbg(` [RIFT] Will flood rift at ${nLabel}`);
          riftToFlood.add(nLabel);
          continue;
        }

        if (isPassable(neighbor, resolved)) {
          dbg(` [Step] ${label} -> ${nLabel} (dir ${dirIdx})`);
          visited.set(nLabel, dist);
          nextLayer.add(nLabel);
        } else if (isHyperlaneConduit(neighbor) && dirIdx != null) {
          dbg(` [Hyperlane] Begin expansion from ${nLabel} (entry ${oppositeSide(dirIdx)})`);
          expandHyperlaneEndpoints(ctx, state, {
            entryLabel: nLabel,
            entryDir: oppositeSide(dirIdx),
            dist,
            nextLayer,
            onRift: dest => riftToFlood.add(dest),
          });
        }
      }
    }

    const floodedRifts = new Set();
    for (const riftLabel of riftToFlood) {
      floodRiftCluster(ctx, state, riftLabel, dist, nextLayer, floodedRifts);
    }
    expandFromFloodedRifts(ctx, state, dist, nextLayer, floodedRifts);

    currentLayer = nextLayer;
  }

  riftOneStepOut(ctx, state, effectiveMaxDist);

  if (!shouldShift) {
    dbg('=== DISTANCE CALC COMPLETE ===');
    return Object.fromEntries(visited);
  }
  const shifted = applyRiftSourceShift(visited);
  dbg('=== DISTANCE CALC COMPLETE (shifted) ===', shifted);
  return shifted;
}
