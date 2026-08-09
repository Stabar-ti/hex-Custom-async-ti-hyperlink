/**
 * Map distance calculation.
 *
 *   import { calculateDistancesFrom } from '../distance/index.js';
 *   const distances = calculateDistancesFrom(editor, '101', 3);
 *
 * Module map:
 *   bfs.js                  the layered search itself
 *   options.js              which rules are switched on for a query
 *   mapIndex.js             per-query coordinate / wormhole / matrix lookups
 *   neighborProviders.js    every way two hexes can be adjacent
 *   movementRules.js        what stops a move, and where a ship may stop
 *   borderAnomalyRules.js   Spatial Tear / Gravity Wave semantics
 *   hyperlaneTraversal.js   walking conduit chains (free movement)
 *   riftRules.js            gravity rift clustering and the +1 bonus
 *   ruleset.js              the rule list a query runs under
 */
export { calculateDistancesFrom } from './bfs.js';

export {
  createRuleset, defaultRuleset, resetRegisteredRules,
  registerNeighborProvider, registerMovementBlocker,
} from './ruleset.js';

export { DEFAULT_OPTIONS, resolveOptions } from './options.js';
export { DEFAULT_PROVIDERS } from './neighborProviders.js';
export {
  DEFAULT_BLOCKERS, isPassable, isHyperlane, isHyperlaneConduit, hasAnomaly,
} from './movementRules.js';
export {
  DEFAULT_ANOMALY_TABLE, normalizeAnomalyId, isScriptedAnomaly, isBidirectionalAnomaly,
  anomalyIdOn, borderAnomalyBlocks, makeAnomalyRules,
} from './borderAnomalyRules.js';
