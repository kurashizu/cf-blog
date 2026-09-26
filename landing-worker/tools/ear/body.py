"""A body's frequency response from recordings, as a minimum-phase impulse.

Every note of an instrument samples its body at the note's harmonics. Divide
each harmonic's level by what the source puts there (a bowed string's
Helmholtz motion falls as 1/n, a plucked one faster) and what is left is the
body; many notes at many pitches fill the curve in. A cepstral fold turns the
magnitude into the causal, minimum-phase impulse a convolver can play.
"""
import glob, re, numpy as np, soundfile as sf

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


# VSCO-2 names its notes with middle C as C3 -- violins "from A2" -- so every
# name is an octave under what sounds. Measured: the harmonics sit on the
# name's even multiples only.
VSCO_OCTAVE = 12


def midi_of(name):
    m = re.search(r'(?:^|_)([A-G])(b|#)?(-?\d)_', name + '_')
    if not m: return None
    n = NOTE[m.group(1)] + (-1 if m.group(2) == 'b' else 1 if m.group(2) == '#' else 0)
    return 12 * (int(m.group(3)) + 1) + n + VSCO_OCTAVE


def load(path, sr=48000):
    x, r = sf.read(path, always_2d=True)
    x = x.mean(1)
    if r != sr:
        from scipy.signal import resample_poly
        x = resample_poly(x, sr, r)
    return x


def estimate_f0(x, sr=48000, t0=0.3, dur=0.5, fmin=25, fmax=2500, hint=None):
    """The played pitch, from the audio, within a semitone of `hint`: a player
    is never exactly on the name, and a section is an average."""
    seg = x[int(t0 * sr):int((t0 + dur) * sr)]
    N = 1 << 16
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), N)); fr = np.fft.rfftfreq(N, 1 / sr)
    def hs(f):
        tot = 0.0
        for n in range(1, 9):
            m = (fr > n * f * 0.985) & (fr < n * f * 1.015)
            if m.any(): tot += S[m].max() ** 2 / n
        return tot
    cands = [hint * 2 ** (k / 48) for k in range(-4, 5)]
    best = max(cands, key=hs)
    m = (fr > best * 0.97) & (fr < best * 1.03)
    return fr[m][np.argmax(S[m])]


def harmonic_levels(x, f0, sr=48000, t0=0.3, t1=None, nmax=60):
    """Mean power of each harmonic over [t0, t1] -- vibrato sweeps it across its peak, so the mean is the region's level."""
    t1 = t1 or min(len(x) / sr - 0.2, t0 + 2.5)
    seg = x[int(t0 * sr):int(t1 * sr)]
    N = 8192; hop = 2048; P = None; k = 0
    for s in range(0, len(seg) - N, hop):
        S = np.abs(np.fft.rfft(seg[s:s + N] * np.hanning(N))) ** 2
        P = S if P is None else P + S; k += 1
    if P is None: return [], []
    P /= k
    fr = np.fft.rfftfreq(N, 1 / sr)
    fs, ls = [], []
    for n in range(1, nmax + 1):
        f = n * f0
        if f > 16000: break
        m = (fr > f * 0.97) & (fr < f * 1.03)
        fs.append(f); ls.append(10 * np.log10(P[m].sum() + 1e-20))
    return np.array(fs), np.array(ls)


def response(files, source_slope=1.0, bins_per_oct=24, fmin=60, fmax=16000, odd=False, t0=0.3, t1=None):
    """Pooled body curve in dB on a log grid; `source_slope` is the source's fall, dB/oct / 6.
    `odd`: the source has odd harmonics only (a square; a clarinet's reed), so only those sample the body."""
    pts_f, pts_l = [], []
    for f in files:
        m = midi_of(f.split('/')[-1])
        if m is None: continue
        x = load(f)
        x = x[max(0, np.argmax(np.abs(x) > 0.1 * np.abs(x).max()) - 48):]
        f0 = estimate_f0(x, t0=t0, dur=min(0.5, (t1 or t0 + 0.5) - t0), hint=440 * 2 ** ((m - 69) / 12))
        fs, ls = harmonic_levels(x, f0, t0=t0, t1=t1)
        if not len(fs): continue
        n = fs / f0
        if odd:
            keep = np.round(n).astype(int) % 2 == 1
            fs, ls, n = fs[keep], ls[keep], n[keep]
        body = ls + 20 * source_slope * np.log10(n)
        body -= np.median(body)
        pts_f += list(fs); pts_l += list(body)
    pts_f, pts_l = np.array(pts_f), np.array(pts_l)
    grid = fmin * 2 ** (np.arange(int(np.log2(fmax / fmin) * bins_per_oct) + 1) / bins_per_oct)
    g = np.full(len(grid), np.nan)
    for i, fc in enumerate(grid):
        m = np.abs(np.log2(pts_f / fc)) < 1 / bins_per_oct
        if m.sum() >= 2: g[i] = np.median(pts_l[m])
    ok = ~np.isnan(g)
    g = np.interp(np.log2(grid), np.log2(grid[ok]), g[ok])
    return grid, g - g.max()


def min_phase_ir(grid, gain_db, sr=48000, n=4096, floor_db=-60):
    fr = np.fft.rfftfreq(n, 1 / sr)
    db = np.interp(np.log2(np.maximum(fr, 1)), np.log2(grid), gain_db, left=gain_db[0] - 24, right=gain_db[-1] - 24)
    db = np.maximum(db, floor_db)
    mag = 10 ** (db / 20)
    full = np.concatenate([mag, mag[-2:0:-1]])
    cep = np.fft.ifft(np.log(full)).real
    fold = np.zeros_like(cep); fold[0] = cep[0]; fold[1:n // 2] = 2 * cep[1:n // 2]; fold[n // 2] = cep[n // 2]
    h = np.fft.ifft(np.exp(np.fft.fft(fold))).real[:n]
    h *= np.hanning(2 * n)[n:] ** 0.5
    return h / np.sqrt((h ** 2).sum())


def split_scale(path, first_midi, sr=48000, thr_db=-25, min_gap=0.25):
    """The notes of a recorded chromatic run (Iowa MIS files: one file, C3 to
    B3 up a semitone each), as (midi, samples) -- found by where the level
    jumps, named in order, each pitch checked against the audio."""
    x = load(path, sr)
    h = int(0.01 * sr)
    e = np.array([np.sqrt(np.mean(x[k:k + h] ** 2)) + 1e-9 for k in range(0, len(x) - h, h)])
    d = 20 * np.log10(e / e.max())
    # Hysteresis: a note starts above thr_db and the next may not start until the level has fallen 15 dB under it.
    onsets, armed = [], True
    for i in range(len(d)):
        if armed and d[i] > thr_db and (not onsets or i - onsets[-1] > min_gap * 100):
            onsets.append(i); armed = False
        elif not armed and d[i] < thr_db - 15:
            armed = True
    notes = []
    for k, i in enumerate(onsets):
        end = onsets[k + 1] if k + 1 < len(onsets) else len(d)
        seg = x[i * h:end * h]
        notes.append((first_midi + k, seg))
    return notes


def response_from(notes, source_slope=1.0, bins_per_oct=24, fmin=60, fmax=16000, t0=0.05, t1=0.8):
    """`response`, from (midi, samples) pairs rather than named files."""
    pts_f, pts_l = [], []
    for m, x in notes:
        if len(x) < int((t1 + 0.1) * 48000): continue
        f0 = estimate_f0(x, t0=t0, dur=t1 - t0, hint=440 * 2 ** ((m - 69) / 12))
        fs, ls = harmonic_levels(x, f0, t0=t0, t1=t1)
        if not len(fs): continue
        body = ls + 20 * source_slope * np.log10(fs / f0)
        body -= np.median(body)
        pts_f += list(fs); pts_l += list(body)
    pts_f, pts_l = np.array(pts_f), np.array(pts_l)
    grid = fmin * 2 ** (np.arange(int(np.log2(fmax / fmin) * bins_per_oct) + 1) / bins_per_oct)
    g = np.full(len(grid), np.nan)
    for i, fc in enumerate(grid):
        m = np.abs(np.log2(pts_f / fc)) < 1 / bins_per_oct
        if m.sum() >= 2: g[i] = np.median(pts_l[m])
    ok = ~np.isnan(g)
    g = np.interp(np.log2(grid), np.log2(grid[ok]), g[ok])
    return grid, g - g.max()
