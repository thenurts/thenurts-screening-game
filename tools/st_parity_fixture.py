# Exports tests/fixtures/sunny-tap-parity.json from tests/sunny-tap-reference.py: schedules at several Fair-1 hit rates and
# simulated players' taps/fades with the reference's score_round() output, so src/modules/sunny-tap/rules.js must match exactly.
import json, random, importlib.util
spec = importlib.util.spec_from_file_location('st', 'tests/sunny-tap-reference.py'); st = importlib.util.module_from_spec(spec); spec.loader.exec_module(st)
def play(skill, composure, seed, quit_at=None):  # the reference simulate(), also returning what was played
    rng = random.Random(seed); taps = []; fades = []
    f1 = 1.4 * (1 + 0.25 * skill); sched = st.schedule(seed=2026, f1_hit_rate=f1); start = dict((n, a) for n, a, _ in st.PHASES)
    for e in sched:
        n = e['phase']; a = start[n]
        dip = max(0, 0.22 - 0.10 * composure) if n in st.POST and e['t'] - a < st.EARLY else 0
        if e['kind'] == 'sun':
            acc = (0.35 + 0.1 * skill) if n.startswith('W') else (0.80 + 0.08 * skill) * (1 - dip)
            rt = max(0.25, rng.gauss(0.60 - 0.06 * skill, 0.10) * (1 + 1.2 * dip))
            if rng.random() < acc and rt < e['life']: taps.append((e['t'] + rt, 'hit', e['t']))
            else: fades.append(e['t'] + e['life'])
        elif rng.random() < (0.05 if n.startswith('F') else 0.25) * (1.3 - 0.3 * composure): taps.append((e['t'] + 0.3, 'miss', None))
    m = st.score_round(taps, fades, sched, quit_at)
    assert m == st.simulate(skill, composure, seed, quit_at)
    return {'f1': f1, 'taps': taps, 'fades': fades, 'quitAt': quit_at, 'metrics': m}
schedules = [{'seed': s, 'f1': f, 'events': st.schedule(seed=s, f1_hit_rate=f)} for s in (2026, 2027) for f in (None, 1.0, 1.4, 2.2, 3.0)]
players = [play(sk, co, seed) for seed, (sk, co) in enumerate([(a / 2, b / 2) for a in range(-3, 4) for b in range(-3, 4)])]
players += [play(0, 0, 100, quit_at=75), play(1, -1, 101, quit_at=40), play(-1, 1, 102, quit_at=105), play(0.5, 0.5, 103, quit_at=115)]
for p in players: p['reports'] = [st.round_report(p['taps'], p['fades'], n) for n in (1, 2, 3, 4)]
json.dump({'schedules': schedules, 'players': players}, open('tests/fixtures/sunny-tap-parity.json', 'w'), separators=(',', ':'))
print('wrote', len(schedules), 'schedules,', len(players), 'players')
