import { chromium } from 'playwright';
const P = (nodes, cables, params = {}, waves = {}) => ({
	advanced: true,
	rackGraph: { nodes: nodes.map(([id,type])=>({id,type})), cables: cables.map(([from,fromPort,to,toPort])=>({from,fromPort,to,toPort})) },
	graphParams: params, graphWaves: waves
});
const EXEC = ['entry','then','output','exec'];
const kf = (id,hz)=>({[`${id}.kind`]:7,[`${id}.value`]:hz});
const kp = (id,v)=>({[`${id}.kind`]:5,[`${id}.value`]:v});
const kn = (id,v)=>({[`${id}.kind`]:6,[`${id}.value`]:v});
const CASES=[]; const add=(n,p,a=[2,40,8])=>CASES.push({name:n,patch:p,args:a});

// ---- WAIT with TWO OUT nodes (the documented flam shape) ----
const seqN = [['entry','in'],['w1','wait'],['k1','const'],['k2','const'],['o1','osc'],['o2','osc'],
	['e1','env'],['e2','env'],['g1','gain'],['g2','gain'],['out1','out'],['out2','out']];
const seqC = [['entry','then','out1','exec'],['entry','then','w1','exec'],['w1','then','out2','exec'],
	['k1','out','o1','pitch'],['k2','out','o2','pitch'],
	['o1','out','g1','in'],['e1','out','g1','level'],['o2','out','g2','in'],['e2','out','g2','level'],
	['g1','out','out1','in'],['g2','out','out2','in']];
const seqP = {...kf('k1',220),...kf('k2',440),
	'e1.envA':0.005,'e1.envD':0.2,'e1.envS':0,'e1.envR':0.05,'e2.envA':0.005,'e2.envD':0.2,'e2.envS':0,'e2.envR':0.05};
add('SEQ 2 OUTs wait 600ms', P(seqN, seqC, {...seqP,'w1.gapMs':600}), [3,40,16,0.05]);
add('SEQ 2 OUTs wait 0ms', P(seqN, seqC, {...seqP,'w1.gapMs':0}), [3,40,16,0.05]);
// 4-step sequence: chain of waits, 4 OUTs
const s4N=[['entry','in'],['w1','wait'],['w2','wait'],['w3','wait'],
	['k1','const'],['k2','const'],['k3','const'],['k4','const'],
	['o1','osc'],['o2','osc'],['o3','osc'],['o4','osc'],
	['e1','env'],['e2','env'],['e3','env'],['e4','env'],
	['g1','gain'],['g2','gain'],['g3','gain'],['g4','gain'],
	['out1','out'],['out2','out'],['out3','out'],['out4','out']];
const s4C=[['entry','then','out1','exec'],['entry','then','w1','exec'],['w1','then','out2','exec'],
	['w1','then','w2','exec'],['w2','then','out3','exec'],['w2','then','w3','exec'],['w3','then','out4','exec'],
	['k1','out','o1','pitch'],['k2','out','o2','pitch'],['k3','out','o3','pitch'],['k4','out','o4','pitch'],
	['o1','out','g1','in'],['o2','out','g2','in'],['o3','out','g3','in'],['o4','out','g4','in'],
	['e1','out','g1','level'],['e2','out','g2','level'],['e3','out','g3','level'],['e4','out','g4','level'],
	['g1','out','out1','in'],['g2','out','out2','in'],['g3','out','out3','in'],['g4','out','out4','in']];
const eP=(i)=>({[`e${i}.envA`]:0.005,[`e${i}.envD`]:0.15,[`e${i}.envS`]:0,[`e${i}.envR`]:0.03});
add('ARP 4-step waits+4 OUTs', P(s4N,s4C,{...kf('k1',220),...kf('k2',262),...kf('k3',330),...kf('k4',392),
	'w1.gapMs':400,'w2.gapMs':400,'w3.gapMs':400,...eP(1),...eP(2),...eP(3),...eP(4)}), [3,40,16,0.05]);

// ---- FM: why did the cable give 0.0047? diagnose ----
// tocv -> osc.pitch with a DC offset added so freq stays positive
add('FMdiag tocv only (0.0047?)', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC,['mod','out','cv','a'],['cv','out','car','pitch'],['car','out','output','in']],{}));
// same, mod silent (gain 0) -> does carrier come back to 220?
add('FMdiag mod muted', P(
	[['entry','in'],['mod','osc'],['mg','gain'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC,['mod','out','mg','in'],['mg','out','cv','a'],['cv','out','car','pitch'],['car','out','output','in']],
	{'mg.level':0}));
// SUM a const (via tosig) with the modulator so carrier freq = 220 + dev*sin
add('FM sum tosig220+mod', P(
	[['entry','in'],['kc','const'],['ts','tosig'],['mod','osc'],['dep','gain'],['s','sum'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC,['kc','out','ts','level'],['ts','out','s','in'],['mod','out','dep','in'],['dep','out','s','in'],
	 ['s','out','cv','a'],['cv','out','car','pitch'],['car','out','output','in']],
	{...kn('kc',220),'dep.level':100}));
add('FM sum tosig220+mod DEP0', P(
	[['entry','in'],['kc','const'],['ts','tosig'],['mod','osc'],['dep','gain'],['s','sum'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC,['kc','out','ts','level'],['ts','out','s','in'],['mod','out','dep','in'],['dep','out','s','in'],
	 ['s','out','cv','a'],['cv','out','car','pitch'],['car','out','output','in']],
	{...kn('kc',220),'dep.level':0}));
// Is osc.pitch registered? probe: does a SIGNAL onto pitch change anything vs
// the same patch where pitch is fed the value only
add('FM drivenBy check', P(
	[['entry','in'],['mod','osc'],['cv','tocv'],['car','osc'],['output','out']],
	[EXEC,['mod','out','cv','a'],['cv','out','car','pitch'],['car','out','output','in']],{}));

// ---- DUCK: inverted follow gave identical numbers. Diagnose. ----
add('DUCKdiag inv level -1', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['lfo','osc'],['fol','follow'],['inv','gain'],['g','gain'],['output','out']],
	[EXEC,['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],
	 ['fol','out','inv','in'],['inv','out','g','level'],['g','out','output','in']],
	{...kf('k1',330),...kf('k2',2),'fol.resp':8,'inv.level':-1,'g.level':1}),[3,40,16]);
add('DUCKdiag inv level +1', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['lfo','osc'],['fol','follow'],['inv','gain'],['g','gain'],['output','out']],
	[EXEC,['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],
	 ['fol','out','inv','in'],['inv','out','g','level'],['g','out','output','in']],
	{...kf('k1',330),...kf('k2',2),'fol.resp':8,'inv.level':1,'g.level':1}),[3,40,16]);
// is the knob zeroed because a signal claimed it? g.level should read 0.
add('DUCKdiag g.level 5', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['lfo','osc'],['fol','follow'],['inv','gain'],['g','gain'],['output','out']],
	[EXEC,['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],
	 ['fol','out','inv','in'],['inv','out','g','level'],['g','out','output','in']],
	{...kf('k1',330),...kf('k2',2),'fol.resp':8,'inv.level':-1,'g.level':5}),[3,40,16]);
// ducking with a DC offset so the inverted follower rides below 1
add('DUCK tosig1 + inv follow', P(
	[['entry','in'],['k1','const'],['k2','const'],['kd','const'],['o','osc'],['lfo','osc'],['fol','follow'],
	 ['inv','gain'],['ts','tosig'],['s','sum'],['cv','tocv'],['g','gain'],['output','out']],
	[EXEC,['k1','out','o','pitch'],['k2','out','lfo','pitch'],['o','out','g','in'],['lfo','out','fol','in'],
	 ['fol','out','inv','in'],['kd','out','ts','level'],['ts','out','s','in'],['inv','out','s','in'],
	 ['s','out','cv','a'],['cv','out','g','level'],['g','out','output','in']],
	{...kf('k1',330),...kf('k2',2),...kn('kd',1),'fol.resp':8,'inv.level':-1,'g.level':0}),[3,40,16]);

// ---- PWM pitch dead? check with the pitch KNOB absent vs CONST ----
add('PWMdiag const 110 pitch', P([['entry','in'],['k','const'],['p','pwm'],['output','out']],
	[EXEC,['k','out','p','pitch'],['p','out','output','in']], kf('k',110)));
add('PWMdiag const 880 pitch', P([['entry','in'],['k','const'],['p','pwm'],['output','out']],
	[EXEC,['k','out','p','pitch'],['p','out','output','in']], kf('k',880)));

// ---- Sample playback: is there any buffer/sample module at all? ----
// (catalogue has none; confirm NOISE is the only buffer source)

// ---- hard sync attempt via ring + saw at exact multiples, and via SEND/RTN ----
add('SYNC sub: saw*square 2:1', P(
	[['entry','in'],['k1','const'],['k2','const'],['c','osc'],['m','osc'],['r','ring'],['output','out']],
	[EXEC,['k1','out','c','pitch'],['k2','out','m','pitch'],['c','out','r','in'],['m','out','r','b'],['r','out','output','in']],
	{...kf('k1',440),...kf('k2',220)},{'c.wave':'sawtooth','m.wave':'square'}));

// ---- granular: can grain RATE exceed what WAIT gives? measure grain density ----
// 8 grains at 60ms via chain of waits and 8 OUTs -> is that a grain cloud?
const gN=[['entry','in']]; const gC=[]; const gP={};
for(let i=1;i<=6;i++){
	gN.push([`w${i}`,'wait'],[`o${i}`,'osc'],[`e${i}`,'env'],[`g${i}`,'gain'],[`out${i}`,'out'],[`k${i}`,'const']);
	gC.push([`k${i}`,'out',`o${i}`,'pitch'],[`o${i}`,'out',`g${i}`,'in'],[`e${i}`,'out',`g${i}`,'level'],[`g${i}`,'out',`out${i}`,'in']);
	Object.assign(gP,kf(`k${i}`,220*(1+i*0.15)),{[`e${i}.envA`]:0.008,[`e${i}.envD`]:0.04,[`e${i}.envS`]:0,[`e${i}.envR`]:0.01,[`w${i}.gapMs`]:60});
}
gC.push(['entry','then','w1','exec'],['w1','then','out1','exec']);
for(let i=2;i<=6;i++) gC.push([`w${i-1}`,'then',`w${i}`,'exec'],[`w${i}`,'then',`out${i}`,'exec']);
add('GRAN 6 grains @60ms', P(gN,gC,gP),[2,40,20,0.03]);

// ---- vocoder was very quiet (0.0407). Boost and re-measure with control ----
const vN=[['entry','in'],['mo','noise'],['kc','const'],['car','osc'],
	['b1','filter'],['b2','filter'],['f1','follow'],['f2','follow'],
	['c1','filter'],['c2','filter'],['v1','gain'],['v2','gain'],['a1','gain'],['a2','gain'],['s','sum'],['output','out']];
const vC=[EXEC,['kc','out','car','pitch'],
	['mo','out','b1','in'],['mo','out','b2','in'],['b1','out','f1','in'],['b2','out','f2','in'],
	['car','out','c1','in'],['car','out','c2','in'],['c1','out','v1','in'],['c2','out','v2','in'],
	['f1','out','a1','in'],['f2','out','a2','in'],['a1','out','v1','level'],['a2','out','v2','level'],
	['v1','out','s','in'],['v2','out','s','in'],['s','out','output','in']];
add('VOC 2-band gain8', P(vN,vC,{...kf('kc',110),
	'b1.type':2,'b1.cutoff':500,'b1.q':4,'b2.type':2,'b2.cutoff':2000,'b2.q':4,
	'c1.type':2,'c1.cutoff':500,'c1.q':4,'c2.type':2,'c2.cutoff':2000,'c2.q':4,
	'f1.resp':30,'f1.sens':6,'f2.resp':30,'f2.sens':6,'a1.level':8,'a2.level':8,'v1.level':0,'v2.level':0},
	{'car.wave':'sawtooth'}),[3,40,16]);
add('VOC 2-band level0 ctl', P(vN,vC,{...kf('kc',110),
	'b1.type':2,'b1.cutoff':500,'b1.q':4,'b2.type':2,'b2.cutoff':2000,'b2.q':4,
	'c1.type':2,'c1.cutoff':500,'c1.q':4,'c2.type':2,'c2.cutoff':2000,'c2.q':4,
	'f1.resp':30,'f1.sens':6,'f2.resp':30,'f2.sens':6,'a1.level':0,'a2.level':0,'v1.level':0,'v2.level':0},
	{'car.wave':'sawtooth'}),[3,40,16]);

// ---- per-note constant check: does a CONST/MAP value move during a note? ----
// map ST4 -> filter cutoff worked (audio path). Check pure chain: entry.gate -> ?
add('CTLCONST entry.gate->cutoff', P(
	[['entry','in'],['o','osc'],['m','mul'],['kb','const'],['f','filter'],['output','out']],
	[EXEC,['entry','gate','m','a'],['kb','out','m','b'],['m','out','f','cutoff'],['o','out','f','in'],['f','out','output','in']],
	{...kn('kb',2000),'f.q':2},{'o.wave':'sawtooth'}),[3,40,16]);

// ---- does SHAPE's drive accept a cable at all (fixed:true)? ----
add('SHAPEdrive cable env', P(
	[['entry','in'],['o','osc'],['sh','shape'],['e','env'],['d','gain'],['output','out']],
	[EXEC,['o','out','sh','in'],['e','out','d','in'],['d','out','sh','shapeDrive'],['sh','out','output','in']],
	{'sh.shapeKind':2,'sh.shapeDrive':0.1,'d.level':90}),[3,40,16]);
add('SHAPEdrive no cable ctl', P(
	[['entry','in'],['o','osc'],['sh','shape'],['e','env'],['d','gain'],['output','out']],
	[EXEC,['o','out','sh','in'],['e','out','d','in'],['sh','out','output','in']],
	{'sh.shapeKind':2,'sh.shapeDrive':0.1,'d.level':90}),[3,40,16]);

// ---- delay time audio-rate (chorus needs smooth sweep) already OK. Check DELAY feedback w/o SEND: refused? ----
// ---- stereo: does PAN accept audio-rate? verified. check SPLIT/MONO roundtrip ----
add('SPLIT L only', P(
	[['entry','in'],['k1','const'],['k2','const'],['o','osc'],['o2','osc'],['mg','merge'],['sp','split'],['output','out']],
	[EXEC,['k1','out','o','pitch'],['k2','out','o2','pitch'],['o','out','mg','in'],['o2','out','mg','r'],
	 ['mg','out','sp','in'],['sp','out','output','in']],{...kf('k1',220),...kf('k2',660)}));

const browser = await chromium.launch({channel:'chrome'});
try{
	const page = await browser.newPage();
	page.on('pageerror',e=>console.error('PAGEERROR',e.message));
	await page.goto('http://localhost:5182/synth/audit',{waitUntil:'domcontentloaded'});
	await page.waitForFunction(()=>window.__audit,null,{timeout:30000});
	for(const c of CASES){
		const r = await page.evaluate(async([patch,args])=>{
			window.__audit.setTrack(patch);
			return await window.__audit.run(...args);
		},[c.patch,c.args]);
		console.log(`${c.name.padEnd(30)} v=${r.builtVoice?1:0} peak=${String(r.peak).padEnd(7)} env=[${r.envelope.join(' ')}]${r.error?' ERR='+r.error:''}`);
	}
	// drivenBy queries
	const q = await page.evaluate(()=>{
		const mk=(nodes,cables,params={})=>({advanced:true,rackGraph:{nodes:nodes.map(([id,type])=>({id,type})),cables:cables.map(([from,fromPort,to,toPort])=>({from,fromPort,to,toPort}))},graphParams:params});
		const p1=mk([['entry','in'],['mod','osc'],['cv','tocv'],['car','osc'],['output','out']],
			[['entry','then','output','exec'],['mod','out','cv','a'],['cv','out','car','pitch'],['car','out','output','in']]);
		const p2=mk([['entry','in'],['mod','osc'],['cv','tocv'],['p','pwm'],['output','out']],
			[['entry','then','output','exec'],['mod','out','cv','a'],['cv','out','p','pitch'],['p','out','output','in']]);
		const p3=mk([['entry','in'],['o','osc'],['sh','shape'],['e','env'],['output','out']],
			[['entry','then','output','exec'],['o','out','sh','in'],['e','out','sh','shapeDrive'],['sh','out','output','in']]);
		return {
			osc_pitch: window.__audit.drivenBy(p1,'car','pitch'),
			pwm_pitch: window.__audit.drivenBy(p2,'p','pitch'),
			shape_drive: window.__audit.drivenBy(p3,'sh','shapeDrive')
		};
	});
	console.log('DRIVENBY', JSON.stringify(q));
} finally { await browser.close(); }
