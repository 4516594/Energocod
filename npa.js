"use strict";
/* ============================================================
   views/npa.js — модуль «НПА и стандарты».
   Данные NPA вынесены в data.js. Здесь только представление.
   Перенесено из монолита без изменения поведения.
   ============================================================ */
let npaGrp="all";
function viewNpa(){
  const grps=["all","Земля","Техприсоединение","Строительство","Энергоцентр","ЦОД и ИТ","Отраслевые стандарты"];
  const chips=grps.map(g=>`<span class="tab ${npaGrp===g?"on":""}" style="border:1px solid var(--line);border-radius:8px;margin-right:6px" onclick="npaGrp='${g}';render()">${g==="all"?"Все ("+NPA.length+")":g}</span>`).join("");
  const list=NPA.filter(d=>npaGrp==="all"||d.grp===npaGrp);
  return `<h2>НПА и стандарты комплексного проекта ЦОД</h2>
  <div class="muted" style="margin-bottom:10px">Нормативная база по всей цепочке: земля → техприсоединение → строительство → энергоцентр → ЦОД. По каждому документу: саммари, таблица ключевых требований с применением в проектах консорциума и ссылка на полный текст в актуальной редакции. Актуальность проверена 07.07.2026; редакции меняются — перед сделкой сверяйте по ссылке.</div>
  <div style="margin-bottom:14px">${chips}</div>
  <div class="grid g3">`+list.map(d=>`<div class="card" onclick="openNpa('${d.id}')" style="cursor:pointer">
    <div class="muted" style="font-size:11px">${d.grp.toUpperCase()}</div>
    <h3 style="margin:4px 0">${d.name}</h3>
    <div class="muted">${d.req}</div>
    <div style="margin-top:8px"><span class="tag gr">${d.st}</span></div>
    <div class="muted" style="margin-top:8px">${d.sum.slice(0,140)}…</div></div>`).join("")+"</div>";
}
function openNpa(id){
  const d=NPA.find(x=>x.id===id);
  document.getElementById("modalBox").innerHTML=`<span class="x" onclick="closeModal()">×</span>
    <div class="muted" style="font-size:11px">${d.grp.toUpperCase()}</div>
    <h2>${d.name}</h2>
    <div class="muted" style="margin:4px 0 10px">${d.req} · <span class="tag gr">${d.st}</span></div>
    <p style="margin-bottom:12px">${d.sum}</p>
    <table><tr><th style="width:52%">Ключевое требование</th><th>Применение в проектах консорциума</th></tr>
    ${d.rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>
    <div style="margin-top:14px">
      <a href="${d.link}" target="_blank"><button class="btn">Полный текст (актуальная редакция)</button></a>
      <span class="muted" style="margin-left:10px">открывается в справочной системе / на официальном ресурсе</span>
    </div>`;
  document.getElementById("modalBg").style.display="flex";
}
