// @ts-check
/**
 * A floating panel of tools that arm a map mode: Wormholes, Custom Links, Border Anomalies.
 *
 * These three put their controls in the inspector, while every other rail tool with a set
 * of controls — System Tiles, Value hints, the AutoMapper — opened a window. And each of
 * the three had its own copy of "press again to close", two of them broken the same way:
 * the rail button disarmed every mode before asking whether its panel was showing, and
 * disarming had just taken the panel down, so the answer was always no and it was built
 * again. Border Anomalies loads its types first, so it vanished for a moment; Custom Links
 * rebuilt in the same frame and looked as if it never closed.
 *
 * So the behaviour is here, once:
 *
 *   - The rail button opens the panel and closes it. Opening arms nothing, and puts down
 *     whatever was armed, as opening Value hints or the AutoMapper does.
 *   - A button inside marked `data-tool` arms a mode. Arming one disarms every other mode
 *     first, so one thing at a time answers a map click.
 *   - Right-click, Escape, arming another tool and closing the panel all disarm it — by
 *     clicking its lit tool buttons, so each runs its own turning-off (a half-picked hex
 *     put back, a pending edge forgotten), the same as disarmAll does everywhere else.
 *     The panel itself stays open: it is a palette, and you pick from it again.
 *   - The rail button is lit only while one of the panel's tools is armed, so a lit rail
 *     button always means "the next map click does this". It carries `data-launcher`,
 *     which disarmAll skips: clicking it would close the panel, not disarm the tool.
 *
 * The panel opens beside the rail the first time, not centred over the map: these are
 * "pick, then click hexes" tools, and the hexes are what a centred window covered. That
 * was why they had moved into the inspector. After a drag it reopens where it was left.
 */

import { showPopup, hidePopup, isPopupOpen } from './popupUI.js';
import { registerMode, activateMode, deactivateMode, deactivateModes } from '../core/registry.js';

/**
 * Make `mode` the only armed thing. Call it before setting the editor's mode, since
 * disarming the others sets it to none.
 *
 * Registered modes are disarmed through the registry. Rail tools that are only a lit
 * button and an editor mode (Hyperlanes, the paint buttons) are not registered, so
 * activateMode cannot reach them; pressed, they put themselves down.
 *
 * @param {string} mode
 */
export function armExclusively(mode) {
    document.querySelectorAll('#toolRail .mode-button.active:not([data-launcher])')
        .forEach(btn => /** @type {HTMLElement} */ (btn).click());
    activateMode(mode);
}

/**
 * @typedef {object} ToolPanelOptions
 * @property {string} id          popup id
 * @property {string} title
 * @property {string} mode        registry mode id
 * @property {string} launcherId  id of the rail button that opens it
 * @property {() => HTMLElement | Promise<HTMLElement>} build  the panel's content, built fresh each time it opens
 * @property {() => void} [onHelp] what the title bar's ? opens
 * @property {string} [accent]    CSS colour for the frame's top edge
 * @property {string} [width]
 */

/**
 * @param {ToolPanelOptions} opts
 * @returns {{ toggle: () => void, isOpen: () => boolean }}
 */
export function createToolPanel({ id, title, mode, launcherId, build, onHelp, accent, width = '300px' }) {
    /** @type {HTMLElement|null} */
    let popup = null;
    // While the content is still being built (Border Anomalies loads its types first, which
    // can take a second on a cold start): a second press means "never mind", not "again".
    let opening = false;
    let cancelled = false;

    // Read from the element rather than looked up by id: by the time a popup's onClose
    // runs, hidePopup has already taken it out of the document.
    const litTools = () => /** @type {HTMLElement[]} */ (
        popup ? [...popup.querySelectorAll('[data-tool].active')] : []
    );

    const syncLauncher = () => {
        document.getElementById(launcherId)?.classList.toggle('active', litTools().length > 0);
    };

    const disarm = () => {
        litTools().forEach(btn => btn.click());
        syncLauncher();
    };

    registerMode(mode, { deactivate: disarm });

    /** Beside the rail, level with the button that opened it. */
    const besideRail = () => {
        const rail = document.getElementById('toolRail')?.getBoundingClientRect();
        const launcher = document.getElementById(launcherId)?.getBoundingClientRect();
        if (!rail || !launcher) return {};
        return {
            left: Math.round(rail.right + 8) + 'px',
            top: Math.round(Math.min(launcher.top, window.innerHeight - 360)) + 'px',
        };
    };

    const open = async () => {
        opening = true;
        cancelled = false;
        try {
            deactivateModes();
            const content = await build();
            if (cancelled) return;

            // Capture, so it runs before the tool's own handler sets the editor's mode:
            // disarming the others afterwards would set it straight back to none.
            content.addEventListener('click', (ev) => {
                const tool = /** @type {HTMLElement|null} */ (ev.target)?.closest?.('[data-tool]');
                if (tool && !tool.classList.contains('active')) armExclusively(mode);
            }, true);
            // And after it, to light or put out the rail button.
            content.addEventListener('click', () => {
                if (!litTools().length) deactivateMode(mode);
                syncLauncher();
            });

            popup = showPopup({
                id,
                title,
                content,
                draggable: true,
                dragHandleSelector: '.popup-ui-titlebar',
                scalable: true,
                rememberPosition: true,
                showHelp: !!onHelp,
                onHelp,
                className: 'tool-panel',
                style: {
                    width,
                    ...(accent ? { border: `2px solid ${accent}` } : {}),
                    ...besideRail(),
                },
                onClose: () => {
                    disarm();
                    popup = null;
                    // Nothing armed from it any more, so nothing left to light.
                    document.getElementById(launcherId)?.classList.remove('active');
                },
            });
        } finally {
            opening = false;
        }
    };

    return {
        toggle: () => {
            if (opening) cancelled = !cancelled;     // and a third press means "yes, open it"
            else if (isPopupOpen(id)) hidePopup(id);
            else open();
        },
        isOpen: () => isPopupOpen(id),
    };
}
