/**
 * Tests for the Milty value of a tile and a slice, slice ownership, and the value overlay's
 * tiers.
 *
 *   node tools/test-milty-score.js      (or: npm test)
 *
 * miltyScore.js replaced three copies of the Milty slice score — the generator's, the home
 * overlay's and the AutoMapper's — which had drifted apart in their weights and in what
 * they counted. The load-bearing checks here are the decomposition (a slice's score is its
 * tiles' values plus the two slice-only terms, exactly) and the reading of the real data:
 * the AutoMapper's copy never counted a tech skip because it read a field no planet has.
 *
 * Everything imported here is DOM-free, so it loads straight into node.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    DEFAULT_WEIGHTS, getWeights, setWeights, resetWeights, subscribeWeights, __resetForTest,
    biasedWeights, flexWeightOf, tileScore, sliceScore, hexAsTile, isTradeStation,
} from '../src/modules/Milty/miltyScore.js';
import { assignSliceTiles } from '../src/features/sliceOwnership.js';
import { buildValueTiers, getFactors } from '../src/features/valueOverlay.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

const close = (a, b) => Math.abs(a - b) < 1e-9;
const W = { ...DEFAULT_WEIGHTS };

const here = dirname(fileURLToPath(import.meta.url));
const systems = JSON.parse(readFileSync(join(here, '..', 'public', 'data', 'SystemInfo.json'), 'utf8')).systems;
const byId = new Map(systems.map(s => [String(s.id), s]));

// ── 1. Optimal R / I / F ─────────────────────────────────────────────────────

{
    // The example the split was defined by: 2/1, 1/2 and 1/1 are R/I/F 2/2/1.
    const t = tileScore({ planets: [
        { resources: 2, influence: 1 }, { resources: 1, influence: 2 }, { resources: 1, influence: 1 },
    ] }, W);
    check('a 2/1, a 1/2 and a 1/1 are R/I/F 2/2/1',
        t.parts.r === 2 && t.parts.i === 2 && t.parts.flex === 1, JSON.stringify(t.parts));
    check('and are worth 2 R + 2 I + 1 flex at the default weights',
        close(t.value, 2 * W.resourceValue + 2 * W.influenceValue + flexWeightOf(W)), String(t.value));

    // The raw-total score counted a 2/2 as 2 R AND 2 I. Optimally it is 2 of one or the other.
    const flex = tileScore({ planets: [{ resources: 2, influence: 2 }] }, W);
    check('a 2/2 is 2 flex', flex.parts.flex === 2 && flex.parts.r === 0 && flex.parts.i === 0);
    check('worth the average of the R and I weights per point, not both',
        close(flex.value, 2 * (W.resourceValue + W.influenceValue) / 2), String(flex.value));
}

// ── 2. Every other term ──────────────────────────────────────────────────────

{
    const one = extra => tileScore({ planets: [{ resources: 0, influence: 0, ...extra }] }, W).value;
    check('a tech skip is worth techSpecialty', close(one({ techSpecialties: ['BIOTIC'] }), W.techSpecialty));
    check('unit and non-unit skips count as skips',
        close(one({ techSpecialties: ['UNITSKIP'] }), W.techSpecialty));
    check('a legendary planet is worth legendaryPlanet',
        close(one({ name: 'Primor', legendaryAbilityName: 'x' }), W.legendaryPlanet));
    check('Industrex and Emelpar carry their own weights',
        close(one({ name: 'Industrex', legendaryAbilityName: 'x' }), W.legendaryIndustrex)
        && close(one({ name: 'Emelpar', legendaryAbilityName: 'x' }), W.legendaryEmelpar));
    check('a planet trait is worth its weight', close(one({ planetType: 'CULTURAL' }), W.cultural));
    check('a trade station is worth tradeStation', close(one({ name: 'Tsion Station' }), W.tradeStation));

    const sys = extra => tileScore({ planets: [], ...extra }, W).value;
    check('a plain empty tile is worth 0', sys({}) === 0);
    check('a scar is worth entropicScar', close(sys({ isScar: true }), W.entropicScar));
    check('a supernova takes supernova away', close(sys({ isSupernova: true }), W.supernova));
    check('a wormhole is worth wormhole', close(sys({ wormholes: ['ALPHA'] }), W.wormhole));
    check('a gamma wormhole is worth gammaWormhole', close(sys({ wormholes: ['GAMMA'] }), W.gammaWormhole));

    // A tile with planets and an anomaly adds the anomaly to its planets.
    const rift = tileScore({ planets: [{ resources: 2, influence: 0 }], isGravityRift: true }, W);
    check('a planet tile with a rift is its planets plus the rift',
        close(rift.value, 2 * W.resourceValue + W.gravityRift), String(rift.value));

    // The terms are what the pool view shows; they must add up to the value.
    let bad = 0;
    for (const s of systems) {
        const t = tileScore(s, W);
        if (!close(Object.values(t.terms).reduce((a, b) => a + b, 0), t.value)) bad++;
    }
    check('on every real tile, the terms add up to the value', bad === 0, `${bad} tiles`);
}

// ── 3. Reading the real data ─────────────────────────────────────────────────

{
    // The AutoMapper's copy read p.techSpecialty; the data only has techSpecialties.
    const withSkips = systems.filter(s => (s.planets || []).some(p => p.techSpecialties?.length));
    check('the data has tiles with tech skips', withSkips.length > 20, String(withSkips.length));
    check('every one of them scores its skips',
        withSkips.every(s => tileScore(s, W).parts.tech > 0));

    // Tsion Station and Oluz Station are trade stations; the home overlay's copy did not
    // think so, the generator's did.
    for (const id of ['109', '111']) {
        const s = byId.get(id);
        check(`tile ${id} (${s?.planets?.[0]?.name}) has a trade station`,
            !!s && s.planets.some(isTradeStation) && tileScore(s, W).parts.stations === 1);
    }
}

// ── 4. The slice score is its tiles plus two slice-only terms ────────────────

{
    const tiles = ['26', '25', '64', '34', '72'].map(id => byId.get(id)).filter(Boolean);
    check('five sample tiles found', tiles.length === 5);
    const s = sliceScore(tiles, W);
    const tileSum = tiles.reduce((a, t) => a + tileScore(t, W).value, 0);
    check('a slice\'s tile total is its tiles\' values added up', close(s.tileTotal, tileSum));
    check('the score is the tile total plus the imbalance and planet-count terms',
        close(s.score, tileSum + s.imbalanceTerm + s.planetCountTerm));

    // Imbalance is measured after flex has been spent to close the gap.
    const lopsided = sliceScore([
        { planets: [{ resources: 5, influence: 0 }] },
        { planets: [{ resources: 0, influence: 2 }] },
        { planets: [{ resources: 2, influence: 2 }] },
    ], W);
    check('flex closes the R/I gap first: 5 R, 2 I and 2 flex is 1 out',
        lopsided.imbalance === 1, String(lopsided.imbalance));
    const covered = sliceScore([{ planets: [{ resources: 3, influence: 0 }] }, { planets: [{ resources: 4, influence: 4 }] }], W);
    check('flex larger than the gap leaves no imbalance', covered.imbalance === 0);

    // A lopsided tile is not charged for its imbalance on its own.
    check('a 3/0 tile carries no imbalance penalty',
        close(tileScore({ planets: [{ resources: 3, influence: 0 }] }, W).value, 3 * W.resourceValue));

    check('fewer than 3 planets costs lowPlanetCount',
        sliceScore([{ planets: [{ resources: 1, influence: 1 }] }], W).planetCountTerm === W.lowPlanetCount);
    const six = Array.from({ length: 6 }, () => ({ planets: [{ resources: 1, influence: 1 }] }));
    check('more than 5 planets costs highPlanetCount', sliceScore(six, W).planetCountTerm === W.highPlanetCount);
    check('3 to 5 planets costs nothing',
        sliceScore(six.slice(0, 4), W).planetCountTerm === 0);

    check('optimal resources count flex half, as the Milty limits always have',
        close(lopsided.optimalResources, 5 + 1) && close(lopsided.optimalInfluence, 2 + 1));
}

// ── 5. A map hex as a tile ───────────────────────────────────────────────────

{
    const planets = [{ resources: 2, influence: 0 }];
    const plain = hexAsTile({ planets, wormholes: new Set(), effects: new Set(), systemTokens: [] });
    check('a plain hex has no anomaly', !plain.isNebula && !plain.isGravityRift && !plain.isScar);
    check('a painted rift is a rift', hexAsTile({ planets, effects: new Set(['rift']) }).isGravityRift);
    // The AutoMapper draws an anomaly it had no tile for as a token.
    check('an anomaly token is the anomaly', hexAsTile({ planets, systemTokens: ['entropicscar'] }).isScar);
    check('a tile\'s own anomaly counts', hexAsTile({ planets }, { isNebula: true }).isNebula);
    check('a hex\'s wormholes are the tile\'s', hexAsTile({ planets, wormholes: new Set(['gamma']) }).wormholes[0] === 'gamma');
    check('and score like a system\'s',
        close(tileScore(hexAsTile({ planets, wormholes: new Set(['gamma']) }), W).value,
            2 * W.resourceValue + W.gammaWormhole));
}

// ── 6. The weight store ──────────────────────────────────────────────────────

{
    __resetForTest();
    let heard = null;
    const off = subscribeWeights(w => { heard = w; });
    setWeights({ ...getWeights(), entropicScar: 4, notAWeight: 99 });
    check('setWeights changes a weight', getWeights().entropicScar === 4);
    check('and ignores keys that are not weights', !('notAWeight' in getWeights()));
    check('listeners hear the change', heard?.entropicScar === 4);
    setWeights({ ...getWeights(), nebula: 'abc' });
    check('a non-number keeps the old value', getWeights().nebula === DEFAULT_WEIGHTS.nebula);
    off();
    resetWeights();
    check('resetWeights puts the defaults back', getWeights().entropicScar === DEFAULT_WEIGHTS.entropicScar);
    check('an unsubscribed listener hears nothing more', heard?.entropicScar === 4);
    check('getWeights returns a copy', (() => { const w = getWeights(); w.nebula = 50; return getWeights().nebula !== 50; })());
    __resetForTest();

    // The R / I / T bias scales the matching weights, relative to 1 · 1 · 2.
    const b = biasedWeights(W, getFactors(true, false, true));
    check('the R bias scales the resource weight', close(b.resourceValue, W.resourceValue * 1.6));
    check('and lowers the influence weight', close(b.influenceValue, W.influenceValue * 0.6));
    check('the T bias scales the tech weight', close(b.techSpecialty, W.techSpecialty * 3.5 / 2));
    check('unbiased, the weights are unchanged', JSON.stringify(biasedWeights(W, getFactors(false, false, false))) === JSON.stringify(W));
}

// ── 7. Slice ownership ───────────────────────────────────────────────────────

{
    const d = new Map([
        ['H1', { H1: 0, a: 1, b: 2, shared: 2, far: 3 }],
        ['H2', { H2: 0, b: 1, shared: 2, c: 1, H1: 4 }],
    ]);
    const slices = assignSliceTiles(d);
    const labels = h => slices.get(h).map(t => t.label);
    check('a tile goes to its nearest home', labels('H1').includes('a') && !labels('H2').includes('a'));
    check('b is nearer H2, so it is only in H2', labels('H2').includes('b') && !labels('H1').includes('b'));
    check('an equally near tile is in both', labels('H1').includes('shared') && labels('H2').includes('shared'));
    check('and names the other home',
        slices.get('H1').find(t => t.label === 'shared').sharedWith[0] === 'H2');
    check('an unshared tile names nobody', slices.get('H1').find(t => t.label === 'a').sharedWith.length === 0);
    check('a home is never in another home\'s slice', !labels('H2').includes('H1'));
    check('a home is not in its own slice', !labels('H1').includes('H1'));
    check('exclude keeps a tile out', !assignSliceTiles(d, { exclude: new Set(['a']) }).get('H1').some(t => t.label === 'a'));
    check('tiles are listed nearest first', slices.get('H1')[0].dist === 1);
}

// ── 8. The value overlay's tiers ─────────────────────────────────────────────

{
    // Placed tiles on a fake map: the overlay reads hex.realId through sectorIDLookup.
    const placed = {
        hyper: { id: 'hl1', isHyperlane: true, planets: [] },
        empty1: { id: 'e1', planets: [] },
        empty2: { id: 'e2', planets: [] },
        scar: { id: 's1', planets: [], isScar: true },
        nova: { id: 'n1', planets: [], isSupernova: true },
        worm: { id: 'w1', planets: [], wormholes: ['ALPHA'] },
        p1: { id: 'p1', planets: [{ resources: 1, influence: 0 }] },
        p2: { id: 'p2', planets: [{ resources: 3, influence: 0 }] },
        p3: { id: 'p3', planets: [{ resources: 3, influence: 0 }] },
    };
    const hexes = {}, lookup = {};
    for (const [label, sys] of Object.entries(placed)) {
        hexes[label] = { realId: sys.id };
        lookup[sys.id.toUpperCase()] = sys;
    }
    const tiers = buildValueTiers({ hexes, sectorIDLookup: lookup }, getFactors(false, false, false));
    check('a hyperlane gets no tier', !tiers.has('hyper'));
    check('a plain empty system gets no tier', !tiers.has('empty1') && !tiers.has('empty2'));
    check('a scar is ranked', tiers.has('scar'));
    check('a wormhole is ranked', tiers.has('worm'));
    check('a supernova is ranked, below the scar',
        tiers.get('nova')?.tier === 1 && tiers.get('scar')?.tier === 5, JSON.stringify([...tiers]));
    check('identical planet tiles share a tier', tiers.get('p2')?.tier === tiers.get('p3')?.tier);
    check('planet tiles are ranked among themselves', tiers.get('p1')?.tier === 1 && tiers.get('p2')?.tier === 5);
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\nmilty score: ${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\nFailures:\n' + failures.map(f => `  ✗ ${f}`).join('\n') + '\n');
    process.exit(1);
}
