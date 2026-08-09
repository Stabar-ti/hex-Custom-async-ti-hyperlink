/**
 * Option resolution for the distance engine.
 *
 * Callers may pass an explicit `opts`; anything they leave out falls back to
 * `editor.options` (wired up in main.js and edited from the Distance Calculator
 * Options popup), and anything still missing defaults to "rule is on".
 */

/**
 * Every flag the engine understands, with its default.
 *
 * `useWormholes` and `useAdjacencyOverrides` were implicit for a long time —
 * those two adjacency sources had no switch at all while the other four did,
 * so "turn off everything special" could not actually be expressed.
 */
export const DEFAULT_OPTIONS = Object.freeze({
  useCustomLinks: true,
  useWormholes: true,
  useAdjacencyOverrides: true,
  useBorderAnomalies: true,
  useSupernova: true,
  useRift: true,
  useNebula: true,
  useAsteroid: true,
});

/**
 * Build the effective option set for one query.
 *
 * Returns a NEW frozen object. The engine used to hang its per-call indexes off
 * the caller's `opts`, which meant a query quietly wrote into its own argument;
 * those indexes now live in the map index instead (see mapIndex.js).
 *
 * @param {object} editor
 * @param {object} [opts] - explicit overrides, highest precedence
 */
export function resolveOptions(editor, opts = {}) {
  const fromEditor = {};
  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    fromEditor[key] = editor?.options?.[key] ?? DEFAULT_OPTIONS[key];
  }
  return Object.freeze({ ...fromEditor, ...opts });
}
