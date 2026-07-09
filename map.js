"use strict";
/* ============================================================
   views/map.js — модуль «Карта размещения» (сайдбар, зум, тултипы).
   Геоданные (LAND_REG, RU_OUTLINE, RU_SAKH, RU_KGD) вынесены в data.js.
   Перенесено из монолита без изменения поведения.
   ============================================================ */
let MAPREG="all", MAPTYPE="all", MQUERY="";
let MST={s:1,tx:0,ty:0};
const MX=lon=>(lon-19)*6.09+5, MY=lat=>(78-lat)*13.51+5;
function stKey(p){
  if(p.type==="land")return "land";
  return p.st.startsWith("Действует")?"act":(p.st.startsWith("Строится")||p.st.includes("расширение")?"bld":"plan");
}
function mapPoints(){
  const pts=[];
  DCREG.forEach((a,i)=>pts.push({type:"dc",reg:a.reg,ll:a.ll,st:a.st,name:a.n,oper:a.oper,idx:i}));
  LAND.forEach(a=>pts.push({type:"land",reg:LAND_REG[a.id]||a.region,ll:a.ll,st:a.status,name:a.name,oper:"участок · "+a.area+" га",idx:a.id}));
  return pts.filter(p=>MAPTYPE==="all"||stKey(p)===MAPTYPE)
            .filter(p=>!MQUERY||((p.name+" "+p.oper+" "+p.reg).toLowerCase().includes(MQUERY.toLowerCase())));
}
function ptColor(p){
  const k=stKey(p);
  return k==="land"?"#F5B942":(k==="act"?"#4ADE80":(k==="bld"?"#FBBF24":"#3DD6F5"));
}
const pathOf=arr=>"M"+arr.map(([lo,la])=>MX(lo).toFixed(1)+","+MY(la).toFixed(1)).join(" L")+" Z";
function viewMap(){
  const pts=mapPoints();
  const all=mapPoints.length?pts:[];
  const regs=[...new Set(pts.map(p=>p.reg))].sort((a,b)=>a.localeCompare(b,"ru"));
  const cnt=k=>pts.filter(p=>stKey(p)===k).length;
  const chips=[["all","Все"],["act","Действуют"],["bld","Строятся"],["plan","Планы"],["land","Участки"]].map(([k,l])=>
    `<span class="mchip ${MAPTYPE===k?"on":""}" style="${MAPTYPE===k?"background:"+({all:"#3DD6F5",act:"#4ADE80",bld:"#FBBF24",plan:"#3DD6F5",land:"#F5B942"}[k]):""}" onclick="MAPTYPE='${k}';render()">${l}</span>`).join("");
  // сайдбар: регионы с объектами
  const side=regs.map(r=>{
    const arr=pts.filter(p=>p.reg===r);
    const items=MAPREG===r?arr.map(p=>{
      const click=p.type==="dc"?`openDcReg(${p.idx})`:`openAsset('land','${p.idx}')`;
      return `<div class="mitem" onclick="${click}"><span style="color:${ptColor(p)}">${p.type==="land"?"◆":"●"}</span> ${p.name.length>36?p.name.slice(0,35)+"…":p.name}</div>`;
    }).join(""):"";
    return `<div class="mreg ${MAPREG===r?"on":""}" onclick="zoomRegion('${r.replace(/'/g,"\\'")}')"><span>${r}</span><span class="tag">${arr.length}</span></div>${items}`;
  }).join("");
  // маркеры (все точки, разводка совпадающих координат по спирали)
  const used={};
  const marks=pts.map(p=>{
    const key=p.ll.join(","); used[key]=used[key]||0;
    const n=used[key]++, ang=n*2.4, off=n?3.2+n*0.9:0;
    const x=MX(p.ll[1])+Math.cos(ang)*off, y=MY(p.ll[0])+Math.sin(ang)*off;
    const col=ptColor(p), click=p.type==="dc"?`openDcReg(${p.idx})`:`openAsset('land','${p.idx}')`;
    const tip=`${p.name}|${p.oper} · ${p.st} · ${p.reg}`;
    const common=`class="mk" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-tip="${tip.replace(/"/g,"&quot;")}" onclick="${click}" onmousemove="showTip(event,this)" onmouseleave="hideTip()" style="cursor:pointer"`;
    return p.type==="land"
      ?`<rect ${common} data-shape="d" fill="${col}" stroke="#0A101E" stroke-width="1"/>`
      :`<circle ${common} data-shape="c" fill="${col}" stroke="#0A101E" stroke-width="1"/>`;
  }).join("");
  const labels=pts.map(p=>{
    const x=MX(p.ll[1]), y=MY(p.ll[0]);
    return `<text class="mlb" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" fill="#C7D3E8" style="display:none;pointer-events:none">${p.name.length>30?p.name.slice(0,29)+"…":p.name}</text>`;
  }).join("");
  const K=(v,l,c)=>`<div class="kpi"><div class="v" style="color:${c}">${v}</div><div class="l">${l}</div></div>`;
  return `<h2>География объектов</h2>
  <div class="mstat">
    ${K(pts.length,"объектов на карте","var(--cyan)")}${K(cnt("act"),"действующих ЦОД","#4ADE80")}${K(cnt("bld"),"строится / расширяется","#FBBF24")}${K(cnt("plan"),"планируется","#3DD6F5")}${K(cnt("land"),"земельных участков","#F5B942")}${K(regs.length,"субъектов РФ","var(--txt)")}
  </div>
  <div style="margin-bottom:8px">${chips}<span class="muted" style="margin-left:8px">Колесо — зум · перетаскивание — перемещение · клик по субъекту слева — его карта · наведение — карточка</span></div>
  <div class="mapgrid">
    <div class="mside">
      <input type="text" placeholder="Поиск: объект, оператор, регион…" value="${MQUERY.replace(/"/g,"&quot;")}" oninput="MQUERY=this.value;mapRefresh()">
      <div class="mreg ${MAPREG==="all"?"on":""}" onclick="MAPREG='all';MST={s:1,tx:0,ty:0};render()"><span>Вся Россия</span><span class="tag">${pts.length}</span></div>
      <div id="msideList">${side}</div>
    </div>
    <div class="mpanel">
      <div class="mzoom">
        <button onclick="mapZoomBtn(1.5)">+</button>
        <button onclick="mapZoomBtn(1/1.5)">−</button>
        <button title="вся Россия" onclick="MAPREG='all';MST={s:1,tx:0,ty:0};render()">⌂</button>
      </div>
      <svg id="msvg" viewBox="0 0 1000 520" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <g id="gw">
          <path d="${pathOf(RU_OUTLINE)}" fill="#182642" fill-opacity="0.85" stroke="#33507F" stroke-width="1"/>
          <path d="${pathOf(RU_SAKH)}" fill="#182642" fill-opacity="0.85" stroke="#33507F" stroke-width="0.8"/>
          <path d="${pathOf(RU_KGD)}" fill="#182642" fill-opacity="0.85" stroke="#33507F" stroke-width="0.8"/>
          ${marks}${labels}
        </g>
      </svg>
      <div class="muted" style="padding:6px 10px;border-top:1px solid var(--line)">Легенда: <span style="color:#4ADE80">●</span> действует · <span style="color:#FBBF24">●</span> строится · <span style="color:#3DD6F5">●</span> план · <span style="color:#F5B942">◆</span> участок консорциума. Проекция схематичная, контур упрощён. Данные: карта ComNews 2024, публикации 2025-2026, реестры операторов.</div>
    </div>
  </div>`;
}
function mapRefresh(){ // фильтр без потери фокуса в поиске
  const pts=mapPoints();
  const regs=[...new Set(pts.map(p=>p.reg))].sort((a,b)=>a.localeCompare(b,"ru"));
  const side=regs.map(r=>{
    const arr=pts.filter(p=>p.reg===r);
    const items=MAPREG===r?arr.map(p=>{
      const click=p.type==="dc"?`openDcReg(${p.idx})`:`openAsset('land','${p.idx}')`;
      return `<div class="mitem" onclick="${click}"><span style="color:${ptColor(p)}">${p.type==="land"?"◆":"●"}</span> ${p.name.length>36?p.name.slice(0,35)+"…":p.name}</div>`;
    }).join(""):"";
    return `<div class="mreg ${MAPREG===r?"on":""}" onclick="zoomRegion('${r.replace(/'/g,"\\'")}')"><span>${r}</span><span class="tag">${arr.length}</span></div>${items}`;
  }).join("");
  const el=document.getElementById("msideList"); if(el) el.innerHTML=side;
  const vis=new Set(pts.map(p=>p.name));
  document.querySelectorAll("#gw .mk").forEach(m=>{
    const nm=(m.getAttribute("data-tip")||"").split("|")[0];
    m.style.display=vis.has(nm)?"":"none";
  });
}
function applyT(){
  const g=document.getElementById("gw"); if(!g)return;
  g.setAttribute("transform",`translate(${MST.tx},${MST.ty}) scale(${MST.s})`);
  const k=4.8/Math.pow(MST.s,0.6), fs=11/Math.pow(MST.s,0.8);
  document.querySelectorAll("#gw .mk").forEach(m=>{
    const x=+m.getAttribute("data-x"), y=+m.getAttribute("data-y");
    if(m.getAttribute("data-shape")==="c"){ m.setAttribute("cx",x); m.setAttribute("cy",y); m.setAttribute("r",k.toFixed(2)); }
    else { m.setAttribute("x",(x-k).toFixed(2)); m.setAttribute("y",(y-k).toFixed(2)); m.setAttribute("width",(2*k).toFixed(2)); m.setAttribute("height",(2*k).toFixed(2)); m.setAttribute("transform",`rotate(45 ${x} ${y})`); }
    m.setAttribute("stroke-width",(1/MST.s).toFixed(3));
  });
  document.querySelectorAll("#gw .mlb").forEach(t=>{
    const x=+t.getAttribute("data-x"), y=+t.getAttribute("data-y");
    t.setAttribute("x",(x+k*1.5).toFixed(1)); t.setAttribute("y",(y+fs*0.35).toFixed(1));
    t.setAttribute("font-size",fs.toFixed(2));
    t.style.display=MST.s>2.4?"":"none";
  });
}
function mapZoomBtn(f){
  const ns=Math.min(20,Math.max(1,MST.s*f));
  const cx=500, cy=260; // центр вьюпорта
  MST.tx=cx-(cx-MST.tx)*ns/MST.s; MST.ty=cy-(cy-MST.ty)*ns/MST.s; MST.s=ns;
  applyT();
}
function zoomRegion(r){
  MAPREG=(MAPREG===r)?MAPREG:r;
  const pts=mapPoints().filter(p=>p.reg===r);
  if(pts.length){
    const xs=pts.map(p=>MX(p.ll[1])), ys=pts.map(p=>MY(p.ll[0]));
    const cx=(Math.min(...xs)+Math.max(...xs))/2, cy=(Math.min(...ys)+Math.max(...ys))/2;
    const w=Math.max(...xs)-Math.min(...xs)+40, h=Math.max(...ys)-Math.min(...ys)+40;
    MST.s=Math.min(9,Math.max(2.5,Math.min(900/w,460/h)));
    MST.tx=500-cx*MST.s; MST.ty=260-cy*MST.s;
  }
  render();
}
function initMap(){
  const svg=document.getElementById("msvg"); if(!svg)return;
  applyT();
  let drag=null;
  svg.addEventListener("mousedown",e=>{drag={x:e.clientX,y:e.clientY,tx:MST.tx,ty:MST.ty};});
  window.addEventListener("mousemove",e=>{
    if(!drag)return;
    const r=svg.getBoundingClientRect(), kx=1000/r.width, ky=520/r.height;
    MST.tx=drag.tx+(e.clientX-drag.x)*kx; MST.ty=drag.ty+(e.clientY-drag.y)*ky;
    document.getElementById("gw").setAttribute("transform",`translate(${MST.tx},${MST.ty}) scale(${MST.s})`);
  });
  window.addEventListener("mouseup",()=>{drag=null;});
  svg.addEventListener("wheel",e=>{
    e.preventDefault();
    const r=svg.getBoundingClientRect();
    const mx=(e.clientX-r.left)*1000/r.width, my=(e.clientY-r.top)*520/r.height;
    const f=e.deltaY<0?1.25:0.8, ns=Math.min(20,Math.max(1,MST.s*f));
    MST.tx=mx-(mx-MST.tx)*ns/MST.s; MST.ty=my-(my-MST.ty)*ns/MST.s; MST.s=ns;
    applyT();
  },{passive:false});
}
function showTip(e,el){
  const t=document.getElementById("mtip"); if(!t)return;
  const [tl,ts]=(el.getAttribute("data-tip")||"|").split("|");
  t.innerHTML=`<div class="tl">${tl}</div><div class="ts">${ts}</div><div class="ts" style="color:var(--cyan)">клик — карточка объекта</div>`;
  t.style.display="block";
  t.style.left=Math.min(window.innerWidth-300,e.clientX+14)+"px";
  t.style.top=(e.clientY+14)+"px";
}
function hideTip(){const t=document.getElementById("mtip"); if(t)t.style.display="none";}
function openDcReg(i){
  const a=DCREG[i];
  document.getElementById("modalBox").innerHTML=`<span class="x" onclick="closeModal()">×</span>
    <h2>${a.n}</h2><div class="muted" style="margin-bottom:10px">${a.oper} · ${a.city} · ${a.reg}</div>
    <table>
      <tr><th style="width:40%">Статус</th><td>${a.st}</td></tr>
      <tr><th>Стойки</th><td>${a.racks}</td></tr>
      <tr><th>Мощность</th><td>${a.mw}</td></tr>
      <tr><th>Уровень надёжности</th><td>${a.tier}</td></tr>
      <tr><th>Примечание</th><td>${a.note}</td></tr>
      <tr><th>Координаты (примерно)</th><td>${a.ll[0]}, ${a.ll[1]}</td></tr>
    </table>
    <div style="margin-top:12px"><a href="${a.src}" target="_blank"><button class="btn sec">Источник (публичные данные)</button></a>
    <span class="muted" style="margin-left:8px">данные оценочные, проверено 07.07.2026</span></div>`;
  document.getElementById("modalBg").style.display="flex";
}
