# Exports tests/fixtures/judgement-parity.json from tests/judgement-reference.py: every bot's run() log + metrics() on both forms,
# a voi() grid, and the reference CALLS, so src/modules/big-calls/rules.js must match exactly.
import json, importlib.util
spec = importlib.util.spec_from_file_location('jd', 'tests/judgement-reference.py'); jd = importlib.util.module_from_spec(spec); spec.loader.exec_module(jd)
runs = []  # v1.2: run12(checker, decider) for every checking bot x every weighing rule x 2 forms x 3 tie seeds
for f in ('A', 'B'):
    for name, bot in jd.BOTS:
        for dname, dec in jd.WEIGHING:
            for seed in (0, 1, 2):
                log = jd.run12(bot, dec, f, seed); runs.append({'form': f, 'bot': name, 'decider': dname, 'seed': seed, 'log': log, 'metrics': jd.metrics(log)})
grid = [[w, n, s, u, jd.voi(w, n, s, u)] for w in (10, 20, 30) for n in range(-4, 5) for s in (1, 2) for u in (False, True)]
calls = {k: {'worth': c['worth'], 'urgent': c['urgent'], 'first': sum(st * d for _, st, d in c['start']), 'clues': [list(x) for x in c['clues']], 'truth': c['truth']} for k, c in jd.CALLS.items()}
json.dump({'runs': runs, 'voi': grid, 'calls': calls}, open('tests/fixtures/judgement-parity.json', 'w'), separators=(',', ':'))
print('wrote', len(runs), 'runs,', len(grid), 'voi points')
