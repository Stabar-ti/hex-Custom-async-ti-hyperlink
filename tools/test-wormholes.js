/**
 * Tests how the editor reads wormholes from the bot's data, run against the real
 * src/constants/constants.js, src/data/wormholeTokens.js and public/data.
 *
 *   node tools/test-wormholes.js      (or: npm test)
 *
 * The bot only takes a wormhole from the `wormholes` field of a tile, token or
 * attachment JSON, never from a file name or id (its COMPONENT_RULES.md). The editor
 * follows the same rule, so what is asserted here is that:
 *   - every wormhole the synced data declares has a display entry, under one key,
 *     whichever spelling the data uses (the bot renamed CUSTOM_ERONOUS_WHIOTA to IOTA
 *     and WHNARROWS to NARROWS, and still accepts the old names);
 *   - every wormhole a token carries can be exported as a token and comes back as the
 *     same wormhole on import;
 *   - a renamed token image still resolves, through `legacyImagePaths`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { wormholeTypes, normalizeWormholeType, wormholeInfo } from '../src/constants/constants.js';
import { buildWormholeTokenIndex } from '../src/data/wormholeTokens.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'public', 'data');
const readJson = name => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// ── 1. Spellings ──────────────────────────────────────────────────────────────

{
    const cases = [
        ['ALPHA', 'alpha'],
        ['alpha', 'alpha'],
        ['CUSTOM_ERONOUS_WHIOTA', 'iota'],
        ['CUSTOM_ERONOUS_WHEPSILON', 'epsilon'],
        ['WHNARROWS', 'narrows'],
        ['WHCHAMPION', 'champion'],
        ['CHAMPION', 'champion'],
        ['OMEGA', 'omega'],
        ['VORTEX', 'vortex'],
        ['null', ''],
        ['', ''],
        [null, ''],
        // Unknown types are kept, so a wormhole added upstream still links to itself.
        ['ZORBLAX', 'zorblax'],
        // A 'wh' prefix only goes when what is left is a known type.
        ['WHZORBLAX', 'whzorblax'],
    ];
    for (const [raw, want] of cases) {
        const got = normalizeWormholeType(raw);
        check(`normalizeWormholeType(${JSON.stringify(raw)})`, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }

    const symbols = Object.values(wormholeTypes).map(t => t.symbol);
    const dupes = symbols.filter((s, i) => symbols.indexOf(s) !== i);
    check('every wormhole symbol is unique', dupes.length === 0, `duplicates: ${dupes.join(', ')}`);
    check('every wormhole type has label, color and symbol',
        Object.values(wormholeTypes).every(t => t.label && t.color && t.symbol));

    check('a legacy spelling gets the canonical display', wormholeInfo('CUSTOM_ERONOUS_WHIOTA') === wormholeTypes.iota);
    const unknown = wormholeInfo('ZORBLAX');
    check('an unknown type gets a grey fallback badge',
        unknown.color === 'gray' && unknown.symbol === 'Z' && unknown.label === 'Zorblax', JSON.stringify(unknown));
}

// ── 2. Every wormhole in the synced data has a display entry ──────────────────

const tokenGroups = readJson('tokens.json');
const systems = readJson('SystemInfo.json').systems;
const attachments = readJson('attachments.json').flat();

{
    const declared = new Map(); // editor key -> where it was seen
    const note = (raw, where) => {
        const key = normalizeWormholeType(raw);
        if (key && !declared.has(key)) declared.set(key, where);
    };
    for (const sys of systems) for (const w of sys.wormholes || []) note(w, `system ${sys.id}`);
    for (const t of tokenGroups.flat()) for (const w of t.wormholes || []) note(w, `token ${t.id}`);
    for (const a of attachments) for (const w of a.wormholes || []) note(w, `attachment ${a.id}`);

    const missing = [...declared].filter(([key]) => !(key in wormholeTypes));
    check('every wormhole in public/data has a wormholeTypes entry', missing.length === 0,
        missing.map(([k, where]) => `${k} (${where})`).join(', '));
    check('the data declares wormholes at all', declared.size >= 10, `got ${declared.size}`);
}

// ── 3. Real tokens.json: export and import agree ──────────────────────────────

{
    const index = buildWormholeTokenIndex(tokenGroups);
    const carried = new Set(Object.values(index.typesByToken).flat());

    for (const type of carried) {
        const token = index.tokenByType[type];
        check(`${type} exports as a token`, !!token);
        if (token) {
            check(`${type} round-trips through ${token}`, index.typesByToken[token]?.includes(type),
                `got ${JSON.stringify(index.typesByToken[token])}`);
        }
    }

    // The plain token, not Creuss or Ion Storm.
    check('alpha exports as whalpha', index.tokenByType.alpha === 'whalpha', `got ${index.tokenByType.alpha}`);
    check('beta exports as whbeta', index.tokenByType.beta === 'whbeta', `got ${index.tokenByType.beta}`);
    check('a Creuss token still imports as its wormhole',
        index.typesByToken.creussalpha?.includes('alpha'), JSON.stringify(index.typesByToken.creussalpha));
    check('tokens resolve by image file name', index.tokenByImage['token_whalpha.png']?.id === 'whalpha');
}

// ── 4. The bot's new data shape ───────────────────────────────────────────────
//
// Shaped like the bot after the wormhole rework: canonical names, a renamed image kept
// in legacyImagePaths, and the thirteen new single-wormhole tokens.

{
    const NEW = ['mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
    const fixture = [
        [
            { id: 'creussalpha', imagePath: 'token_creussalpha.png', wormholes: ['ALPHA'] },
            { id: 'ionalpha', imagePath: 'token_ionalpha.png', wormholes: ['ALPHA'] },
            { id: 'whalpha', imagePath: 'token_whalpha.png', wormholes: ['ALPHA'] },
        ],
        [
            { id: 'whzeta', imagePath: 'token_custom_eronous_whzeta.png', legacyImagePaths: ['token_whzeta.png'], wormholes: ['ZETA'] },
            { id: 'whchampion', imagePath: 'token_whchampion.png', wormholes: ['CHAMPION'] },
            { id: 'sigma_lamdba_wormhole', imagePath: 'token_sigma_lambda.png', wormholes: ['LAMBDA'] },
            { id: 'twin', imagePath: 'token_twin.png', wormholes: ['ALPHA', 'BETA'] },
            ...NEW.map(w => ({ id: `wh${w}`, imagePath: `token_wh${w}.png`, wormholes: [w.toUpperCase()] })),
        ],
    ];
    const index = buildWormholeTokenIndex(fixture);

    for (const w of NEW) {
        check(`new wormhole ${w} has a display entry`, w in wormholeTypes);
        check(`new wormhole ${w} exports as wh${w}`, index.tokenByType[w] === `wh${w}`, `got ${index.tokenByType[w]}`);
    }
    check('lambda exports as the Sigma token', index.tokenByType.lambda === 'sigma_lamdba_wormhole');
    check('the shortest id wins among tokens carrying the same wormhole',
        index.tokenByType.alpha === 'whalpha', `got ${index.tokenByType.alpha}`);
    check('a token carrying two wormholes imports as both',
        JSON.stringify(index.typesByToken.twin) === '["alpha","beta"]', JSON.stringify(index.typesByToken.twin));
    check('a two-wormhole token is never what a single type exports as',
        !Object.values(index.tokenByType).includes('twin'));
    check('a renamed image still resolves through legacyImagePaths',
        index.tokenByImage['token_whzeta.png']?.id === 'whzeta');
    check('the current image resolves too',
        index.tokenByImage['token_custom_eronous_whzeta.png']?.id === 'whzeta');
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nwormholes: ${passed} checks passed, ${failures.length} failed ` +
    `(${Object.keys(wormholeTypes).length} wormhole types, ${systems.length} systems)`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
