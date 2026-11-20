// Dead Harbor 2.9 server.  Run: npm i ws  then  node server.js [port] [seed]
// Serves the game page AND the multiplayer socket, so friends (PC or phone) just open the address in a browser.
// Loft (the launcher) sets DH_DATA (the world folder, where data.json lives), DH_GAME (path of the game page) and DH_NAME (world name).
// World settings (PvP on/off, loot drop on PvP death) live inside data.json under "cfg". The owner can change them in chat: /pvp on|off, /loot on|off.
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),https=require('https');
const {WebSocketServer}=require('ws');
const DATA=process.env.DH_DATA||__dirname,GAME=process.env.DH_GAME||path.join(__dirname,'dead-harbor-3d.html'),WNAME=String(process.env.DH_NAME||'Dead Harbor Server').slice(0,40);
try{fs.mkdirSync(DATA,{recursive:true})}catch(e){}
const PORT=+process.argv[2]||3000,MAXP=20,DAYL=360,F=path.join(DATA,'data.json');
let DB={seed:+process.argv[3]||(Math.random()*1e9|0),t0:Date.now()-.02*DAYL*1000,users:{},pcs:{}},dirty=0;
try{DB=Object.assign(DB,JSON.parse(fs.readFileSync(F,'utf8')))}catch(e){}
if(!Array.isArray(DB.rm))DB.rm=[];if(!Array.isArray(DB.rg))DB.rg=[];
DB.cfg=Object.assign({pvp:true,loot:true},DB.cfg&&typeof DB.cfg=='object'?DB.cfg:{});const CFG=DB.cfg;
if(DB.age==null)DB.age=Math.min((Date.now()-DB.t0)/1000,DAYL*8);DB.t0=Date.now()-DB.age*1000;
const flush=()=>{if(!dirty)return;dirty=0;DB.age=(Date.now()-DB.t0)/1000;fs.writeFileSync(F+'.tmp',JSON.stringify(DB));fs.renameSync(F+'.tmp',F)};
if(!DB.owner&&Object.keys(DB.users)[0])DB.owner=Object.keys(DB.users)[0];
setInterval(flush,5000);setInterval(()=>{dirty=1},20000);for(const s of['SIGINT','SIGTERM'])process.on(s,()=>{dirty=1;flush();process.exit()});
// Loft asks the server to quit through an IPC channel, so the world is saved (Windows cannot deliver SIGTERM).
process.on('message',m=>{if(m&&m.cmd=='quit'){dirty=1;flush();process.exit(0)}});process.on('disconnect',()=>{dirty=1;try{flush()}catch(e){}process.exit(0)});
const page=a=>fs.readFileSync(GAME,'utf8').replace('<meta charset="utf-8">','<meta charset="utf-8"><script>window.DH_SERVER='+JSON.stringify(a)+'</script>');
const srv=http.createServer((q,r)=>{try{const h=page(q.headers.host||'');r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(h)}catch(e){r.writeHead(404);r.end('Put dead-harbor-3d.html next to server.js')}});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),mk=k=>{const t=crypto.randomBytes(24).toString('hex'),U=DB.users[k];U.tk=(U.tk||[]).concat(sha(t)).slice(-5);dirty=1;return t};
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex'),bad=new Map;
function auth(m,ip){const u=String(m.u||'').trim(),k=u.toLowerCase(),p=String(m.p||'');
if(!/^[A-Za-z0-9_]{3,16}$/.test(u))return'Username: 3-16 letters, numbers or _';if(m.m=='token'){const U=DB.users[k];return U&&U.tk&&U.tk.includes(sha(String(m.k||'')))?{ok:k}:'Session expired. Please log in again.'}if(p.length<6||p.length>64)return'Password must be 6-64 characters';
const b=bad.get(ip);if(b&&b[0]>=8&&Date.now()<b[1])return'Too many tries. Wait a minute.';
if(m.m=='signup'){if(DB.users[k])return'That username is taken';const s=crypto.randomBytes(16).toString('hex');DB.users[k]={n:u,s,h:hash(p,s),d:null};if(!DB.owner)DB.owner=k;dirty=1;return{ok:k,tok:mk(k)}}
const U=DB.users[k];if(!U||!crypto.timingSafeEqual(Buffer.from(U.h,'hex'),Buffer.from(hash(p,U.s),'hex'))){const c=bad.get(ip)||[0,0];c[0]++;c[1]=Date.now()+60000;bad.set(ip,c);return'Wrong username or password'}
bad.delete(ip);return{ok:k,tok:mk(k)}}
const isLocal=req=>/^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress||'')&&!req.headers['x-forwarded-for']&&!req.headers['cf-connecting-ip'];
const PL=new Map;let nid=1;
// ---------------- PvP ----------------
// Damage is decided HERE, not by the attacker's game: the weapon tables are read from the game page itself (so they never drift),
// range and attack speed are checked, new/respawned players are protected for a few seconds, and kills are credited to whoever hit last.
const PROT=5000,WIN=10000;
let WPN={hand:{dm:6,cd:.4},bat:{dm:22,cd:.5,hl:.4,hw:.03,hh:.03,hd:.2,hc:'#a67c52'},spear:{dm:30,cd:.6,rc:3.7,hl:.6,hw:.02,hh:.02,hd:.08,hc:'#cfd4d8'},machete:{dm:34,cd:.35,hl:.1,hw:.015,hh:.04,hd:.35,hc:'#aab4ba'},sledge:{dm:55,cd:1,hl:.4,hw:.07,hh:.07,hd:.1,hc:'#55585e'},axe:{dm:16,cd:.55,tree:3},iron_axe:{dm:24,cd:.5,tree:6,hc:'#cfd8de'},pick:{dm:14,cd:.6,rock:3},iron_pick:{dm:20,cd:.55,rock:6,hc:'#d8d8a0'},steel_axe:{dm:30,cd:.45,tree:10,hc:'#cfe0f0'},steel_pick:{dm:26,cd:.5,rock:10,hc:'#cfe0f0'},katana:{dm:46,cd:.3,rc:3.1,hl:.1,hw:.012,hh:.04,hd:.42,hc:'#dfe8f0'}},GUN={pistol:{dm:28,cd:.3,sp:.006,n:1,am:1},shotgun:{dm:11,cd:.85,sp:.07,n:6,am:2},rifle:{dm:60,cd:.7,sp:.002,n:1,am:1},smg:{dm:19,cd:.09,sp:.03,n:1,am:1},sniper:{dm:170,cd:1.4,sp:0,n:1,am:1},crossbow:{dm:80,cd:1.0,sp:0,n:1,am:1,ammo:'bolt',pierce:1}};
try{const g=fs.readFileSync(GAME,'utf8'),a=/^const WP=(\{.*\});\s*$/m.exec(g),b=/^const GN=(\{.*\});\s*$/m.exec(g);if(a&&b){const w=new Function('return('+a[1]+')')(),q=new Function('return('+b[1]+')')();if(w.hand&&q.pistol){WPN=w;GUN=q}}}catch(e){}
const sbList=()=>[...PL.values()].map(p=>{const t=(DB.users[p.k]||{}).st||{};return{id:p.id,n:p.n,k:t.k|0,d:t.d|0,ks:p.ks|0}});
const sbCast=()=>bc({t:'sb',a:sbList()});
function pvHit(me,m){const now=Date.now(),q=PL.get(+m.to);
if(!q||q===me||me.dead||q.dead)return;
if(!CFG.pvp){if(now-(me.nt||0)>3000){me.nt=now;to(me.id,{t:'hit',blk:'off'})}return}
const wid=typeof m.w=='string'&&(GUN[m.w]||WPN[m.w])?m.w:'hand',g=GUN[wid],w=WPN[wid]||WPN.hand;
const n=Math.max(1,Math.min(g?g.n:1,m.n|0||1)),hd=g?Math.max(0,Math.min(n,m.hd|0)):0;
if(Math.hypot(me.x-q.x,me.y-q.y,me.z-q.z)>(g?104:(w.rc||2.8)+3))return; // out of reach (a little slack for lag and cars)
const key=wid+':'+(m.sq|0),sh=me.sh;
if(!sh||sh.k!==key){if(now<((me.wc&&me.wc[wid])||0)-150)return;(me.wc=me.wc||{})[wid]=now+(g?g.cd:w.cd)*850;me.sh={k:key,t:now,u:new Set}} // a new swing or shot must respect the weapon's cooldown
else if(now-sh.t>250||sh.u.has(q.id))return; // the same shot may hit several players (shotgun), once each
me.sh.u.add(q.id);
if(q.pr>now){to(me.id,{t:'hit',id:q.id,blk:'prot'});return}
if(me.pr>now){me.pr=0;to(me.id,{t:'prot',ms:0})} // attacking ends your own protection
const per=g?g.dm:w.dm*(1+.08*Math.max(0,Math.min(5,m.st|0))),dmg=Math.round(Math.min(400,per*(n-hd)+per*2*hd));
q.lh={id:me.id,k:me.k,n:me.n,w:wid,t:now};
to(q.id,{t:'hurt',d:dmg,f:me.n,w:wid,hd:hd?1:0,ax:me.x,az:me.z});
to(me.id,{t:'hit',id:q.id,d:dmg,hd:hd?1:0})}
function pvDead(me){const l=me.lh,now=Date.now();me.lh=null;me.ks=0;
if(!l||now-l.t>WIN||!CFG.pvp)return;
const K=DB.users[l.k],V=DB.users[me.k],kp=PL.get(l.id);
if(K){K.st=K.st||{k:0,d:0};K.st.k++}if(V){V.st=V.st||{k:0,d:0};V.st.d++}dirty=1;
bc({t:'kill',k:l.n,v:me.n,w:l.w});to(me.id,{t:'died',by:l.n,w:l.w,loot:CFG.loot?1:0});
if(kp&&kp.k==l.k){kp.ks=(kp.ks|0)+1;if([3,5,8,12,16,20].includes(kp.ks))bc({t:'msg',s:kp.n+' is on a '+kp.ks+' kill streak'})}
sbCast()}
function cmd(me,s){const a=s.slice(1).trim().split(/\s+/),c=(a[0]||'').toLowerCase(),v=(a[1]||'').toLowerCase(),own=me.k==DB.owner,say=t=>to(me.id,{t:'msg',s:t});
if(c=='pvp'||c=='loot'){const nm=c=='pvp'?'PvP':'Loot drop on PvP death';
if(!v)return say(nm+' is '+(CFG[c]?'ON':'OFF')+(own?'. Change it with /'+c+' on or /'+c+' off':'.'));
if(!own)return say('Only the server owner can change that');
if(v!='on'&&v!='off')return say('Use /'+c+' on or /'+c+' off');
CFG[c]=v=='on';dirty=1;bc({t:'cfg',pvp:CFG.pvp,loot:CFG.loot});bc({t:'msg',s:me.n+' turned '+nm+' '+v})}
else say('Commands: /pvp [on|off]   /loot [on|off]   (hold Z for the player list)')}

// ---- things that must be the same for everybody: dropped items, container contents, doors, time of day ----
const ITEMS=new Map,SLOTS=30;
const okSlot=v=>v===null||(v&&typeof v.id=='string'&&v.id.length<32&&Number.isFinite(v.n)&&v.n>0&&v.n<=99&&(v.dr==null||Number.isFinite(v.dr)));
const cleanSlot=v=>v?(v.dr!=null?{id:v.id,n:v.n|0,dr:+v.dr}:{id:v.id,n:v.n|0}):null;
function applyCs(s,m){ // s = stored piece, m = client message. Returns the cleaned payload to relay, or null.
if(s.t=='h'&&m.sl&&typeof m.sl=='object'){s.ch=Array.isArray(s.ch)?s.ch:Array(SLOTS).fill(null);const out={};for(const k of Object.keys(m.sl)){const i=+k;if(Number.isInteger(i)&&i>=0&&i<SLOTS&&okSlot(m.sl[k])){s.ch[i]=cleanSlot(m.sl[k]);out[i]=s.ch[i]}}return Object.keys(out).length?{sl:out}:null}
if(s.t=='m'&&m.s&&typeof m.s=='object'){const o={};for(const k of['fu','in','ou','ht','pg'])if(Number.isFinite(m.s[k])){s[k]=Math.max(0,Math.min(9999,m.s[k]));o[k]=s[k]}for(const k of['ii','oi'])if(typeof m.s[k]=='string'&&m.s[k].length<32){s[k]=m.s[k];o[k]=s[k]}return{s:o}}
if(s.t=='t'&&m.s&&Number.isFinite(m.s.am)){s.am=Math.max(0,Math.min(999,m.s.am|0));return{s:{am:s.am}}}
if(s.t=='p'&&m.s&&Number.isFinite(m.s.pa)){s.pa=m.s.pa;return{s:{pa:s.pa}}}
return null}
function mkPc(s){const o={t:s.t,gx:s.gx,gz:s.gz,L:s.L,dir:s.dir,m:s.m,tl:s.tl|0,open:s.open?1:0};
if(s.t=='h'&&Array.isArray(s.ch))o.ch=s.ch.slice(0,SLOTS).map(v=>okSlot(v||null)?cleanSlot(v):null);
if(s.t=='m'){for(const k of['fu','in','ou'])if(Number.isFinite(s[k]))o[k]=s[k];for(const k of['ii','oi'])if(typeof s[k]=='string'&&s[k].length<32)o[k]=s[k]}
if(s.t=='t'&&Number.isFinite(s.am))o.am=s.am|0;if(s.t=='p'&&Number.isFinite(s.pa))o.pa=s.pa;return o}
const elapsed=()=>(Date.now()-DB.t0)/1000/DAYL;
function jump(night){let el=elapsed();if(night&&el%1>=.5){el=Math.floor(el)+1+.02;DB.t0=Date.now()-el*DAYL*1000;dirty=1}for(const p of PL.values())p.sl=false;bc({t:'tm',tm:el%1,day:Math.floor(el)+1,jump:1});bc({t:'slp',n:0,of:[...PL.values()].filter(p=>!p.dead).length})}
// everybody is dead: back to the morning of the same day (any time of day), and every zombie vanishes (clients clear them on 'jump')
function wipe(){const el=Math.floor(elapsed())+.02;DB.t0=Date.now()-el*DAYL*1000;dirty=1;for(const p of PL.values())p.sl=false;bc({t:'tm',tm:el%1,day:Math.floor(el)+1,jump:1,wipe:1});bc({t:'slp',n:0,of:0})}
function slpCheck(){const pl=[...PL.values()].filter(p=>!p.dead),n=pl.filter(p=>p.sl).length;if(pl.length&&n==pl.length&&elapsed()%1>=.5)jump(true);else bc({t:'slp',n,of:pl.length})}
function wipeCheck(){if(PL.size&&[...PL.values()].every(p=>p.dead))wipe()}
const bc=(o,ex)=>{const s=JSON.stringify(o);for(const p of PL.values())if(p!==ex&&p.ws.readyState==1)p.ws.send(s)};
const to=(id,o)=>{const q=PL.get(+id);if(q&&q.ws.readyState==1)q.ws.send(JSON.stringify(o))};let AU=0;
function setAu(){const alive=[...PL.values()].filter(p=>!p.dead),pool=alive.length?alive:[...PL.values()],n=pool.length?Math.min(...pool.map(p=>p.id)):0;if(n!=AU){AU=n;for(const q of PL.values())to(q.id,{t:'au',v:q.id==AU})}}
const wss=new WebSocketServer({noServer:true,maxPayload:4194304}),hws=new WebSocketServer({noServer:true,maxPayload:65536});
srv.on('upgrade',(q,so,h)=>{const w=q.url=='/hub'?hws:wss;w.handleUpgrade(q,so,h,ws=>w.emit('connection',ws,q))});
const HU=new Map;
hws.on('connection',(ws,req)=>{const ip=req.socket.remoteAddress;let k=null;const sd=o=>{if(ws.readyState==1)ws.send(JSON.stringify(o))};
ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}
if(!k){if(m.t!='auth'||m.m!='token')return sd({t:'err',e:'Mail needs a saved login'});const a=auth(m,ip);if(typeof a=='string')return sd({t:'err',e:a});k=a.ok;HU.set(k,ws);return sd({t:'mail',a:DB.users[k].mail||[]})}
if(m.t=='send'){const tk=String(m.to||'').toLowerCase(),T=DB.users[tk];if(!T||!m.m||!Array.isArray(m.m.addr))return sd({t:'err',e:'No player with that name'});const ml={id:crypto.randomBytes(6).toString('hex'),from:DB.users[k].n,name:String(m.m.name||'a world').slice(0,30),addr:m.m.addr.slice(0,5).map(x=>String(x).slice(0,100)),ts:Date.now()};T.mail=(T.mail||[]).concat(ml).slice(-50);dirty=1;const w=HU.get(tk);if(w&&w.readyState==1)w.send(JSON.stringify({t:'mail+',m:ml}));sd({t:'sent',to:T.n})}
else if(m.t=='del'){const U=DB.users[k];U.mail=(U.mail||[]).filter(x=>x.id!=m.id);dirty=1}});
ws.on('close',()=>{if(k&&HU.get(k)===ws)HU.delete(k)});ws.on('error',()=>{})});

wss.on('connection',(ws,req)=>{const ip=req.socket.remoteAddress,local=isLocal(req);let me=null;const err=e=>{ws.send(JSON.stringify({t:'err',e}));ws.close()};
ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(e){return}
if(!me){if(m.t=='status'){ws.send(JSON.stringify({t:'status',n:PL.size,max:MAXP,pvp:CFG.pvp,name:WNAME}));return}if(m.t!='auth')return;const a=auth(m,ip);if(typeof a=='string')return err(a);const k=a.ok;
if([...PL.values()].some(p=>p.k==k))return err('That account is already online');if(PL.size>=MAXP)return err('Server is full');
me={id:nid++,k,n:DB.users[k].n,x:0,y:0,z:0,yaw:0,ws,dead:false,sl:false,pr:Date.now()+PROT,ks:0};PL.set(me.id,me);setAu();const el=(Date.now()-DB.t0)/1000/DAYL;
ws.send(JSON.stringify({t:'ok',u:me.n,id:me.id,seed:DB.seed,diff:1,name:WNAME,pvp:CFG.pvp,loot:CFG.loot,prot:PROT,sb:sbList(),au:me.id==AU,tok:a.tok,tm:el%1,day:Math.floor(el)+1,data:DB.users[k].d,pcs:Object.values(DB.pcs),items:[...ITEMS.values()].map(e=>e.i),rm:DB.rm}));bc({t:'msg',s:me.n+' joined'},me);sbCast();return}
if(m.t=='p'){for(const k of['x','y','z','yaw'])if(Number.isFinite(m[k]))me[k]=m[k];if(typeof m.ar=='string'&&/^[0-9a-z]{4}$/.test(m.ar))me.ar=m.ar}
else if(m.t=='pc+'&&m.s&&typeof m.k=='string'&&m.k.length<48&&['gx','gz','L','dir','m'].every(k=>Number.isFinite(m.s[k]))&&typeof m.s.t=='string'&&m.s.t.length==1){DB.pcs[m.k]={t:m.s.t,gx:m.s.gx,gz:m.s.gz,L:m.s.L,dir:m.s.dir,m:m.s.m,tl:m.s.tl|0,open:0};dirty=1;bc({t:'pc+',s:DB.pcs[m.k]},me)}
else if(m.t=='pc-'&&typeof m.k=='string'){delete DB.pcs[m.k];dirty=1;bc({t:'pc-',k:m.k},me)}
else if(m.t=='save'&&m.d&&typeof m.d=='object'){DB.users[me.k].d=m.d;dirty=1}
else if(m.t=='z'&&me.id==AU&&Array.isArray(m.a))bc({t:'z',a:m.a.slice(0,80)},me)
else if(m.t=='zh'&&AU)to(AU,{t:'zh',id:m.id,d:Math.min(Math.max(+m.d||0,0),500),kx:+m.kx||0,kz:+m.kz||0,f:me.id})
else if(m.t=='ld'&&me.id==AU)to(m.to,{t:'ld',id:String(m.id),n:Math.min(+m.n||0,99),x:+m.x,y:+m.y,z:+m.z})
else if(m.t=='ph'){if(m.z&&me.id==AU)to(m.to,{t:'hurt',d:Math.min(Math.max(+m.d||0,0),200),f:''})}
else if(m.t=='pv')pvHit(me,m)
else if(m.t=='inv'){const q=[...PL.values()].find(r=>r.n.toLowerCase()==String(m.to).toLowerCase());if(q&&q!==me)to(q.id,{t:'inv',from:me.n,id:me.id})}
else if(m.t=='pg'&&Number.isFinite(m.x)&&Number.isFinite(m.z)){const t=Date.now();if(t-(me.pt||0)>=1500&&!me.dead&&Math.hypot(m.x-me.x,m.z-me.z)<=400){me.pt=t;bc({t:'pg',n:me.n,x:Math.round(m.x*10)/10,z:Math.round(m.z*10)/10})}}
else if(m.t=='chat'&&typeof m.s=='string'){const t=Date.now();if(t-(me.ct||0)<800)return;me.ct=t;if(m.s[0]=='/'){cmd(me,m.s);return}bc({t:'chat',n:me.n,s:m.s.slice(0,120)})}
else if(m.t=='door'&&typeof m.k=='string'&&DB.pcs[m.k]&&DB.pcs[m.k].t=='d'){DB.pcs[m.k].open=m.o?1:0;dirty=1;bc({t:'door',k:m.k,o:m.o?1:0},me)}
else if(m.t=='cs'&&typeof m.k=='string'&&DB.pcs[m.k]){const o=applyCs(DB.pcs[m.k],m);if(o){dirty=1;o.t='cs';o.k=m.k;bc(o,me)}}
else if(m.t=='it+'&&m.i&&typeof m.i.u=='string'&&m.i.u.length<40&&typeof m.i.id=='string'&&m.i.id.length<32&&Number.isFinite(m.i.n)&&m.i.n>0&&m.i.n<=99&&ITEMS.size<500&&!ITEMS.has(m.i.u)){const i={u:m.i.u,id:m.i.id,n:m.i.n|0,x:+m.i.x||0,y:+m.i.y||0,z:+m.i.z||0,vx:+m.i.vx||0,vy:+m.i.vy||0,vz:+m.i.vz||0};if(Number.isFinite(m.i.dr))i.dr=m.i.dr;ITEMS.set(i.u,{i,ts:Date.now()});bc({t:'it+',i},me)}
else if(m.t=='itc'&&typeof m.u=='string'){if(ITEMS.delete(m.u)){ws.send(JSON.stringify({t:'itok',u:m.u}));bc({t:'it-',u:m.u},me)}else ws.send(JSON.stringify({t:'it-',u:m.u}))}
else if(m.t=='rm'&&(typeof m.id=='string'||typeof m.id=='number')&&String(m.id).length<48){if(!DB.rm.includes(m.id)&&DB.rm.length<6000){DB.rm.push(m.id);dirty=1;if(m.g)DB.rg.push([m.id,Date.now()+(200+Math.random()*120)*1000])}bc({t:'rm',id:m.id},me)}
else if(m.t=='dead'){const was=me.dead;me.dead=!!m.v;if(me.dead){me.sl=false;if(!was)pvDead(me)}else{me.pr=Date.now()+PROT;me.lh=null;to(me.id,{t:'prot',ms:PROT})}setAu();if(me.dead)wipeCheck();else if(AU&&Number.isFinite(m.x)&&Number.isFinite(m.z))to(AU,{t:'zc',x:+m.x,z:+m.z,r:30});slpCheck()}
else if(m.t=='slp'){me.sl=!!m.v&&!me.dead;slpCheck()}
else if(m.t=='import'){if(me.k!=DB.owner&&!local)return ws.send(JSON.stringify({t:'err',e:'Only the person who runs the server can open a world. Do it on the PC that runs server.js.'}));if(PL.size!=1)return ws.send(JSON.stringify({t:'err',e:'Other players are online. Ask them to leave first, then try again.'}));if(local)DB.owner=me.k;const w=m.w;if(!w||!Array.isArray(w.pcs))return;DB.seed=w.seed|0;DB.pcs={};DB.rm=Array.isArray(w.rm)?w.rm.filter(x=>typeof x=='string'||typeof x=='number').slice(0,6000):[];DB.rg=[];ITEMS.clear();for(const e of w.pcs.slice(0,6000)){const s=e&&e.s;if(s&&typeof e.k=='string'&&e.k.length<48&&['gx','gz','L','dir','m'].every(k=>Number.isFinite(s[k]))&&typeof s.t=='string'&&s.t.length==1)DB.pcs[e.k]=mkPc(s)}DB.t0=Date.now()-((+w.day||1)-1+(+w.t||0))*DAYL*1000;if(m.d&&typeof m.d=='object')DB.users[me.k].d=m.d;dirty=1;ws.send(JSON.stringify({t:'imp'}))}});
ws.on('close',()=>{if(me){const fled=me.lh&&!me.dead&&Date.now()-me.lh.t<WIN;PL.delete(me.id);setAu();bc({t:'msg',s:me.n+(fled?' left in the middle of a fight':' left')});slpCheck();sbCast()}});ws.on('error',()=>{})});
setInterval(()=>{const t=Date.now();DB.rg=DB.rg.filter(e=>{if(t<e[1])return true;const i=DB.rm.indexOf(e[0]);if(i>=0)DB.rm.splice(i,1);dirty=1;bc({t:'rg',id:e[0]});return false})},4000);
setInterval(()=>{if(PL.size){const el=elapsed();bc({t:'tm',tm:el%1,day:Math.floor(el)+1})}const t=Date.now();for(const[u,e]of ITEMS)if(t-e.ts>330000){ITEMS.delete(u);bc({t:'it-',u})}},2000);
setInterval(()=>{if(PL.size)bc({t:'ps',a:[...PL.values()].map(p=>({id:p.id,n:p.n,x:p.x,y:p.y,z:p.z,yaw:p.yaw,ar:p.ar}))})},100);
const lan=()=>{const o=[];for(const l of Object.values(os.networkInterfaces()))for(const i of l)if((i.family=='IPv4'||i.family===4)&&!i.internal)o.push(i.address+':'+PORT);return o};
function writeJoin(a){a=[].concat(a);try{fs.writeFileSync(path.join(DATA,'JOIN-MY-SERVER.html'),page(a));console.log('\n>>> Send your friends the file JOIN-MY-SERVER.html (server: '+a+'). They just double-click it.\n')}catch(e){console.log('Could not write the join file: '+e.message)}}
function ipFallback(){https.get('https://api.ipify.org',{timeout:3000},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log('No tunnel found. Using your public IP (port '+PORT+' must be forwarded on your router).');writeJoin([d+':'+PORT].concat(lan()))})}).on('error',()=>writeJoin(lan().concat('localhost:'+PORT)))}
function findAddr(){const pa=process.env.PUBLIC_ADDR||process.argv[4];if(pa)return writeJoin(pa);let done=0;try{const c=require('child_process').spawn('cloudflared',['tunnel','--url','http://localhost:'+PORT]);c.on('error',()=>{if(!done){done=1;ipFallback()}});c.stderr.on('data',d=>{const m=/https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(d);if(m&&!done){done=1;console.log('Tunnel online: '+m[0]);writeJoin([m[0]].concat(lan()))}});process.on('exit',()=>c.kill())}catch(e){ipFallback()}}
srv.listen(PORT,'0.0.0.0',()=>{console.log('\nDEAD HARBOR SERVER RUNNING (port '+PORT+')\nYou and friends on your Wi-Fi/LAN open:');
for(const l of Object.values(os.networkInterfaces()))for(const i of l)if((i.family=='IPv4'||i.family===4)&&!i.internal)console.log('   http://'+i.address+':'+PORT);
console.log('Friends over the internet: forward port '+PORT+' on your router, or use a tunnel (see notes).');
findAddr()});
