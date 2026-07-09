"use strict";
/* ============================================================
   admin.js — админ-панель (P2.2). Доступна роли admin.
   Всё управление платформой из UI, без правки кода:
   1) настройки расчёта (константы-ориентиры) с историей версий;
   2) веса скоринга площадок;
   3) диапазоны и значения по умолчанию бегунков конфигуратора;
   4) управление пользователями (роль, блокировка, добавление);
   5) журнал посещений;
   6) интеграции (Supabase URL/ключ, Telegram bot token).
   Данные читаются/пишутся через слой DB.* Сохранение настроек
   версионируется (DB.saveSettings → история в getSettingsHistory).
   ============================================================ */

const ADMIN_CALC_LABELS = {
  tpPerMW:   "Техприсоединение к сети, млн ₽/МВт",
  tpDualMult:"Множитель за второй независимый ввод",
  dguPerKw:  "ДГУ, тыс ₽/кВт",
  upsPerKwIt:"ИБП+АКБ, тыс ₽/кВт IT",
  staffPct:  "Персонал ЭЦ, доля CAPEX ЭЦ / год",
  dcMaintPct:"Обслуживание ЦОД, доля CAPEX ЦОД / год",
  insPct:    "Страхование, доля суммарного CAPEX / год",
  resMaintPct:"ТО ДГУ и ИБП, доля их CAPEX / год",
  lcoeYears: "Горизонт LCOE, лет",
  ndsPct:    "Ставка НДС, %",
};
const ADMIN_LAND_LABELS = {
  gas:"Газ", grs:"ГРС", grid:"Сеть", fib:"ВОЛС", dual:"2 ввода",
  vri:"ВРИ", encumb:"Обременения", status:"Статус", transport:"Транспорт",
};

function esc(s){ return String(s==null?"":s).replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function numInput(id,val,step){ return `<input type="text" id="${id}" value="${esc(val)}" data-step="${step||""}" style="width:110px">`; }

function viewAdmin(){
  const st=DB.getSettings();
  const c=st.calc||{};
  const land=st.land||{};
  const params=st.params||[];
  const ints=st.integrations||{};
  const users=DB.getUsers();
  const hist=DB.getSettingsHistory();

  /* 1. Константы расчёта */
  const calcRows=Object.keys(ADMIN_CALC_LABELS).map(k=>
    `<div class="prow" style="grid-template-columns:1fr 130px">
       <div class="plabel">${ADMIN_CALC_LABELS[k]} <span class="punit">(${k})</span></div>
       ${numInput("ac_"+k,c[k])}
     </div>`).join("");
  const calcBlock=`<div class="card">
    <h3>Настройки расчёта (константы-ориентиры)</h3>
    <div class="muted" style="margin-bottom:10px">Действующая версия настроек: v${st.version} · изменил: ${esc(st.updatedBy)} · ${esc(st.updatedAt).slice(0,10)}</div>
    ${calcRows}
    <div style="margin-top:12px"><button class="btn" onclick="adminSaveCalc()">Сохранить константы</button></div>
  </div>`;

  /* 2. Веса скоринга площадок */
  const wKeys=Object.keys(ADMIN_LAND_LABELS);
  const wHead=`<tr><th>Профиль</th>${wKeys.map(k=>`<th>${ADMIN_LAND_LABELS[k]}</th>`).join("")}</tr>`;
  const wRow=(prof,obj)=>`<tr><td>${prof==="gpu"?"ГПУ (собств. генерация)":"Сеть (от энергосистемы)"}</td>${wKeys.map(k=>`<td>${numInput("al_"+prof+"_"+k,(obj||{})[k])}</td>`).join("")}</tr>`;
  const landBlock=`<div class="card">
    <h3>Веса скоринга площадок</h3>
    <div class="prow" style="grid-template-columns:1fr 130px">
      <div class="plabel">Удельный расход газа <span class="punit">(нм³/ч на 1 МВт)</span></div>
      ${numInput("al_gasRatePerMW",land.gasRatePerMW)}
    </div>
    <div style="overflow-x:auto"><table>${wHead}${wRow("gpu",land.gpu)}${wRow("grid",land.grid)}</table></div>
    <div style="margin-top:12px"><button class="btn" onclick="adminSaveLand()">Сохранить веса</button></div>
  </div>`;

  /* 3. Диапазоны бегунков конфигуратора */
  const pHead=`<tr><th>ID</th><th>Параметр</th><th>Ед.</th><th>min</th><th>max</th><th>шаг</th><th>по умолч.</th></tr>`;
  const pRows=params.map(p=>`<tr>
      <td class="muted">${esc(p.id)}</td><td>${esc(p.l)}</td><td class="muted">${esc(p.u)}</td>
      <td>${numInput("ap_min_"+p.id,p.min)}</td>
      <td>${numInput("ap_max_"+p.id,p.max)}</td>
      <td>${numInput("ap_step_"+p.id,p.step)}</td>
      <td>${numInput("ap_v_"+p.id,p.v)}</td>
    </tr>`).join("");
  const paramBlock=`<div class="card">
    <h3>Диапазоны и значения по умолчанию бегунков</h3>
    <div style="overflow-x:auto"><table>${pHead}${pRows}</table></div>
    <div style="margin-top:12px">
      <button class="btn" onclick="adminSaveParams()">Сохранить диапазоны</button>
      <button class="btn sec" onclick="adminResetSettings()" style="margin-left:8px">Сбросить все настройки к исходным</button>
    </div>
  </div>`;

  /* 4. Пользователи */
  const roleOpts=(cur)=>Object.entries(ROLES).map(([k,r])=>`<option value="${k}" ${k===cur?"selected":""}>${r.name}</option>`).join("");
  const uHead=`<tr><th>E-mail</th><th>ФИО</th><th>Компания</th><th>Роль</th><th>Telegram chat_id</th><th>Статус</th><th></th></tr>`;
  const uRows=users.map(u=>`<tr>
      <td>${esc(u.email)}</td><td>${esc(u.name)}</td><td>${esc(u.company)}</td>
      <td><select onchange="adminSetUserRole('${esc(u.email)}',this.value)">${roleOpts(u.role)}</select></td>
      <td><input type="text" value="${esc(u.telegram_chat_id||"")}" placeholder="chat_id" style="width:120px" onchange="adminSetChatId('${esc(u.email)}',this.value)"></td>
      <td><span class="tag ${u.status==="blocked"?"rd":"gr"}">${u.status==="blocked"?"заблокирован":"активен"}</span></td>
      <td><button class="btn sec" style="padding:4px 10px" onclick="adminToggleBlock('${esc(u.email)}')">${u.status==="blocked"?"Разблокировать":"Заблокировать"}</button></td>
    </tr>`).join("");
  const newUser=`<div class="split" style="margin-top:12px;gap:10px">
    <div class="field"><label>E-mail</label><input type="text" id="nu_email"></div>
    <div class="field"><label>ФИО</label><input type="text" id="nu_name"></div>
    <div class="field"><label>Компания</label><input type="text" id="nu_company"></div>
    <div class="field"><label>Роль</label><select id="nu_role">${roleOpts("customer")}</select></div>
    <div class="field"><label>Пароль</label><input type="text" id="nu_pass" value="energocod"></div>
  </div>
  <div id="nu_err" class="muted" style="color:var(--red);min-height:16px"></div>
  <button class="btn" onclick="adminAddUser()">Добавить пользователя</button>`;
  const usersBlock=`<div class="card">
    <h3>Пользователи и роли</h3>
    <div style="overflow-x:auto"><table>${uHead}${uRows}</table></div>
    <hr class="sep"><h3 style="font-size:13.5px">Добавить пользователя</h3>${newUser}
  </div>`;

  /* 5. Журнал посещений */
  const visits=DB.getVisits().slice(-60).reverse();
  const vHead=`<tr><th>Время</th><th>Пользователь</th><th>Роль</th><th>Раздел</th><th>Событие</th></tr>`;
  const vRows=visits.map(v=>`<tr>
      <td class="muted">${esc(v.t).slice(0,19).replace("T"," ")}</td>
      <td>${esc(v.user||"—")}</td><td>${esc(v.role||"—")}</td>
      <td>${esc(TABS[v.section]||v.section)}</td><td class="muted">${esc(v.event||"переход")}</td>
    </tr>`).join("")||`<tr><td colspan="5" class="muted">Журнал пуст</td></tr>`;
  const visitsBlock=`<div class="card">
    <h3>Журнал посещений (последние 60 событий)</h3>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto"><table>${vHead}${vRows}</table></div>
  </div>`;

  /* 6. Интеграции */
  const onSup=DB.isSupabase();
  const supReady=DB.supabaseReady();
  const supErr=DB.supabaseError();
  const statusTag = onSup && supReady
    ? `<span class="tag gr">Supabase подключён</span>`
    : (onSup ? `<span class="tag rd">Supabase: ошибка подключения</span>`
             : `<span class="tag am">Демо-режим (LocalAdapter)</span>`);
  const errLine = supErr ? `<div class="muted" style="color:var(--red);margin-top:6px">Последняя ошибка: ${esc(supErr)}</div>` : "";
  const intBlock=`<div class="card">
    <h3>Интеграции</h3>
    <div style="margin-bottom:10px">Активный источник данных: ${statusTag}</div>
    <div class="muted" style="margin-bottom:10px">Реквизиты активируют Production-бэкенд и уведомления. До подключения платформа работает на LocalAdapter (демо-режим, данные в браузере). Схема БД — supabase/schema.sql (выполнить один раз в SQL-редакторе проекта).</div>
    <div class="field"><label>Supabase URL</label><input type="text" id="ai_supabaseUrl" value="${esc(ints.supabaseUrl)}" placeholder="https://xxxx.supabase.co"></div>
    <div class="field"><label>Supabase anon key</label><input type="text" id="ai_supabaseKey" value="${esc(ints.supabaseKey)}" placeholder="anon public key"></div>
    <div class="field"><label>Telegram bot token</label><input type="text" id="ai_tgBotToken" value="${esc(ints.tgBotToken)}" placeholder="123456:ABC-..."></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn" onclick="adminSaveIntegrations()">Сохранить реквизиты</button>
      ${onSup
        ? `<button class="btn sec" onclick="adminUseLocal()">Вернуться в демо-режим</button>`
        : `<button class="btn am" onclick="adminConnectSupabase()">Подключить Supabase</button>`}
      <span id="ai_conn_msg" class="muted"></span>
    </div>
    ${errLine}
  </div>`;

  /* 6b. Уведомления (P3.3) */
  const notifs=DB.getNotifications().slice(-40).reverse();
  const queued=DB.getNotifications({status:"queued"}).length;
  const nHead=`<tr><th>Время</th><th>Канал</th><th>Получатель</th><th>Тема</th><th>Текст</th><th>Статус</th></tr>`;
  const nTag=s=>s==="sent"?`<span class="tag gr">отправлено</span>`:(s==="error"?`<span class="tag rd">ошибка</span>`:`<span class="tag am">в очереди</span>`);
  const nRows=notifs.map(n=>`<tr>
      <td class="muted">${esc(String(n.created_at||"").slice(0,19).replace("T"," "))}</td>
      <td>${esc(n.channel)}</td>
      <td class="muted">${esc(n.recipient||"—")}${n.recipient_role?" ("+esc(n.recipient_role)+")":""}</td>
      <td>${esc(n.subject||"")}</td>
      <td class="muted">${esc(n.body||"")}${n.error?`<br><span style="color:var(--red)">${esc(n.error)}</span>`:""}</td>
      <td>${nTag(n.status)}</td>
    </tr>`).join("")||`<tr><td colspan="6" class="muted">Уведомлений пока нет</td></tr>`;
  const notifBlock=`<div class="card">
    <h3>Уведомления (Telegram)</h3>
    <div class="muted" style="margin-bottom:10px">Изменение готовности вехи ставит уведомление ответственной роли в очередь. Отправка идёт в Telegram по токену бота (раздел «Интеграции») тем участникам, у кого задан chat_id (столбец в таблице пользователей). E-mail — вторая очередь. В очереди: ${queued}. В Production-режиме (Supabase) отправку выполняет серверная функция notify (supabase/functions/notify).</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <button class="btn" onclick="adminSendNotifications()">Отправить очередь</button>
      <span id="ai_notif_msg" class="muted"></span>
    </div>
    <div style="overflow-x:auto;max-height:320px;overflow-y:auto"><table>${nHead}${nRows}</table></div>
  </div>`;

  /* 7. История версий настроек */
  const hRows=hist.slice(-15).reverse().map(h=>`<tr>
      <td>v${esc(h.version)}</td><td class="muted">${esc(h.updatedAt).slice(0,19).replace("T"," ")}</td><td>${esc(h.updatedBy)}</td>
    </tr>`).join("")||`<tr><td colspan="3" class="muted">Изменений ещё не было</td></tr>`;
  const histBlock=`<div class="card">
    <h3>История версий настроек</h3>
    <table><tr><th>Версия</th><th>Дата</th><th>Кто изменил</th></tr>${hRows}</table>
  </div>`;

  return `<h2>Администрирование платформы</h2>
    <div class="grid g3" style="grid-template-columns:1fr">
      ${calcBlock}${landBlock}${paramBlock}${usersBlock}${visitsBlock}${intBlock}${notifBlock}${histBlock}
    </div>`;
}

/* ================= ОБРАБОТЧИКИ ================= */
function adminVal(id){ const e=document.getElementById(id); return e?e.value.trim().replace(",","."):""; }
function adminNum(id){ const v=Number(adminVal(id)); return isNaN(v)?null:v; }
function adminBy(){ return sessionUser?sessionUser.email:"admin"; }

function adminSaveCalc(){
  const cur=DB.getSettings().calc||{};
  const next=Object.assign({},cur);
  Object.keys(ADMIN_CALC_LABELS).forEach(k=>{ const v=adminNum("ac_"+k); if(v!==null) next[k]=v; });
  DB.saveSettings({calc:next},adminBy());
  render();
}
function adminSaveLand(){
  const cur=DB.getSettings().land||{};
  const next=JSON.parse(JSON.stringify(cur));
  const gr=adminNum("al_gasRatePerMW"); if(gr!==null) next.gasRatePerMW=gr;
  ["gpu","grid"].forEach(prof=>{
    next[prof]=next[prof]||{};
    Object.keys(ADMIN_LAND_LABELS).forEach(k=>{ const v=adminNum("al_"+prof+"_"+k); if(v!==null) next[prof][k]=v; });
  });
  DB.saveSettings({land:next},adminBy());
  render();
}
function adminSaveParams(){
  const cur=DB.getSettings().params||[];
  const next=cur.map(p=>{
    const min=adminNum("ap_min_"+p.id), max=adminNum("ap_max_"+p.id),
          step=adminNum("ap_step_"+p.id), v=adminNum("ap_v_"+p.id);
    return Object.assign({},p,{
      min: min!==null?min:p.min, max: max!==null?max:p.max,
      step: step!==null?step:p.step, v: v!==null?v:p.v,
    });
  });
  DB.saveSettings({params:next},adminBy());
  render(); // конфигуратор перечитывает диапазоны через DB.getParams() при следующем открытии

}
function adminSaveIntegrations(){
  const next={
    supabaseUrl: adminVal("ai_supabaseUrl"),
    supabaseKey: adminVal("ai_supabaseKey"),
    tgBotToken: adminVal("ai_tgBotToken"),
  };
  DB.saveSettings({integrations:next},adminBy());
  render();
}
/* Подключение к Supabase из UI (без правки кода). Реквизиты сначала
   сохраняются, затем идёт async-подключение с индикацией статуса. */
function adminConnectSupabase(){
  const url=adminVal("ai_supabaseUrl"), key=adminVal("ai_supabaseKey");
  const msg=document.getElementById("ai_conn_msg");
  if(!url||!key){ if(msg){ msg.style.color="var(--red)"; msg.textContent="Укажите URL и anon key"; } return; }
  DB.saveSettings({integrations:{supabaseUrl:url,supabaseKey:key,tgBotToken:adminVal("ai_tgBotToken")}},adminBy());
  if(msg){ msg.style.color=""; msg.textContent="Подключение…"; }
  DB.useSupabase(url,key).then(r=>{
    if(r.ok){ render(); }
    else if(msg){ msg.style.color="var(--red)"; msg.textContent="Ошибка: "+(r.error||"не удалось подключиться"); }
  });
}
function adminUseLocal(){ DB.useLocal(); render(); }
function adminResetSettings(){
  if(typeof confirm==="function" && !confirm("Сбросить ВСЕ настройки к исходным значениям? История версий сохранится.")) return;
  DB.resetSettings();
  render();
}
function adminSetUserRole(email,role){ DB.updateUser(email,{role:role}); render(); }
/* Telegram chat_id пользователя (адресат уведомлений). Не перерисовываем
   экран, чтобы не терять фокус ввода в соседних полях. */
function adminSetChatId(email,val){ DB.updateUser(email,{telegram_chat_id:(val||"").trim()}); }
/* Отправка очереди уведомлений в Telegram. LocalAdapter шлёт напрямую
   через Bot API; SupabaseAdapter вызывает edge-функцию notify. */
function adminSendNotifications(){
  const set=(txt,err)=>{ const m=document.getElementById("ai_notif_msg"); if(m){ m.style.color=err?"var(--red)":""; m.textContent=txt; } };
  set("Отправка…",false);
  Promise.resolve(DB.sendNotifications()).then(r=>{
    render(); // перечитывает счётчик очереди и статусы
    if(r&&r.error) set("Ошибка: "+r.error,true);
    else set("Отправлено: "+(r.sent||0)+", ошибок: "+(r.failed||0)+(r.skipped?", пропущено: "+r.skipped:""),false);
  });
}
function adminToggleBlock(email){
  const u=DB.findUser(email); if(!u) return;
  DB.updateUser(email,{status: u.status==="blocked"?"active":"blocked"});
  render();
}
function adminAddUser(){
  const err=document.getElementById("nu_err");
  const r=DB.createUser({
    email: adminVal("nu_email"), name: adminVal("nu_name"),
    company: adminVal("nu_company"), role: adminVal("nu_role"),
    pass: adminVal("nu_pass")||"energocod", status:"active",
  });
  if(!r.ok){ if(err) err.textContent=r.error; return; }
  render();
}
