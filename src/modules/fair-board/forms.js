// Fair Board content + form choice. content.json is generated from tests/fair-board-stress-test.py by tools/fb_build_content.py.
import CONTENT from './content.json' with { type: 'json' };

export { CONTENT };
export const CONTENT_VERSION = CONTENT.version;
export const BOARDS = ['sales', 'times', 'map'];
export const BOARD_TITLES = { sales: 'Stall sales', times: 'Timetable', map: 'Fair map' };
/** After the bump the timetable shows its rows in this fixed order (original row indices), identical for everyone. No row stays put. */
export const BUMP_ORDER = [3, 0, 4, 1, 2];

/**
 * Form A = the official first real attempt of run 1 (identical for everyone). Any restart and every later run = Form B.
 * `form` (developer mode) overrides. Practice always uses the practice board.
 */
export function pickForm({ mode, runNo = 1, attemptNo = 1, form = null, casual = false }) {
  if (mode === 'practice') return 'P';
  if (form === 'A' || form === 'B') return form;
  if (casual) return 'B'; // play-for-fun never sees the official Form A (request #26)
  return Number(runNo) <= 1 && attemptNo <= 1 ? 'A' : 'B';
}

/** Parse "sales:badges;time:magic show,band" → [{ board: 'sales', cells: ['badges'] }, { board: 'times', cells: [...] }]. */
export function parseEvidence(ev) {
  return String(ev || '').split(';').filter(Boolean).map((part) => {
    const [b, cells] = part.split(':');
    return { board: b === 'time' ? 'times' : b, cells: cells.split(',').map((s) => s.trim()) };
  });
}
