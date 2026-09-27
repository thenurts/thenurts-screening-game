# Builds tests/fixtures/torch-talk-parity.json: build pack §13 cases + shuffles, answered by the reference check() (v2.1).
import json, importlib.util, sys, io, contextlib, random
spec = importlib.util.spec_from_file_location('v', 'tests/torch-talk-validate.py'); v = importlib.util.module_from_spec(spec)
sys.argv = ['x', 'src/modules/torch-talk/items.json']
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(v)
random.seed(3); cases = []
for it in v.R:
    I = it['ideal']; full = it['tiles'] + (it['gap']['answerTile'].split() if it['gap'] else [])
    add = lambda m: cases.append([it['id'], m, v.check(m, it)])
    add(I); add(list(reversed(I)))
    for b in it['breakers']: add(I + [b]); add(I + ['not', b]); add(['not', b] + I)
    for f in it['fillers']: add(I + [f]); add([f] + I)
    for k in range(len(I)): add(I[:k] + I[k + 1:]); add(I[:k] + ['not'] + I[k:])
    for t in full: add([t])
    for _ in range(12): m = I[:]; random.shuffle(m); add(m)                       # order / bind / between
    for _ in range(12): add(random.sample(full, random.randint(2, min(10, len(full)))))
json.dump(cases, open('tests/fixtures/torch-talk-parity.json', 'w'), ensure_ascii=False)
from collections import Counter; print(len(cases), Counter(c[2] for c in cases))
