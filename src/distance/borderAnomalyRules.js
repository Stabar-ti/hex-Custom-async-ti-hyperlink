/**
 * Border anomaly semantics for pathfinding.
 *
 * Only two of the border types in public/data/border.json are "scripted" — they
 * actually affect movement. The rest are decorative and must never block:
 *
 *   SPATIALTEAR   nothing crosses this border, either way.
 *                 The UI writes it on BOTH hexes (borderAnomaliesUI, double mode).
 *   GRAVITYWAVE   one-way: ships cannot ENTER the hex it is written on through
 *                 that edge, but may leave through it.
 *                 The UI writes it on the primary hex ONLY (single mode).
 */
import { normalizeAnomalyId } from '../constants/borderAnomalies.js';
import { oppositeSide } from '../utils/hexGrid.js';

export { normalizeAnomalyId };

/**
 * The border types that actually affect movement, and their default direction.
 *
 * WHICH types block is a code fact — each one needs an implementation, and the
 * same two IDs are what borderAnomaliesUI marks "[SCRIPTED - Has game
 * mechanics]". Everything else in border.json is decoration and must stay
 * inert no matter what the registry says about it.
 *
 * WHETHER a type blocks both ways is a user setting, overridable per type from
 * the border anomaly panel — see `makeAnomalyRules`.
 */
export const DEFAULT_ANOMALY_TABLE = Object.freeze({
  SPATIALTEAR: Object.freeze({ bidirectional: true }),
  GRAVITYWAVE: Object.freeze({ bidirectional: false }),
});

/** The anomaly ID stored on `hex`'s given side, or '' if there is none. */
export function anomalyIdOn(hex, side) {
  return normalizeAnomalyId(hex?.borderAnomalies?.[side]?.type);
}

/**
 * True for the border types that carry game mechanics, as opposed to the purely
 * decorative ones. Accepts either stored form ("SPATIALTEAR" or "Spatial Tear").
 */
export function isScriptedAnomaly(type) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_ANOMALY_TABLE, normalizeAnomalyId(type));
}

/**
 * Wrap a type table into the two predicates the rules need.
 *
 * `typeTable` is optional and may be the live registry from
 * constants/borderAnomalies.js. It is consulted for `bidirectional` ONLY —
 * whether a type blocks at all is fixed by DEFAULT_ANOMALY_TABLE, so enabling a
 * decorative border in the registry can never start blocking ships.
 */
export function makeAnomalyRules(typeTable = null) {
  return {
    blocks: isScriptedAnomaly,
    isBidirectional: id => isBidirectionalAnomaly(id, typeTable),
  };
}

/**
 * Does this border type apply in both directions?
 *
 * Bidirectional types are stored on BOTH hexes sharing the edge; one-way types
 * (Gravity Wave, by default) are stored on the primary hex only. Anything that
 * mirrors border anomalies between neighbours has to respect that, or a one-way
 * border silently becomes a wall.
 *
 * @param {string} type - either stored form, ID or display name
 * @param {object} [typeTable] - the live registry, for the user's per-type setting
 */
export function isBidirectionalAnomaly(type, typeTable = null) {
  const id = normalizeAnomalyId(type);
  const override = typeTable?.[id]?.bidirectional;
  if (typeof override === 'boolean') return override;
  return DEFAULT_ANOMALY_TABLE[id]?.bidirectional ?? true;
}

/** The rules used when a caller supplies no type table. */
export const DEFAULT_ANOMALY_RULES = makeAnomalyRules();

/**
 * Does a border anomaly stop a move from `fromHex` to `toHex` across `dirIdx`?
 *
 * Two edges are involved and they are checked differently:
 *
 *   outbound — the anomaly on `fromHex`'s `dirIdx` side. Only a BIDIRECTIONAL
 *              type blocks here, because a one-way type written on this hex
 *              points the other way: it guards entry, not exit.
 *   inbound  — the anomaly on `toHex`'s facing side. Any blocking type stops
 *              the move, one-way or not; that is what "one-way" means.
 *
 * This is the single border rule. Ordinary steps and hyperlane hops both use
 * it — they used to disagree about Gravity Wave, with the hyperlane path
 * treating it as bidirectional.
 */
export function borderAnomalyBlocks(fromHex, toHex, dirIdx, rules = DEFAULT_ANOMALY_RULES) {
  if (dirIdx == null) return false;

  const outbound = anomalyIdOn(fromHex, dirIdx);
  if (rules.blocks(outbound) && rules.isBidirectional(outbound)) return true;

  const inbound = anomalyIdOn(toHex, oppositeSide(dirIdx));
  if (rules.blocks(inbound)) return true;

  return false;
}
