// Exercises the page-side gateway with the frames a booting guest actually
// sends. Run: node --experimental-strip-types qemu-net.test.mjs
// replies. Node has no WebSocket to the relay here, so the class is given a stub.
import { QemuNet } from './qemu-net.ts';

globalThis.location = { protocol: 'http:', host: 'localhost' };
const sent = [];
let ws = null;
globalThis.WebSocket = class {
  constructor(url) { this.url = url; ws = this; sent.push(['ws-open', url]); queueMicrotask(()=>setTimeout(()=>this.onopen?.(),0)); }
  send(b) { sent.push(['ws-send', new Uint8Array(b)]); }
  close() {}
};
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(12) });

const out = [];
const net = new QemuNet({ send: (b) => out.push(new Uint8Array(b)) });

const GUEST_MAC = [0x52,0x54,0x00,0x12,0x34,0x56];
function frame(dstMac, type, payload) {
  const f = new Uint8Array(14 + payload.length);
  f.set(dstMac,0); f.set(GUEST_MAC,6); f[12]=type>>8; f[13]=type&0xff; f.set(payload,14);
  const w = new Uint8Array(4+f.length);
  new DataView(w.buffer).setUint32(0,f.length,false); w.set(f,4);
  return w;
}
const parse = (w) => { const len = new DataView(w.buffer,w.byteOffset,4).getUint32(0,false); return { len, eth: w.subarray(4,4+len) }; };

let pass=0, fail=0;
const check=(n,c,d='')=>{ if(c){pass++;console.log('PASS',n,d);} else {fail++;console.log('FAIL',n,d);} };

// ---- ARP: who has 10.0.2.2?
const arp = new Uint8Array(28);
arp.set([0,1,0x08,0x00,6,4,0,1],0);
arp.set(GUEST_MAC,8); arp.set([10,0,2,15],14);
arp.set([0,0,0,0,0,0],18); arp.set([10,0,2,2],24);
out.length=0;
net.receive(frame([0xff,0xff,0xff,0xff,0xff,0xff], 0x0806, arp));
check('ARP answered', out.length===1);
if(out.length){
  const {eth}=parse(out[0]); const p=eth.subarray(14);
  check('ARP is a reply', ((p[6]<<8)|p[7])===2);
  check('ARP carries the gateway MAC', [...p.subarray(8,14)].join()==='82,85,10,0,2,2', [...p.subarray(8,14)].join());
  check('ARP sender is 10.0.2.2', [...p.subarray(14,18)].join()==='10,0,2,2');
}

// ---- DHCP DISCOVER
function dhcp(kind){
  const p=new Uint8Array(300);
  p[0]=1;p[1]=1;p[2]=6; p.set([0x11,0x22,0x33,0x44],4); p.set(GUEST_MAC,28);
  p.set([0x63,0x82,0x53,0x63],236);
  p[240]=53;p[241]=1;p[242]=kind; p[243]=0xff;
  const udp=new Uint8Array(8+p.length);
  udp[0]=0;udp[1]=68; udp[2]=0;udp[3]=67; udp[4]=udp.length>>8; udp[5]=udp.length&0xff;
  udp.set(p,8);
  const ip=new Uint8Array(20+udp.length);
  ip[0]=0x45; ip[2]=ip.length>>8; ip[3]=ip.length&0xff; ip[8]=64; ip[9]=17;
  ip.set([0,0,0,0],12); ip.set([255,255,255,255],16); ip.set(udp,20);
  return frame([0xff,0xff,0xff,0xff,0xff,0xff],0x0800,ip);
}
out.length=0;
net.receive(dhcp(1));
check('DHCP OFFER sent', out.length===1);
if(out.length){
  const {eth}=parse(out[0]);
  check('OFFER goes to the broadcast MAC', [...eth.subarray(0,6)].every(b=>b===0xff));
  const bootp=eth.subarray(14+20+8);
  check('OFFER yiaddr is 10.0.2.15', [...bootp.subarray(16,20)].join()==='10,0,2,15', [...bootp.subarray(16,20)].join());
  check('OFFER xid echoed', [...bootp.subarray(4,8)].join()==='17,34,51,68');
  let kind=0, router=null, mask=null, dns=null;
  for(let i=240;i<bootp.length && bootp[i]!==0xff;){
    if(bootp[i]===0){i++;continue;}
    const len=bootp[i+1];
    if(bootp[i]===53) kind=bootp[i+2];
    if(bootp[i]===3) router=[...bootp.subarray(i+2,i+2+len)].join();
    if(bootp[i]===1) mask=[...bootp.subarray(i+2,i+2+len)].join();
    if(bootp[i]===6) dns=[...bootp.subarray(i+2,i+2+len)].join();
    i+=2+len;
  }
  check('option 53 says OFFER', kind===2, 'kind='+kind);
  check('router is the gateway', router==='10,0,2,2', String(router));
  check('netmask is /24', mask==='255,255,255,0', String(mask));
  check('DNS points at the gateway', dns==='10,0,2,2', String(dns));
}
out.length=0;
net.receive(dhcp(3));
if(out.length){
  const {eth}=parse(out[0]); const bootp=eth.subarray(14+20+8);
  let kind=0;
  for(let i=240;i<bootp.length && bootp[i]!==0xff;){ if(bootp[i]===0){i++;continue;} if(bootp[i]===53)kind=bootp[i+2]; i+=2+bootp[i+1]; }
  check('REQUEST gets an ACK', kind===5, 'kind='+kind);
}

// ---- checksum sanity on the IP header we produce
if(out.length){
  const {eth}=parse(out[0]); const ip=eth.subarray(14);
  let sum=0; for(let i=0;i<20;i+=2) sum+=(ip[i]<<8)|ip[i+1];
  while(sum>>>16) sum=(sum&0xffff)+(sum>>>16);
  check('IP header checksum verifies', sum===0xffff, 'sum=0x'+sum.toString(16));
}

await new Promise(r=>setTimeout(r,5)); // let the relay socket report open

// ---- TCP SYN opens a WISP stream and is answered
const wispBefore = sent.filter(s=>s[0]==='ws-send').length;
function tcp(flags, seq, ack, dport, payload=new Uint8Array(0)){
  const seg=new Uint8Array(20+payload.length);
  const v=new DataView(seg.buffer);
  v.setUint16(0,45000,false); v.setUint16(2,dport,false);
  v.setUint32(4,seq,false); v.setUint32(8,ack,false);
  seg[12]=5<<4; seg[13]=flags; v.setUint16(14,64240,false);
  seg.set(payload,20);
  const ip=new Uint8Array(20+seg.length);
  ip[0]=0x45; ip[2]=ip.length>>8; ip[3]=ip.length&0xff; ip[8]=64; ip[9]=6;
  ip.set([10,0,2,15],12); ip.set([93,184,216,34],16); ip.set(seg,20);
  return frame([0x52,0x55,0x0a,0x00,0x02,0x02],0x0800,ip);
}
out.length=0;
net.receive(tcp(0x02, 1000, 0, 80));
check('SYN is answered', out.length===1);
if(out.length){
  const {eth}=parse(out[0]); const seg=eth.subarray(14+20);
  check('reply is SYN|ACK', seg[13]===0x12, 'flags=0x'+seg[13].toString(16));
  const v=new DataView(seg.buffer,seg.byteOffset,seg.byteLength);
  check('acks the SYN', v.getUint32(8,false)===1001, String(v.getUint32(8,false)));
  check('reply comes from port 80', v.getUint16(0,false)===80);
}
const wispFrames = sent.filter(s=>s[0]==='ws-send').slice(wispBefore);
check('a WISP CONNECT was queued', wispFrames.length>=1);
if(wispFrames.length){
  const b=wispFrames[0][1];
  check('WISP type is CONNECT', b[0]===0x01, 'type='+b[0]);
  const port=b[6]|(b[7]<<8);
  check('CONNECT names port 80', port===80, 'port='+port);
  check('CONNECT names the host', new TextDecoder().decode(b.subarray(8))==='93.184.216.34', new TextDecoder().decode(b.subarray(8)));
}

// ---- guest data is forwarded
out.length=0;
const before2 = sent.filter(s=>s[0]==='ws-send').length;
net.receive(tcp(0x18, 1001, 1, 80, new TextEncoder().encode('GET / HTTP/1.0\r\n\r\n')));
const dataFrames = sent.filter(s=>s[0]==='ws-send').slice(before2);
check('guest payload reached the relay', dataFrames.some(f=>f[1][0]===0x02 && new TextDecoder().decode(f[1].subarray(5)).startsWith('GET /')));
check('and was acked', out.some(w=>{const {eth}=parse(w); return (eth.subarray(14+20)[13]&0x10)!==0;}));

// ---- the return path: bytes from the relay reach the guest as TCP segments
{
  // The stream id the CONNECT above was opened with.
  const b = wispFrames[0][1];
  const streamId = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(1, true);
  const body = new TextEncoder().encode('HTTP/1.0 200 OK\r\n\r\nhi');
  const wisp = new Uint8Array(5 + body.length);
  new DataView(wisp.buffer).setUint8(0, 0x02);
  new DataView(wisp.buffer).setUint32(1, streamId, true);
  wisp.set(body, 5);
  out.length = 0;
  ws.onmessage({ data: wisp.buffer });
  check('relay data reaches the guest', out.length >= 1);
  if (out.length) {
    const { eth } = parse(out[0]);
    const seg = eth.subarray(14 + 20);
    check('delivered with PSH|ACK', (seg[13] & 0x08) !== 0 && (seg[13] & 0x10) !== 0, 'flags=0x'+seg[13].toString(16));
    check('carries the body', new TextDecoder().decode(seg.subarray(20)).startsWith('HTTP/1.0 200'));
    check('addressed to the guest', [...eth.subarray(14).subarray(16,20)].join()==='10,0,2,15');
  }

  // And a close from upstream becomes a FIN.
  const close = new Uint8Array(6);
  new DataView(close.buffer).setUint8(0, 0x04);
  new DataView(close.buffer).setUint32(1, streamId, true);
  close[5] = 0x02;
  out.length = 0;
  ws.onmessage({ data: close.buffer });
  check('upstream close becomes a FIN', out.some(w => (parse(w).eth.subarray(14+20)[13] & 0x01) !== 0));
}

// ---- frame reassembly: a split arrival must still parse
out.length=0;
const whole = dhcp(1);
net.receive(whole.subarray(0, 10));
check('a partial frame produces nothing', out.length===0);
net.receive(whole.subarray(10));
check('the rest completes it', out.length===1);

net.destroy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
