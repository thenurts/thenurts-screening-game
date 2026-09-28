# Exports tests/fixtures/mamak-parity.json from tests/mamak-reference.py: every bot's action list per form, with the
# reference's per-action ok flags, metrics() and org_score(), so the JS port (src/modules/mamak-rush/rules.js) must match.
import json, importlib.util
spec = importlib.util.spec_from_file_location('mk', 'tests/mamak-reference.py'); mk = importlib.util.module_from_spec(spec); spec.loader.exec_module(mk)
out = []
for f in ('A', 'B'):
    mk.use_form(f)
    bots = [('careful', mk.careful, 0, 0.0), ('fifo', mk.fifo, 0, 0.0), ('starter', mk.starter, 0, 0.0), ('forgetful', mk.forgetful, 0, 0.0), ('slips', mk.careful, 1, 0.15)]
    bots += [(f'random{s}', mk.randomp, s, 0.0) for s in range(60)]
    for name, pol, seed, slip in bots:
        st = mk.run(pol, seed, slip)
        m = mk.metrics(st)
        out.append({'form': f, 'bot': name, 'actions': [[e[1], e[2]] for e in st['log']], 'ok': [1 if e[3] else 0 for e in st['log']], 'metrics': m, 'org': mk.org_score(m)})
json.dump(out, open('tests/fixtures/mamak-parity.json', 'w'), separators=(',', ':'))
print('wrote', len(out), 'runs')
