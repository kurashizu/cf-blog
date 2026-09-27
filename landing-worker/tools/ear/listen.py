"""Blind listening: the user's ears as the last check on any measure.

Each trial is two clips of the same pitch, one a recording and one our
render, in random order and at matched loudness (so level gives nothing
away). The listener picks the one that sounds like the real instrument, or
says they cannot tell. A preset whose real one is picked every time is
plainly synthetic; one at chance (50%, or "cannot tell") passes.

The truth stays on the server; the page only ever sees random ids.

    uv run listen.py build [PRESET ... | --kits | --all]   render the trials
    uv run listen.py serve                                  http://127.0.0.1:8765
    uv run listen.py report                                 per preset, against validate.py's mmd
"""
import glob, http.server, json, os, random, sys, numpy as np, soundfile as sf
from body import load

HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, '.cache')
OUT = os.path.join(C, 'listen')
SR = 48000
SEC = 2.0
TRUTH = os.path.join(OUT, 'truth.json')
ANSWERS = os.path.join(OUT, 'answers.jsonl')


def prepare(x):
    """Onset-aligned, two seconds, the same loudness (RMS of the first
    second), a 60 ms fade at the end so neither is cut off differently."""
    a = max(0, int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05)) - int(0.005 * SR))
    y = x[a:a + int(SEC * SR)]
    y = np.pad(y, (0, int(SEC * SR) - len(y)))
    y = y / (np.sqrt(np.mean(y[:SR] ** 2)) + 1e-9) * 0.08
    f = int(0.06 * SR)
    y[-f:] *= np.linspace(1, 0, f)
    peak = np.abs(y).max()
    return y * (0.95 / peak) if peak > 0.95 else y


def trials_for_preset(render, name, spec, n=3):
    from validate import bank
    R = bank(spec, n)
    out = []
    for midi, real in R.items():
        path = os.path.join(C, f'_ls_{os.getpid()}.wav')
        r = render(name=name, params={}, notes=[{'note': 108 - midi, 'at': 0.05, 'dur': spec.get('held', 1.2), 'vel': 90}], out=path, seconds=SEC + 0.3)
        assert r['ok'], r
        out.append((name, f'MIDI {midi}', real, load(path)))
        os.remove(path)
    return out


def trials_for_kits(render):
    from validate import DRUMS
    out = []
    for gm, what, pattern in DRUMS:
        files = sorted(glob.glob(os.path.join(C, 'refs', pattern)))
        if len(files) < 3:
            continue
        for f, vel in zip(random.Random(gm).sample(files, 3), [70, 100, 120]):
            path = os.path.join(C, f'_ls_{os.getpid()}.wav')
            r = render(kit='JAZZ KIT', key=str(108 - gm), params={}, notes=[{'note': 108 - gm, 'at': 0.05, 'dur': 0.3, 'vel': vel}], out=path, seconds=SEC + 0.3)
            if not r['ok']:
                continue
            out.append((f'JAZZ KIT {what}', os.path.basename(f), load(f), load(path)))
            os.remove(path)
    return out


def build(args):
    from tune import Renderer
    from validate import SPECS
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, '*.wav')):
        os.remove(f)
    render = Renderer()
    trials = []
    if '--kits' in args or '--all' in args:
        trials += trials_for_kits(render)
    names = [a for a in args if not a.startswith('--')]
    if '--all' in args:
        names = [n for n, s in SPECS.items() if s.get('ref') or s.get('bank')]
    for n in names:
        trials += trials_for_preset(render, n, SPECS[n])
    render.p.stdin.close()
    rng = random.Random()
    rng.shuffle(trials)
    truth = {}
    for i, (item, note, real, ours) in enumerate(trials):
        tid = f't{i:03d}'
        real_side = rng.choice('AB')
        for side, x in (('A', real if real_side == 'A' else ours), ('B', ours if real_side == 'A' else real)):
            sf.write(os.path.join(OUT, f'{tid}{side}.wav'), prepare(x), SR)
        truth[tid] = {'item': item, 'note': note, 'real': real_side}
    json.dump(truth, open(TRUTH, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(truth)} trials in {OUT}')


PAGE = """<!doctype html><meta charset=utf-8><title>盲听</title>
<style>body{background:#111;color:#ddd;font:15px/1.6 ui-monospace,monospace;max-width:640px;margin:40px auto}
button{background:#222;color:#ddd;border:1px solid #555;padding:10px 18px;margin:4px;font:inherit;cursor:pointer}
button:hover{border-color:#aaa}.pick{border-color:#7a7}#p{color:#888}</style>
<h2>盲听：哪个是真乐器？</h2>
<p id=p></p>
<div><button onclick="play('A')">▶ A</button><button onclick="play('B')">▶ B</button></div>
<div><button class=pick onclick="answer('A')">A 是真的</button><button class=pick onclick="answer('B')">B 是真的</button><button onclick="answer('?')">分不出</button></div>
<p>快捷键：1 播放 A，2 播放 B，A / B 选择，空格 分不出。两段已经对齐响度。</p>
<script>
let ids=[],i=0,audio=new Audio();
fetch('ids').then(r=>r.json()).then(j=>{ids=j;show()});
function show(){document.getElementById('p').textContent=i<ids.length?`第 ${i+1} / ${ids.length} 题`:'完成，谢谢！可以关掉页面了。'}
function play(s){if(i<ids.length){audio.pause();audio=new Audio(ids[i]+s+'.wav');audio.play()}}
function answer(c){if(i>=ids.length)return;fetch('answer',{method:'POST',body:JSON.stringify({id:ids[i],choice:c,t:Date.now()})});audio.pause();i++;show();if(i<ids.length)play('A')}
document.onkeydown=e=>{if(e.key==='1')play('A');if(e.key==='2')play('B');if(e.key==='a')answer('A');if(e.key==='b')answer('B');if(e.key===' '){e.preventDefault();answer('?')}}
</script>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=OUT, **k)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            body = PAGE.encode()
        elif self.path == '/ids':
            done = {json.loads(l)['id'] for l in open(ANSWERS)} if os.path.exists(ANSWERS) else set()
            body = json.dumps([t for t in sorted(json.load(open(TRUTH))) if t not in done]).encode()
        elif self.path.endswith('.wav'):
            return super().do_GET()
        else:
            return self.send_error(404)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        a = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with open(ANSWERS, 'a') as f:
            f.write(json.dumps(a) + '\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


def report():
    truth = json.load(open(TRUTH))
    by = {}
    for line in open(ANSWERS):
        a = json.loads(line)
        t = truth.get(a['id'])
        if t:
            by.setdefault(t['item'], []).append('?' if a['choice'] == '?' else 'right' if a['choice'] == t['real'] else 'wrong')
    print(f"{'':22s} {'n':>3s} {'heard as fake':>14s} {'fooled':>7s} {'cannot tell':>12s}")
    for item, v in sorted(by.items(), key=lambda kv: -kv[1].count('right') / len(kv[1])):
        n = len(v)
        print(f"{item:22s} {n:3d} {v.count('right') / n:14.0%} {v.count('wrong') / n:7.0%} {v.count('?') / n:12.0%}")


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'build':
        build(sys.argv[2:])
    elif cmd == 'serve':
        print('http://127.0.0.1:8765')
        http.server.ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
    elif cmd == 'report':
        report()
    else:
        print(__doc__)
