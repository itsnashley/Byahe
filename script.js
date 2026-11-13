var HSEL=0,routes=[],mode="fare",nid=1,cmpCount=0,dpCells=0,active="origin";
var $=i=>document.getElementById(i);
var esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
var peso=n=>"₱"+Math.round(n).toLocaleString("en-PH");
var mins=n=>{var h=Math.floor(n/60),m=n%60;return h?h+"h"+(m?" "+m+"m":""):m+" min"};
var BG=["var(--bbg)","var(--b2)","var(--b3)","var(--bbg)"];

/* ---------- data (loaded from data.js) ---------- */
var D=typeof BIYAHE_DATA!=="undefined"?BIYAHE_DATA:{settings:{},modes:[],corridors:[]};
var HOP=(D.settings&&D.settings.hopMinutes)||10;   /* minutes lost at each transfer */
var BOARD=(D.settings&&D.settings.boardMinutes!=null)?D.settings.boardMinutes:5;
var CORR=D.corridors.filter(c=>{var ok=Array.isArray(c)&&c[0]&&c[1]&&c[0]!==c[1]&&c[2]>0;if(!ok)console.warn("data.js: bad corridor skipped",c);return ok});
var towns={},adj={};
CORR.forEach(c=>{towns[c[0]]=1;towns[c[1]]=1;(adj[c[0]]=adj[c[0]]||[]).push([c[1],c[2]]);(adj[c[1]]=adj[c[1]]||[]).push([c[0],c[2]])});
var MODES=D.modes.filter(m=>{var ok=m&&m.veh&&m.speed>0&&m.fare&&m.fare.base>=0&&m.fare.perKm>=0;if(!ok)console.warn("data.js: bad mode skipped",m);return ok}).map(m=>{var F=m.fare;
 return{veh:m.veh,ic:m.icon||"🚌",sp:m.speed,f:k=>Math.max(F.min||0,F.base+Math.max(0,k-(F.baseKm||0))*F.perKm)}});
var ICON={};MODES.forEach(m=>ICON[m.veh]=m.ic);

/* ---------- town lookup ---------- */
function norm(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim()}
function canon(s){var q=norm(s);if(!q)return null;var k=Object.keys(towns),i;
 for(i=0;i<k.length;i++)if(norm(k[i])===q)return k[i];
 for(i=0;i<k.length;i++)if(norm(k[i]).indexOf(q)===0)return k[i];
 for(i=0;i<k.length;i++)if(norm(k[i]).indexOf(q)>-1)return k[i];
 return null}
function findKm(a,b){a=canon(a);b=canon(b);if(!a||!b)return null;
 for(var i=0;i<CORR.length;i++){var x=CORR[i][0],y=CORR[i][1];if((x===a&&y===b)||(x===b&&y===a))return CORR[i][2]}return null}
function budget(){var b=parseInt($("budget").value,10);return isNaN(b)||b<0?0:b}

/* ---------- multi-leg paths ---------- */
var MAXDETOUR=(D.settings&&D.settings.maxDetour)||1.5; /* longest allowed path vs the shortest */
function legOpts(km){return MODES.map(m=>({veh:m.veh,fare:Math.round(m.f(km)),time:Math.round(km/m.sp*60+BOARD)}))}
function paths(a,b){var out=[];
 (function go(n,seen,legs){
  if(n===b){out.push({legs:legs.slice(),km:legs.reduce((s,l)=>s+l.km,0)});return}
  if(legs.length>=4)return;
  (adj[n]||[]).forEach(e=>{if(seen[e[0]])return;seen[e[0]]=1;legs.push({from:n,to:e[0],km:e[1]});go(e[0],seen,legs);legs.pop();seen[e[0]]=0})
 })(a,(function(){var o={};o[a]=1;return o})(),[]);
 out.sort((x,y)=>x.km-y.km);
 /* drop big detours: keep paths at most 1.5x the shortest one */
 if(out.length)out=out.filter(p=>p.km<=out[0].km*MAXDETOUR);
 return out.slice(0,6)}

/* ---------- knapsack (multiple-choice, 0/1) ----------
   One group per leg, one vehicle chosen from each group.
   Weight = fare, value = time. dp[i][j] = least time for the first i legs
   when the fare is at most j pesos. Returns the picks, or null if the
   budget cannot pay for even the cheapest vehicles. */
function knapsack(groups,cap){var n=groups.length,INF=1e9,dp=[],pick=[],i,j,k;
 dp[0]=[];for(j=0;j<=cap;j++)dp[0][j]=0;
 for(i=1;i<=n;i++){dp[i]=[];pick[i]=[];
  for(j=0;j<=cap;j++){var b=INF,bk=-1;
   for(k=0;k<groups[i-1].length;k++){var it=groups[i-1][k];dpCells++;
    if(it.fare<=j&&dp[i-1][j-it.fare]<INF){var v=dp[i-1][j-it.fare]+it.time;if(v<b){b=v;bk=k}}}
   dp[i][j]=b;pick[i][j]=bk}}
 if(dp[n][cap]>=INF)return null;
 var res=[];j=cap;for(i=n;i>=1;i--){k=pick[i][j];res.unshift(groups[i-1][k]);j-=groups[i-1][k].fare}
 return res}

function mk(p,picks,tag,over){var f=0,t=0;
 var legs=picks.map((x,i)=>{f+=x.fare;t+=x.time;return{from:p.legs[i].from,to:p.legs[i].to,km:p.legs[i].km,veh:x.veh,fare:x.fare,time:x.time}});
 t+=HOP*(legs.length-1);
 var names=legs.map(l=>l.veh);
 return{id:nid++,legs:legs,veh:names.join(" + "),ic:legs.length>1?"🔀":ICON[names[0]],fare:f,time:t,tr:legs.length-1,tag:tag,over:over}}

function candidates(oc,dc,bud){var ps=paths(oc,dc),out=[],seen={};dpCells=0;
 ps.forEach(p=>{
  var g=p.legs.map(l=>legOpts(l.km));
  var add=(picks,tag)=>{var key=picks.map(x=>x.veh).join("|")+"/"+p.legs.map(l=>l.to).join(">");if(seen[key])return;seen[key]=1;
   var tot=picks.reduce((s,o)=>s+o.fare,0);out.push(mk(p,picks,tag,tot>bud))};
  if(g.length===1){g[0].forEach(o=>add([o],""))}
  else{
   var cheap=g.map(a=>a.reduce((x,y)=>y.fare<x.fare?y:x)),
       fast=g.map(a=>a.reduce((x,y)=>y.time<x.time?y:x)),
       sum=g.reduce((s,a)=>s+Math.max.apply(null,a.map(o=>o.fare)),0),
       kp=knapsack(g,Math.min(bud,sum));
   if(kp)add(kp,"Best for your budget");
   add(cheap,"Cheapest mix");add(fast,"Fastest mix")}});
 return{list:out,npaths:ps.length}}

/* ---------- autosuggest ---------- */
function sugg(id){active=id;var q=norm($(id).value),pre=[],sub=[];
 Object.keys(towns).forEach(t=>{var n=norm(t);if(!q||n.indexOf(q)===0)pre.push(t);else if(n.indexOf(q)>-1)sub.push(t)});
 var m=pre.concat(sub).slice(0,6),dd=$("dd");
 if(!m.length||(m.length===1&&norm(m[0])===q)){dd.hidden=true;return}
 dd.innerHTML=m.map(t=>"<button class='sg' data-t='"+esc(t)+"'><b>"+esc(t)+"</b><span>"+adj[t].length+" nearby towns</span></button>").join("");
 dd.hidden=false}

/* ---------- search ---------- */
function search(quiet){var oc=canon($("origin").value),dc=canon($("dest").value),m=$("msg");$("dd").hidden=true;$("err").hidden=true;if(!quiet)showPage("main");
 if(!oc||!dc){m.textContent="Can’t find the "+(!oc?"origin":"destination")+". Pick a town from the suggestions.";return}
 if(oc===dc){m.textContent="Origin and destination are the same.";return}
 $("origin").value=oc;$("dest").value=dc;
 var r=candidates(oc,dc,budget());routes=r.list;HSEL=0;
 if(!routes.length){$("err").hidden=true;m.textContent="No saved route for "+oc+" and "+dc+" yet. Add your own below.";render();return}
 m.textContent="Found "+oc+" → "+dc+": "+r.npaths+" path"+(r.npaths===1?"":"s")+", "+routes.length+" options. Budget ₱"+budget()+".";
 render();
 if(!quiet)$("routes").scrollIntoView({behavior:"smooth"})}

/* ---------- ranking ---------- */
var RULES={fare:"Lowest fare first. If tied: faster, then fewer transfers.",time:"Shortest time first. If tied: cheaper, then fewer transfers.",tr:"Fewest transfers first. If tied: faster, then cheaper.",best:"Mixes 40% fare, 40% travel time and 20% transfers. A lower mix is better. If tied: faster."};
var LBL={fare:"Cheapest",time:"Fastest",tr:"Fewest transfers",best:"Best overall"};
var ORDER={fare:["fare","time","tr"],time:["time","fare","tr"],tr:["tr","time","fare"],best:["score","time","fare"]};
function scores(l){var mx=k=>Math.max.apply(null,l.map(r=>r[k]))||1,a=mx("fare"),b=mx("time"),c=mx("tr");l.forEach(r=>r.score=.4*r.fare/a+.4*r.time/b+.2*r.tr/c)}
function cmp(a,b,k){for(var i=0;i<k.length;i++){cmpCount++;var d=a[k[i]]-b[k[i]];if(Math.abs(d)>1e-9)return d}return 0}
function quick(arr,k){if(arr.length<2)return arr;var p=arr[arr.length>>1],lo=[],eq=[],hi=[];
 for(var i=0;i<arr.length;i++){var c=cmp(arr[i],p,k);(c<0?lo:c>0?hi:eq).push(arr[i])}
 return quick(lo,k).concat(eq,quick(hi,k))}
function bubble(arr,k){var a=arr.slice(),n=a.length,s;do{s=false;for(var i=0;i<n-1;i++)if(cmp(a[i],a[i+1],k)>0){var t=a[i];a[i]=a[i+1];a[i+1]=t;s=true}n--}while(s);return a}

/* ---------- rendering ---------- */
function renderDb(){
 var oc=canon($("origin").value),dc=canon($("dest").value),h="";
 if(!oc||!dc||oc===dc){h="<div class='empty'>Pick two different towns from the suggestions.</div>"}
 else{var km=findKm(oc,dc);
  if(km!==null){var fs=MODES.map(m=>Math.round(m.f(km))),lo=Math.min.apply(null,fs);
   MODES.forEach((m,i)=>{var f=fs[i],t=Math.round(km/m.sp*60+BOARD),p=Math.round((f-lo)/lo*100);
    h+="<div class='row'><div class='ic' style='background:"+BG[i%4]+"'>"+m.ic+"</div><div class='rm'><b>"+m.veh+"</b><span>"+mins(t)+" · "+km+" km</span></div><div class='pr'>"+peso(f)+"<small class='"+(p?"dn":"up")+"'>"+(p?"▲ "+p+"%":"Cheapest")+"</small></div><button class='btn sm ln' data-db='"+i+"'>Use</button></div>"});
   h+="<button class='btn' id='useAll' style='margin-top:10px'>Add all to ranking</button>"}
  else{var ps=paths(oc,dc);
   if(!ps.length)h="<div class='empty'>No saved route for this pair yet. Try Los Baños → Calamba.</div>";
   else{h="<div class='note' style='margin:0 0 6px'>No direct ride. The shortest way takes "+ps[0].legs.length+" rides, about "+ps[0].km+" km:</div>";
    ps[0].legs.forEach((l,i)=>{h+="<div class='row'><div class='ic' style='background:"+BG[i%4]+"'>"+(i+1)+"</div><div class='rm'><b>"+esc(l.from)+" → "+esc(l.to)+"</b><span>"+l.km+" km · "+peso(Math.round(MODES[0].f(l.km)))+" to "+peso(Math.round(Math.max.apply(null,MODES.map(m=>m.f(l.km)))))+"</span></div></div>"})}}}
 $("dbBox").innerHTML=h}

function smooth(p){var d="M"+p[0][0]+","+p[0][1];for(var i=1;i<p.length;i++){var c=(p[i-1][0]+p[i][0])/2;d+=" C"+c+","+p[i-1][1]+" "+c+","+p[i][1]+" "+p[i][0]+","+p[i][1]}return d}
function arcP(a0,a1){var P=a=>(100+80*Math.cos(a)).toFixed(1)+" "+(100-80*Math.sin(a)).toFixed(1);return "M"+P(a0)+" A80 80 0 0 1 "+P(a1)}

function checkBudget(){var e=$("err");
 if(!routes.length){e.hidden=true;return}
 var lo=Math.min.apply(null,routes.map(r=>r.fare)),b=budget();
 if(lo>b){var d=$("dest").value.trim()||"that place";
  e.textContent="Your budget of "+peso(b)+" isn’t enough to get to "+d+". The cheapest trip costs "+peso(lo)+", so you need at least "+peso(lo-b)+" more.";e.hidden=false}
 else e.hidden=true}

function render(){
 checkBudget();renderDb();$("rule").textContent=RULES[mode];
 var o=$("origin").value.trim()||"Origin",d=$("dest").value.trim()||"Destination";
 $("tripLbl").textContent=o+" → "+d;
 if(!routes.length){
  $("hero").innerHTML="<div class='ch'><h2>Top pick</h2></div><div class='empty'>Search a route or add one to see the best option.</div>";
  $("gauge").innerHTML="<div class='empty'>Route score appears here.</div>";
  $("out").innerHTML="<div class='empty'>No routes yet.</div>";$("cmpN").textContent="0";$("msN").textContent="0 ms";$("knN").textContent=dpCells.toLocaleString();return}
 scores(routes);cmpCount=0;var t0=performance.now(),s=quick(routes,ORDER[mode]),ms=performance.now()-t0,top=s[0],sh=s.slice(0,10);
 var avg=routes.reduce((a,r)=>a+r.fare,0)/routes.length,pc=Math.round((avg-top.fare)/avg*100);
 var fp=top.fare.toFixed(2).split("."),ip=Number(fp[0]).toLocaleString("en-PH");
 /* hero */
 var W=340,H=100,fs=sh.map(r=>r.fare),mn=Math.min.apply(null,fs),mx=Math.max.apply(null,fs)||1;if(mx===mn)mx=mn+1;
 var pts=sh.map((r,i)=>[8+(sh.length>1?i*(W-16)/(sh.length-1):(W-16)/2),H-10-(r.fare-mn)/(mx-mn)*(H-30)]);
 var line=pts.length>1?smooth(pts):"M8,"+pts[0][1]+" L"+(W-8)+","+pts[0][1];
 var area=line+" L"+(pts.length>1?pts[pts.length-1][0]:W-8)+","+H+" L8,"+H+" Z";
 $("hero").innerHTML="<div class='ch'><h2 id='hTitle'>Top pick</h2><span class='chip'>"+LBL[mode]+"</span></div>"+
  "<div class='big' id='hBig'>₱"+ip+"<span class='dec'>."+fp[1]+"</span></div>"+
  "<div id='hDl' class='dl "+(pc>=0?"up":"dn")+"'>"+(pc>=0?"▼ "+pc+"% below":"▲ "+(-pc)+"% above")+" average fare</div>"+
  "<div id='hMeta' class='mute'>"+esc(top.veh)+" · "+mins(top.time)+" · "+top.tr+" transfer"+(top.tr===1?"":"s")+"</div>"+
  "<div class='cw'><div class='tip' id='hTip' style='left:"+(pts[0][0]/W*100)+"%'>"+peso(top.fare)+" · "+mins(top.time)+"</div>"+
  "<svg viewBox='0 0 "+W+" "+(H+16)+"' id='hSvg' tabindex='0' role='slider' aria-label='Drag to compare routes' aria-valuemin='1' aria-valuemax='"+sh.length+"' style='margin-top:28px;touch-action:pan-y;cursor:ew-resize;outline:0'><defs><linearGradient id='g1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' style='stop-color:var(--blue);stop-opacity:.18'/><stop offset='1' style='stop-color:var(--blue);stop-opacity:0'/></linearGradient></defs>"+
  "<path d='"+area+"' fill='url(#g1)'/><path d='"+line+"' fill='none' style='stroke:var(--blue)' stroke-width='1.6'/>"+
  "<circle id='hDot' cx='"+pts[0][0]+"' cy='"+pts[0][1]+"' r='4.5' style='fill:var(--blue);stroke:var(--card)' stroke-width='2'/>"+
  pts.map((p,i)=>"<text class='hl' data-i='"+i+"' x='"+p[0]+"' y='"+(H+12)+"' text-anchor='middle' font-size='9' style='fill:var(--mute)'>#"+(i+1)+"</text>").join("")+"</svg></div>";

 function fill(i){var r=sh[i],f=r.fare.toFixed(2).split("."),p=Math.round((avg-r.fare)/avg*100);
  HSEL=i;$("hTitle").textContent=i?"Pick #"+(i+1):"Top pick";
  $("hBig").innerHTML="₱"+Number(f[0]).toLocaleString("en-PH")+"<span class='dec'>."+f[1]+"</span>";
  $("hDl").className="dl "+(p>=0?"up":"dn");$("hDl").textContent=(p>=0?"▼ "+p+"% below":"▲ "+(-p)+"% above")+" average fare";
  $("hMeta").textContent=r.veh+" · "+mins(r.time)+" · "+r.tr+" transfer"+(r.tr===1?"":"s");
  var tip=$("hTip");tip.textContent=peso(r.fare)+" · "+mins(r.time);
  tip.style.left=Math.max(14,Math.min(86,pts[i][0]/W*100))+"%";tip.style.transform="translateX(-50%)";
  var dot=$("hDot");dot.setAttribute("cx",pts[i][0]);dot.setAttribute("cy",pts[i][1]);
  [].forEach.call(document.querySelectorAll("#hSvg .hl"),t=>{var on=+t.getAttribute("data-i")===i;t.style.fill=on?"var(--blue)":"var(--mute)";t.style.fontWeight=on?"700":"400"});
  $("hSvg").setAttribute("aria-valuenow",i+1)}
 var hs=$("hSvg"),drag=false;
 function at(e){var b=hs.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*W,bi=0,bd=1e9;
  pts.forEach((p,i)=>{var d=Math.abs(p[0]-x);if(d<bd){bd=d;bi=i}});if(bi!==HSEL)fill(bi)}
 hs.onpointerdown=e=>{drag=true;hs.setPointerCapture(e.pointerId);at(e)};
 hs.onpointermove=e=>{if(drag)at(e)};
 hs.onpointerup=hs.onpointercancel=()=>{drag=false};
 hs.onkeydown=e=>{if(e.key==="ArrowRight"&&HSEL<sh.length-1){e.preventDefault();fill(HSEL+1)}else if(e.key==="ArrowLeft"&&HSEL>0){e.preventDefault();fill(HSEL-1)}};
 fill(Math.min(HSEL,sh.length-1));
 /* gauge */
 var best=routes.slice().sort((a,b)=>a.score-b.score)[0],val=Math.round((1-best.score)*100),seg=Math.max(0,Math.min(4,Math.floor(val/20))),
  cols=["#cfe0fb","#9dc0f7","#6a9ff0","#2f78e8","#0b4fc4"],G=0.07,u=Math.PI/5,arcs="";
 for(var i=0;i<5;i++)arcs+="<path d='"+arcP(Math.PI-i*u-G,Math.PI-(i+1)*u+G)+"' fill='none' stroke='"+cols[i]+"' stroke-width='16' stroke-linecap='round' opacity='"+(i===seg?1:.45)+"'/>";
 $("gauge").innerHTML="<div class='ch' style='text-align:left'><h2>Best overall</h2><span class='mute'>"+esc(best.veh)+"</span></div><div style='position:relative'><svg viewBox='0 0 200 112'>"+arcs+"</svg><div class='gn'><b>"+val+"</b><span class='mute'>"+["Poor","Fair","Good","Great","Excellent"][seg]+"</span></div></div>";
 /* ranked list */
 var h="";sh.forEach((r,i)=>{
  var sub=mins(r.time)+" · "+r.tr+" transfer"+(r.tr===1?"":"s")+(r.tag?" · "+esc(r.tag):""),
      lg=r.legs.length>1?"<span class='lg'>"+r.legs.map(l=>esc(l.from)+" → "+esc(l.to)+" · "+esc(l.veh)+" "+peso(l.fare)).join("<br>")+"</span>":"";
  h+="<div class='row'><div class='ic' style='background:"+BG[i%4]+"'>"+(r.ic||"🚌")+"</div><div class='rm'><b><span class='rk'>#"+(i+1)+"</span> "+esc(r.veh)+"</b><span class='"+(i?"":"ok")+"'>"+(i?"":"● Recommended · ")+sub+"</span>"+(r.over?" <span class='over'>· over budget</span>":"")+lg+"</div><div class='pr'>"+peso(r.fare)+"<small><button class='x' data-id='"+r.id+"'>remove</button></small></div></div>"});
 if(s.length>10)h+="<div class='note'>Showing the top 10 of "+s.length+" options.</div>";
 $("out").innerHTML=h;
 $("cmpN").textContent=cmpCount;$("msN").textContent=ms.toFixed(3)+" ms";$("knN").textContent=dpCells.toLocaleString();
}

/* ---------- events ---------- */
$("dbBox").onclick=e=>{var oc=canon($("origin").value),dc=canon($("dest").value),km=findKm(oc,dc);if(km===null)return;var d=e.target.getAttribute("data-db");
 if(d!==null){var o=legOpts(km)[+d];routes.push(mk({legs:[{from:oc,to:dc,km:km}]},[o],"",o.fare>budget()));render();showPage("main");$("routes").scrollIntoView({behavior:"smooth"})}
 else if(e.target.id==="useAll"){search(true);showPage("main");$("routes").scrollIntoView({behavior:"smooth"})}};
$("addBtn").onclick=()=>{var f=parseFloat($("fare").value),t=parseFloat($("time").value),x=parseInt($("tr").value,10);
 if(isNaN(f)||isNaN(t)||isNaN(x)||f<0||t<=0||x<0){alert("Please enter a valid fare, time and transfers.");return}
 var v=$("veh").value,o=$("origin").value.trim()||"Origin",d=$("dest").value.trim()||"Destination";
 routes.push({id:nid++,legs:[{from:o,to:d,km:0,veh:v,fare:f,time:Math.round(t)}],veh:v,ic:ICON[v],fare:f,time:Math.round(t),tr:x,tag:"Your route",over:f>budget()});render()};
$("toggle").onclick=e=>{var k=e.target.getAttribute("data-k");if(!k)return;mode=k;HSEL=0;[].forEach.call($("toggle").children,b=>b.classList.toggle("on",b===e.target));render()};
$("out").onclick=e=>{var i=e.target.getAttribute("data-id");if(!i)return;routes=routes.filter(r=>r.id!==+i);render()};
$("swap").onclick=()=>{var a=$("origin").value;$("origin").value=$("dest").value;$("dest").value=a;search(true)};
$("go").onclick=()=>search();
$("budget").onchange=()=>search(true);
$("budget").oninput=()=>{routes.forEach(r=>r.over=r.fare>budget());checkBudget()};
["origin","dest"].forEach(i=>{
 $(i).oninput=()=>{$("msg").textContent="";renderDb();sugg(i)};
 $(i).onfocus=()=>{$(i).select();sugg(i)};
 $(i).onkeydown=e=>{if(e.key==="Enter"){search()}else if(e.key==="Escape"){$("dd").hidden=true}else if(e.key==="ArrowDown"){var b=$("dd").querySelector(".sg");if(b){e.preventDefault();b.focus()}}}});
$("dd").onclick=e=>{var b=e.target.closest(".sg");if(!b)return;$(active).value=b.getAttribute("data-t");$("dd").hidden=true;renderDb();
 if(active==="origin"&&(!$("dest").value||canon($("dest").value)===b.getAttribute("data-t")))$("dest").focus();else search()};
$("dd").onkeydown=e=>{var b=e.target.closest(".sg");if(!b)return;
 if(e.key==="ArrowDown"&&b.nextElementSibling){e.preventDefault();b.nextElementSibling.focus()}
 else if(e.key==="ArrowUp"){e.preventDefault();(b.previousElementSibling||$(active)).focus()}};
document.addEventListener("click",e=>{if(!e.target.closest(".sbar"))$("dd").hidden=true});
$("speed").onclick=()=>{var v=["Jeepney","Bus","UV Express","Tricycle","Grab Car"],data=[];
 for(var i=0;i<5000;i++)data.push({fare:20+Math.floor(Math.random()*480),time:10+Math.floor(Math.random()*170),tr:Math.floor(Math.random()*4),veh:v[i%5]});
 scores(data);var k=ORDER[mode];
 cmpCount=0;var a=performance.now();quick(data,k);var qt=performance.now()-a,qc=cmpCount;
 cmpCount=0;a=performance.now();bubble(data,k);var bt=performance.now()-a,bc=cmpCount;
 $("speedOut").innerHTML="Fast method: <b>"+qt.toFixed(1)+" ms</b> ("+qc.toLocaleString()+" comparisons)<br>Slow method: <b>"+bt.toFixed(1)+" ms</b> ("+bc.toLocaleString()+" comparisons)<br><b>"+(bt/Math.max(qt,.01)).toFixed(1)+"× faster</b>"};
/* ---------- pages ---------- */
var PAGES={main:"pageMain",fares:"pageFares",saved:"pageSaved",settings:"pageSettings"};
function showPage(p){if(!PAGES[p])p="main";
 Object.keys(PAGES).forEach(k=>{$(PAGES[k]).hidden=k!==p});
 [].forEach.call(document.querySelectorAll(".nav [data-go]"),b=>b.classList.toggle("cur",b.getAttribute("data-go")===p));
 $("home").classList.toggle("nopill",p==="saved"||p==="settings");
 if(p==="saved")renderSaved();if(p==="settings")paintSet()}
document.querySelector(".nav").onclick=e=>{var b=e.target.closest("button[data-go]");if(!b)return;showPage(b.getAttribute("data-go"));window.scrollTo({top:0,behavior:"smooth"})};

/* ---------- storage ---------- */
function load(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

/* ---------- settings ---------- */
var DEF={budget:60,hop:HOP,board:BOARD,detour:MAXDETOUR};
function applySet(){var s=load("biyahe-settings",{});
 HOP=s.hop!=null?s.hop:DEF.hop;BOARD=s.board!=null?s.board:DEF.board;MAXDETOUR=s.detour!=null?s.detour:DEF.detour;
 $("budget").value=s.budget!=null?s.budget:DEF.budget}
function paintSet(){var s=load("biyahe-settings",{});
 $("setBudget").value=s.budget!=null?s.budget:DEF.budget;$("setHop").value=HOP;$("setBoard").value=BOARD;$("setDetour").value=MAXDETOUR;$("setMsg").textContent=""}
$("setSave").onclick=()=>{var v={budget:parseFloat($("setBudget").value),hop:parseFloat($("setHop").value),board:parseFloat($("setBoard").value),detour:parseFloat($("setDetour").value)};
 if([v.budget,v.hop,v.board,v.detour].some(isNaN)||v.budget<0||v.hop<0||v.board<0||v.detour<1){$("setMsg").textContent="Please enter valid numbers (detour must be 1 or more).";return}
 store("biyahe-settings",v);applySet();search(true);$("setMsg").textContent="Saved. Routes were re-ranked with your settings."};
$("setReset").onclick=()=>{try{localStorage.removeItem("biyahe-settings")}catch(e){}applySet();search(true);paintSet();$("setMsg").textContent="Back to defaults."};
$("clearSaved").onclick=()=>{store("biyahe-saved",[]);renderSaved();$("setMsg").textContent="Saved trips cleared."};

/* ---------- saved trips ---------- */
function renderSaved(){var l=load("biyahe-saved",[]),h="";$("savedCount").textContent=l.length?l.length+" saved":"";
 if(!l.length){$("savedBox").innerHTML="<div class='empty'>No saved trips yet. Tap “Save this trip” under Ranked routes on Home.</div>";return}
 var d0=dpCells;
 l.forEach((t,i)=>{var r=candidates(t.o,t.d,t.b).list,sub="No route data";
  if(r.length)sub="From "+peso(Math.min.apply(null,r.map(x=>x.fare)))+" · fastest "+mins(Math.min.apply(null,r.map(x=>x.time)));
  h+="<div class='row'><div class='ic' style='background:"+BG[i%4]+"'>📍</div><div class='rm'><b>"+esc(t.o)+" → "+esc(t.d)+"</b><span>Budget "+peso(t.b)+" · "+sub+"</span></div><div class='pr'><button class='btn sm ln' data-open='"+i+"'>Open</button><small><button class='x' data-del='"+i+"'>remove</button></small></div></div>"});
 dpCells=d0;$("savedBox").innerHTML=h}
$("saveTrip").onclick=()=>{var oc=canon($("origin").value),dc=canon($("dest").value);
 if(!oc||!dc||oc===dc){$("msg").textContent="Search a valid trip first, then save it.";return}
 var l=load("biyahe-saved",[]);if(!l.some(t=>t.o===oc&&t.d===dc&&t.b===budget()))l.unshift({o:oc,d:dc,b:budget()});
 store("biyahe-saved",l);var b=$("saveTrip");b.textContent="★ Saved";setTimeout(()=>{b.textContent="☆ Save this trip"},1500)};
$("savedBox").onclick=e=>{var l=load("biyahe-saved",[]),o=e.target.getAttribute("data-open"),d=e.target.getAttribute("data-del");
 if(o!==null){var t=l[+o];if(!t)return;$("origin").value=t.o;$("dest").value=t.d;$("budget").value=t.b;search();window.scrollTo({top:0})}
 else if(d!==null){l.splice(+d,1);store("biyahe-saved",l);renderSaved()}};

applySet();
search(true);

/* ---------- dark mode ---------- */
function isDark(){var t=document.documentElement.getAttribute("data-theme");return t==="dark"}
function paintTheme(){var d=isDark();$("themeLbl").textContent=d?"Light":"Dark";$("theme").classList.toggle("on",d)}
$("theme").onclick=()=>{var t=isDark()?"light":"dark";document.documentElement.setAttribute("data-theme",t);try{localStorage.setItem("theme",t)}catch(e){}paintTheme()};
paintTheme();

$("veh").innerHTML=MODES.map(m=>"<option>"+esc(m.veh)+"</option>").join("");

showPage("main");
