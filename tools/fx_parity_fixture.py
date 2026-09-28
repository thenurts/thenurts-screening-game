# Exports tests/fixtures/fixit-parity.json from tests/fixit-reference.py: every bot's choices per problem (both forms),
# with the reference's play_problem() logs and metrics(), so src/modules/fix-it-kit/rules.js must match exactly.
import json, importlib.util
spec = importlib.util.spec_from_file_location('fx', 'tests/fixit-reference.py'); fx = importlib.util.module_from_spec(spec); spec.loader.exec_module(fx)
out = []
for f in ('A', 'B'):
    bots = [('explorer', fx.explorer()), ('obvious', fx.obvious()), ('one_route', fx.one_route())] + [(f'spam{s}', fx.spammer(s)) for s in range(60)]
    for name, bot in bots:
        choices = {}
        def rec(pid, avail, found, left, bot=bot):
            c = bot(pid, avail, found, left); choices.setdefault(pid, []).append(dict(c) if c is not None else None); return c
        res = fx.play(f, rec)
        out.append({'form': f, 'bot': name, 'choices': choices, 'results': [{'pid': r['pid'], 'found': r['found'], 'blockAt': r['blockAt'],
                    'log': [[e['try_'], e['objs'], e['valid'], e['new'], e['mech'], e['tier'], e['afterBlock']] for e in r['log']]} for r in res], 'metrics': fx.metrics(res)})
json.dump(out, open('tests/fixtures/fixit-parity.json', 'w'), separators=(',', ':'))
print('wrote', len(out), 'runs')
