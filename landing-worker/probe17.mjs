import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('krsz.welcome.seen','1'); });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5182/synth', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// Build the chain in a real OfflineAudioContext, exactly as the engine does.
const r = await page.evaluate(async () => {
  const ac = new OfflineAudioContext(1, 44100*2, 44100);
  // OSC2 @1Hz -> TO-CV (gain 1) -> MAP -> GAIN.level ; OSC1 @440 -> GAIN -> out
  const osc2 = ac.createOscillator(); osc2.frequency.value = 1;
  const tocv = ac.createGain(); tocv.gain.value = 1;
  osc2.connect(tocv);
  // MAP: in-stage for X -1..1
  const lo=-1, hi=1, span=hi-lo;
  const inGain = ac.createGain(); inGain.gain.value = 2/span;
  const inOff = ac.createConstantSource(); inOff.offset.value = -1-(2*lo)/span;
  const shaped = ac.createGain();
  tocv.connect(inGain); inGain.connect(shaped); inOff.connect(shaped);
  const sh = ac.createWaveShaper();
  const N=1024, t=new Float32Array(N);
  for (let i=0;i<N;i++){ const x=(i/(N-1))*2-1; const norm=(x+1)/2; // GATE on 0..1
    const y = norm < 0.5 ? 0 : 1;  // outLo 0 outHi 1
    t[i] = y*2-1; }
  sh.curve=t; sh.oversample='2x'; shaped.connect(sh);
  const outGain=ac.createGain(); outGain.gain.value=(1-0)/2;
  const outOff=ac.createConstantSource(); outOff.offset.value=0+(1-0)/2;
  const result=ac.createGain(); sh.connect(outGain); outGain.connect(result); outOff.connect(result);
  const osc1=ac.createOscillator(); osc1.frequency.value=440;
  const g=ac.createGain(); g.gain.value=0;      // LVL = 0
  osc1.connect(g); result.connect(g.gain); g.connect(ac.destination);
  osc1.start(); osc2.start(); inOff.start(); outOff.start();
  const buf = await ac.startRendering();
  const d = buf.getChannelData(0);
  const rms=(a,b)=>{let s=0;for(let i=a;i<b;i++)s+=d[i]*d[i];return Math.sqrt(s/(b-a));};
  return { q1:+rms(0,11025).toFixed(4), q2:+rms(11025,22050).toFixed(4),
           q3:+rms(22050,33075).toFixed(4), q4:+rms(33075,44100).toFixed(4) };
});
console.log('RMS per quarter-second:', r);
console.log('ERRS', errs);
await b.close();
