/**
 * The set of rules one distance query runs under.
 *
 * These used to be two module-level arrays that the engine pushed into at import
 * time. That made rule order depend on module evaluation order, made the rules
 * impossible to isolate in a test, and was outright unsafe next to this repo's
 * cache-busting `import('...?v=' + Date.now())` pattern — a second evaluation of
 * the module would have registered every rule twice.
 *
 * A ruleset is a plain `{ providers, blockers }`; the BFS takes one per call.
 */
import { DEFAULT_PROVIDERS } from './neighborProviders.js';
import { DEFAULT_BLOCKERS } from './movementRules.js';

/** Extra rules contributed by callers via the register* helpers below. */
const extraProviders = [];
const extraBlockers = [];

/**
 * @param {object} [overrides] - `{providers, blockers}`; either replaces the
 *   corresponding default list entirely.
 */
export function createRuleset({ providers, blockers } = {}) {
  return {
    providers: providers ?? [...DEFAULT_PROVIDERS, ...extraProviders],
    blockers: blockers ?? [...DEFAULT_BLOCKERS, ...extraBlockers],
  };
}

/** The rules a query uses when the caller does not supply its own. */
export function defaultRuleset() {
  return createRuleset();
}

/**
 * Add a neighbour provider `(ctx, hex, label) => Edge[]` to every subsequent
 * query. Idempotent by function identity, so re-evaluating a module that
 * registers rules cannot double them up.
 */
export function registerNeighborProvider(fn) {
  if (typeof fn === 'function' && !extraProviders.includes(fn)) extraProviders.push(fn);
}

/** Add a movement blocker `(ctx, fromHex, toHex, edge) => boolean`. */
export function registerMovementBlocker(fn) {
  if (typeof fn === 'function' && !extraBlockers.includes(fn)) extraBlockers.push(fn);
}

/** Drop every registered extra rule. Test helper. */
export function resetRegisteredRules() {
  extraProviders.length = 0;
  extraBlockers.length = 0;
}
