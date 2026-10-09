// @ts-check
/**
 * Which home system's slice each tile belongs to, on a map scored by distance.
 *
 * Slice Analysis used to give every home all the tiles within reach of it, so a tile two
 * steps from two homes was counted in both slices, and a map's slices added up to more
 * than the map. A Milty slice never shares a tile. So a tile now goes to the home nearest
 * to it. When two or more homes are equally near there is no fair way to pick, so it is
 * counted in each of them and marked as shared, and the analysis says so.
 *
 * No DOM — tools/test-milty-score.js loads this under node.
 */

/**
 * @param {Map<string, Record<string, number>>} distancesByHome
 *        home label -> the distances it reaches, label -> steps (the home itself at 0)
 * @param {{ exclude?: Set<string> }} [opts]  labels never in a slice, such as other homes
 * @returns {Map<string, {label: string, dist: number, sharedWith: string[]}[]>}
 *          home label -> its tiles, nearest first; `sharedWith` names the other homes a
 *          tile is equally near to
 */
export function assignSliceTiles(distancesByHome, { exclude = new Set() } = {}) {
    /** @type {Map<string, {dist: number, homes: string[]}>} */
    const nearest = new Map();
    for (const [home, distances] of distancesByHome) {
        for (const [label, dist] of Object.entries(distances)) {
            if (!(dist > 0) || exclude.has(label) || distancesByHome.has(label)) continue;
            const best = nearest.get(label);
            if (!best || dist < best.dist) nearest.set(label, { dist, homes: [home] });
            else if (dist === best.dist) best.homes.push(home);
        }
    }

    /** @type {Map<string, {label: string, dist: number, sharedWith: string[]}[]>} */
    const slices = new Map([...distancesByHome.keys()].map(h => [h, []]));
    for (const [label, { dist, homes }] of nearest) {
        for (const home of homes) {
            slices.get(home)?.push({ label, dist, sharedWith: homes.filter(h => h !== home) });
        }
    }
    for (const tiles of slices.values()) {
        tiles.sort((a, b) => a.dist - b.dist || a.label.localeCompare(b.label, undefined, { numeric: true }));
    }
    return slices;
}
