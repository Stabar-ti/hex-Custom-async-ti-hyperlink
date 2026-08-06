/**
 * The picker's search language: parsing, matching, ranking, highlighting, sorting.
 *
 * The old search was a whitespace split AND-ed over one flat haystack. That worked for
 * "18" and "lodor" but made whole questions unaskable: ~200 tiles sit in the "Others"
 * source bucket with no button of their own, so "show me the Andcat tiles" had no
 * expression at all. It also silently lost alias search in the rewrite — `camelot` is
 * an alias of tile 18 and returned nothing.
 *
 * So: field prefixes (`tech:cybernetic`, `src:andcat`), `-` to negate, quotes to group,
 * and everything unprefixed still matching anywhere, exactly as before.
 *
 * No DOM — this module loads under node for tools/test-system-picker.js.
 */

import {
    COLUMNS, wormholesOf, techsOf, planetTypesOf,
    totalResources, totalInfluence, effectiveValue, anomaliesOf, sourceGroupOf
} from './pickerModel.js';

/** Prefixes accepted in a query. Anything else before a `:` is treated as literal text. */
export const QUERY_FIELDS = ['id', 'name', 'planet', 'tech', 'worm', 'src', 'alias'];

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Splits a raw query into terms.
 *
 *   parseQuery('tech:cybernetic -fow "new terra"')
 *     → { raw, terms: [ {field:'tech', value:'cybernetic', negated:false},
 *                       {field:null,   value:'fow',        negated:true},
 *                       {field:null,   value:'new terra',  negated:false} ] }
 *
 * Quotes group whitespace and may follow a prefix (`name:"new terra"`). A leading `-`
 * negates. An unknown prefix is not an error — `foo:bar` searches for the literal text
 * "foo:bar", so a user who types a colon by accident still gets sensible results.
 */
export function parseQuery(raw) {
    const text = (raw || '').trim();
    const terms = [];

    // One token = optional '-', optional 'field:', then either a quoted run or a bare run.
    const re = /(-?)(?:([a-z]+):)?(?:"([^"]*)"|(\S+))/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const [, neg, rawField, quoted, bare] = m;
        let field = rawField ? rawField.toLowerCase() : null;
        let value = quoted !== undefined ? quoted : (bare || '');

        // Unknown prefix: fold it back into the literal text rather than dropping it.
        if (field && !QUERY_FIELDS.includes(field)) {
            value = `${field}:${value}`;
            field = null;
        }

        value = value.trim().toLowerCase();
        if (!value) continue;
        terms.push({ field, value, negated: neg === '-' });
    }

    return { raw: text, terms };
}

export function isEmptyQuery(parsed) {
    return !parsed || parsed.terms.length === 0;
}

// ── Haystacks ─────────────────────────────────────────────────────────────────

// Memoized per system object. The picker re-filters on every keystroke over 671
// systems; rebuilding these strings each time is the difference between typing feeling
// instant and feeling laggy. Keyed by object identity, so a reloaded SystemInfo.json
// naturally invalidates.
const haystackCache = new WeakMap();

/**
 * The searchable text of a system, split by field plus a combined `all`.
 * Everything is pre-lowercased so matching is a plain `includes`.
 */
export function systemHaystacks(sys) {
    let h = haystackCache.get(sys);
    if (h) return h;

    const lower = v => String(v == null ? '' : v).toLowerCase();
    const planets = (sys.planets || []).map(p => lower(p.name)).filter(Boolean);
    const aliases = (Array.isArray(sys.aliases) ? sys.aliases : []).map(lower).filter(Boolean);
    const techs = techsOf(sys).map(lower);
    const worms = wormholesOf(sys).map(lower);

    h = {
        id: lower(sys.id),
        idDigits: lower(sys.id).replace(/\D/g, ''),
        name: lower(sys.name),
        planet: planets.join(' '),
        planets,
        alias: aliases.join(' '),
        aliases,
        tech: techs.join(' '),
        worm: worms.join(' '),
        src: lower(sys.source),
        all: ''
    };
    // `all` deliberately includes aliases — the old buildSearchHaystack did not, which
    // is why "camelot" found nothing despite being an alias of tile 18.
    h.all = [h.id, h.name, h.planet, h.alias, h.tech, h.worm, h.src].filter(Boolean).join(' ');

    haystackCache.set(sys, h);
    return h;
}

// ── Matching ──────────────────────────────────────────────────────────────────

function termHits(h, term) {
    if (term.field) return (h[term.field] || '').includes(term.value);

    // Unprefixed. A purely numeric token also matches digits embedded in the ID, so
    // "18" still finds tile "18" and searching "13" finds "d13" — carried over from
    // the old applySearchAndSort.
    if (/^\d+$/.test(term.value) && h.idDigits.includes(term.value)) return true;
    return h.all.includes(term.value);
}

/** True when a system satisfies every term (AND), honouring negation. */
export function matchesQuery(sys, parsed) {
    if (isEmptyQuery(parsed)) return true;
    const h = systemHaystacks(sys);
    return parsed.terms.every(term => termHits(h, term) !== term.negated);
}

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * How well a system answers the query; higher is better, 0 means "no match".
 *
 * Ordering intent: someone typing "18" wants tile 18 first, not tile 118 and not a
 * planet called "Primor 18". Exact identifiers beat prefixes, prefixes beat
 * substrings, and name beats the long tail of planet/tech/source text.
 */
export function scoreMatch(sys, parsed) {
    if (isEmptyQuery(parsed)) return 0;
    if (!matchesQuery(sys, parsed)) return 0;

    const h = systemHaystacks(sys);
    let score = 1; // matched at all

    for (const term of parsed.terms) {
        if (term.negated) continue;
        const v = term.value;

        if (h.id === v || h.idDigits === v) score += 100;
        else if (h.id.startsWith(v)) score += 60;
        else if (h.aliases.includes(v)) score += 50;
        else if (h.name === v) score += 45;
        else if (h.name.startsWith(v)) score += 30;
        else if (h.aliases.some(a => a.startsWith(v))) score += 20;
        else if (h.name.includes(v)) score += 15;
        else if (h.planets.some(p => p.startsWith(v))) score += 10;
        else if (h.planet.includes(v)) score += 6;
        else score += 1;
    }

    return score;
}

/** The literal strings to wrap in <mark>. Negated terms are excluded — they aren't there. */
export function highlightTokens(parsed) {
    if (isEmptyQuery(parsed)) return [];
    return parsed.terms.filter(t => !t.negated).map(t => t.value);
}

// ── Highlighting ──────────────────────────────────────────────────────────────

/** Escapes HTML so untrusted tile text can be mixed with <mark> via innerHTML. */
export function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Wraps every case-insensitive occurrence of any token in <mark>. Returns safe HTML. */
export function highlightMatches(text, tokens) {
    const safe = escapeHtml(text);
    if (!tokens || !tokens.length) return safe;
    const pattern = tokens
        .filter(Boolean)
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    if (!pattern) return safe;
    return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

// ── Sorting ───────────────────────────────────────────────────────────────────

const TYPE_PRIORITY = { CULTURAL: 1, INDUSTRIAL: 2, HAZARDOUS: 3, NEUTRAL: 4 };
const WORM_PRIORITY = { alpha: 1, beta: 2, gamma: 3, delta: 4 };
const TECH_PRIORITY = { WARFARE: 1, PROPULSION: 2, CYBERNETIC: 3, BIOTIC: 4 };
const ANOMALY_PRIORITY = { supernova: 1, gravity: 2, nebula: 3, asteroid: 4, scar: 5 };

function sum(list, fn) {
    return list.reduce((acc, x) => acc + fn(x), 0);
}

/**
 * The value a column sorts on. Returns an array compared lexicographically, so a
 * column can express "by count, then by type priority" without the old version's
 * duplicated if/else-per-case (uiFilters.js:352-550).
 */
function sortKey(sys, column, isUsed) {
    switch (column) {
        case 'id':        return [systemHaystacks(sys).id];
        case 'name':      return [systemHaystacks(sys).name];
        case 'planets': {
            const ps = sys.planets || [];
            return [ps.length, sum(ps, p => (p.resources || 0) + (p.influence || 0))];
        }
        case 'planetTypes': {
            const types = planetTypesOf(sys);
            return [types.size, sum(Array.from(types), t => TYPE_PRIORITY[t] || 5)];
        }
        case 'resources': return [totalResources(sys)];
        case 'influence': return [totalInfluence(sys)];
        case 'effective': return [effectiveValue(sys).total];
        case 'wormholes': {
            const ws = wormholesOf(sys);
            return [ws.length, sum(ws, w => WORM_PRIORITY[String(w).toLowerCase()] || 5)];
        }
        case 'tech': {
            const ts = techsOf(sys);
            return [ts.length, sum(ts, t => TECH_PRIORITY[String(t).toUpperCase()] || 5)];
        }
        case 'legendary': return [(sys.planets || []).some(p => p.legendaryAbilityName) ? 1 : 0];
        case 'anomalies': {
            const as = anomaliesOf(sys);
            return [as.length, sum(as, a => ANOMALY_PRIORITY[a.key] || 5)];
        }
        case 'fracture':  return [sys.tileBack === 'fracture' ? 1 : 0];
        case 'source':    return [sourceGroupOf(sys) || '', systemHaystacks(sys).src];
        case 'used':      return [isUsed && isUsed(sys.id) ? 1 : 0];
        default:          return null;
    }
}

function compareKeys(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i], y = b[i];
        if (x === y) continue;
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        return x < y ? -1 : 1;
    }
    return 0;
}

export const SORTABLE_COLUMNS = COLUMNS.filter(c => c.key !== 'tile').map(c => c.key);

/**
 * Sorts by column. Unknown columns return the list unchanged rather than throwing, and
 * ties fall back to the original index so the order never depends on object identity —
 * a re-render of the same result set must not shuffle rows under the user's cursor.
 */
export function sortSystems(list, column, direction, { isUsed } = {}) {
    if (!column) return list.slice();

    const decorated = list.map((sys, i) => ({ sys, i, key: sortKey(sys, column, isUsed) }));
    if (decorated.length && decorated[0].key === null) return list.slice();

    const sign = direction === 'desc' ? -1 : 1;
    decorated.sort((a, b) => {
        const r = compareKeys(a.key, b.key);
        return r !== 0 ? r * sign : a.i - b.i;
    });
    return decorated.map(d => d.sys);
}

/** Sorts by search relevance, then by the stable original order. */
export function sortByRelevance(list, parsed) {
    const decorated = list.map((sys, i) => ({ sys, i, score: scoreMatch(sys, parsed) }));
    decorated.sort((a, b) => (b.score - a.score) || (a.i - b.i));
    return decorated.map(d => d.sys);
}
