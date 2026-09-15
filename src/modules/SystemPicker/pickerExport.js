/**
 * CSV export for the table view: whatever rows the current filter/search left visible,
 * in whatever columns the "Columns" menu currently shows.
 *
 * Values are plain text pulled from pickerModel's pure data helpers rather than the
 * DOM-badge builders in pickerCells.js (tech letters, wormhole initials, …) — a CSV
 * reader wants "CYBERNETIC, BIOTIC", not "Y" and a colour.
 */

import {
    totalResources, totalInfluence, wormholesOf, techsOf, planetTypesOf, isFractureTile
} from './pickerModel.js';
import { effectiveText, anomalyTitle, legendaryPlanet } from './pickerCells.js';

function cellValue(key, sys, isUsed) {
    switch (key) {
        case 'tile':
        case 'id':        return sys.id;
        case 'name':       return sys.name || '';
        case 'planets':    return (sys.planets || []).length;
        case 'planetTypes':return Array.from(planetTypesOf(sys)).join(', ');
        case 'resources':  return totalResources(sys);
        case 'influence':  return totalInfluence(sys);
        case 'effective':  return effectiveText(sys);
        case 'wormholes':  return wormholesOf(sys).join(', ');
        case 'tech':       return techsOf(sys).join(', ');
        case 'legendary':  return legendaryPlanet(sys)?.legendaryAbilityName || '';
        case 'anomalies':  return anomalyTitle(sys);
        case 'fracture':   return isFractureTile(sys) ? 'Yes' : '';
        case 'used':       return isUsed(sys.id) ? 'Yes' : '';
        default:           return '';
    }
}

/** Wraps a field in quotes and doubles embedded quotes only when the field needs it. */
function csvField(value) {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function buildCsv(results, columns, isUsed) {
    const lines = [columns.map(c => csvField(c.label)).join(',')];
    for (const sys of results) {
        lines.push(columns.map(c => csvField(cellValue(c.key, sys, isUsed))).join(','));
    }
    // CRLF is the CSV spec's line ending and keeps Excel from misreading the file.
    return lines.join('\r\n');
}

function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * @param {object[]} results - the currently filtered/sorted systems (table row order)
 * @param {{key: string, label: string}[]} columns - the currently visible columns, in order
 * @param {(id: string) => boolean} isUsed
 */
export function exportSystemsCsv(results, columns, isUsed) {
    const csv = buildCsv(results, columns, isUsed);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ti4-systems-${timestamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
