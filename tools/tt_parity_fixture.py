# Builds tests/fixtures/torch-talk-parity.json: every case from build pack §13, answered by the reference check().
import json, importlib.util, sys, io, contextlib
spec = importlib.util.spec_from_file_location('v', 'tests/torch-talk-validate.py'); v = importlib.util.module_from_spec(spec)
sys.argv = ['x', 'src/modules/torch-talk/items.json']
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(v)
cases = []
for it in v.R:
    I = it['ideal']; add = lambda m: cases.append([it['id'], m, v.check(m, it)])
    add(I); add(list(reversed(I)))
    for b in it['breakers']: add(I + [b]); add(I + ['not', b]); add(['not', b] + I)
    for f in it['fillers']: add(I + [f]); add([f] + I)
    for k in range(len(I)): add(I[:k] + I[k + 1:]); add(I[:k] + ['not'] + I[k:])
    for t in it['tiles']: add([t])
json.dump(cases, open('tests/fixtures/torch-talk-parity.json', 'w'))
from collections import Counter; print(len(cases), Counter(c[2] for c in cases))
