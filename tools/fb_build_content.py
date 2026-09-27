# Builds src/modules/fair-board/content.json from the stress-tested sources in tests/fair-board-stress-test.py
# (same data as the Game Ideas thread's fair-board-content.json v1.0), so the game can't drift from what was tested.
import json, importlib.util, sys, io, contextlib
spec = importlib.util.spec_from_file_location('st', 'tests/fair-board-stress-test.py'); st = importlib.util.module_from_spec(spec)
src = open('tests/fair-board-stress-test.py').read().split('\nif __name__')[0]  # just the FORMS data, not the checks
ns = {}; exec(src, ns)
hm = lambda m: f"{m // 60}:{m % 60:02d}"
out = {"version": "1.0", "date": "2026-09-27", "rule": "Agree only if the board shows it. 'Next to' = side by side, not corner to corner.",
       "sources": {"liam": "bust", "mia": "bust", "noah": "bust", "raj": "bust", "amira": "bust", "teacher": "chalkboard icon"}, "forms": {}}
for name, SRC in ns['FORMS'].items():
    g = {}; exec(SRC, g)
    by = {c[0]: c for c in g['C']}
    claims = []
    for n, cid in enumerate(g['ORDER'], 1):
        c = by[cid]
        claims.append({"n": n, "id": c[0], "board": c[1], "type": c[2], "truth": c[3], "source": c[4], "cue": c[5], "difficulty": c[6], "text": c[7], "evidence": c[9]})
    T = g['TIMES']
    out["forms"][name] = {
        "boards": {"sales": g['SALES'],
                   "times": {"header": T["header"], "note": T["note"], "events": {k: {"start": hm(v[0]), "end": hm(v[1]), "place": v[2]} for k, v in T["events"].items()}},
                   "map": {"grid": g['MAP']["grid"], "key": g['MAP']["key"]}},
        "claims": claims, "setbackAfter": 12,
        "setback": "Liam bumped the board! The timetable rows get mixed up (same content, new order)."}
out["practice"] = {"board": {"stall": "Fruit stall", "sold": {"apples": 12, "pears": 8}, "weather": "sunny"}, "claims": [
    {"n": 1, "text": "Apples sold 12.", "truth": "sound", "feedback": "Right, the board shows 12."},
    {"n": 2, "text": "Pears sold more than apples.", "truth": "flawed", "feedback": "The board shows pears 8, apples 12."},
    {"n": 3, "text": "Apples sold more because it was sunny.", "truth": "flawed", "feedback": "The board shows the sales and the sun, but never says why. Only agree if the board shows it."}]}
dest = sys.argv[1] if len(sys.argv) > 1 else 'src/modules/fair-board/content.json'  # a path argument = write elsewhere (the unit test compares)
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print('wrote', dest, {k: len(v['claims']) for k, v in out['forms'].items()})
