"""Regenerate SMB1 TRK 4 (src/lib/songs/mario1.ts) from the ROM: the ground-music section sequence, each
section's noise data (with its loop-back offset), on the 1/24-beat grid.
Frames -> steps: a quarter is 36 frames = 24 steps, so 1 frame = 2/3 step;
every length the noise channel uses is a multiple of 3 frames.

Needs the SMB1 disassembly (https://gist.github.com/1wErt3r/4048722) as
smbdis.asm next to this file. Run with --emit to write trk4_grid.ts, then
paste that block over MARIO1_TRK4_GRID."""
import re, sys

import os
HERE = os.path.dirname(os.path.abspath(__file__))
asm = open(os.path.join(HERE, 'smbdis.asm')).read().split('\n')

def db_bytes(lines):
    out = []
    for l in lines:
        l = l.split(';')[0]
        m = re.search(r'\.db\s+(.*)', l)
        if not m:
            continue
        for tok in m.group(1).split(','):
            tok = tok.strip()
            if tok.startswith('$'):
                out.append(int(tok[1:], 16))
    return out

# data blocks, contiguous in ROM in this order (line ranges from the listing)
def block(label):
    start = next(i for i, l in enumerate(asm) if l.startswith(label + ':'))
    end = start + 1
    while end < len(asm) and not re.match(r'^[A-Za-z_]\w*:', asm[end]):
        end += 1
    return db_bytes(asm[start:end])

order = ['GroundM_P1Data', 'SilenceData', 'GroundM_P2AData', 'GroundM_P2BData', 'GroundM_P2CData',
         'GroundM_P3AData', 'GroundM_P3BData', 'GroundMLdInData', 'GroundM_P4AData', 'GroundM_P4BData',
         'DeathMusData', 'GroundM_P4CData']
mem = []
addr = {}
for lab in order:
    addr[lab] = len(mem)
    mem += block(lab)

headers = {}
for l in asm:
    m = re.match(r'^(GroundLevel\w+Hdr):\s+\.db\s+\$(\w\w),\s*<(\w+),\s*>\w+,\s*\$(\w\w),\s*\$(\w\w),\s*\$(\w\w)', l)
    if m:
        headers[m.group(1)] = dict(lenofs=int(m.group(2), 16), data=m.group(3), tri=int(m.group(4), 16),
                                   sq1=int(m.group(5), 16), noise=int(m.group(6), 16))

LEN_TBL = [0x05, 0x0a, 0x14, 0x28, 0x50, 0x1e, 0x3c, 0x02,
           0x04, 0x08, 0x10, 0x20, 0x40, 0x18, 0x30, 0x0c,
           0x03, 0x06, 0x0c, 0x18, 0x30, 0x12, 0x24, 0x08,
           0x36, 0x03, 0x09, 0x06, 0x12, 0x1b, 0x24, 0x0c,
           0x24, 0x02, 0x06, 0x04, 0x0c, 0x12, 0x18, 0x08,
           0x12, 0x01, 0x03, 0x02, 0x06, 0x09, 0x0c, 0x04]

def sq2_frames(h):
    """Sum of square-2 note lengths until the $00 terminator = section length."""
    base = addr[h['data']]
    i = base
    cur = None
    total = 0
    while True:
        b = mem[i]
        i += 1
        if b == 0:
            return total
        if b & 0x80:
            cur = LEN_TBL[(b & 7) + h['lenofs']]
            b = mem[i]
            i += 1
        total += cur

def noise_events(h, frames):
    """(frame, beat) pairs for `frames` frames of this section's noise data, looping at $00."""
    base = addr[h['data']]
    ofs = h['noise']
    p = base + ofs
    t = 0
    ev = []
    while t < frames:
        b = mem[p]
        p += 1
        if b == 0:
            p = base + ofs
            continue
        idx = ((b & 1) << 2) | ((b >> 7) << 1) | ((b >> 6) & 1)
        length = LEN_TBL[idx + h['lenofs']]
        beat = (b >> 4) & 3
        if beat:
            ev.append((t, beat))
        t += length
    return ev

SEQ = ['LeadIn', 'Part1', 'Part1',
       'Part2A', 'Part2B', 'Part2A', 'Part2C', 'Part2A', 'Part2B', 'Part2A', 'Part2C',
       'Part3A', 'Part3B', 'Part3A', 'LeadIn', 'Part1', 'Part1',
       'Part4A', 'Part4B', 'Part4A', 'Part4C', 'Part4A', 'Part4B', 'Part4A', 'Part4C',
       'Part3A', 'Part3B', 'Part3A', 'LeadIn', 'Part4A', 'Part4B', 'Part4A', 'Part4C',
       # the loop returns to Part1 (header offset $11 -> $12); the transcription's bars 38-40 are its first three bars
       'Part1', 'Part1']

KEY = {1: 55, 2: 60, 3: 58}       # short -> F3 (hat), strong -> C3 (kick), long -> D3 (snare)
DUR = {1: 2, 2: 2, 3: 7}          # steps: 48 ms, 48 ms, 167 ms at 105 BPM

grid = [[] for _ in range(3840)]
frame0 = 0
print('section   frames  bars   beats(short/strong/long)')
for name in SEQ:
    h = headers['GroundLevel' + name + 'Hdr']
    frames = sq2_frames(h)
    ev = noise_events(h, frames)
    cnt = {1: 0, 2: 0, 3: 0}
    for f, beat in ev:
        cnt[beat] += 1
        assert (frame0 + f) % 3 == 0, (name, f)
        step = (frame0 + f) * 2 // 3
        for k in range(DUR[beat]):
            if step + k < 3840 and not grid[step + k]:
                grid[step + k] = [KEY[beat]]
    print(f'{name:8s} {frames:6d} {frames/144:5.2f}   {cnt[1]}/{cnt[2]}/{cnt[3]}')
    frame0 += frames
print('total frames', frame0, '=', frame0 / 144, 'bars;', frame0 * 2 // 3, 'steps')

if '--emit' in sys.argv:
    out = ['const MARIO1_TRK4_GRID: number[][] = [']
    for b in range(40):
        out.append(f'  // BAR {b+1} (Steps {b*96}..{b*96+95})')
        out.append('  ' + ', '.join('[' + ', '.join(map(str, c)) + ']' for c in grid[b*96:(b+1)*96]) + ',')
    out.append('];')
    open(os.path.join(HERE, 'trk4_grid.ts'), 'w').write('\n'.join(out) + '\n')
    onsets = sum(1 for s in range(3840) if grid[s] and (s == 0 or grid[s-1] != grid[s]))
    print('emitted; onsets', onsets)
