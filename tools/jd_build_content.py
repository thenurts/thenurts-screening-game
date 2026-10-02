# Builds src/modules/big-calls/content.json (= the Game Ideas thread's judgement-content.json v1.2) from tests/judgement-reference.py.
# Usage: python3 tools/jd_build_content.py [dest]. The unit test checks the shipped file equals this output.
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location('jd', 'tests/judgement-reference.py'); jd = importlib.util.module_from_spec(spec); spec.loader.exec_module(jd)
S = lambda d: 'L' if d > 0 else 'R'
def clue(src, st, d, opts):
    return {'source': src, 'kind': 'saw it' if st == 2 else 'heard it', 'icon': '👁' if st == 2 else '👂', 'strength': st, 'points': S(d), 'text': f'{src}: "{opts[S(d)]}"'}
def card(k, c):
    o = {'L': c['L'], 'R': c['R']}
    return {'id': k, 'situation': c['situation'], 'options': o, 'kidsAffected': c['worth'], 'urgent': c['urgent'],
            'startClues': [clue(*x, o) for x in c['start']], 'clues': [clue(*x, o) for x in c['clues']], 'outcome': S(c['truth'])}
P1 = {'situation': 'Sports day relay: field or hall?', 'L': 'Field', 'R': 'Hall', 'worth': 30, 'urgent': False, 'start': [],
      'clues': [('Caretaker saw', 2, -1), ('Janitor heard', 1, -1), ('Someone said', 1, 1)], 'truth': -1}
P2 = {'situation': 'Snack table: left or right corner?', 'L': 'Left', 'R': 'Right', 'worth': 10, 'urgent': True, 'start': [('Mia thinks', 1, 1)],
      'clues': [('Class chat rumour', 1, -1), ('Raj heard', 1, 1), ('Liam heard', 1, 1)], 'truth': 1}
practice = [dict(card('P1', P1), teach='Affects 30 kids, a tie, and the next source saw it: asking is worth it.'),
            dict(card('P2', P2), teach='Affects 10 kids, urgent (asking costs 6), and the next source only heard it: asking costs more than it can win. Just decide.')]
out = {'version': '1.2', 'date': '2026-10-02',
       'model': {'arrowWeight': round(jd.W1, 4), 'checkCost': {'normal': jd.COST[False], 'urgent': jd.COST[True]}, 'neutralMargin': jd.MARGIN, 'worths': [10, 20, 30],
                 'note': "v1.2: no tally. 👁 'saw it' (first-hand) = 2 arrows of weight; 👂 'heard it' (second-hand/old) = 1. Ex-ante best = the weighted sum of what the player has seen. The Check button names the next source type. Stakes are shown as kids affected (10/20/30)."},
       'forms': {f: [card(k, c) for k, c in jd.CALLS.items() if k.startswith(f)] for f in 'AB'}, 'practice': practice,
       'consequenceLines': {'right': 'Good call: {kids} kids were happy.', 'wrongSmart': 'Unlucky! {kids} kids waited. But that was the smart call.', 'wrong': '{kids} kids waited at the wrong place.'}}
dest = sys.argv[1] if len(sys.argv) > 1 else 'src/modules/big-calls/content.json'
json.dump(out, open(dest, 'w'), indent=1, ensure_ascii=False); print('wrote', dest)
