"use strict";
/* ============================================================
   views/members.js — модуль «Участники».
   MEMBERS_ALL (участники + компании карты ComNews в роли
   «Конечный заказчик») вынесен в data.js. Здесь только
   представление. Перенесено из монолита без изменения поведения.
   ============================================================ */
let MFILTER="all";
function viewMembers(){
  const types=["all",...new Set(MEMBERS_ALL.map(m=>m.type))];
  const chips=types.map(t=>`<span class="mchip ${MFILTER===t?"on":""}" style="${MFILTER===t?"background:var(--cyan)":""}" onclick="MFILTER='${t.replace(/'/g,"\\'")}';render()">${t==="all"?"Все ("+MEMBERS_ALL.length+")":t}</span>`).join("");
  const list=MEMBERS_ALL.filter(m=>MFILTER==="all"||m.type===MFILTER);
  return `<h2>Реестр участников консорциума</h2><div style="margin-bottom:12px">${chips}</div><div class="grid g3">`+list.map(m=>`<div class="card">
    <h3>${m.name}</h3><div class="muted">${m.type} · ${m.region}</div>
    <div style="margin:8px 0">${m.comp.map(c=>`<span class="tag">${c}</span>`).join("")}</div>
    <div class="muted">Референсы: ${m.ref}</div>
    <div style="margin-top:8px"><span class="tag ${m.tail==="кандидат"?"am":"gr"}">${m.tail}</span></div></div>`).join("")+"</div>";
}
