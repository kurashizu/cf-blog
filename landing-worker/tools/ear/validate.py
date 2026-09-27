"""Does a measure of "sounds like the instrument" measure that? Checked before
it is trusted to voice anything.

The AudioSet label score was trusted, and the tuner learnt to please it:
FULL STRING came to score 0.60 as a violin where the violin section's own
recordings score 0.10, KOTO 0.18 against the dan tranh's 0.055 -- a render
cannot be more like the instrument than the instrument, so the score was
being fooled, not approached. And the embedding similarity it sat beside was
0.93-0.97 for everything, because AST pads each clip to ten seconds and the
mean over its tokens was mostly the padding.

So each candidate measure is put through four tests, per instrument, on
single notes (the same pitches, real and ours):

  floor      real against real (alternate notes as two sets): what "same
             instrument" scores. A measure is read in multiples of it.
  damage     the recordings made worse on purpose -- low-passed, their decay
             cut short, a click added, replaced by a sine at the same pitch --
             must score monotonically worse, and a sine worst.
  ours       each preset's renders, in units of the floor.
  foolable   ours may not score better than real against real.

Candidates:
  label  mean AudioSet probability of the preset's labels (the old measure)
  mmd    kernel two-sample distance between the sets of AST embeddings,
         pooled over the sounding frames only (MMD^2, RBF, median bandwidth)
  mel    paired log-mel distance: ours against the recording of the same
         note, frame by frame over its first 1.5 s, level-normalised (dB)

    uv run validate.py [PRESET ...]      single notes against each bank
    uv run validate.py --organ           DRAWBAR ORGAN by phrase (no bank)
    uv run validate.py --kits            kit pieces against VCSL single hits
"""
import glob, os, sys, numpy as np, torch
from scipy.signal import resample_poly, butter, sosfilt
from transformers import ASTFeatureExtractor, ASTForAudioClassification
from tune import Renderer
from body import midi_of, load
from specs import SPECS

HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, '.cache')
SR = 48000
CLIP = 2.0
MODEL = 'MIT/ast-finetuned-audioset-10-10-0.4593'
fe = ASTFeatureExtractor.from_pretrained(MODEL)
model = ASTForAudioClassification.from_pretrained(MODEL).eval()
LAB = {v: int(k) for k, v in model.config.id2label.items()}


def onset_clip(x):
    a = max(0, int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05)) - int(0.005 * SR))
    y = x[a:a + int(CLIP * SR)]
    return np.pad(y, (0, int(CLIP * SR) - len(y)))


@torch.no_grad()
def features(x):
    """Label probabilities, the AST embedding over the sounding frames only,
    and the log-mel frames (the model's own fbank, before its normalising)."""
    y = resample_poly(x, 16000, SR).astype(np.float32)
    y = y / (np.abs(y).max() or 1) * 0.5
    inp = fe(y, sampling_rate=16000, return_tensors='pt')
    out = model(**inp, output_hidden_states=True)
    h = out.hidden_states[-1][0, 2:]  # the patches, frequency-major: 12 x 101
    t = int(np.ceil(len(y) / 160 / 10))  # patches a 10 ms hop and a stride of 10 cover
    emb = h.reshape(12, 101, -1)[:, :t].mean((0, 1)).numpy()
    mel = inp['input_values'][0, :int(1.5 * 100)].numpy()  # 1.5 s of 10 ms frames
    mel = mel - np.log(np.mean(np.exp(mel)) + 1e-9)  # level-normalised
    return torch.sigmoid(out.logits[0]).numpy(), emb / np.linalg.norm(emb), mel


def mmd(A, B):
    """Unbiased MMD^2 between two sets of embeddings, RBF at the median distance."""
    Z = np.vstack([A, B])
    D = ((Z[:, None] - Z[None]) ** 2).sum(-1)
    s = np.median(D[D > 0])
    K = np.exp(-D / s)
    n, m = len(A), len(B)
    kaa = (K[:n, :n].sum() - n) / (n * (n - 1))
    kbb = (K[n:, n:].sum() - m) / (m * (m - 1))
    return float(kaa + kbb - 2 * K[:n, n:].mean())


def mel_dist(a, b):
    return float(np.mean(np.abs(a - b)))


IOWA = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def iowa_midi(f):
    # Piano.mf.C4.wav: scientific pitch, not VSCO's octave-low names.
    n = os.path.basename(f).split('.')[2]
    return 12 * (int(n[-1]) + 1) + IOWA[n[:-1]]


def bank(spec, n=10):
    files = glob.glob(os.path.join(C, 'refs', spec.get('bank') or spec['ref']))
    by = {}
    for f in sorted(files):
        m = iowa_midi(f) if 'iowa-piano' in f else midi_of(os.path.basename(f))
        if m is not None:
            by.setdefault(m, f)
    keys = sorted(by)
    if len(keys) > n:
        keys = [keys[round(i * (len(keys) - 1) / (n - 1))] for i in range(n)]
    return {k: onset_clip(load(by[k])) for k in keys}


def damaged(x, how):
    if how == 'lowpass':
        return sosfilt(butter(4, 1500, fs=SR, output='sos'), x)
    if how == 'cut decay':
        env = np.ones_like(x)
        a, b = int(0.25 * SR), int(0.35 * SR)
        env[a:b] = np.linspace(1, 0, b - a)
        env[b:] = 0
        return x * env
    if how == 'click':
        y = x.copy()
        y[:int(0.002 * SR)] += np.abs(x).max() * 1.5 * np.hanning(int(0.002 * SR))
        return y
    if how == 'sine':
        f = np.abs(np.fft.rfft(x[int(0.1 * SR):int(0.6 * SR)]))
        f0 = np.argmax(f[5:]) + 5
        f0 = f0 * SR / (2 * (len(f) - 1))
        env = np.sqrt(np.convolve(x ** 2, np.ones(480) / 480, 'same'))
        return np.sin(2 * np.pi * f0 * np.arange(len(x)) / SR) * env * np.sqrt(2)
    raise ValueError(how)


def ours(render, name, keys, held):
    out = {}
    for k in keys:
        path = os.path.join(C, f'_val_{os.getpid()}.wav')
        r = render(name=name, params={}, notes=[{'note': 108 - k, 'at': 0.05, 'dur': held, 'vel': 90}], out=path, seconds=CLIP + 0.3)
        assert r['ok'], r
        out[k] = onset_clip(load(path))
        os.remove(path)
    return out


def report(name, spec, render):
    R = bank(spec)
    keys = sorted(R)
    labels = [LAB[l] for l in spec['labels']]
    F = {k: features(x) for k, x in R.items()}
    lab = lambda feats: float(np.mean([max(f[0][labels]) for f in feats]))
    emb = lambda feats: np.array([f[1] for f in feats])
    half_a, half_b = keys[0::2], keys[1::2]
    floor_mmd = mmd(emb([F[k] for k in half_a]), emb([F[k] for k in half_b]))
    # A real note against its neighbour: how far apart two real notes are.
    floor_mel = float(np.mean([mel_dist(F[a][2], F[b][2]) for a, b in zip(keys, keys[1:])]))
    rows = [('real', lab(F.values()), floor_mmd, floor_mel)]
    for how in ['lowpass', 'cut decay', 'click', 'sine']:
        D = {k: features(damaged(x, how)) for k, x in R.items()}
        rows.append((f'real, {how}', lab(D.values()), mmd(emb(F.values()), emb(D.values())),
                     float(np.mean([mel_dist(F[k][2], D[k][2]) for k in keys]))))
    S = {k: features(x) for k, x in ours(render, name, keys, spec.get('held', 1.2)).items()}
    rows.append((f'OURS {name}', lab(S.values()), mmd(emb(F.values()), emb(S.values())),
                 float(np.mean([mel_dist(F[k][2], S[k][2]) for k in keys]))))
    print(f'\n== {name}: {len(keys)} notes, MIDI {keys[0]}-{keys[-1]}  (first row: real against real)')
    print(f"{'':22s} {'label':>6s} {'mmd':>7s} {'mel dB':>7s}")
    for what, l, m, d in rows:
        print(f'{what:22s} {l:6.3f} {m:7.3f} {d:7.2f}')
    return rows


# PIANO's spec plays a passage from the Iowa bank; its single notes are these.
SPECS['PIANO'] = {**SPECS['PIANO'], 'bank': 'iowa-piano/Piano.mf.*.wav'}


def main():
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or [n for n, s in SPECS.items() if s.get('ref') or s.get('bank')]
    render = Renderer()
    if '--kits' in sys.argv:
        for kit in ['JAZZ KIT', '808 KIT']:
            drum_check(render, kit)
    elif '--organ' in sys.argv:
        phrase_check(render, 'DRAWBAR ORGAN', ['commons/Hammond_Organ_-_Model_A_Medley.wav', 'commons/Jazzyblues_For_Hammond_by_Michael_Huber.wav', 'commons/Drawbar_C_Chord.wav'], ['ORGAN', 'CLARINET', 'FULL STRING', 'PIANO'])
    else:
        for n in names:
            report(n, SPECS[n], render)
    render.p.stdin.close()



def windows(x, n=12, sec=CLIP):
    """Up to n sounding two-second windows spread through a recording."""
    w = int(sec * SR)
    starts = [i for i in range(0, len(x) - w, w) if np.sqrt(np.mean(x[i:i + w] ** 2)) > 0.01 * np.abs(x).max()]
    if len(starts) > n:
        starts = [starts[round(i * (len(starts) - 1) / (n - 1))] for i in range(n)]
    return [x[i:i + w] for i in starts]


def phrase_check(render, target, files, others):
    """For sounds with no single-note bank: the recordings' two-second windows
    against our phrase's. The floor is one recording's windows against the
    others'; `others` are presets the same measure should rank below."""
    from tune import comping
    real = {f: [features(w)[1] for w in windows(load(os.path.join(C, 'refs', f)))] for f in files}
    A = np.array(real[files[0]])
    B = np.array([e for f in files[1:] for e in real[f]])
    allr = np.vstack([A, B])
    print(f'\n== {target} by phrase: {len(allr)} windows of {len(files)} recordings')
    print(f"{'real vs real (file 1 vs rest)':34s} {mmd(A, B):7.3f}")
    for name in [target] + others:
        path = os.path.join(C, f'_val_{os.getpid()}.wav')
        embs = []
        for seed in range(2):
            r = render(name=name, params={}, notes=comping(SPECS['DRAWBAR ORGAN']['base'], seed), out=path, seconds=10.3)
            assert r['ok'], r
            embs += [features(w)[1] for w in windows(load(path), n=6)]
        os.remove(path)
        print(f"{'OURS ' + name:34s} {mmd(allr, np.array(embs)):7.3f}")


V = 'vcsl/Membranophones/Struck Membranophones/'
I = 'vcsl/Idiophones/Struck Idiophones/'
# GM key, what it is, the recordings' single hits (rolls, bows, crescendos left out).
DRUMS = [
    (36, 'kick', V + 'Bass Drum 2/bassdrum_hit_*.wav'),
    (38, 'snare', V + 'Snare Drum, Modern 1/Snare2_HitSN_*.wav'),
    (50, 'high tom', V + 'Tom 1/Stick/TomH_HitS_*.wav'),
    (42, 'closed hat', I + 'Hi-Hat Cymbal/HiHat_HitC_*.wav'),
    (46, 'open hat', I + 'Hi-Hat Cymbal/HiHat_HitO*.wav'),
    (49, 'crash', I + 'Suspended Cymbal 1/susCymb1_hit_[!b]*.wav'),
    (39, 'clap', I + 'Claps/SoloClap_*.wav'),
    (76, 'wood block', I + 'Woodblock/wood_click*.wav'),
    (56, 'cowbell', I + 'Cowbells/Cowbell1_Hit_*.wav'),
]


def drum_check(render, kit):
    """Each kit piece against the recordings' own hits, by the same measure:
    the floor is half the takes against the other half."""
    print(f"\n== {kit}: kit pieces against VCSL single hits (mmd; real vs real first)")
    print(f"{'':12s} {'hits':>5s} {'real':>7s} {'sine':>7s} {'OURS':>7s}")
    for gm, what, pattern in DRUMS:
        files = sorted(glob.glob(os.path.join(C, 'refs', pattern)))
        if len(files) < 4:
            print(f'{what:12s} too few recordings ({len(files)})')
            continue
        R = [features(onset_clip(load(f)))[1] for f in files[:12]]
        Rs = [features(damaged(onset_clip(load(f)), 'sine'))[1] for f in files[:12]]
        S = []
        for vel in [50, 70, 85, 100, 115, 127]:
            path = os.path.join(C, f'_val_{os.getpid()}.wav')
            r = render(kit=kit, key=str(108 - gm), params={}, notes=[{'note': 108 - gm, 'at': 0.05, 'dur': 0.3, 'vel': vel}], out=path, seconds=CLIP + 0.3)
            if not r['ok']:
                break  # the kit has no such key
            S.append(features(onset_clip(load(path)))[1])
            os.remove(path)
        if not S:
            print(f'{what:12s} not in this kit')
            continue
        R = np.array(R)
        print(f'{what:12s} {len(R):5d} {mmd(R[0::2], R[1::2]):7.3f} {mmd(R, np.array(Rs)):7.3f} {mmd(R, np.array(S)):7.3f}')


if __name__ == '__main__':
    main()
