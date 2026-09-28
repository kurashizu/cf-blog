"""Rate versions against a recording, MUSHRA-style: which change made a sound
more like the instrument, and by how much.

The blind A/B (listen.py) only asks "can you tell?", and once a sound is
caught at all it is caught every time: a second round had every revoiced kit
piece at 100% again, and a piece nobody had touched (the high tom) went from
unsure to caught -- the listener had learnt. It cannot say whether a change
helped. Here each trial shows the recording as the reference, and beneath it,
in random order and unnamed, the versions to compare plus the recording
again hidden among them; each is rated 0-100 for how like the reference it
is. Old and new are heard side by side, so learning moves both, and the
hidden recording shows whether the ratings can be trusted (it should score
near 100).

    uv run rate.py build      from the two listen.py rounds + tune_note results
    uv run rate.py serve      http://127.0.0.1:8766
    uv run rate.py report
"""
import glob, http.server, json, os, random, sys, numpy as np, soundfile as sf
from body import load

HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, '.cache')
OUT = os.path.join(C, 'rate')
SR = 48000


def ours_of(round_dir):
    """Each trial of a listen.py round: item, note, and our clip, by trial."""
    truth = json.load(open(os.path.join(round_dir, 'truth.json')))
    out = {}
    for tid, t in truth.items():
        mine = 'B' if t['real'] == 'A' else 'A'
        out[(t['item'], t['note'])] = (load(os.path.join(round_dir, f'{tid}{t["real"]}.wav')), load(os.path.join(round_dir, f'{tid}{mine}.wav')))
    return out


def build():
    from listen import prepare
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, '*.wav')):
        os.remove(f)
    trials = []
    # Kit pieces and PIZZ: round 1 heard what shipped before, round 2 after,
    # on the same recorded takes and velocities.
    r1 = ours_of(os.path.join(C, 'listen-round1'))
    r2 = ours_of(os.path.join(C, 'listen'))
    changed = {'JAZZ KIT closed hat', 'JAZZ KIT open hat', 'JAZZ KIT crash', 'JAZZ KIT cowbell', 'JAZZ KIT snare', 'JAZZ KIT wood block', 'PIZZ'}
    for key in sorted(set(r1) & set(r2)):
        if key[0] in changed:
            trials.append((key[0], key[1], r2[key][0], {'before': r1[key][1], 'after': r2[key][1]}))
    # FLUTE and CLARINET: what ships against the tuned knobs, not yet in the source.
    from tune import Renderer
    from validate import bank, SPECS
    r = Renderer()
    for name in ['FLUTE', 'CLARINET']:
        moved = json.load(open(os.path.join(C, f'tuned_note_{name}.json')))['moved']
        for midi, real in bank(SPECS[name], 3).items():
            v = {}
            for label, params in [('before', {}), ('after', moved)]:
                path = os.path.join(C, f'_rt_{os.getpid()}.wav')
                q = r(name=name, params=params, notes=[{'note': 108 - midi, 'at': 0.05, 'dur': 1.2, 'vel': 90}], out=path, seconds=2.3)
                assert q['ok'], q
                v[label] = load(path)
                os.remove(path)
            trials.append((name, f'MIDI {midi}', real, v))
    r.p.stdin.close()
    rng = random.Random()
    rng.shuffle(trials)
    truth = {}
    for i, (item, note, real, versions) in enumerate(trials):
        tid = f'r{i:03d}'
        sf.write(os.path.join(OUT, f'{tid}_ref.wav'), prepare(real), SR)
        slots = [('hidden', real)] + list(versions.items())
        rng.shuffle(slots)
        truth[tid] = {'item': item, 'note': note, 'slots': [label for label, _ in slots]}
        for j, (_, x) in enumerate(slots):
            sf.write(os.path.join(OUT, f'{tid}_{j}.wav'), prepare(x), SR)
    json.dump(truth, open(os.path.join(OUT, 'truth.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{len(truth)} trials in {OUT}')


PAGE = """<!doctype html><meta charset=utf-8><title>评分</title>
<style>body{background:#111;color:#ddd;font:15px/1.6 ui-monospace,monospace;max-width:720px;margin:40px auto}
button{background:#222;color:#ddd;border:1px solid #555;padding:8px 14px;margin:3px;font:inherit;cursor:pointer}
button:hover{border-color:#aaa}.ref{border-color:#7a7}.row{display:flex;align-items:center;gap:12px;margin:10px 0}
input[type=range]{width:320px}#p{color:#888}.v{width:3em;text-align:right}</style>
<h2>和参照比，每个版本有多像？（0–100）</h2>
<p id=p></p>
<div class=row><button class=ref onclick="play('ref')">▶ 参照（真实录音）</button></div>
<div id=slots></div>
<button onclick="next()">提交，下一题 →</button>
<p>三个版本里藏着一段和参照一样的真实录音，它应该接近 100 分。其余按你觉得的像不像打分，不必互相拉开。已对齐响度。快捷键：0 播放参照，1 2 3 播放版本。</p>
<script>
let ids=[],i=0,audio=new Audio(),n=3;
fetch('ids').then(r=>r.json()).then(j=>{ids=j;show()});
function show(){const p=document.getElementById('p');if(i>=ids.length){p.textContent='完成，谢谢！可以关掉页面了。';document.getElementById('slots').innerHTML='';return}
p.textContent=`第 ${i+1} / ${ids.length} 题`;let h='';for(let k=0;k<n;k++)h+=`<div class=row><button onclick="play(${k})">▶ ${k+1}</button><input type=range min=0 max=100 value=50 id=s${k} oninput="document.getElementById('v${k}').textContent=this.value"><span class=v id=v${k}>50</span></div>`;
document.getElementById('slots').innerHTML=h}
function play(s){if(i<ids.length){audio.pause();audio=new Audio(ids[i]+'_'+s+'.wav');audio.play()}}
function next(){if(i>=ids.length)return;const sc=[];for(let k=0;k<n;k++)sc.push(+document.getElementById('s'+k).value);
fetch('answer',{method:'POST',body:JSON.stringify({id:ids[i],scores:sc,t:Date.now()})});audio.pause();i++;show()}
document.onkeydown=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='0')play('ref');if(['1','2','3'].includes(e.key))play(+e.key-1)}
</script>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=OUT, **k)

    def do_GET(self):
        ans = os.path.join(OUT, 'answers.jsonl')
        if self.path in ('/', '/index.html'):
            body = PAGE.encode()
        elif self.path == '/ids':
            done = {json.loads(l)['id'] for l in open(ans)} if os.path.exists(ans) else set()
            body = json.dumps([t for t in sorted(json.load(open(os.path.join(OUT, 'truth.json')))) if t not in done]).encode()
        elif self.path.endswith('.wav'):
            return super().do_GET()
        else:
            return self.send_error(404)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        a = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with open(os.path.join(OUT, 'answers.jsonl'), 'a') as f:
            f.write(json.dumps(a) + '\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


def report():
    truth = json.load(open(os.path.join(OUT, 'truth.json')))
    by = {}
    for line in open(os.path.join(OUT, 'answers.jsonl')):
        a = json.loads(line)
        t = truth[a['id']]
        for label, s in zip(t['slots'], a['scores']):
            by.setdefault(t['item'], {}).setdefault(label, []).append(s)
    print(f"{'':22s} {'hidden real':>11s} {'before':>7s} {'after':>6s}  after-before")
    for item, v in sorted(by.items()):
        h, b, a = (np.mean(v.get(k, [np.nan])) for k in ('hidden', 'before', 'after'))
        print(f'{item:22s} {h:11.0f} {b:7.0f} {a:6.0f}  {a - b:+6.0f}')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'build':
        build()
    elif cmd == 'serve':
        print('http://127.0.0.1:8766')
        http.server.ThreadingHTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
    elif cmd == 'report':
        report()
    else:
        print(__doc__)
