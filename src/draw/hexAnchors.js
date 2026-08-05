/**
 * Shared geometry and naming for things drawn on top of a hex.
 *
 * The planet anchor formula was copy-pasted between realIDsOverlays.js (planet type circles,
 * res/inf text) and tokenOverlay.js (whose comment noted it "mirrors drawPlanetTypeLayer").
 * Every overlay that wants to sit on a planet rather than the hex centre needs the same
 * positions, so they live here once.
 */

/** Planet slot angles, in draw order: up, right, left. A 4th+ planet reuses the cycle. */
const PLANET_ANGLES_DEG = [-90, 0, 180];

/** Distance in from the hex edge at which planet markers sit. */
const PLANET_INSET = 17;

/**
 * Centre point of the planet marker for `index` on `hex`, in SVG coordinates.
 * Returns null when the hex has no centre yet (before the grid is drawn).
 */
export function planetAnchor(hex, index, hexRadius) {
    if (!hex?.center) return null;
    const theta = PLANET_ANGLES_DEG[index % PLANET_ANGLES_DEG.length] * Math.PI / 180;
    const r = hexRadius - PLANET_INSET;
    return {
        x: hex.center.x + r * Math.cos(theta),
        y: hex.center.y + r * Math.sin(theta)
    };
}

/**
 * The name to show for a planet. Real systems carry `name`; hand-built ones may only have
 * an id, and a blank slot falls back to its 1-based position.
 */
export function planetDisplayName(planet, index) {
    return planet?.name || planet?.planetID || planet?.id || `Planet ${index + 1}`;
}
