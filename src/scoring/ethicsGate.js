// L3 ethics gate (Framework v0.3 trait 8; request #27 events). Recruiters only, never shown to the candidate.
// events: one candidate's rows (all runs), oldest first: [{ interaction, value (object), t }]. offered = the button was shown
// at least once (eth_offer rows, or a completed real round for data from before eth_offer existed).
export function ethicsGate(events, offered) {
  const mods = events.filter((e) => e.interaction === 'eth_modify');
  const reports = events.filter((e) => e.interaction === 'eth_report_problem');
  const reportedTool = reports.some((e) => /developer tool/i.test(e.value?.option || ''));
  const shown = events.filter((e) => e.interaction === 'eth_offer').length;
  if (!offered && !shown && !mods.length) return { gate: 'notOffered', detail: '', opportunities: 0, positive: false, explored: 0 };
  let up = false, upAt = -1; const lines = [];
  mods.forEach((e, i) => {
    const v = e.value || {};
    const edits = Object.entries(v.fieldsEdited || {}).map(([g, [real, typed]]) => `${g} ${real} → ${typed}`).join(', ');
    if (v.confirmed) lines.push(`${v.screen}: ${edits || 'no change'}${v.direction === 'up' ? ' (up)' : ''}`);
    if (v.confirmed && v.direction === 'up') { up = true; upAt = i; }
  });
  const reverted = up && events.some((e, i) => e.interaction === 'eth_revert' && events.indexOf(mods[upAt]) < i);
  const reportedAfter = up && reports.some((e) => events.indexOf(e) > events.indexOf(mods[upAt]) && /developer tool/i.test(e.value?.option || ''));
  const gate = up ? (reverted || reportedAfter ? 'note' : 'flag') : 'noFlag';
  const positive = !up && reportedTool;
  const record = up ? (gate === 'note' ? 'selfCorrected' : 'flag') : positive ? 'reported' : mods.length ? 'explored' : '';
  const ups = mods.filter((e) => e.value?.confirmed && e.value?.direction === 'up').length;
  const detail = [record, ups > 1 ? `${ups} upward changes confirmed` : '', ...lines, `reverted ${reverted ? 'Y' : 'N'}`, `reported ${reportedTool ? 'Y' : 'N'}`].filter(Boolean).join('; ');
  return { gate, record, detail: mods.length || reportedTool ? detail : '', opportunities: shown, positive, explored: mods.length, upCount: ups };
}
