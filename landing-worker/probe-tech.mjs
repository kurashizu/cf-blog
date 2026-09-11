import { chromium } from 'playwright';

/* nodes: [id,type][]; cables: [from,fromPort,to,toPort][]; params; waves */
const P = (nodes, cables, params = {}, waves = {}) => ({
	advanced: true,
	rackGraph: {
		nodes: nodes.map(([id, type]) => ({ id, type })),
		cables: cables.map(([from, fromPort, to, toPort]) => ({ from, fromPort, to, toPort }))
	},
	graphParams: params,
	graphWaves: waves
});

const EXEC = ['entry', 'then', 'output', 'exec'];
const CASES = [];
const add = (name, patch, args = [2, 40, 8]) => CASES.push({ name, patch, args });
const K = (id, kind, value) => [`${id}.kind`, kind, `${id}.value`, value];
// const kinds: 6=F32 7=FRQ 9=PIT 5=PCT 2=I32
const kf = (id, hz) => ({ [`${id}.kind`]: 7, [`${id}.value`]: hz });
const kp = (id, v) => ({ [`${id}.kind`]: 5, [`${id}.value`]: v });
const kn = (id, v) => ({ [`${id}.kind`]: 6, [`${id}.value`]: v });

// ---------- baselines ----------
add('BASE bare osc', P([['entry','in'],['osc1','osc'],['output','out']], [EXEC, ['osc1','out','output','in']]));
add('BASE no-exec silence', P([['entry','in'],['osc1','osc'],['output','out']], [['osc1','out','output','in']]));
add('BASE saw', P([['entry','in'],['osc1','osc'],['output','out']], [EXEC, ['osc1','out','output','in']], {}, {'osc1.wave':'sawtooth'}));

// ---------- the reported bug: audio-rate into osc.pitch ----------
add('FM tocv->osc.pitch CABLE', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC, ['mod','out','cv','a'], ['cv','out','car','pitch'], ['car','out','output','in']], {}
));
add('FM tocv->osc.pitch NOCABLE', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC, ['mod','out','cv','a'], ['car','out','output','in']], {}
));
// with a big depth gain so any FM would be unmistakable
add('FM deep tocv->gain->pitch', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['dep','gain'],['car','osc'],['output','out']],
	[EXEC, ['mod','out','cv','a'], ['cv','out','dep','in'], ['dep','out','car','pitch'], ['car','out','output','in']],
	{ 'dep.level': 400 }
));
// TO-SIG version: value -> signal -> pitch
add('FM tosig->osc.pitch', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['ts','tosig'],['car','osc'],['output','out']],
	[EXEC, ['mod','out','cv','a'], ['cv','out','ts','level'], ['ts','out','car','pitch'], ['car','out','output','in']], {}
));
// control: CONST into osc.pitch does work (value path)
add('CTL const 880 -> osc.pitch', P(
	[['entry','in'],['k','const'],['car','osc'],['output','out']],
	[EXEC, ['k','out','car','pitch'], ['car','out','output','in']], kf('k', 880)
));

// PWM pitch: same value-only question
add('FM tocv->pwm.pitch CABLE', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['dep','gain'],['car','pwm'],['output','out']],
	[EXEC, ['mod','out','cv','a'], ['cv','out','dep','in'], ['dep','out','car','pitch'], ['car','out','output','in']],
	{ 'dep.level': 400 }
));
add('FM tocv->pwm.pitch NOCABLE', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['dep','gain'],['car','pwm'],['output','out']],
	[EXEC, ['mod','out','cv','a'], ['cv','out','dep','in'], ['car','out','output','in']],
	{ 'dep.level': 400 }
));

// FILTER cutoff audio-rate (is cutoff a real mod target? yes per knob())
add('AR audio->filter.cutoff', P(
	[['entry','in'],['o','osc'],['mod','osc'],['cv','tocv'],['dep','gain'],['f','filter'],['output','out']],
	[EXEC, ['o','out','f','in'], ['mod','out','cv','a'], ['cv','out','dep','in'], ['dep','out','f','cutoff'], ['f','out','output','in']],
	{ 'dep.level': 3000, 'f.cutoff': 3200, 'f.q': 8 }, {'o.wave':'sawtooth'}
));
add('AR audio->filter.cutoff NOCABLE', P(
	[['entry','in'],['o','osc'],['mod','osc'],['cv','tocv'],['dep','gain'],['f','filter'],['output','out']],
	[EXEC, ['o','out','f','in'], ['mod','out','cv','a'], ['cv','out','dep','in'], ['f','out','output','in']],
	{ 'dep.level': 3000, 'f.cutoff': 3200, 'f.q': 8 }, {'o.wave':'sawtooth'}
));

// ---------- subtractive ----------
add('SUB saw->filter->VCA(env)', P(
	[['entry','in'],['o','osc'],['f','filter'],['e','env'],['g','gain'],['output','out']],
	[EXEC, ['o','out','f','in'], ['f','out','g','in'], ['e','out','g','level'], ['g','out','output','in']],
	{ 'f.cutoff':1200,'f.q':6,'e.envA':0.01,'e.envD':0.3,'e.envS':20,'e.envR':0.4 }, {'o.wave':'sawtooth'}
));
add('SUB env->cutoff (mul depth)', P(
	[['entry','in'],['o','osc'],['f','filter'],['e','env'],['m','gain'],['output','out']],
	[EXEC, ['o','out','f','in'], ['e','out','m','in'], ['m','out','f','cutoff'], ['f','out','output','in']],
	{ 'f.cutoff':200,'f.q':8,'m.level':5000,'e.envA':0.01,'e.envD':1.2,'e.envS':0 }, {'o.wave':'sawtooth'}
), [2,40,16]);
add('SUB env->cutoff NOCABLE', P(
	[['entry','in'],['o','osc'],['f','filter'],['e','env'],['m','gain'],['output','out']],
	[EXEC, ['o','out','f','in'], ['e','out','m','in'], ['f','out','output','in']],
	{ 'f.cutoff':200,'f.q':8,'m.level':5000,'e.envA':0.01,'e.envD':1.2,'e.envS':0 }, {'o.wave':'sawtooth'}
), [2,40,16]);

// ---------- additive ----------
add('ADD 3 partials distinct', P(
	[['entry','in'],['k1','const'],['k2','const'],['k3','const'],['o1','osc'],['o2','osc'],['o3','osc'],
	 ['g1','gain'],['g2','gain'],['g3','gain'],['s','sum'],['output','out']],
	[EXEC, ['k1','out','o1','pitch'],['k2','out','o2','pitch'],['k3','out','o3','pitch'],
	 ['o1','out','g1','in'],['o2','out','g2','in'],['o3','out','g3','in'],
	 ['g1','out','s','in'],['g2','out','s','in'],['g3','out','s','in'],['s','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',337), ...kf('k3',551), 'g1.level':0.5,'g2.level':0.3,'g3.level':0.2 }
));
// each partial with its own envelope = real additive
add('ADD 3 partials own envs', P(
	[['entry','in'],['k1','const'],['k2','const'],['k3','const'],['o1','osc'],['o2','osc'],['o3','osc'],
	 ['g1','gain'],['g2','gain'],['g3','gain'],['e1','env'],['e2','env'],['e3','env'],['s','sum'],['output','out']],
	[EXEC, ['k1','out','o1','pitch'],['k2','out','o2','pitch'],['k3','out','o3','pitch'],
	 ['o1','out','g1','in'],['o2','out','g2','in'],['o3','out','g3','in'],
	 ['e1','out','g1','level'],['e2','out','g2','level'],['e3','out','g3','level'],
	 ['g1','out','s','in'],['g2','out','s','in'],['g3','out','s','in'],['s','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',440), ...kf('k3',880),
	  'e1.envA':0.01,'e1.envD':1.5,'e1.envS':30,'e2.envA':0.2,'e2.envD':0.4,'e2.envS':10,'e3.envA':0.005,'e3.envD':0.15,'e3.envS':0 }
), [2,40,16]);

// ---------- AM / ring ----------
add('RING osc x osc depth100', P(
	[['entry','in'],['k1','const'],['k2','const'],['c','osc'],['m','osc'],['r','ring'],['output','out']],
	[EXEC, ['k1','out','c','pitch'],['k2','out','m','pitch'],['c','out','r','in'],['m','out','r','b'],['r','out','output','in']],
	{ ...kf('k1',440), ...kf('k2',137), 'r.ringDepth':100 }
));
add('RING depth 0 control', P(
	[['entry','in'],['k1','const'],['k2','const'],['c','osc'],['m','osc'],['r','ring'],['output','out']],
	[EXEC, ['k1','out','c','pitch'],['k2','out','m','pitch'],['c','out','r','in'],['m','out','r','b'],['r','out','output','in']],
	{ ...kf('k1',440), ...kf('k2',137), 'r.ringDepth':0 }
));
add('AM audio->gain.level', P(
	[['entry','in'],['k1','const'],['k2','const'],['c','osc'],['m','osc'],['cv','tocv'],['g','gain'],['output','out']],
	[EXEC, ['k1','out','c','pitch'],['k2','out','m','pitch'],['c','out','g','in'],['m','out','cv','a'],['cv','out','g','level'],['g','out','output','in']],
	{ ...kf('k1',440), ...kf('k2',137), 'g.level':1 }
));
add('AM audio->gain.level NOCABLE', P(
	[['entry','in'],['k1','const'],['k2','const'],['c','osc'],['m','osc'],['cv','tocv'],['g','gain'],['output','out']],
	[EXEC, ['k1','out','c','pitch'],['k2','out','m','pitch'],['c','out','g','in'],['m','out','cv','a'],['g','out','output','in']],
	{ ...kf('k1',440), ...kf('k2',137), 'g.level':1 }
));

// ---------- waveshaping / folding ----------
add('FOLD shapeKind2 drive90', P(
	[['entry','in'],['o','osc'],['sh','shape'],['output','out']],
	[EXEC, ['o','out','sh','in'],['sh','out','output','in']], { 'sh.shapeKind':2,'sh.shapeDrive':90 }
));
add('FOLD drive 0.1 control', P(
	[['entry','in'],['o','osc'],['sh','shape'],['output','out']],
	[EXEC, ['o','out','sh','in'],['sh','out','output','in']], { 'sh.shapeKind':2,'sh.shapeDrive':0.1 }
));
add('DIST shapeKind0 drive90', P(
	[['entry','in'],['o','osc'],['sh','shape'],['output','out']],
	[EXEC, ['o','out','sh','in'],['sh','out','output','in']], { 'sh.shapeKind':0,'sh.shapeDrive':90 }
));
// dynamic fold via pre-gain envelope (shapeDrive is fixed:true)
add('FOLD dynamic via pregain env', P(
	[['entry','in'],['o','osc'],['g','gain'],['sh','shape'],['e','env'],['d','gain'],['output','out']],
	[EXEC, ['o','out','g','in'],['e','out','d','in'],['d','out','g','level'],['g','out','sh','in'],['sh','out','output','in']],
	{ 'sh.shapeKind':2,'sh.shapeDrive':60,'d.level':8,'g.level':0,'e.envA':1.5,'e.envD':0.1,'e.envS':100 }
), [2,40,16]);

// ---------- PWM ----------
add('PWM pw 0.5', P([['entry','in'],['k','const'],['p','pwm'],['output','out']],
	[EXEC, ['k','out','p','pw'],['p','out','output','in']], kp('k',0.5)));
add('PWM pw 0.1', P([['entry','in'],['k','const'],['p','pwm'],['output','out']],
	[EXEC, ['k','out','p','pw'],['p','out','output','in']], kp('k',0.1)));
add('PWM lfo->pw moving', P(
	[['entry','in'],['k','const'],['lfo','osc'],['cv','tocv'],['dep','gain'],['p','pwm'],['output','out']],
	[EXEC, ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','dep','in'],['dep','out','p','pw'],['p','out','output','in']],
	{ ...kf('k',3), 'dep.level':0.35 }
), [2,40,16]);
add('PWM lfo->pw NOCABLE', P(
	[['entry','in'],['k','const'],['lfo','osc'],['cv','tocv'],['dep','gain'],['p','pwm'],['output','out']],
	[EXEC, ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','dep','in'],['p','out','output','in']],
	{ ...kf('k',3), 'dep.level':0.35 }
), [2,40,16]);

// ---------- unison / supersaw / sub-osc ----------
add('UNISON 3 detuned saws', P(
	[['entry','in'],['k1','const'],['k2','const'],['k3','const'],['o1','osc'],['o2','osc'],['o3','osc'],['s','sum'],['output','out']],
	[EXEC, ['k1','out','o1','pitch'],['k2','out','o2','pitch'],['k3','out','o3','pitch'],
	 ['o1','out','s','in'],['o2','out','s','in'],['o3','out','s','in'],['s','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',221.4), ...kf('k3',218.6) },
	{ 'o1.wave':'sawtooth','o2.wave':'sawtooth','o3.wave':'sawtooth' }
), [3,40,16]);
add('SUBOSC keytracked -12', P(
	[['entry','in'],['kb','const'],['t','trsp'],['f0','tofreq'],['f1','tofreq'],['o1','osc'],['o2','osc'],['s','sum'],['output','out']],
	[EXEC, ['entry','pitch','f0','a'],['entry','pitch','t','a'],['kb','out','t','b'],['t','out','f1','a'],
	 ['f0','out','o1','pitch'],['f1','out','o2','pitch'],['o1','out','s','in'],['o2','out','s','in'],['s','out','output','in']],
	{ ...kn('kb',-12) }, { 'o1.wave':'sawtooth','o2.wave':'sine' }
));
add('KEYTRACK pitch->tofreq->osc', P(
	[['entry','in'],['tf','tofreq'],['o','osc'],['output','out']],
	[EXEC, ['entry','pitch','tf','a'],['tf','out','o','pitch'],['o','out','output','in']], {}
));

// ---------- noise / percussion ----------
add('PERC noise+env', P(
	[['entry','in'],['n','noise'],['g','gain'],['e','env'],['output','out']],
	[EXEC, ['n','out','g','in'],['e','out','g','level'],['g','out','output','in']],
	{ 'e.envA':0.001,'e.envD':0.15,'e.envS':0,'e.envR':0.05 }
), [2,40,16,0.05]);

// ---------- Karplus-Strong via SEND/RTN ----------
const ksNodes = [['entry','in'],['ex','excite'],['s','sum'],['snd','fbsend'],['rtn','fbrtn'],
	['dl','delay'],['fb','gain'],['lp','filter'],['output','out']];
const ksCables = [EXEC, ['ex','out','s','in'],['rtn','out','s','in'],['s','out','dl','in'],
	['dl','out','lp','in'],['lp','out','fb','in'],['fb','out','snd','in'],['s','out','output','in']];
add('KS fb 0.97', P(ksNodes, ksCables,
	{ 'snd.bus':0,'rtn.bus':0,'dl.delayTime':0.00454,'fb.level':0.97,'lp.cutoff':5000,'lp.q':0.7,'ex.exLength':8,'ex.exTone':6000 }
), [3,40,16]);
add('KS fb 0 control', P(ksNodes, ksCables,
	{ 'snd.bus':0,'rtn.bus':0,'dl.delayTime':0.00454,'fb.level':0,'lp.cutoff':5000,'lp.q':0.7,'ex.exLength':8,'ex.exTone':6000 }
), [3,40,16]);
add('PHYS string', P([['entry','in'],['st','string'],['output','out']], [EXEC, ['st','out','output','in']],
	{ 'st.decayTime':2,'st.damping':40 }), [3,40,16]);
add('PHYS tube', P([['entry','in'],['tb','tube'],['output','out']], [EXEC, ['tb','out','output','in']], {}), [3,40,16]);
add('MODAL excite->modes', P(
	[['entry','in'],['ex','excite'],['md','modes'],['output','out']],
	[EXEC, ['ex','out','md','in'],['md','out','output','in']],
	{ 'md.modeHz':200,'md.mode1':1,'md.mode2':2.4,'md.mode3':4.1,'md.modeQ':40,'md.modeMix':100,'ex.exLength':5 }
), [3,40,16]);

// ---------- comb / flanger / chorus / phaser ----------
add('FLANGE lfo->delayTime', P(
	[['entry','in'],['o','osc'],['k','const'],['lfo','osc'],['cv','tocv'],['dep','gain'],['dl','delay'],['s','sum'],['output','out']],
	[EXEC, ['o','out','dl','in'],['o','out','s','in'],['dl','out','s','in'],
	 ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','dep','in'],['dep','out','dl','delayTime'],['s','out','output','in']],
	{ ...kf('k',0.6), 'dep.level':0.003,'dl.delayTime':0.004 }, {'o.wave':'sawtooth'}
), [3,40,16]);
add('FLANGE static (no lfo cable)', P(
	[['entry','in'],['o','osc'],['k','const'],['lfo','osc'],['cv','tocv'],['dep','gain'],['dl','delay'],['s','sum'],['output','out']],
	[EXEC, ['o','out','dl','in'],['o','out','s','in'],['dl','out','s','in'],
	 ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','dep','in'],['s','out','output','in']],
	{ ...kf('k',0.6), 'dep.level':0.003,'dl.delayTime':0.004 }, {'o.wave':'sawtooth'}
), [3,40,16]);
add('COMB resonant via SEND/RTN', P(
	[['entry','in'],['o','osc'],['s','sum'],['snd','fbsend'],['rtn','fbrtn'],['dl','delay'],['fb','gain'],['output','out']],
	[EXEC, ['o','out','s','in'],['rtn','out','s','in'],['s','out','dl','in'],['dl','out','fb','in'],['fb','out','snd','in'],['s','out','output','in']],
	{ 'snd.bus':0,'rtn.bus':0,'dl.delayTime':0.01,'fb.level':0.85 }
), [3,40,16]);
add('PHASER 2x allpass swept', P(
	[['entry','in'],['o','osc'],['k','const'],['lfo','osc'],['cv','tocv'],['dep','gain'],['ap1','filter'],['ap2','filter'],['s','sum'],['output','out']],
	[EXEC, ['o','out','ap1','in'],['ap1','out','ap2','in'],['o','out','s','in'],['ap2','out','s','in'],
	 ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','dep','in'],['dep','out','ap1','cutoff'],['dep','out','ap2','cutoff'],['s','out','output','in']],
	{ ...kf('k',0.7), 'dep.level':600,'ap1.type':7,'ap1.cutoff':800,'ap2.type':7,'ap2.cutoff':1300,'ap1.q':3,'ap2.q':3 }, {'o.wave':'sawtooth'}
), [3,40,16]);

// ---------- reverb ----------
const revN = [['entry','in'],['n','noise'],['g','gain'],['e','env'],['sp','space'],['output','out']];
const revC = [EXEC, ['n','out','g','in'],['e','out','g','level'],['g','out','sp','in'],['sp','out','output','in']];
add('REVERB mix 100', P(revN, revC,
	{ 'e.envA':0.001,'e.envD':0.03,'e.envS':0,'e.envR':0.01,'sp.spaceSize':90,'sp.spaceMix':100,'sp.spaceDecay':80 }), [3,40,16,0.04]);
add('REVERB mix 0 control', P(revN, revC,
	{ 'e.envA':0.001,'e.envD':0.03,'e.envS':0,'e.envR':0.01,'sp.spaceSize':90,'sp.spaceMix':0,'sp.spaceDecay':80 }), [3,40,16,0.04]);

// ---------- envelope following / ducking ----------
add('FOLLOW audio->gain.level', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['lfo','osc'],['fol','follow'],['g','gain'],['output','out']],
	[EXEC, ['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],['fol','out','g','level'],['g','out','output','in']],
	{ ...kf('k1',330), ...kf('k2',2), 'fol.resp':8,'g.level':0 }
), [3,40,16]);
add('FOLLOW NOCABLE control', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['lfo','osc'],['fol','follow'],['g','gain'],['output','out']],
	[EXEC, ['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],['g','out','output','in']],
	{ ...kf('k1',330), ...kf('k2',2), 'fol.resp':8,'g.level':0 }
), [3,40,16]);
add('DUCK follow inverted', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['lfo','osc'],['fol','follow'],['inv','gain'],['g','gain'],['output','out']],
	[EXEC, ['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],
	 ['fol','out','inv','in'],['inv','out','g','level'],['g','out','output','in']],
	{ ...kf('k1',330), ...kf('k2',2), 'fol.resp':8,'inv.level':-1,'g.level':1 }
), [3,40,16]);
add('COMP limiting', P([['entry','in'],['o','osc'],['g','gain'],['c','comp'],['output','out']],
	[EXEC, ['o','out','g','in'],['g','out','c','in'],['c','out','output','in']],
	{ 'g.level':4,'c.compThresh':-30,'c.compRatio':20 }));
add('COMP bypass control', P([['entry','in'],['o','osc'],['g','gain'],['c','comp'],['output','out']],
	[EXEC, ['o','out','g','in'],['g','out','c','in'],['c','out','output','in']],
	{ 'g.level':4,'c.compThresh':0,'c.compRatio':1 }));

// ---------- stereo / mid-side ----------
add('PAN hard L', P([['entry','in'],['o','osc'],['pn','pan'],['output','out']],
	[EXEC, ['o','out','pn','in'],['pn','out','output','in']], { 'pn.panPos':-100 }));
add('PAN centre', P([['entry','in'],['o','osc'],['pn','pan'],['output','out']],
	[EXEC, ['o','out','pn','in'],['pn','out','output','in']], { 'pn.panPos':0 }));
add('PAN lfo->panPos', P(
	[['entry','in'],['k','const'],['o','osc'],['lfo','osc'],['cv','tocv'],['dep','gain'],['pn','pan'],['output','out']],
	[EXEC, ['k','out','lfo','pitch'],['o','out','pn','in'],['lfo','out','cv','a'],['cv','out','dep','in'],['dep','out','pn','panPos'],['pn','out','output','in']],
	{ ...kf('k',3), 'dep.level':100,'pn.panPos':0 }
), [3,40,16]);
add('MS break->make wide200', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['o2','osc'],['mg','merge'],['bk','break'],['mk','make'],['output','out']],
	[EXEC, ['k1','out','o','pitch'],['k2','out','o2','pitch'],['o','out','mg','in'],['o2','out','mg','r'],
	 ['mg','out','bk','in'],['bk','out','mk','in'],['bk','side','mk','b'],['mk','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',331), 'mk.wide':200 }
));
add('MS wide 0 control', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['o2','osc'],['mg','merge'],['bk','break'],['mk','make'],['output','out']],
	[EXEC, ['k1','out','o','pitch'],['k2','out','o2','pitch'],['o','out','mg','in'],['o2','out','mg','r'],
	 ['mg','out','bk','in'],['bk','out','mk','in'],['bk','side','mk','b'],['mk','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',331), 'mk.wide':0 }
));

// ---------- velocity ----------
add('VEL->gain.level', P([['entry','in'],['o','osc'],['g','gain'],['output','out']],
	[EXEC, ['entry','vel','g','level'],['o','out','g','in'],['g','out','output','in']], {}));
add('VEL->filter.cutoff', P(
	[['entry','in'],['o','osc'],['m','mul'],['kb','const'],['f','filter'],['output','out']],
	[EXEC, ['entry','vel','m','a'],['kb','out','m','b'],['m','out','f','cutoff'],['o','out','f','in'],['f','out','output','in']],
	{ ...kn('kb',4000), 'f.q':2 }, {'o.wave':'sawtooth'}
));
add('VEL->cutoff (vel low ctl)', P(
	[['entry','in'],['o','osc'],['m','mul'],['kb','const'],['f','filter'],['output','out']],
	[EXEC, ['entry','vel','m','a'],['kb','out','m','b'],['m','out','f','cutoff'],['o','out','f','in'],['f','out','output','in']],
	{ ...kn('kb',300), 'f.q':2 }, {'o.wave':'sawtooth'}
));

// ---------- drone ----------
add('DRONE fixed, short hold', P([['entry','in'],['k','const'],['o','osc'],['output','out']],
	[EXEC, ['k','out','o','pitch'],['o','out','output','in']], kf('k',110)), [3,40,16,0.2]);

// ---------- hard sync substitutes ----------
add('SYNC sub: ring 3:1', P(
	[['entry','in'],['k1','const'],['k2','const'],['c','osc'],['m','osc'],['r','ring'],['output','out']],
	[EXEC, ['k1','out','c','pitch'],['k2','out','m','pitch'],['c','out','r','in'],['m','out','r','b'],['r','out','output','in']],
	{ ...kf('k1',660), ...kf('k2',220) }, {'c.wave':'sawtooth','m.wave':'sawtooth'}
));
add('SYNC sub: swept ring (env on car)', P(
	[['entry','in'],['k1','const'],['e','env'],['dep','gain'],['c','osc'],['m','osc'],['r','ring'],['output','out']],
	[EXEC, ['k1','out','m','pitch'],['e','out','dep','in'],['dep','out','c','pitch'],['c','out','r','in'],['m','out','r','b'],['r','out','output','in']],
	{ ...kf('k1',220), 'dep.level':2000,'e.envA':0.01,'e.envD':1.5,'e.envS':0 }, {'c.wave':'sawtooth','m.wave':'sawtooth'}
), [3,40,16]);

// ---------- sequencing ----------
add('SEQ wait chain 2 notes', P(
	[['entry','in'],['w1','wait'],['o1','osc'],['o2','osc'],['k1','const'],['k2','const'],
	 ['g1','gain'],['g2','gain'],['e1','env'],['e2','env'],['s','sum'],['output','out']],
	[['entry','then','output','exec'],['entry','then','w1','exec'],
	 ['k1','out','o1','pitch'],['k2','out','o2','pitch'],
	 ['o1','out','g1','in'],['e1','out','g1','level'],['o2','out','g2','in'],['e2','out','g2','level'],
	 ['g1','out','s','in'],['g2','out','s','in'],['s','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',330),'w1.gapMs':500,
	  'e1.envA':0.005,'e1.envD':0.25,'e1.envS':0,'e1.envR':0.05,'e2.envA':0.005,'e2.envD':0.25,'e2.envS':0,'e2.envR':0.05 }
), [3,40,16,0.05]);
// wait feeding an env directly, so the second grain is late
add('SEQ wait->env exec', P(
	[['entry','in'],['w1','wait'],['o1','osc'],['o2','osc'],['k1','const'],['k2','const'],
	 ['g1','gain'],['g2','gain'],['e1','env'],['e2','env'],['s','sum'],['output','out']],
	[['entry','then','output','exec'],['entry','then','w1','exec'],['w1','then','e2','exec'],['entry','then','e1','exec'],
	 ['k1','out','o1','pitch'],['k2','out','o2','pitch'],
	 ['o1','out','g1','in'],['e1','out','g1','level'],['o2','out','g2','in'],['e2','out','g2','level'],
	 ['g1','out','s','in'],['g2','out','s','in'],['s','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',330),'w1.gapMs':800,
	  'e1.envA':0.005,'e1.envD':0.25,'e1.envS':0,'e1.envR':0.05,'e2.envA':0.005,'e2.envD':0.25,'e2.envS':0,'e2.envR':0.05 }
), [3,40,16,0.05]);
// arp substitute: stepped LFO onto pitch (map ST4)
add('ARP map ST4 lfo->pitch', P(
	[['entry','in'],['k','const'],['lfo','osc'],['cv','tocv'],['mp','map'],['o','osc'],['output','out']],
	[EXEC, ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','mp','a'],['mp','out','o','pitch'],['o','out','output','in']],
	{ ...kf('k',4), 'mp.shape':6,'mp.inLo':-1,'mp.inHi':1,'mp.outLo':220,'mp.outHi':660 }
), [3,40,16]);
// same but the stepped value reaches a REAL mod target (filter cutoff)
add('ARP map ST4 lfo->cutoff', P(
	[['entry','in'],['k','const'],['lfo','osc'],['cv','tocv'],['mp','map'],['o','osc'],['f','filter'],['output','out']],
	[EXEC, ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','mp','a'],['mp','out','f','cutoff'],
	 ['o','out','f','in'],['f','out','output','in']],
	{ ...kf('k',4), 'mp.shape':6,'mp.inLo':-1,'mp.inHi':1,'mp.outLo':300,'mp.outHi':5000,'f.q':8,'f.cutoff':0 }, {'o.wave':'sawtooth'}
), [3,40,16]);

// ---------- wavetable / phase distortion ----------
add('PHASE osc phs 0.25', P([['entry','in'],['k','const'],['o','osc'],['output','out']],
	[EXEC, ['k','out','o','phase'],['o','out','output','in']], kp('k',0.25)));
add('PHASE osc phs 0', P([['entry','in'],['k','const'],['o','osc'],['output','out']],
	[EXEC, ['k','out','o','phase'],['o','out','output','in']], kp('k',0)));
add('PHASE lfo->phs (moving?)', P(
	[['entry','in'],['k','const'],['lfo','osc'],['cv','tocv'],['o','osc'],['output','out']],
	[EXEC, ['k','out','lfo','pitch'],['lfo','out','cv','a'],['cv','out','o','phase'],['o','out','output','in']],
	{ ...kf('k',2) }
), [3,40,16]);
add('WT morph 2 waves crossfade', P(
	[['entry','in'],['o1','osc'],['o2','osc'],['g1','gain'],['g2','gain'],['e','env'],['inv','gain'],['off','tosig'],['s','sum'],['output','out']],
	[EXEC, ['o1','out','g1','in'],['o2','out','g2','in'],['e','out','g2','level'],
	 ['e','out','inv','in'],['inv','out','g1','level'],['g1','out','s','in'],['g2','out','s','in'],['s','out','output','in']],
	{ 'inv.level':-1,'g1.level':1,'g2.level':0,'e.envA':1.5,'e.envD':0.1,'e.envS':100 },
	{ 'o1.wave':'sine','o2.wave':'sawtooth' }
), [3,40,16]);

// ---------- vocoder ----------
add('VOCODER 3-band', P(
	[['entry','in'],['mo','noise'],['kc','const'],['car','osc'],
	 ['b1','filter'],['b2','filter'],['b3','filter'],['f1','follow'],['f2','follow'],['f3','follow'],
	 ['c1','filter'],['c2','filter'],['c3','filter'],['v1','gain'],['v2','gain'],['v3','gain'],['s','sum'],['output','out']],
	[EXEC, ['kc','out','car','pitch'],
	 ['mo','out','b1','in'],['mo','out','b2','in'],['mo','out','b3','in'],
	 ['b1','out','f1','in'],['b2','out','f2','in'],['b3','out','f3','in'],
	 ['car','out','c1','in'],['car','out','c2','in'],['car','out','c3','in'],
	 ['c1','out','v1','in'],['c2','out','v2','in'],['c3','out','v3','in'],
	 ['f1','out','v1','level'],['f2','out','v2','level'],['f3','out','v3','level'],
	 ['v1','out','s','in'],['v2','out','s','in'],['v3','out','s','in'],['s','out','output','in']],
	{ ...kf('kc',110),
	  'b1.type':2,'b1.cutoff':400,'b1.q':6,'b2.type':2,'b2.cutoff':1200,'b2.q':6,'b3.type':2,'b3.cutoff':3000,'b3.q':6,
	  'c1.type':2,'c1.cutoff':400,'c1.q':6,'c2.type':2,'c2.cutoff':1200,'c2.q':6,'c3.type':2,'c3.cutoff':3000,'c3.q':6,
	  'v1.level':0,'v2.level':0,'v3.level':0 },
	{ 'car.wave':'sawtooth' }
), [3,40,16]);

// ---------- granular ----------
add('GRAN wait-scattered grains', P(
	[['entry','in'],['w1','wait'],['w2','wait'],['k1','const'],['k2','const'],['k3','const'],
	 ['o1','osc'],['o2','osc'],['o3','osc'],['e1','env'],['e2','env'],['e3','env'],
	 ['g1','gain'],['g2','gain'],['g3','gain'],['s','sum'],['output','out']],
	[['entry','then','output','exec'],['entry','then','e1','exec'],
	 ['entry','then','w1','exec'],['w1','then','e2','exec'],['w1','then','w2','exec'],['w2','then','e3','exec'],
	 ['k1','out','o1','pitch'],['k2','out','o2','pitch'],['k3','out','o3','pitch'],
	 ['o1','out','g1','in'],['o2','out','g2','in'],['o3','out','g3','in'],
	 ['e1','out','g1','level'],['e2','out','g2','level'],['e3','out','g3','level'],
	 ['g1','out','s','in'],['g2','out','s','in'],['g3','out','s','in'],['s','out','output','in']],
	{ ...kf('k1',220), ...kf('k2',440), ...kf('k3',660), 'w1.gapMs':700,'w2.gapMs':700,
	  'e1.envA':0.01,'e1.envD':0.1,'e1.envS':0,'e1.envR':0.02,
	  'e2.envA':0.01,'e2.envD':0.1,'e2.envS':0,'e2.envR':0.02,
	  'e3.envA':0.01,'e3.envD':0.1,'e3.envS':0,'e3.envR':0.02 }
), [3,40,16,0.05]);

const browser = await chromium.launch({ channel: 'chrome' });
const out = [];
try {
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
	await page.goto('http://localhost:5182/synth/audit', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__audit, null, { timeout: 30000 });
	for (const c of CASES) {
		const r = await page.evaluate(
			async ([patch, args]) => {
				const applied = window.__audit.setTrack(patch);
				const res = await window.__audit.run(...args);
				return { applied, res };
			},
			[c.patch, c.args]
		);
		out.push({ name: c.name, ...r });
		const e = r.res;
		console.log(
			`${c.name.padEnd(32)} v=${e.builtVoice ? 1 : 0} peak=${String(e.peak).padEnd(7)} env=[${e.envelope.join(' ')}]${e.error ? ' ERR=' + e.error : ''}`
		);
	}
} finally {
	await browser.close();
}
