// Learn-by-doing practice (build pack O1 §4): 3 tiny shifts, each catching one misreading. Uses the real rules engine.
export const TUTORIAL = [
  { step: 1, headline: 'Tap order, then station', say: ['liam', 'Make Mia’s teh tarik: tap her order, then the Urn.'],
    cfg: { stream: [[1, 't1', 'teh', 9, 'mia']], parked: null, setback: null, ticks: 8 },
    goal: (st) => st.done.includes('t1') },
  { step: 2, headline: '★ worth more, ⏳ due soon', say: ['liam', 'Two orders! ★ = worth more · ⏳ = minutes left.'],
    cfg: { stream: [[1, 't1', 'teh', 5, 'zoey'], [1, 't2', 'nasi', 3, 'raj']], parked: null, setback: null, ticks: 5 },
    goal: (st) => st.done.includes('t2'), lost: (st) => st.expired.includes('t2'), lostText: 'Your nasi lemak customer left!', hintTarget: 't2' },
  { step: 3, headline: 'Don’t forget the pin', say: ['amira', 'Boss, one teh tarik tapau (takeaway)! I’ll be back at 7:05.'],
    cfg: { stream: [[2, 't1', 'kopi', 6, 'noah']], parked: { id: 'tapau', item: 'teh', announce: 1, window: [6, 8], late: [9, 9], customer: 'amira' }, setback: null, ticks: 9 },
    goal: (st) => st.tapau.handed && st.tapau.handed >= 6 && st.tapau.handed <= 8, lostText: 'Amira came back at 7:05, but her tapau wasn’t handed over.', hintTarget: 'tapau' },
];
/** The latest practice on this page, so the real round can carry the tutorialStruggle caveat (≥ 2 fail-safes). */
export const tutorialMemo = { done: false, failSafes: 0 };
