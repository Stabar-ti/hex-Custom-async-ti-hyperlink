// ───────────────────────────────────────────────────────────────
// data/wormholeTokens.js
//
// Which tokens are wormholes, read only from the `wormholes` field of
// tokens.json — the same rule the bot follows (COMPONENT_RULES.md,
// "Never detect a wormhole from a file name or id"). Used by the
// mapInfo import (token -> wormholes) and by both exports
// (wormhole -> the token to place).
// ───────────────────────────────────────────────────────────────

import {
  normalizeWormholeType, parseWormholeKey, wormholeTokenId, ONE_WAY_WORMHOLE_DIRS
} from '../constants/constants.js';

/**
 * A one-way wormhole token. The bot generates these (Mapper.oneWayWormholeTokens); they are
 * in no JSON file and have no image on disk, so the editor derives them by the same rule.
 *
 * Directions as in constants.js ONE_WAY_WORMHOLE_DIRS. On a hex the wormhole is stored as
 * 'type:dir' among the custom wormholes (wormholeKey).
 *
 * @typedef {Object} OneWayWormholeToken
 * @property {string} id         e.g. 'whalpha_in'
 * @property {string} type       editor wormhole key, e.g. 'alpha'
 * @property {'in'|'out'} dir
 * @property {string} imagePath  the bot's stored token name, e.g. 'token_oneway_whalpha_in.png'
 * @property {string} baseId     the plain token it is made from, e.g. 'whalpha'
 * @property {string} baseImage  that token's image, to draw it with
 */

/**
 * @typedef {Object} WormholeTokenIndex
 * @property {Record<string, string[]>} typesByToken  token id -> wormhole types it carries
 * @property {Record<string, string>}   tokenByType   wormhole type -> token id to export it as
 * @property {Record<string, Object>}   tokenByImage  image file name (incl. legacyImagePaths) -> token, for every token
 * @property {Record<string, OneWayWormholeToken>} oneWayByToken  one-way token id AND image name (lowercase) -> token
 * @property {Record<string, {in: string, out: string}>} oneWayByType  wormhole type -> its one-way token ids
 */

/**
 * The one-way token for a token id or stored image name (`whalpha_in`,
 * `token_oneway_whalpha_in.png`, any case), or null.
 *
 * @param {WormholeTokenIndex} index
 * @param {string} name
 * @returns {OneWayWormholeToken|null}
 */
export function resolveOneWayToken(index, name) {
  if (!name) return null;
  const key = String(name).split('/').pop().toLowerCase();
  return index?.oneWayByToken?.[key] || null;
}

/**
 * The one-way token id that places `type` in direction `dir`, or null when the bot has none
 * for that type (Creuss, Ion Storm and Vortex wormholes have no plain token).
 *
 * @param {WormholeTokenIndex} index
 * @param {string} type
 * @param {'in'|'out'} dir
 */
export function oneWayTokenId(index, type, dir) {
  return index?.oneWayByType?.[normalizeWormholeType(type)]?.[dir] || null;
}

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
  const index = { typesByToken: {}, tokenByType: {}, tokenByImage: {}, oneWayByToken: {}, oneWayByType: {} };
  const better = (a, b) => a.id.length !== b.id.length ? a.id.length < b.id.length : a.id < b.id;
  const candidates = {};

  for (const token of (tokenGroups || []).flat()) {
    if (!token?.id) continue;
    addOneWayTokens(index, token);

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
 * Adds the entry-only and exit-only tokens the bot generates from `token`, if it is the
 * plain token of its type: its id is the type's bot token id (`whalpha`, `whgamma` — not
 * `gamma`, `creussalpha` or `ionalpha`), it carries that one wormhole, and it merges into
 * the wormhole icon. Mirrors Mapper.plainWormholeTokens / Mapper.oneWayToken.
 */
function addOneWayTokens(index, token) {
  const types = (token.wormholes || []).map(normalizeWormholeType).filter(Boolean);
  if (types.length !== 1 || token.wormholeIconMerge === false) return;
  const [type] = types;
  if (token.id !== wormholeTokenId(type)) return;

  index.oneWayByType[type] = { in: `${token.id}_in`, out: `${token.id}_out` };
  for (const dir of ONE_WAY_WORMHOLE_DIRS) {
    const id = `${token.id}_${dir}`;
    /** @type {OneWayWormholeToken} */
    const entry = {
      id, type, dir,
      imagePath: `token_oneway_${id}.png`,
      baseId: token.id,
      baseImage: token.imagePath || '',
    };
    index.oneWayByToken[id] = entry;
    index.oneWayByToken[entry.imagePath] = entry;
  }
}

/**
 * The token ids that place a hex's user-added wormholes: the plain token for a two-way
 * custom wormhole (`whalpha`) and the one-way token for a one-way one (`alpha:in` →
 * `whalpha_in`). Inherent wormholes come with the tile and are never listed.
 *
 * @param {WormholeTokenIndex} index
 * @param {{customWormholes?: Iterable<string>}} hex
 * @returns {{tokens: string[], missing: string[]}}  `missing`: wormholes with no token to place them
 */
export function wormholeTokensForHex(index, hex) {
  const tokens = [];
  const missing = [];
  for (const raw of hex?.customWormholes || []) {
    const { type, dir } = parseWormholeKey(raw);
    const token = dir ? oneWayTokenId(index, type, dir) : index?.tokenByType?.[type];
    if (token) tokens.push(token);
    else missing.push(String(raw));
  }
  return { tokens, missing };
}

/**
 * The wormhole key a token places, for the mapInfo import: 'alpha:in' for a one-way token
 * (by id or stored image name), the plain types for any other wormhole token, or null when
 * the token is not a wormhole.
 *
 * @param {WormholeTokenIndex} index
 * @param {string} name  token id or image file name
 * @returns {string[]|null}
 */
export function wormholeKeysForToken(index, name) {
  const oneWay = resolveOneWayToken(index, name);
  if (oneWay) return [`${oneWay.type}:${oneWay.dir}`];
  const fileName = String(name || '').split('/').pop();
  const token = index?.tokenByImage?.[fileName];
  const id = token?.id || name;
  return index?.typesByToken?.[id] || null;
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
/** @type {WormholeTokenIndex|null} the index once tokens.json has loaded */
let loadedIndex = null;

/**
 * The index if tokens.json has already loaded, else null. For synchronous callers (lore
 * validation) that can do without it until then.
 *
 * @returns {WormholeTokenIndex|null}
 */
export function getLoadedWormholeTokenIndex() {
  return loadedIndex;
}

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
      loadedIndex = buildWormholeTokenIndex(await response.json());
      return loadedIndex;
    } catch (error) {
      console.error('Failed to load wormhole tokens, using fallback:', error);
      indexPromise = null; // retry on the next call
      return buildWormholeTokenIndex(FALLBACK_TOKEN_GROUPS);
    }
  })();
  return indexPromise;
}
