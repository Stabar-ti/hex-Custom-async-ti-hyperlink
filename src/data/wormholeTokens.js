// ───────────────────────────────────────────────────────────────
// data/wormholeTokens.js
//
// Which tokens are wormholes, read only from the `wormholes` field of
// tokens.json — the same rule the bot follows (COMPONENT_RULES.md,
// "Never detect a wormhole from a file name or id"). Used by the
// mapInfo import (token -> wormholes) and by both exports
// (wormhole -> the token to place).
// ───────────────────────────────────────────────────────────────

import { normalizeWormholeType } from '../constants/constants.js';

/**
 * @typedef {Object} WormholeTokenIndex
 * @property {Record<string, string[]>} typesByToken  token id -> wormhole types it carries
 * @property {Record<string, string>}   tokenByType   wormhole type -> token id to export it as
 * @property {Record<string, Object>}   tokenByImage  image file name (incl. legacyImagePaths) -> token, for every token
 */

/**
 * Builds the index from tokens.json's content (an array of arrays, one per source file).
 *
 * The token exported for a type is the one with the shortest id among those carrying
 * only that wormhole (whalpha, not creussalpha or ionalpha), ties broken alphabetically.
 *
 * @param {Array<Object|Object[]>} tokenGroups
 * @returns {WormholeTokenIndex}
 */
export function buildWormholeTokenIndex(tokenGroups) {
  /** @type {WormholeTokenIndex} */
  const index = { typesByToken: {}, tokenByType: {}, tokenByImage: {} };
  const better = (a, b) => a.id.length !== b.id.length ? a.id.length < b.id.length : a.id < b.id;
  const candidates = {};

  for (const token of (tokenGroups || []).flat()) {
    if (!token?.id) continue;

    for (const path of [token.imagePath, ...(token.legacyImagePaths || [])]) {
      if (!path) continue;
      index.tokenByImage[path] = token;
      const fileName = path.split('/').pop();
      if (fileName !== path) index.tokenByImage[fileName] = token;
    }

    const types = (token.wormholes || []).map(normalizeWormholeType).filter(Boolean);
    if (!types.length) continue;
    index.typesByToken[token.id] = types;
    if (types.length === 1) {
      const [type] = types;
      if (!candidates[type] || better(token, candidates[type])) candidates[type] = token;
    }
  }

  for (const [type, token] of Object.entries(candidates)) index.tokenByType[type] = token.id;
  return index;
}

/**
 * Used only when tokens.json cannot be loaded, so exports still name real bot tokens.
 */
const FALLBACK_TOKEN_GROUPS = [[
  ...['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'eta', 'zeta', 'kappa',
    'champion', 'probability', 'voyage', 'narrows']
    .map(type => ({ id: `wh${type}`, wormholes: [type] })),
  { id: 'custom_eronous_whiota', wormholes: ['iota'] },
  { id: 'custom_eronous_whtheta', wormholes: ['theta'] },
  { id: 'vortex', wormholes: ['vortex'] },
]];

/** @type {Promise<WormholeTokenIndex>|null} */
let indexPromise = null;

/**
 * Loads tokens.json once and returns the index for it.
 *
 * @returns {Promise<WormholeTokenIndex>}
 */
export function loadWormholeTokenIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    try {
      const basePath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

      const response = await fetch(`${basePath}public/data/tokens.json`);
      if (!response.ok) throw new Error(`Failed to load tokens.json: ${response.status}`);
      return buildWormholeTokenIndex(await response.json());
    } catch (error) {
      console.error('Failed to load wormhole tokens, using fallback:', error);
      indexPromise = null; // retry on the next call
      return buildWormholeTokenIndex(FALLBACK_TOKEN_GROUPS);
    }
  })();
  return indexPromise;
}
