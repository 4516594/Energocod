"use strict";
/* ============================================================
   views/deals.js — модуль «Заявки и проекты».
   Чтение и запись заявок идут через слой DB (P1.2): загрузка в
   app.js через DB.getDeals(), сохранение новой заявки — DB.saveDeals().
   ============================================================ */
function viewDeals(){
  const stTag=s=>({"Сбор команды":"am","Техрешение":"","Финмодель":"","Контракт подписан":"gr"}[s]||"");
  const profileNeed={ec:"ЭЦ ГПУ",dc:"ЦОД",it:"ИТ",land:"Земля",grid:"Сети",fiber:"Связь (ВОЛС)",op:"Эксплуатация",investor:"Инвестор"};
  let list=DEALS;
  let note="";
  if(profileNeed[role]){
    list=DEALS.filter(d=>d.need.includes(profileNeed[role]));
    note=`<div class="muted" style="margin-bottom:10px">Показаны заявки, где требуется профиль «${profileNeed[role]}» (${list.length} из ${DEALS.length}). УК видит полный список.</div>`;
  }
  const cards=list.map(d=>`<div class="card">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <h3>${d.id} · ${d.client}</h3><span class="tag ${stTag(d.status)}">${d.status}</span></div>
    <div class="muted" style="margin:4px 0">${d.type} · ${d.mw} · ${d.region} · бюджет ${d.budget} · от ${d.created}</div>
    <div style="margin:6px 0">${d.desc}</div>
    <div>Нужны: ${d.need.map(n=>`<span class="tag">${n}</span>`).join("")}</div>
    <div style="margin-top:10px">
      ${role==="uk"?`<button class="btn" onclick="matchTeam('${d.id}')">Сформировать пул исполнителей</button> `:""}
      ${["ec","dc","it","land","grid","fiber","op","investor"].includes(role)&&d.status!=="Контракт подписан"?`<button class="btn am" onclick="respondDeal('${d.id}')">Откликнуться</button> `:""}
      <button class="btn sec" onclick="openMilestones('${d.id}')">Вехи проекта (${DB.dealProgress(d.id)}%)</button>
      ${(role==="uk"||isAdmin())?`<button class="btn sec" onclick="openContacts('${d.id}')">Журнал контактов (${DB.getContacts(d.id).length})</button>`:""}
      ${role==="customer"||role==="uk"?`<button class="btn sec" onclick="setTab('calc')">Экономика в конфигураторе</button>`:""}
    </div></div>`).join("");
  const form = (role==="customer"||role==="uk")?`
    <div class="card" style="margin-top:16px"><h3>Новая заявка</h3>
      <div class="split">
        <div>
          <div class="field"><label>Компания / заказчик</label><input type="text" id="nz_client" placeholder="ООО «…»"></div>
          <div class="field"><label>Тип проекта</label><select id="nz_type"><option>ЦОД + ЭЦ под ключ</option><option>Только энергоцентр (ГПУ)</option><option>Только ЦОД (энергия есть)</option><option>HPC/ИИ-кластер</option><option>Подбор земли под ЦОД</option></select></div>
          <div class="field"><label>Мощность (МВт IT или МВт ЭЦ)</label><input type="text" id="nz_mw" placeholder="например: 4 МВт IT"></div>
        </div>
        <div>
          <div class="field"><label>Регион</label><input type="text" id="nz_region" placeholder="например: ПФО"></div>
          <div class="field"><label>Бюджет (ориентир)</label><input type="text" id="nz_budget" placeholder="например: 2-3 млрд ₽"></div>
          <div class="field"><label>Комментарий</label><textarea id="nz_desc" rows="2" placeholder="сроки, tier, особые требования"></textarea></div>
        </div>
      </div>
      <button class="btn" onclick="addDeal()">Отправить заявку</button>
      <span class="muted" style="margin-left:10px">Тестовая среда: заявка сохраняется локально в браузере</span></div>`:"";
  return `<h2>Заявки и проекты</h2>${note}<div class="grid" style="grid-template-columns:1fr">${cards||"<div class='muted'>Нет заявок по вашему профилю.</div>"}</div>${form}`;
}
function addDeal(){
  const g=id=>document.getElementById(id).value.trim();
  if(!g("nz_client")||!g("nz_mw")){alert("Заполните заказчика и мощность");return;}
  const typeNeeds={"ЦОД + ЭЦ под ключ":["Земля","ЭЦ ГПУ","ЦОД","ИТ","Связь (ВОЛС)","Эксплуатация"],"Только энергоцентр (ГПУ)":["ЭЦ ГПУ","Сети"],"Только ЦОД (энергия есть)":["ЦОД","ИТ","Связь (ВОЛС)","Эксплуатация"],"HPC/ИИ-кластер":["ЦОД","ИТ","ЭЦ ГПУ","Связь (ВОЛС)"],"Подбор земли под ЦОД":["Земля","Сети","Связь (ВОЛС)"]};
  DEALS.unshift({id:"Z"+(DEALS.length+1),client:g("nz_client"),type:g("nz_type"),mw:g("nz_mw"),region:g("nz_region")||"—",budget:g("nz_budget")||"—",
    need:typeNeeds[g("nz_type")]||["ЦОД"],status:"Сбор команды",created:new Date().toLocaleDateString("ru-RU"),desc:g("nz_desc")||"—"});
  DB.saveDeals(DEALS);
  render();
}
function matchTeam(id){
  const d=DEALS.find(x=>x.id===id);
  const map={"Земля":["ГК «МосРегионЗем»"],"ЭЦ ГПУ":["УК «Энергофит»"],"ЦОД":["ООО «ДатаСтрой»"],"ИТ":["«Тера»"],"Сети":["АО «СетьЭнергоРегион»"],"Связь (ВОЛС)":["«РусВОЛС Инфра»"],"Эксплуатация":["«РусКолокейшн»"],"Инвестор":["«СеверКапитал»"]};
  const rows=d.need.map(n=>`<tr><td>${n}</td><td>${(map[n]||["—"]).join(", ")}</td><td><span class="tag gr">соответствие: профиль, регион, допуски</span></td></tr>`).join("");
  document.getElementById("modalBox").innerHTML=`<span class="x" onclick="closeModal()">×</span>
    <h2>Пул исполнителей ·${d.id}</h2>
    <div class="muted" style="margin-bottom:10px">Текущий алгоритм: сопоставление по профильному направлению. В Production-версии — скоринг по допускам СРО, референсам, географии, загрузке и рейтингу взаимодействия (Приложение № 2-1).</div>
    <table><tr><th>Роль в проекте</th><th>Кандидат</th><th>Обоснование</th></tr>${rows}</table>
    <div style="margin-top:14px"><button class="btn" onclick="passContacts('${d.id}')">Передать результативные контакты</button></div>`;
  document.getElementById("modalBg").style.display="flex";
}

/* ============================================================
   Журнал результативных контактов (P3.2).
   Доказательная база Tail Fee: фиксирует передачу контакта (УК →
   участник по заявке) и отклик участника. Данные — через DB.logContact
   (contacts_log в LocalAdapter/SupabaseAdapter). Экспорт CSV — ниже.
   ============================================================ */
const NEED_ROLE={"Земля":"land","ЭЦ ГПУ":"ec","ЦОД":"dc","ИТ":"it","Сети":"grid","Связь (ВОЛС)":"fiber","Эксплуатация":"op","Инвестор":"investor"};
function dealsBy(){ return (typeof sessionUser!=="undefined"&&sessionUser)?sessionUser.email:"admin"; }
function roleRu(r){ return (typeof ROLES!=="undefined"&&ROLES[r])?ROLES[r].name:(r||"—"); }

/* УК передаёт результативные контакты по всем профилям заявки. */
function passContacts(id){
  const d=DEALS.find(x=>x.id===id); if(!d) return;
  const map={"Земля":["ГК «МосРегионЗем»"],"ЭЦ ГПУ":["УК «Энергофит»"],"ЦОД":["ООО «ДатаСтрой»"],"ИТ":["«Тера»"],"Сети":["АО «СетьЭнергоРегион»"],"Связь (ВОЛС)":["«РусВОЛС Инфра»"],"Эксплуатация":["«РусКолокейшн»"],"Инвестор":["«СеверКапитал»"]};
  let n=0;
  d.need.forEach(need=>{
    (map[need]||[]).forEach(member=>{
      DB.logContact({deal_id:id,member:member,member_role:NEED_ROLE[need]||"",status:"передан",
        comment:"Профиль: "+need,created_by:dealsBy()});
      n++;
    });
  });
  alert("Результативные контакты переданы: "+n+". Записи добавлены в журнал (доказательная база Tail Fee). Уведомления участникам — на шаге P3.3.");
  closeModal();
}

/* Участник фиксирует отклик по заявке. */
function respondDeal(id){
  const member=(typeof sessionUser!=="undefined"&&sessionUser&&sessionUser.company)?sessionUser.company:roleRu(role);
  DB.logContact({deal_id:id,member:member,member_role:role,status:"передан",
    comment:"Отклик участника",created_by:dealsBy()});
  alert("Отклик зафиксирован в журнале результативных контактов и направлен в УК.");
  render();
}

/* Модальное окно журнала контактов по заявке (УК и администратор). */
function openContacts(id){
  const d=DEALS.find(x=>x.id===id);
  const list=DB.getContacts(id).slice().reverse();
  const stTag=s=>({"принят":"gr","возражение":"rd"}[s]||"am");
  const rows=list.map(e=>`<tr>
      <td class="muted">${esc(String(e.created_at||"").slice(0,16).replace("T"," "))}</td>
      <td>${esc(e.member)}</td><td class="muted">${esc(roleRu(e.member_role))}</td>
      <td><span class="tag ${stTag(e.status)}">${esc(e.status)}</span></td>
      <td>${esc(e.comment||"")}</td><td class="muted">${esc(e.created_by||"")}</td>
    </tr>`).join("")||`<tr><td colspan="6" class="muted">Контактов по заявке пока нет</td></tr>`;
  document.getElementById("modalBox").innerHTML=`<span class="x" onclick="closeModal()">×</span>
    <h2>Журнал результативных контактов · ${esc(id)}${d?" · "+esc(d.client):""}</h2>
    <div class="muted" style="margin-bottom:10px">Доказательная база Tail Fee: кто, кому, по какой заявке, с каким результатом и когда. Экспорт в CSV для приложения к отчётности.</div>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
      <table><tr><th>Время</th><th>Участник</th><th>Роль</th><th>Статус</th><th>Комментарий</th><th>Кто передал</th></tr>${rows}</table>
    </div>
    <div style="margin-top:14px">
      <button class="btn" onclick="exportContactsCsv('${esc(id)}')">Экспорт CSV</button>
      <span class="muted" style="margin-left:10px">Записей: ${list.length}</span>
    </div>`;
  document.getElementById("modalBg").style.display="flex";
}

/* Экспорт журнала контактов заявки в CSV (разделитель «;», UTF-8 BOM
   для корректного открытия в Excel; статусы «передан/принят/возражение»). */
function exportContactsCsv(id){
  const list=DB.getContacts(id);
  const q=v=>`"${String(v==null?"":v).replace(/"/g,'""')}"`;
  const head=["Дата","Заявка","Участник","Роль","Статус","Комментарий","Кто передал"];
  const lines=[head.map(q).join(";")];
  list.forEach(e=>lines.push([e.created_at,id,e.member,roleRu(e.member_role),e.status,e.comment,e.created_by].map(q).join(";")));
  const csv="﻿"+lines.join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="contacts_"+id+".csv";
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },0);
}
