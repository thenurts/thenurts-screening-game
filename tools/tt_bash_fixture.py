# Builds tests/fixtures/torch-talk-bash.json (request #39): for every item (38 bank + 6 try-it), 1,000 random "bashes"
# (8-10 random tray taps, capped at the item's word cap) and 1,000 "keyword sprays" (every required slot's words + random
# extra tray words except "not", shuffled), answered by the reference check() and points().
# Only the answers are stored; the JS test regenerates the same messages with PyRandom (Python's Mersenne Twister) and the
# simple helpers below, so the fixture stays small. Code per message: points if it passes, else -(1 + reason index).
import json, importlib.util, sys, io, contextlib, random
spec = importlib.util.spec_from_file_location('v', 'tests/torch-talk-validate.py'); v = importlib.util.module_from_spec(spec)
sys.argv = ['x', 'src/modules/torch-talk/items.json']
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(v)
TUT = json.load(open('src/modules/torch-talk/tutorial.json'))['steps']
REASONS = ['missing', 'breaker', 'negated', 'order', 'bind', 'between']
N = 1000

def rb(r, n):                      # CPython's _randbelow_with_getrandbits
    k = n.bit_length(); x = r.getrandbits(k)
    while x >= n: x = r.getrandbits(k)
    return x
def pick(r, pool, n):              # partial Fisher-Yates: n distinct items
    a = list(pool)
    for i in range(n):
        j = i + rb(r, len(a) - i); a[i], a[j] = a[j], a[i]
    return a[:n]
def shuffle(r, a):
    for i in range(len(a) - 1, 0, -1):
        j = rb(r, i + 1); a[i], a[j] = a[j], a[i]
    return a
def full_tray(it): return it['tiles'] + (it['gap']['answerTile'].split() if it['gap'] else [])
def bash(r, it):
    full = full_tray(it); n = min(8 + rb(r, 3), it['cap'], len(full)); return pick(r, full, n)
def spray(r, it):
    full = full_tray(it); req = []
    for s in it['slots']:
        for w in s['accept'][rb(r, len(s['accept']))].split():
            if w not in req: req.append(w)
    n = max(len(req), min(8 + rb(r, 3), it['cap']))
    rest = [t for t in full if t != 'not' and t not in req]
    return shuffle(r, req + pick(r, rest, min(n - len(req), len(rest))))
def code(m, it):
    c = v.check(m, it); return v.points(m, it) if c == 'pass' else -(1 + REASONS.index(c))

items = v.R + TUT
out = {'n': N, 'reasons': REASONS, 'items': [], 'bash': [], 'spray': []}
tot = {'bash': [0, 0], 'spray': [0, 0]}
for k, it in enumerate(items):
    r = random.Random(1000 + k)
    b = [code(bash(r, it), it) for _ in range(N)]
    s = [code(spray(r, it), it) for _ in range(N)]
    out['items'].append(it['id']); out['bash'].append(b); out['spray'].append(s)
    tot['bash'][0] += sum(x >= 0 for x in b); tot['spray'][0] += sum(x >= 0 for x in s); tot['bash'][1] += N; tot['spray'][1] += N
json.dump(out, open('tests/fixtures/torch-talk-bash.json', 'w'), separators=(',', ':'))
for k, (p, n) in tot.items(): print(f'{k}: {p} of {n} pass ({100 * p / n:.2f}%)')
