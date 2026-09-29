# Builds src/modules/big-calls/content.json (= the Game Ideas thread's judgement-content.json v1.1) from tests/judgement-reference.py.
# Usage: python3 tools/jd_build_content.py [dest]. The unit test checks the shipped file equals this output.
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location('jd', 'tests/judgement-reference.py'); jd = importlib.util.module_from_spec(spec); spec.loader.exec_module(jd)
S = lambda d: 'L' if d > 0 else 'R'
def card(k, c):
    return {'id': k, 'situation': c['situation'], 'options': {'L': c['L'], 'R': c['R']}, 'worth': c['worth'], 'urgent': c['urgent'],
            'firstClue': {'arrows': 1, 'points': S(c['first']), 'label': 'First word'} if c['first'] else None,
            'clues': [{'label': l, 'strength': s, 'points': S(d)} for l, s, d in c['clues']], 'outcome': S(c['truth'])}
practice = [
    {'id': 'P1', 'situation': 'Sports day relay: field or hall?', 'options': {'L': 'Field', 'R': 'Hall'}, 'worth': 30, 'urgent': False, 'firstClue': None,
     'clues': [{'label': 'Weather app', 'strength': 2, 'points': 'R'}, {'label': 'Janitor', 'strength': 1, 'points': 'R'}, {'label': 'Sky', 'strength': 1, 'points': 'L'}],
     'outcome': 'R', 'teach': 'Worth 30, a tie, strong clue next: checking is worth it.'},
    {'id': 'P2', 'situation': 'Snack table: left or right corner?', 'options': {'L': 'Left', 'R': 'Right'}, 'worth': 10, 'urgent': True,
     'firstClue': {'arrows': 1, 'points': 'L', 'label': 'Mia thinks'},
     'clues': [{'label': 'Class chat', 'strength': 1, 'points': 'R'}, {'label': 'Poll', 'strength': 1, 'points': 'L'}, {'label': 'Noah saw', 'strength': 1, 'points': 'L'}],
     'outcome': 'L', 'teach': 'Worth 10, urgent (a check costs 6), weak clue next: checking costs more than it can win. Just decide.'}]
out = {'version': '1.1', 'date': '2026-09-27',
       'model': {'arrowWeight': round(jd.W1, 4), 'checkCost': {'normal': jd.COST[False], 'urgent': jd.COST[True]}, 'neutralMargin': jd.MARGIN, 'worths': [10, 20, 30],
                 'note': 'One currency: points. A check reveals the next clue; its strength (weak = 1 arrow, strong = 2) is shown on the Check button first. Ex-ante best = the side with more arrows (live tally). A tie means either is fine.'},
       'forms': {f: [card(k, c) for k, c in jd.CALLS.items() if k.startswith(f)] for f in 'AB'}, 'practice': practice}
dest = sys.argv[1] if len(sys.argv) > 1 else 'src/modules/big-calls/content.json'
json.dump(out, open(dest, 'w'), indent=1, ensure_ascii=False); print('wrote', dest)
