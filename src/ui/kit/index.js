// @ts-check
/**
 * The UI kit's public surface. Import from here rather than the individual files:
 *
 *     import { panelButton, checkbox, stack, section } from '../ui/kit/index.js';
 *
 * See el.js for what the kit is for and what it deliberately does not cover.
 */

export {
    el, apply, append, setActive,
} from './el.js';

export {
    button, panelButton, buttonRow,
    checkbox, field, select,
    stack, row, section, separator, note,
} from './controls.js';
