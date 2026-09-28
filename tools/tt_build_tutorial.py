# Builds src/modules/torch-talk/tutorial.json: the how-to v3 "try it" steps (Game Ideas build pack C1 §1, request #17),
# using the same item helper as tools/tt_build_items.py, then checks every persona message against the Python
# reference checker (tests/torch-talk-validate.py). Run: python3 tools/tt_build_tutorial.py  → "TUTORIAL OK"
import json, sys
src = open('tools/tt_build_items.py').read().split('\nI = [')[0]
ns = {}; exec(src, ns); it = ns['it']
v = open('tests/torch-talk-validate.py').read().split('\ndef slotwords')[0]
vs = {}; sys_argv = sys.argv; sys.argv = ['x']; exec(v, vs); sys.argv = sys_argv
check, points = vs['check'], vs['points']

def gid(real, *a, **k):
    x = it('G-0', *a, **k); x['id'] = real; return x

def step(n, headline, item, **extra):
    item.update(pool='tutorial', form=None, slot=None, step=n, headline=headline, **extra)
    return item

S = [
 step(1, 'Short wins', gid('G1',  'E', 'mia', 'change-of-plan', 'picnic day', 'Mia, the picnic is on Sunday now, not Saturday. Please bring a blanket.',
      'what:picnic;day:Sunday;action:bring;item:blanket', 'Saturday', 'the is on now not please a', 'picnic Sunday bring blanket'),
      maxWords=6, catch={'long': 'That took {n} flashes! Try it shorter.'}),
 step(2, 'Say what to do', gid('G2',  'E', 'liam', 'request', 'tent tape', 'Liam, the tent has a rip. Can you bring some tape to school tomorrow?',
      'action:bring;item:tape;place:school;day:tomorrow', 'glue today', 'tent rip has can you some to the please', 'bring tape school tomorrow'),
      catch={'missingSlot': 'action', 'text': 'Tape… and what do I do?'}),
 step(3, 'Your own words work', gid('G3',  'E', 'zoey', 'request', 'water the plants', 'Zoey, can you give the plants a drink before lunch?',
      'task:water;item:plants;w1:before;w2:lunch', 'after dinner', 'give drink the a can you please some', 'water plants before lunch', order='w1<w2'),
      catch={'missingSlot': 'task', 'text': 'Plants don’t drink juice!', 'hint': 'water'}),
 step(4, 'Who’s reading?', gid('G4a',  'E', 'liam', 'meeting', 'meet at the slide', 'Liam, meet at the *Rocket* (our name for the big slide) at 3pm.',
      'action:meet;place:Rocket|big slide;time:3pm', '4pm swings', 'at the our name for', 'meet Rocket 3pm', ctx=('Rocket', 'nickname', 'place')),
      part='a', catch={'text': 'Close Friends know our nicknames.'}),
 step(4, 'Who’s reading?', gid('G4b',  'E', 'raj', 'meeting', 'meet at the slide', 'Raj, meet at the *Rocket* (our name for the big slide) at 3pm.',
      'action:meet;place:big slide;time:3pm', '4pm swings', 'Rocket at the our name for', 'meet big slide 3pm', ctx=('Rocket', 'nickname', 'place')),
      part='b', catch={'word': 'Rocket', 'text': 'What’s the Rocket?'}),
 step(5, 'Missing something? Ask', gid('G5',  'E', 'mia', 'gap', 'swimming time', 'Mia, swimming is on Tuesday. I forgot to ask the time.',
      'what:swimming;day:Tuesday;time:4pm', '3pm 5pm Monday', 'is on the forgot ask time please', 'swimming Tuesday 4pm',
      gap=('time', 'when', '4pm', 'Mum says 4pm.')),
      catch={'text': 'That’s a guess! Something’s missing: tap Ask.'}),
]
S[0]['cap'] = 12  # room for a full sentence, so the sentence-writer is caught by the points, not by the cap
for x in S:  # the Rocket tile keeps its capital (it's a name)
    x['tiles'] = [w for w in x['tiles']]

# persona messages (build pack §1 red-team matrix): [item, message, expected check, expected points or None]
P = [
 ('G1', 'the picnic is on Sunday now please bring a blanket', 'pass', 4),   # sentence writer: passes, ~4 points, must retry
 ('G1', 'picnic Sunday bring blanket', 'pass', 10),
 ('G1', 'picnic Sunday not Saturday bring blanket', 'pass', 7),
 ('G1', 'picnic Saturday bring blanket', 'breaker', 0),
 ('G1', 'picnic Sunday blanket', 'missing', 0),                           # minimalist
 ('G2', 'tape school tomorrow', 'missing', 0),                            # keyword picker
 ('G2', 'bring tape school tomorrow', 'pass', 10),
 ('G2', 'bring glue school tomorrow', 'breaker', 0),
 ('G3', 'drink plants before lunch', 'missing', 0),                       # note copier
 ('G3', 'give plants a drink before lunch', 'missing', 0),
 ('G3', 'water plants before lunch', 'pass', 10),
 ('G3', 'water plants lunch before', 'order', 0),
 ('G4a', 'meet Rocket 3pm', 'pass', 10),                                  # nicknames work with Close Friends
 ('G4a', 'meet big slide 3pm', 'pass', 8),
 ('G4b', 'meet Rocket 3pm', 'missing', 0),                                # ignoring the reader
 ('G4b', 'meet big slide 3pm', 'pass', 10),
 ('G5', 'swimming Tuesday 3pm', 'breaker', 0),                            # guesser
 ('G5', 'swimming Tuesday', 'missing', 0),
 ('G5', 'swimming Tuesday 4pm', 'pass', 10),
]
by = {x['id']: x for x in S}
bad = []
for iid, m, want, pts in P:
    msg = m.split(); it_ = by[iid]
    tray = set(it_['tiles']) | ({it_['gap']['answerTile']} if it_['gap'] else set())
    if not set(msg) <= tray: bad.append(f'{iid} "{m}": word not in tray {set(msg) - tray}')
    got = check(msg, it_)
    if got != want: bad.append(f'{iid} "{m}": {got} != {want}')
    if pts is not None and points(msg, it_) != pts: bad.append(f'{iid} "{m}": {points(msg, it_)} pts != {pts}')
for x in S:
    if check(x['ideal'], x) != 'pass' or points(x['ideal'], x) != 10: bad.append(f"{x['id']}: ideal doesn't score 10")
    if x['gap'] and x['gap']['answerTile'] in x['tiles']: bad.append(f"{x['id']}: answer tile visible before asking")
    if len(x['tiles']) + (1 if x['gap'] else 0) > 18: bad.append(f"{x['id']}: tray too big")
out = {'version': '1.0', 'date': '2026-09-28', 'source': 'build pack C1 v2.2 §1 (how-to v3)', 'steps': S, 'personas': P}
dest = sys.argv[1] if len(sys.argv) > 1 else 'src/modules/torch-talk/tutorial.json'
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print('\n'.join(bad) if bad else 'TUTORIAL OK'); sys.exit(1 if bad else 0)
