/* Branch Line game: state, economy, workshop, map rendering. Sound lives in audio.js. */
(function(){
"use strict";
const W=1000,H=760;
const ST=[
 {n:'Alder',x:300,y:400},{n:'Brook',x:520,y:330},{n:'Cray',x:420,y:560},{n:'Dunmoor',x:700,y:470},
 {n:'Elm Hill',x:180,y:250},{n:'Fenwick',x:640,y:170},{n:'Garth',x:120,y:520},{n:'Holt',x:860,y:330},
 {n:'Ivel',x:400,y:150},{n:'Juniper',x:600,y:650},{n:'Kelso',x:880,y:580},{n:'Lyme',x:240,y:680},
 {n:'Morrow',x:860,y:120},{n:'Nethy',x:110,y:110}];
/* Allowed rail links: stations whose Voronoi cells touch (Delaunay edges), minus very long rim links */
const DEL=(function(P){const E=new Set(),n=P.length;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++){
  const a=P[i],b=P[j],c=P[k],d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(d)<1e-9)continue;
  const A=a.x*a.x+a.y*a.y,B=b.x*b.x+b.y*b.y,Q=c.x*c.x+c.y*c.y;
  const ux=(A*(b.y-c.y)+B*(c.y-a.y)+Q*(a.y-b.y))/d,uy=(A*(c.x-b.x)+B*(a.x-c.x)+Q*(b.x-a.x))/d,r2=(a.x-ux)**2+(a.y-uy)**2;
  let ok=true;for(let m=0;m<n&&ok;m++)if(m!==i&&m!==j&&m!==k&&(P[m].x-ux)**2+(P[m].y-uy)**2<r2-1e-6)ok=false;
  if(ok){E.add(i+'-'+j);E.add(j+'-'+k);E.add(i+'-'+k)}}
 return [...E].map(t=>t.split('-').map(Number)).filter(([a,b])=>Math.hypot(P[a].x-P[b].x,P[a].y-P[b].y)<=440)})(ST);
const ICON={
 engine:'<path d="M3 8h9v6H3zM12 10h4l1 4h-5M5 5v3M4 5h3"/><circle cx="6" cy="15.5" r="1.5"/><circle cx="13" cy="15.5" r="1.5"/>',
 cars:'<rect x="2" y="6" width="16" height="8" rx="1.5"/><path d="M6 6v8M10 6v8M14 6v8"/><circle cx="6" cy="16" r="1.2"/><circle cx="14" cy="16" r="1.2"/>',
 tickets:'<path d="M3 6h14v3a1.5 1.5 0 000 3v3H3v-3a1.5 1.5 0 000-3zM8 7v7"/>',
 platforms:'<path d="M2 15h16M4 15V9h12v6M3 9l7-4 7 4"/>',
 signals:'<path d="M10 18v-8"/><rect x="7" y="2" width="6" height="8" rx="3"/><circle cx="10" cy="5" r="1"/>',
 depot:'<path d="M3 16V8l7-4 7 4v8M7 16v-5h6v5"/>',
 rails:'<path d="M6 2L4 18M14 2l2 16M5 6h10M4.5 10h11M4 14h12"/>',
 cafe:'<path d="M4 7h9v4a4 4 0 01-4 4H8a4 4 0 01-4-4zM13 8h2a2 2 0 010 4h-2M4 17.5h10M7 2v2M10 2v2"/>',
 dining:'<path d="M6 2v6a2 2 0 004 0V2M8 2v16M14 18V2c-2 1-3 4-3 7h3"/>'};
/* Quality tiers and workshop odds (percent per tier, by workshop level) */
const QN=['Salvaged','Standard','Fine','Express','Pullman','Royal'],QM=[0.6,1,1.4,1.9,2.5,3.3],QC=['--q0','--s3','--s1','--s4','--s2','--s0'];
const ODDS=[[70,30,0,0,0,0],[50,42,8,0,0,0],[30,50,18,2,0,0],[15,48,30,7,0,0],[5,40,38,15,2,0],[0,30,40,23,6,1],[0,18,40,30,10,2],[0,8,35,35,17,5]];
const SLOTS=['engine','cars','tickets','platforms','signals','cafe','dining'];
const NAME={engine:'Engine',cars:'Carriages',tickets:'Tickets',platforms:'Platforms',signals:'Signals',cafe:'Station café',dining:'Dining car',rails:'Rails',depot:'Depot'};
const ORDER=['engine','cars','tickets','platforms','signals','cafe','dining','rails','depot'];
const KEY='branch-line-v1';
const fresh=()=>({coins:0,tokens:3,tokP:0,sound:true,items:{},depot:0,works:1,pending:null,auto:false,edges:[[0,1]],delivered:0,xp:0,level:1,goal:0,rate:0,t:Date.now()});
let S=fresh();
let conn,adj,waiting,spawnT,trains,floats=[],acc=0,accT=0,cafeT=0;
let smoke=[],pulses=[],born={},popT={},bridges=[],stAng=[];
const Snd=window.Snd||{start(){},setOn(){},clack(){},whistle(){}};

const pw=it=>it?it.lv*QM[it.q]:0;
const E=k=>pw(S.items[k]);
const rankB=()=>1+0.05*(S.level-1);
const speedE=e=>70*(1+0.08*e), capE=e=>4+Math.round(1.5*e), fareE=e=>(1+0.2*e)*rankB(), hopE=e=>0.25+0.06*e,
      spawnE=e=>3.2/(1+0.1*e), dwellE=e=>Math.max(0.25,0.9*Math.pow(0.93,e)), cafeE=e=>0.05*e*fareBase();
const speed=()=>speedE(E('engine')),cap=()=>capE(E('cars')),fareBase=()=>fareE(E('tickets')),hopBonus=()=>hopE(E('dining')),
      spawnInt=()=>spawnE(E('platforms')),wcap=()=>6+Math.round(1.5*E('platforms')),dwell=()=>dwellE(E('signals')),cafeRate=()=>cafeE(E('cafe'));
const FX={
 engine:e=>Math.round(speedE(e)*0.8)+' km/h',
 cars:e=>capE(e)+' seats',
 tickets:e=>'fare '+fmt2(fareE(e)),
 platforms:e=>Math.round(60/spawnE(e))+'/min each',
 signals:e=>dwellE(e).toFixed(2)+'s stops',
 cafe:e=>e?'+'+fmt2(cafeE(e))+'/guest':'no café yet',
 dining:e=>'+'+Math.round(hopE(e)*100)+'% far trips'};
const depotCost=()=>Math.ceil(120*Math.pow(2.6,S.depot));
const worksCost=()=>150*Math.pow(4,S.works-1);
const need=l=>Math.floor(15*Math.pow(l,1.5));
const dist=(a,b)=>Math.hypot(ST[a].x-ST[b].x,ST[a].y-ST[b].y);
function fmt(n){n=Math.floor(n);if(n<1000)return ''+n;const u=['K','M','B','T','Q'];let i=-1;while(n>=1000&&i<u.length-1){n/=1000;i++}return (n<10?n.toFixed(2):n<100?n.toFixed(1):n.toFixed(0))+u[i]}
function fmt2(n){return n<10?n.toFixed(2):n<100?n.toFixed(1):fmt(n)}
const $=id=>document.getElementById(id);
const qcol=q=>'var('+QC[q]+')';

function rebuild(){
  conn=new Set();adj=ST.map(()=>[]);
  for(const [a,b] of S.edges){conn.add(a);conn.add(b);adj[a].push(b);adj[b].push(a)}
  geo();
  waiting=waiting||ST.map(()=>[]);spawnT=spawnT||ST.map(()=>Math.random()*2);
  trains=trains||[];
  const list=[...conn];
  while(trains.length<1+S.depot){trains.push({at:list[trains.length%list.length],to:-1,p:0,len:1,state:'dwell',w:0.3+trains.length*0.4,path:[],pax:[],ang:0,target:-1})}
}
function bfs(a,b){
  if(a===b)return [];const D=new Map([[a,0]]),prev=new Map(),done=new Set();
  for(;;){let c=-1,bd=1e18;for(const [k,v] of D)if(!done.has(k)&&v<bd){bd=v;c=k}
    if(c<0||c===b)break;done.add(c);
    for(const n of adj[c]){const nd=bd+dist(c,n);if(!D.has(n)||nd<D.get(n)){D.set(n,nd);prev.set(n,c)}}}
  if(!prev.has(b))return [];const out=[];let c=b;while(c!==a){out.unshift(c);c=prev.get(c)}return out}
function cands(){const out=[],base=40*Math.pow(1.85,conn.size-2)/250;
  for(const [p,q] of DEL){const cp=conn.has(p),cq=conn.has(q);if((!cp&&!cq)||adj[p].includes(q))continue;
    const nw=!(cp&&cq);out.push({a:cp?p:q,b:cp?q:p,nw,c:Math.ceil(base*dist(p,q)*(nw?1:0.6))})}
  return out.sort((x,y)=>x.c-y.c)}

function earn(v){S.coins+=v;acc+=v}
function addXp(n){S.xp+=n;let up=false;while(S.xp>=need(S.level)){S.xp-=need(S.level);S.level++;up=true}if(up)rankUp()}
function build(g){
  const nm=g.nw?ST[g.b].n:ST[g.a].n+'–'+ST[g.b].n;
  if(S.coins<g.c){toast('Need '+fmt(g.c-S.coins+1)+' more coins for '+nm);return}
  S.coins-=g.c;S.edges.push([g.a,g.b]);rebuild();born[g.a+'-'+g.b]=performance.now();if(g.nw)popT[g.b]=performance.now()+700;
  floats.push({i:g.b,txt:g.nw?ST[g.b].n+' linked':'New link',t:0});$('hint').hidden=true;save();ui()}
function buy(k){
  if(k==='rails'){const g=cands(),n=g.find(x=>x.nw)||g[0];if(n)build(n);return}
  if(k==='depot'){const c=depotCost();if(S.coins<c)return;S.coins-=c;S.depot++;rebuild();save();ui()}}

/* ---------- Workshop: random part of random quality ---------- */
function roll(odds){let r=Math.random()*100;for(let q=0;q<odds.length;q++){r-=odds[q];if(r<0)return q}return odds.findIndex(o=>o>0)}
const val=it=>Math.max(1,Math.round(3*Math.pow(it.lv,1.2)*QM[it.q]));
function sellPart(it){const v=val(it);S.coins+=v;addXp(v);return v}
function drawPart(){
  if(S.pending){showPart();return}
  if(S.tokens<1){toast('No tokens. You get 1 for every 5 passengers delivered');return}
  S.tokens--;
  const k=SLOTS[Math.floor(Math.random()*SLOTS.length)],q=roll(ODDS[S.works-1]),lv=Math.max(1,S.level+Math.floor(Math.random()*4)-2);
  const it={k,q,lv};
  const cur=S.items[k];
  if(S.auto&&cur&&pw(it)<=pw(cur)){const v=sellPart(it);toast('Sold '+QN[q]+' '+NAME[k]+' Lv '+lv+' for '+fmt(v)+' coins and '+fmt(v)+' XP')}
  else{S.pending=it;showPart()}
  save();ui()}
function showPart(){
  const it=S.pending;if(!it)return;const cur=S.items[it.k],up=pw(it)>pw(cur);
  $('pt-title').textContent=NAME[it.k];
  $('pt-cur-t').textContent=cur?QN[cur.q]+' · Lv '+cur.lv:'Empty slot';$('pt-cur-t').style.color=cur?qcol(cur.q):'var(--muted)';
  $('pt-cur-v').textContent=FX[it.k](pw(cur));
  $('pt-new-t').textContent=QN[it.q]+' · Lv '+it.lv;$('pt-new-t').style.color=qcol(it.q);$('pt-new-card').style.borderColor=qcol(it.q);
  $('pt-new-v').innerHTML=FX[it.k](pw(it))+' <span style="color:var('+(up?'--s3':'--s0')+')">'+(up?'▲ better':pw(it)===pw(cur)?'= same':'▼ worse')+'</span>';
  $('pt-sell').innerHTML='Sell <i class="coin"></i>'+fmt(val(it))+' +'+fmt(val(it))+' XP';
  $('pt-fit').innerHTML=cur?'Fit, sell old <i class="coin"></i>'+fmt(val(cur)):'Fit';
  $('dlg-works').hidden=true;$('dlg-part').hidden=false;$('ov').hidden=false}
function closeOv(){$('ov').hidden=true;$('dlg-part').hidden=true;$('dlg-works').hidden=true}
$('pt-sell').addEventListener('click',()=>{const it=S.pending;if(!it)return;S.pending=null;sellPart(it);closeOv();save();ui()});
$('pt-fit').addEventListener('click',()=>{const it=S.pending;if(!it)return;const old=S.items[it.k];S.items[it.k]={q:it.q,lv:it.lv};S.pending=null;closeOv();if(old){const v=sellPart(old);toast('Old '+NAME[it.k]+' sold for '+fmt(v)+' coins and '+fmt(v)+' XP')}save();ui()});
function showWorks(){
  const L=S.works,max=L>=ODDS.length;let h='<tr><th>Quality</th><th>Level '+L+'</th><th>'+(max?'':'Level '+(L+1))+'</th></tr>';
  for(let q=0;q<QN.length;q++)h+='<tr><td style="color:'+qcol(q)+'">'+QN[q]+'</td><td>'+ODDS[L-1][q]+'%</td><td class="nx">'+(max?'':ODDS[L][q]+'%')+'</td></tr>';
  $('odds').innerHTML=h;const b=$('wk-up');
  if(max){b.textContent='Top level';b.disabled=true}else{b.innerHTML='Upgrade <i class="coin"></i>'+fmt(worksCost());b.disabled=S.coins<worksCost()}
  $('dlg-part').hidden=true;$('dlg-works').hidden=false;$('ov').hidden=false}
$('works').addEventListener('click',showWorks);
$('wk-close').addEventListener('click',closeOv);
$('wk-up').addEventListener('click',()=>{if(S.works>=ODDS.length||S.coins<worksCost())return;S.coins-=worksCost();S.works++;save();ui();showWorks()});
$('ov').addEventListener('click',e=>{if(e.target===$('ov'))closeOv()});
$('draw').addEventListener('click',drawPart);
$('auto').addEventListener('change',e=>{S.auto=e.target.checked;save()});

function fare(p){return fareBase()*(1+hopBonus()*Math.max(0,dist(p.o,p.d)/230-1))}
function load(tr){const q=waiting[tr.at];while(tr.pax.length<cap()&&q.length)tr.pax.push(q.shift())}
function arrive(tr){
  tr.state='dwell';tr.w=dwell();let e=0,n=0;
  tr.pax=tr.pax.filter(p=>{if(p.d===tr.at){e+=fare(p);n++;return false}return true});
  if(n){earn(e);S.delivered+=n;addXp(n);S.tokP+=n;while(S.tokP>=5){S.tokP-=5;S.tokens++}floats.push({i:tr.at,txt:'+'+fmt2(e),t:0});pulses.push({i:tr.at,t:0});flyCoins(tr.at,Math.min(3,n))}
  load(tr)}
function stepTrain(tr,dt){
  if(tr.state==='dwell'){
    tr.w-=dt;if(tr.w>0)return;load(tr);
    if(!tr.path.length){
      let target=-1;
      if(tr.pax.length)target=tr.pax[0].d;
      else{let bs=0;for(const i of conn){if(i===tr.at)continue;let s=waiting[i].length;for(const o of trains)if(o!==tr&&o.target===i)s-=cap();if(s>bs){bs=s;target=i}}}
      tr.target=target;
      if(target<0){tr.w=0.4;return}
      tr.path=bfs(tr.at,target);if(!tr.path.length){tr.w=0.4;return}
      tr.wh=1;
    }
    if(tr.wh){tr.wh=0;Snd.whistle()}
    tr.to=tr.path.shift();tr.p=0;tr.len=dist(tr.at,tr.to);tr.state='move';return}
  tr.p+=speed()*dt/tr.len;
  if(tr.p>=1){tr.at=tr.to;arrive(tr)}}
function step(dt){
  if(conn.size>=2){const list=[...conn];for(const i of list){spawnT[i]-=dt;if(spawnT[i]<=0){spawnT[i]=spawnInt()*(0.7+0.6*Math.random());
    if(waiting[i].length<wcap()){let d=i;while(d===i)d=list[Math.floor(Math.random()*list.length)];waiting[i].push({o:i,d})}}}}
  if(S.items.cafe){cafeT+=dt;if(cafeT>=3){cafeT=0;for(const i of conn){const n=waiting[i].length;if(n){const v=n*cafeRate();earn(v);floats.push({i,txt:'café +'+fmt2(v),t:0,low:1})}}}}
  for(const tr of trains){stepTrain(tr,dt);trailStep(tr,dt)}
  for(const f of floats)f.t+=dt;floats=floats.filter(f=>f.t<1.6);
  for(const f of smoke)f.t+=dt;smoke=smoke.filter(f=>f.t<1.3);
  for(const f of pulses)f.t+=dt;pulses=pulses.filter(f=>f.t<.9);
  accT+=dt;if(accT>=5){const inst=acc/accT;S.rate=S.rate?S.rate*0.7+inst*0.3:inst;acc=0;accT=0}}

function goalDef(i){
  const k=Math.floor(i/4),type=i%4,rw=Math.max(40*Math.pow(1.4,i),S.rate*120);
  if(type===0&&3+k<=ST.length)return{txt:'Link '+(3+k)+' stations',cur:conn.size,target:3+k,rw};
  if(type===0||type===1){const t=Math.round(25*Math.pow(2.6,k)*(type===0?2:1));return{txt:'Carry '+fmt(t)+' passengers',cur:S.delivered,target:t,rw}}
  if(type===2)return{txt:'Run '+(2+k)+' trains',cur:1+S.depot,target:2+k,rw};
  return{txt:'Reach line rank '+(3+3*k),cur:S.level,target:3+3*k,rw}}

/* ---------- UI ---------- */
const partEl={};
function mkParts(){
  const root=$('parts');
  for(const k of ORDER){
    const isBuy=k==='rails'||k==='depot',b=document.createElement(isBuy?'button':'div');b.className='part';b.id='part-'+k;
    b.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true">'+ICON[k]+'</svg><span class="lv"></span><span class="nm">'+NAME[k]+'</span><span class="ef"></span><span class="co"></span>';
    if(isBuy)b.addEventListener('click',()=>buy(k));root.appendChild(b);
    partEl[k]={b,lv:b.querySelector('.lv'),ef:b.querySelector('.ef'),co:b.querySelector('.co')}}
}
const coinH=v=>'<i class="coin"></i>'+fmt(v);
function ui(){
  $('coins').lastChild.textContent=' '+fmt(S.coins);
  $('rate').textContent='+'+fmt(S.rate*60)+' / min';
  $('lvl').textContent=S.level;$('xpbar').style.width=Math.min(100,100*S.xp/need(S.level))+'%';$('xptext').textContent=S.xp+'/'+need(S.level);
  $('st-speed').textContent=Math.round(speed()*0.8)+' km/h';$('st-seats').textContent=cap()+' × '+(1+S.depot);$('st-fare').textContent=fmt2(fareBase());$('st-carried').textContent=fmt(S.delivered);
  for(const k of ORDER){const e=partEl[k];
    if(k==='rails'){const cs=cands(),g=cs.find(x=>x.nw)||cs[0];e.lv.textContent=conn.size+'/'+ST.length;
      if(g){e.ef.textContent=g.nw?'to '+ST[g.b].n:ST[g.a].n+'–'+ST[g.b].n;e.co.innerHTML=coinH(g.c);e.b.classList.toggle('can',S.coins>=g.c)}
      else{e.ef.textContent='All linked';e.co.textContent='';e.b.classList.remove('can')}
      continue}
    if(k==='depot'){const c=depotCost();e.lv.textContent='';e.ef.textContent=(1+S.depot)+(S.depot?' trains':' train');e.co.innerHTML=coinH(c);e.b.classList.toggle('can',S.coins>=c);continue}
    const it=S.items[k];e.b.classList.toggle('empty',!it);e.ef.textContent=FX[k](pw(it));
    e.lv.textContent=it?'Lv '+it.lv:'';e.co.textContent=it?QN[it.q]:'Empty';e.co.style.color=it?qcol(it.q):''}
  $('tokens').lastChild.textContent=' '+fmt(S.tokens);$('draw').classList.toggle('can',!!S.pending||S.tokens>=1);
  $('draw-txt').textContent=S.pending?'Review new part':'Build a part';$('draw-co').innerHTML=S.pending?'':'<i class="tok"></i>1';
  $('works-lv').textContent='Workshop '+S.works;$('works').classList.toggle('can',S.works<ODDS.length&&S.coins>=worksCost());
  if(!$('dlg-works').hidden&&S.works<ODDS.length)$('wk-up').disabled=S.coins<worksCost();
  $('auto').checked=!!S.auto;$('snd-t').textContent=S.sound?'On':'Off';$('snd').setAttribute('aria-pressed',S.sound?'true':'false');
  const g=goalDef(S.goal),done=g.cur>=g.target;
  $('goal').classList.toggle('ready',done);
  $('goal-txt').textContent=done?g.txt+'. Tap to collect':g.txt+' ('+fmt(Math.min(g.cur,g.target))+'/'+fmt(g.target)+')';
  $('goal-rw').innerHTML=coinH(g.rw);
}
let toastT;
function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2800)}
$('goal').addEventListener('click',()=>{const g=goalDef(S.goal);if(g.cur<g.target)return;S.coins+=g.rw;S.goal++;toast('Collected '+fmt(g.rw)+' coins');save();ui()});
$('snd').addEventListener('click',()=>{S.sound=!S.sound;Snd.setOn(S.sound);if(S.sound)Snd.start();save();ui()});
for(const ev of ['pointerdown','keydown'])document.addEventListener(ev,()=>{if(S.sound)Snd.start()});
let resetArm=0;
$('reset').addEventListener('click',()=>{const b=$('reset');
  if(Date.now()-resetArm<3000){S=fresh();waiting=null;spawnT=null;trains=null;floats=[];smoke=[];pulses=[];born={};popT={};rebuild();save();$('hint').hidden=false;b.textContent='Reset';resetArm=0;ui();toast('Line reset');return}
  resetArm=Date.now();b.textContent='Tap again';setTimeout(()=>{b.textContent='Reset'},3000)});

/* ---------- Effects outside the canvas ---------- */
const RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
let flying=0;
function flyCoins(i,n){
  if(RM||document.hidden||flying>15||!document.body.animate)return;
  const r=cv.getBoundingClientRect(),t=$('coins').getBoundingClientRect(),p=P(i),x0=r.left+p.x,y0=r.top+p.y,x1=t.left+6,y1=t.top+t.height/2;
  for(let j=0;j<n;j++){const el=document.createElement('i');el.className='fly';document.body.appendChild(el);flying++;
    const mx=(x0+x1)/2+(Math.random()*60-30),my=Math.min(y0,y1)+(Math.abs(y0-y1))*0.35-Math.random()*30;
    el.animate([{transform:'translate('+x0+'px,'+y0+'px) scale(.6)',opacity:0},{transform:'translate('+x0+'px,'+(y0-8)+'px) scale(1)',opacity:1,offset:.12},
      {transform:'translate('+mx+'px,'+my+'px) scale(1)',opacity:1,offset:.55},{transform:'translate('+x1+'px,'+y1+'px) scale(.7)',opacity:.9}],
      {duration:750+j*110,delay:j*70,easing:'ease-in-out',fill:'backwards'}).onfinish=()=>{el.remove();flying--;$('coins').animate([{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:180})}}}
function rankUp(){
  const el=$('rankup');
  if(RM||!el.animate){toast('Line rank '+S.level+'. Fares up 5%, new parts one level higher');return}
  $('rankup-n').textContent=S.level;el.hidden=false;const c='translate(-50%,-50%) ';
  el.animate([{opacity:0,transform:c+'scale(.7)'},{opacity:1,transform:c+'scale(1)',offset:.15},{opacity:1,transform:c+'scale(1)',offset:.75},{opacity:0,transform:c+'scale(1.08)'}],{duration:2200}).onfinish=()=>{el.hidden=true};
  const f=$('flash');f.hidden=false;f.animate([{opacity:.5},{opacity:0}],{duration:900}).onfinish=()=>{f.hidden=true}}

/* ---------- Landscape (fixed, generated once from a seed) ---------- */
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const RIV=[];
(function(){const B=(a,b,c,d,t)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d};
  const S1=[[560,-400],[620,120],[760,200],[780,260]],S2=[[780,260],[800,330],[900,440],[1500,480]];
  for(const s of [S1,S2])for(let i=(s===S1?0:1);i<=24;i++){const t=i/24;RIV.push({x:B(s[0][0],s[1][0],s[2][0],s[3][0],t),y:B(s[0][1],s[1][1],s[2][1],s[3][1],t)})}})();
const nearRiv=(x,y,d)=>RIV.some(p=>Math.hypot(p.x-x,p.y-y)<d);
const inLake=(x,y,m)=>Math.pow((x-50)/(125+m),2)+Math.pow((y-700)/(75+m),2)<1;
const LAND=(function(){const r=rng(11),R=(a,b)=>a+r()*(b-a),fields=[],trees=[],hills=[];
  const farSt=(x,y,d)=>ST.every(s=>Math.hypot(s.x-x,s.y-y)>d);
  for(let i=0;i<40;i++){const x=R(-350,1350),y=R(-300,1060),w=R(90,210),h=R(60,130),ro=R(-.6,.6);if(nearRiv(x,y,120)||inLake(x,y,100))continue;fields.push({x,y,w,h,r:ro,k:i%2})}
  for(let i=0;i<64;i++){const cx=R(-350,1350),cy=R(-300,1060),n=Math.floor(R(8,24));if(!farSt(cx,cy,80))continue;
    for(let j=0;j<n;j++){const a=R(0,6.283),d=r()*r()*80,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d,tr=R(6.5,11);if(!farSt(x,y,50)||nearRiv(x,y,32)||inLake(x,y,10))continue;trees.push({x,y,r:tr})}}
  trees.sort((a,b)=>a.y-b.y);
  for(let i=0;i<30&&hills.length<7;i++){const x=R(-200,1200),y=R(-150,900),hr=R(60,95),w=Array.from({length:9},()=>R(.78,1.18));if(!farSt(x,y,95)||nearRiv(x,y,120)||inLake(x,y,100))continue;hills.push({x,y,r:hr,w})}
  return{fields,trees,hills}})();
function segX(p,q,a,b){const d=(q.x-p.x)*(b.y-a.y)-(q.y-p.y)*(b.x-a.x);if(Math.abs(d)<1e-9)return null;
  const t=((a.x-p.x)*(b.y-a.y)-(a.y-p.y)*(b.x-a.x))/d,s=((a.x-p.x)*(q.y-p.y)-(a.y-p.y)*(q.x-p.x))/d;
  return t>0&&t<1&&s>=0&&s<=1?{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t}:null}
/* Station orientation and bridges, recomputed whenever the network changes */
function geo(){stAng=ST.map(()=>0);bridges=[];const seen=new Set();
  for(const [a,b] of S.edges){const an=Math.atan2(ST[b].y-ST[a].y,ST[b].x-ST[a].x);
    if(!seen.has(a)){seen.add(a);stAng[a]=an}if(!seen.has(b)){seen.add(b);stAng[b]=an}
    for(let i=1;i<RIV.length;i++){const h=segX(ST[a],ST[b],RIV[i-1],RIV[i]);if(h)bridges.push({x:h.x,y:h.y,ang:an})}}}
function trailStep(tr,dt){const a=ST[tr.at];let x=a.x,y=a.y;
  if(tr.state==='move'){const b=ST[tr.to];x=a.x+(b.x-a.x)*tr.p;y=a.y+(b.y-a.y)*tr.p;tr.ang=Math.atan2(b.y-a.y,b.x-a.x);
    tr.sm=(tr.sm||0)+dt;if(tr.sm>0.24){tr.sm=0;if(smoke.length<140)smoke.push({x,y,t:0,d:Math.random()*8-4})}
    tr.ck=(tr.ck||0)+speed()*dt;if(tr.ck>52){tr.ck=0;Snd.clack()}}
  tr.wx=x;tr.wy=y;const T=tr.trail||(tr.trail=[]),l=T[T.length-1];
  if(!l||Math.hypot(l.x-x,l.y-y)>4){T.push({x,y});if(T.length>90)T.shift()}}
function along(tr,d){let px=tr.wx,py=tr.wy;const T=tr.trail||[];
  for(let i=T.length-1;i>=0;i--){const q=T[i],l=Math.hypot(px-q.x,py-q.y);if(l>0&&l>=d){const t=d/l;return{x:px+(q.x-px)*t,y:py+(q.y-py)*t,ang:Math.atan2(py-q.y,px-q.x)}}d-=l;px=q.x;py=q.y}
  return{x:px,y:py,ang:tr.ang||0}}

/* ---------- Canvas ---------- */
const cv=$('map'),ctx=cv.getContext('2d');let cw=300,ch=300,sc=1,ox=0,oy=0,dpr=1,C={},ckey='',land=null,HALO='#fff';
const TOK=['ground','field','field2','forest','forest2','water','water2','ballast','sleeper','stone','plat','smoke','surface','ink','muted','track','accent','brass'];
function tokens(){const cs=getComputedStyle(document.documentElement),g=n=>cs.getPropertyValue(n).trim();
  for(const t of TOK)C[t]=g('--'+t);C.s=[0,1,2,3,4,5,6].map(i=>g('--s'+i));
  const n=parseInt(C.ground.slice(1),16);C.dark=((n>>16)+(n>>8&255)+(n&255))/3<110;
  const k=C.ground+C.forest+C.water;if(k!==ckey){ckey=k;land=null}}
function mixc(h,r2,g2,b2,t){const n=parseInt(h.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;return 'rgb('+Math.round(r+(r2-r)*t)+','+Math.round(g+(g2-g)*t)+','+Math.round(b+(b2-b)*t)+')'}
function resize(){const r=$('stage').getBoundingClientRect();dpr=window.devicePixelRatio||1;cw=Math.max(50,r.width);ch=Math.max(50,r.height);
  cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);sc=Math.min(cw/W,ch/H);ox=(cw-W*sc)/2;oy=(ch-H*sc)/2;land=null}
const PX=x=>ox+x*sc,PY=y=>oy+y*sc,P=i=>({x:PX(ST[i].x),y:PY(ST[i].y)});
function shapeOn(g,i,x,y,r){g.beginPath();const k=i%3;
  if(k===0)g.arc(x,y,r,0,7);else if(k===1)g.rect(x-r*.88,y-r*.88,r*1.76,r*1.76);else{g.moveTo(x,y-r*1.15);g.lineTo(x+r*1.1,y+r*.8);g.lineTo(x-r*1.1,y+r*.8);g.closePath()}}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function label(txt,x,y,col,size){ctx.font='600 '+(size||12)+'px "Barlow Condensed","Arial Narrow",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle=HALO;ctx.strokeText(txt,x,y);ctx.fillStyle=col;ctx.fillText(txt,x,y)}
function seg(p,q,dx,dy){ctx.beginPath();ctx.moveTo(p.x+(dx||0),p.y+(dy||0));ctx.lineTo(q.x+(dx||0),q.y+(dy||0));ctx.stroke()}

function renderLand(){
  land=document.createElement('canvas');land.width=cv.width;land.height=cv.height;const g=land.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle=C.ground;g.fillRect(0,0,cw,ch);
  for(const f of LAND.fields){const w=f.w*sc,h=f.h*sc;g.save();g.translate(PX(f.x),PY(f.y));g.rotate(f.r);g.fillStyle=f.k?C.field2:C.field;g.beginPath();g.rect(-w/2,-h/2,w,h);g.fill();g.clip();
    g.strokeStyle=C.ink;g.globalAlpha=.05;g.lineWidth=1;g.beginPath();for(let y=-h/2+3;y<h/2;y+=5){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();g.restore()}
  g.strokeStyle=C.ink;g.lineWidth=1;
  for(const h of LAND.hills)for(let k=0;k<3;k++){g.globalAlpha=.07+.025*k;const R=h.r*(1-k*.3)*sc,n=h.w.length,cx=PX(h.x),cy=PY(h.y);g.beginPath();
    for(let i=0;i<=n;i++){const a0=(i%n)/n*6.2832,a1=((i+1)%n)/n*6.2832,r0=R*h.w[i%n],r1=R*h.w[(i+1)%n];
      const x0=cx+Math.cos(a0)*r0,y0=cy+Math.sin(a0)*r0,mx=(x0+cx+Math.cos(a1)*r1)/2,my=(y0+cy+Math.sin(a1)*r1)/2;
      if(i===0)g.moveTo(mx,my);else g.quadraticCurveTo(x0,y0,mx,my)}
    g.closePath();g.stroke()}
  g.globalAlpha=1;
  const rw=Math.max(6,24*sc);g.lineCap='round';g.lineJoin='round';
  const riv=()=>{g.beginPath();RIV.forEach((p,i)=>i?g.lineTo(PX(p.x),PY(p.y)):g.moveTo(PX(p.x),PY(p.y)))};
  g.strokeStyle=C.water2;g.lineWidth=rw+3;riv();g.stroke();g.strokeStyle=C.water;g.lineWidth=rw;riv();g.stroke();
  g.strokeStyle=C.water2;g.lineWidth=Math.max(1,rw*.12);g.setLineDash([rw*.9,rw*1.7]);riv();g.stroke();g.setLineDash([]);
  g.fillStyle=C.water2;g.beginPath();g.ellipse(PX(50),PY(700),110*sc+2,60*sc+2,-0.3,0,7);g.fill();
  g.fillStyle=C.water;g.beginPath();g.ellipse(PX(50),PY(700),110*sc,60*sc,-0.3,0,7);g.fill();
  g.strokeStyle=C.water2;g.lineWidth=1;g.beginPath();g.ellipse(PX(50),PY(700),70*sc,34*sc,-0.3,0.4,2.4);g.stroke();
  for(const t of LAND.trees){const x=PX(t.x),y=PY(t.y),r=Math.max(1.6,t.r*sc);g.fillStyle=C.forest2;g.beginPath();g.arc(x+r*.25,y+r*.35,r,0,7);g.fill();g.fillStyle=C.forest;g.beginPath();g.arc(x,y,r*.9,0,7);g.fill()}
}
function housePos(i,u){const an=stAng[i],hs=Math.cos(an)>=0?1:-1,p=P(i);return{x:p.x-Math.sin(an)*hs*20*u,y:p.y+Math.cos(an)*hs*20*u,hs}}
function drawStation(i,now,u,nf){
  const p=P(i),an=stAng[i],hs=Math.cos(an)>=0?1:-1,e=E('platforms'),tier=e>=16?3:e>=8?2:e>=3?1:0,PL=30+tier*5,hw=8+tier;
  let k=1;const pt=popT[i];if(pt){const t=(now-pt)/500;if(t>=1)delete popT[i];else if(t>0)k=1+0.35*Math.sin(Math.PI*t)}
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(an);ctx.scale(u*k,u*k);
  ctx.lineWidth=.8;ctx.strokeStyle=C.ink;
  for(const sd of [-1,1]){rr(-PL/2,sd*10.5-2.6,PL,5.2,1.5);ctx.fillStyle=C.plat;ctx.fill();ctx.globalAlpha=.35;ctx.stroke();ctx.globalAlpha=1;
    if(tier>=1&&sd===hs){ctx.fillStyle=C.stone;ctx.fillRect(-PL/4,sd*10.5-2.6,PL/2,5.2)}}
  /* station house, roof in the station's own colour */
  rr(-hw,hs*20-5.5,hw*2,11,1.5);ctx.fillStyle=C.s[i%7];ctx.fill();ctx.lineWidth=1.1;ctx.stroke();
  ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(-hw+1.5,hs*20);ctx.lineTo(hw-1.5,hs*20);ctx.stroke();ctx.globalAlpha=1;
  if(tier>=2){rr(-hw-5,hs*20-3,5,6,1);ctx.fillStyle=C.surface;ctx.fill();ctx.stroke();ctx.fillStyle=C.brass;ctx.beginPath();ctx.arc(-hw-2.5,hs*20,1.2,0,7);ctx.fill()}
  if(tier>=3){rr(-hw+3,hs*27-1,hw*2-6,4,1);ctx.fillStyle=C.stone;ctx.fill();ctx.stroke()}
  if(nf>.2){ctx.fillStyle=C.brass;ctx.globalAlpha=nf;for(let w=-1;w<=1;w++)ctx.fillRect(w*(hw*.55)-1,hs*20-hs*4.2-1,2,2);ctx.globalAlpha=1}
  if(S.items.cafe){const cx=hw+3;rr(cx,hs*20-4.5,9,9,1.5);ctx.fillStyle=C.surface;ctx.fill();
    ctx.save();ctx.clip();ctx.fillStyle=C.brass;for(let x=0;x<9;x+=3)ctx.fillRect(cx+x,hs*20-4.5,1.5,9);ctx.restore();rr(cx,hs*20-4.5,9,9,1.5);ctx.stroke();
    ctx.fillStyle=C.surface;for(let t=0;t<2;t++){ctx.beginPath();ctx.arc(cx+2.5+t*4.5,hs*20+hs*-7.5,1.4,0,7);ctx.fill();ctx.stroke()}}
  /* waiting passengers stand on the platforms; shape and colour show where they are going */
  const q=waiting[i],n=Math.min(q.length,20),slots=Math.max(6,Math.floor((PL-6)/3.6));
  for(let j=0;j<n;j++){const sd=j%2?-hs:hs,s=Math.floor(j/2)%slots,x=-PL/2+3.5+s*((PL-7)/(slots-1)),y=sd*10.5;
    ctx.fillStyle=C.s[q[j].d%7];shapeOn(ctx,q[j].d,x,y,2.1);ctx.fill();ctx.fillStyle=C.ink;ctx.beginPath();ctx.arc(x,y,.7,0,7);ctx.fill()}
  ctx.restore()}

function draw(){
  const now=performance.now(),u=Math.max(.7,Math.min(1.25,sc/.55));
  /* day and night: a full cycle takes six minutes */
  const dd=-Math.cos(((now/1000)%360)/360*6.2832),nx=Math.max(0,Math.min(1,(dd-.25)/.45)),nf=nx*nx*(3-2*nx),NA=nf*(C.dark?.24:.36);
  HALO=mixc(C.ground,12,22,48,NA);
  if(!land||land.width!==cv.width||land.height!==cv.height)renderLand();
  ctx.setLineDash([]);ctx.globalAlpha=1;ctx.drawImage(land,0,0,cw,ch);

  const rw=Math.max(6,24*sc);
  for(const b of bridges){const L=rw*1.5+12*u;ctx.save();ctx.translate(PX(b.x),PY(b.y));ctx.rotate(b.ang);
    ctx.fillStyle=C.stone;ctx.fillRect(-L/2,-9.5*u,L,19*u);ctx.strokeStyle=C.ink;ctx.globalAlpha=.55;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(-L/2,-9.5*u);ctx.lineTo(L/2,-9.5*u);ctx.moveTo(-L/2,9.5*u);ctx.lineTo(L/2,9.5*u);
    for(const x of [-L/2,L/2]){ctx.moveTo(x,-12*u);ctx.lineTo(x,-9.5*u);ctx.moveTo(x,9.5*u);ctx.lineTo(x,12*u)}ctx.stroke();ctx.restore()}
  ctx.globalAlpha=1;

  const cd=cands();
  ctx.lineCap='butt';ctx.setLineDash([2,6]);ctx.strokeStyle=C.muted;ctx.globalAlpha=.35;ctx.lineWidth=1;ctx.beginPath();
  for(const [a,b] of DEL){if(conn.has(a)||conn.has(b))continue;const p=P(a),q=P(b);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y)}ctx.stroke();
  ctx.setLineDash([4,5]);ctx.lineWidth=1.5;
  for(const g of cd){const ok=S.coins>=g.c;ctx.strokeStyle=ok?C.accent:C.muted;ctx.globalAlpha=ok?.95:.6;seg(P(g.a),P(g.b))}
  ctx.setLineDash([3,3]);ctx.lineWidth=2;
  for(let i=0;i<ST.length;i++){if(conn.has(i))continue;const p=P(i),g=cd.find(x=>x.b===i);
    ctx.globalAlpha=g?1:.5;ctx.fillStyle=C.ground;ctx.strokeStyle=g&&S.coins>=g.c?C.accent:C.muted;ctx.beginPath();ctx.arc(p.x,p.y,9*u,0,7);ctx.fill();ctx.stroke()}
  ctx.setLineDash([]);ctx.globalAlpha=1;

  /* double track: ballast first so junctions join cleanly, then sleepers and rails */
  const tr=[];
  for(const [a,b] of S.edges){const p=P(a),q0=P(b),key=a+'-'+b,bt=born[key];let pr=1;if(bt){pr=Math.min(1,(now-bt)/700);if(pr>=1)delete born[key]}
    const q={x:p.x+(q0.x-p.x)*pr,y:p.y+(q0.y-p.y)*pr},an=Math.atan2(q0.y-p.y,q0.x-p.x);tr.push({p,q,nx:-Math.sin(an),ny:Math.cos(an),pr})}
  ctx.lineCap='round';ctx.strokeStyle=C.ballast;ctx.lineWidth=15*u;for(const t of tr)seg(t.p,t.q);
  ctx.lineCap='butt';
  for(const t of tr)for(const sd of [-1,1]){const o=3.6*u*sd;
    ctx.strokeStyle=C.sleeper;ctx.lineWidth=5.4*u;ctx.setLineDash([1.6*u,3.2*u]);seg(t.p,t.q,t.nx*o,t.ny*o);ctx.setLineDash([]);
    ctx.strokeStyle=C.track;ctx.lineWidth=Math.max(.8,u);seg(t.p,t.q,t.nx*(o-1.5*u),t.ny*(o-1.5*u));seg(t.p,t.q,t.nx*(o+1.5*u),t.ny*(o+1.5*u))}
  for(const t of tr)if(t.pr<1){ctx.fillStyle=C.brass;ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(t.q.x,t.q.y,(5+3*Math.sin(now/60))*u,0,7);ctx.fill();ctx.globalAlpha=1}

  for(const i of conn)drawStation(i,now,u,nf);

  for(const s of smoke){const a=Math.max(0,1-s.t/1.3);ctx.globalAlpha=a*.6;ctx.fillStyle=C.smoke;ctx.beginPath();ctx.arc(PX(s.x)+s.d*s.t,PY(s.y)-11*s.t*u,(2+5*s.t)*u,0,7);ctx.fill()}
  ctx.globalAlpha=1;

  const nc=Math.min(4,1+Math.floor(E('cars')/3));
  for(const t of trains){if(t.wx==null)continue;const lit=Math.round(t.pax.length/cap()*nc*3);
    for(let j=nc;j>=1;j--){const c=along(t,(8+j*12.5)*u/sc);ctx.save();ctx.translate(PX(c.x)-Math.sin(c.ang)*3.6*u,PY(c.y)+Math.cos(c.ang)*3.6*u);ctx.rotate(c.ang);ctx.scale(u,u);
      rr(-5.5,-3.3,11,6.6,1.6);ctx.fillStyle=C.accent;ctx.fill();ctx.strokeStyle=C.ink;ctx.lineWidth=.9;ctx.stroke();
      for(let w=0;w<3;w++){const on=(j-1)*3+w<lit;ctx.fillStyle=on?C.brass:C.surface;ctx.globalAlpha=on?1:.55;ctx.fillRect(2.2-w*3.3,-1.3,2.2,2.6)}
      ctx.restore()}
    const a=t.ang||0;ctx.save();ctx.translate(PX(t.wx)-Math.sin(a)*3.6*u,PY(t.wy)+Math.cos(a)*3.6*u);ctx.rotate(a);ctx.scale(u,u);
    rr(-8,-3.7,15.5,7.4,2.6);ctx.fillStyle=C.ink;ctx.fill();
    ctx.fillStyle=C.s[0];ctx.fillRect(-7.2,-3.7,4.2,7.4);
    ctx.fillStyle=C.brass;ctx.beginPath();ctx.arc(5.2,0,1.9,0,7);ctx.fill();ctx.fillStyle=C.muted;ctx.beginPath();ctx.arc(1.6,0,1.4,0,7);ctx.fill();
    ctx.restore()}

  if(NA>0){ctx.fillStyle='rgba(12,22,48,'+NA.toFixed(3)+')';ctx.fillRect(0,0,cw,ch)}
  if(nf>.05){
    for(const i of conn){const h=housePos(i,u),g=ctx.createRadialGradient(h.x,h.y,0,h.x,h.y,16*u);g.addColorStop(0,'rgba(255,214,120,'+(.55*nf).toFixed(3)+')');g.addColorStop(1,'rgba(255,214,120,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(h.x,h.y,16*u,0,7);ctx.fill()}
    for(const t of trains){if(t.wx==null||t.state!=='move')continue;const a=t.ang||0;ctx.save();ctx.translate(PX(t.wx)-Math.sin(a)*3.6*u,PY(t.wy)+Math.cos(a)*3.6*u);ctx.rotate(a);ctx.scale(u,u);
      const g=ctx.createLinearGradient(7,0,40,0);g.addColorStop(0,'rgba(255,232,160,'+(.5*nf).toFixed(3)+')');g.addColorStop(1,'rgba(255,232,160,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(40,-11);ctx.lineTo(40,11);ctx.closePath();ctx.fill();ctx.restore()}}

  for(const f of pulses){const p=P(f.i),k=f.t/.9;ctx.globalAlpha=Math.max(0,1-k);ctx.strokeStyle=C.brass;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,(8+22*k)*u,0,7);ctx.stroke()}
  ctx.globalAlpha=1;
  for(const i of conn){const p=P(i);shapeOn(ctx,i,p.x,p.y,6.5*u);ctx.fillStyle=C.s[i%7];ctx.fill();ctx.strokeStyle=C.ink;ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
    }
  cd.slice(0,4).forEach(g=>{const p=P(g.a),q=P(g.b);label(fmt(g.c),(p.x+q.x)/2,(p.y+q.y)/2+7,S.coins>=g.c?C.accent:C.muted,12)});
  for(const i of conn){const p=P(i);label(ST[i].n.toUpperCase(),p.x,p.y-(15*u+9),C.ink,12)}
  for(const f of floats){const p=P(f.i);ctx.globalAlpha=Math.max(0,1-f.t/1.6);
    f.low?label(f.txt,p.x,p.y+34*u+10+f.t*8,C.brass,12):label(f.txt,p.x,p.y-(15*u+26)-f.t*14,C.brass,15);ctx.globalAlpha=1}
}
cv.addEventListener('pointerdown',e=>{const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let best=null,bd=18;
  for(const g of cands()){const p=P(g.a),q=P(g.b),dx=q.x-p.x,dy=q.y-p.y,t=Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/(dx*dx+dy*dy||1)));
    let d=Math.hypot(p.x+dx*t-x,p.y+dy*t-y);if(Math.hypot(p.x-x,p.y-y)<14)d=99;/* taps on a built station are not a build */
    if(d<bd-3||(d<bd+3&&best&&g.c<best.c&&d<18)){bd=d;best=g}}
  if(best)build(best)});

/* ---------- Save / boot ---------- */
function ser(){S.t=Date.now();return JSON.parse(JSON.stringify(S))}
function save(){try{localStorage.setItem(KEY,JSON.stringify(ser()))}catch(e){}}
function away(sec){if(S.rate>0&&sec>45){const v=S.rate*Math.min(sec,4*3600)*0.5;if(v>=1){S.coins+=v;toast('While you were away the line earned '+fmt(v)+' coins')}}}
function start(data){
  let raw=data&&data.save;if(!raw){try{raw=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){raw=null}}
  if(raw&&Array.isArray(raw.edges)&&raw.edges.length){
    if(raw.lv&&!raw.items){raw.items={};for(const k of SLOTS)if(raw.lv[k]>0)raw.items[k]={q:1,lv:raw.lv[k],v:1};raw.depot=raw.lv.depot||0;delete raw.lv}
    S=Object.assign(fresh(),raw);if(!S.items||typeof S.items!=='object')S.items={};
    for(const k of Object.keys(S.items)){const it=S.items[k];if(!FX[k]||!it||!(it.q>=0&&it.q<QN.length)||!(it.lv>0))delete S.items[k]}
    if(S.pending&&(!FX[S.pending.k]||!(S.pending.q>=0&&S.pending.q<QN.length)))S.pending=null;
    S.tokens=Math.max(0,S.tokens|0);S.tokP=S.tokP|0;S.works=Math.max(1,Math.min(ODDS.length,S.works|0||1));S.depot=S.depot|0;
    S.edges=S.edges.filter(e=>Array.isArray(e)&&ST[e[0]]&&ST[e[1]]);if(!S.edges.length)S.edges=[[0,1]]}
  Snd.setOn(S.sound!==false);rebuild();mkParts();tokens();resize();
  if(S.edges.length>1)$('hint').hidden=true;
  away((Date.now()-(S.t||Date.now()))/1000);ui();
  new ResizeObserver(resize).observe($('stage'));
  setInterval(()=>{tokens();ui()},300);setInterval(save,5000);
  let hid=0;document.addEventListener('visibilitychange',()=>{if(document.hidden){hid=Date.now();save()}else if(hid){away((Date.now()-hid)/1000);hid=0}});
  let last=performance.now();
  (function loop(now){const dt=Math.max(0,Math.min(0.1,(now-last)/1000));last=now;step(dt);draw();requestAnimationFrame(loop)})(last);
}
const hot=window.claude&&window.claude.hot;
try{hot&&hot.snapshot&&hot.snapshot(()=>({save:ser()}))}catch(e){}
if(hot&&hot.ready)hot.ready(d=>start(d||{}));else start((hot&&hot.data)||{});
})();
