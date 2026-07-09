"use strict";
/* ============================================================
   app.js — каркас платформы: состояние, маршрутизация по вкладкам,
   инициализация. Подключается последним (после данных и всех
   представлений).
   P1.2: обращения к хранилищу идут через слой DB.*
   P1.3: интернационализация (I18N).
   P2.1: гейт авторизации — до входа рендерится экран auth; роль
   берётся из профиля сессии; роль admin открывает вкладку
   «Администрирование» и просмотр платформы под любой ролью.
   ============================================================ */

/* ================= СОСТОЯНИЕ ================= */
let sessionUser = null;                 // профиль текущего пользователя (P2.1)
let role = "uk";                        // активная роль-представление (для admin меняется)
let tab = "dash";
const fmt = (n,d=1)=>n==null?"—":Number(n).toLocaleString("ru-RU",{maximumFractionDigits:d,minimumFractionDigits:0});
function isAdmin(){ return !!sessionUser && sessionUser.role==="admin"; }

/* ================= КАРКАС ================= */
function init(){
  if(!document.getElementById("mtip")){
    const t=document.createElement("div"); t.id="mtip"; t.className="mtip"; document.body.appendChild(t);
  }
  I18N.init();
  syncLangSel();
  // P2.3: если ранее был выбран Supabase и заданы реквизиты — восстановить
  // подключение (async). До завершения работает LocalAdapter (демо-режим).
  if(DB.getAdapterPref()==="supabase"){
    DB.autoConnect().then(r=>{ if(r&&r.ok){ sessionUser=DB.getSession(); if(sessionUser){ enterApp(); return; } renderLogin(); } });
  }
  sessionUser = DB.getSession();
  if(!sessionUser){ renderLogin(); return; }
  enterApp();
}
function syncLangSel(){
  const lsel=document.getElementById("langSel");
  if(lsel) lsel.innerHTML=I18N.langs.map(l=>`<option value="${l.code}" ${l.code===I18N.lang?"selected":""}>${l.label}</option>`).join("");
}

/* --- экран входа: скрываем навигацию, показываем auth --- */
function renderLogin(){
  document.getElementById("tabs").innerHTML="";
  toggleChrome(false);
  applyChrome();
  document.getElementById("content").innerHTML=viewAuth();
}

/* --- вход в приложение после успешной авторизации --- */
function enterApp(){
  sessionUser = DB.getSession();
  if(!sessionUser){ renderLogin(); return; }
  role = ROLES[sessionUser.role] ? sessionUser.role : "uk";
  if(sessionUser.lang){ I18N.set(sessionUser.lang); syncLangSel(); }
  if(!ROLES[role].tabs.includes(tab)) tab=ROLES[role].tabs[0];
  DEALS = DB.getDeals();
  toggleChrome(true);
  applyChrome();
  DB.logVisit(tab,{event:"login",user:sessionUser.email});
  renderTabs(); render();
}

function logout(){ DB.clearSession(); sessionUser=null; tab="dash"; AUTH_MODE="login"; renderLogin(); }

/* --- показ/скрытие элементов шапки в зависимости от состояния входа --- */
function toggleChrome(loggedIn){
  const roleSel=document.getElementById("roleSel");
  const roleLbl=document.getElementById("roleLbl");
  const userBox=document.getElementById("userBox");
  const logoutBtn=document.getElementById("logoutBtn");
  const adminView=loggedIn && isAdmin();     // селектор роли доступен только администратору
  if(roleSel) roleSel.style.display=adminView?"":"none";
  if(roleLbl) roleLbl.style.display=adminView?"":"none";
  if(userBox) userBox.style.display=loggedIn?"":"none";
  if(logoutBtn) logoutBtn.style.display=loggedIn?"":"none";
}

/* Перерисовка оболочки под текущий язык и пользователя. */
function applyChrome(){
  document.documentElement.lang=I18N.lang;
  const sel=document.getElementById("roleSel");
  if(sel) sel.innerHTML=Object.entries(ROLES).map(([k,r])=>`<option value="${k}" ${k===role?"selected":""}>${t(r.name)}</option>`).join("");
  const rl=document.getElementById("roleLbl"); if(rl) rl.textContent=t("Вы вошли как:");
  const ub=document.getElementById("userBox");
  if(ub) ub.textContent = sessionUser ? (sessionUser.name+" · "+sessionUser.company) : "";
  const ft=document.getElementById("footer");
  if(ft) ft.textContent=t("Консорциум «ЭнергоЦОД» · платформа кооперации участников рынка ЦОД и энергоцентров · показатели расчётов не являются офертой");
}
/* Смена языка интерфейса: сохраняем через DB, перерисовываем оболочку и контент. */
function setLang(l){
  I18N.set(l);
  if(sessionUser){ DB.updateUser(sessionUser.email,{lang:l}); sessionUser.lang=l; }
  applyChrome();
  if(!sessionUser){ renderLogin(); return; }
  renderTabs(); render();
}
/* Смена роли-представления (только администратор). */
function setRole(r,first){
  if(!first && !isAdmin()) return;         // обычный пользователь роль не меняет
  role=r;
  if(!ROLES[r].tabs.includes(tab) && !(isAdmin()&&tab==="admin")) tab=ROLES[r].tabs[0];
  DB.logVisit(tab,{event:first?"login":"role"});
  applyChrome(); renderTabs(); render();
}
function setTab(t){tab=t;DB.logVisit(t,{user:sessionUser?sessionUser.email:null});renderTabs();render();}
function renderTabs(){
  const list=ROLES[role].tabs.slice();
  if(isAdmin() && !list.includes("admin")) list.push("admin");
  document.getElementById("tabs").innerHTML=list.map(tb=>
    `<div class="tab ${tb===tab?"on":""}" onclick="setTab('${tb}')">${t(TABS[tb])}</div>`).join("");
}
function render(){
  const c=document.getElementById("content");
  if(!sessionUser){ c.innerHTML=viewAuth(); return; }
  const hintRole = (tab==="admin") ? "admin" : role;
  const note=I18N.catalogNote();
  const noteHtml=note?`<div class="hint" style="opacity:.85">${note}</div>`:"";
  const hint=`<div class="hint"><b>${t(ROLES[hintRole].name)}.</b> ${t(ROLE_HINTS[hintRole])}</div>`+noteHtml;
  if(tab==="dash") c.innerHTML=hint+viewDash();
  if(tab==="assets") c.innerHTML=hint+viewAssets();
  if(tab==="calc"){c.innerHTML=hint+viewCalc();calc();}
  if(tab==="deals") c.innerHTML=hint+viewDeals();
  if(tab==="members") c.innerHTML=hint+viewMembers();
  if(tab==="npa") c.innerHTML=hint+viewNpa();
  if(tab==="map"){ c.innerHTML=hint+viewMap(); setTimeout(initMap,0); }
  if(tab==="admin") c.innerHTML=hint+viewAdmin();
}
function closeModal(){document.getElementById("modalBg").style.display="none";render();}

/* ================= ЗАПУСК ================= */
init();
/* build: v3.8. P5: смоук-тест слоя данных (tests/smoke.test.js, загрузка реальных
   data.js+db.js в общий контекст), деплой-документация (README, docs/ADMIN_GUIDE,
   docs/DEPLOY_GUIDE, docs/TEST_CHECKLIST). Отдельная папка dist/ не создаётся: весь
   platform_v4 — готовый статический бандл без шага сборки (публикуется напрямую).
   P3.3: уведомления — очередь notifications (DB.queueNotification/
   getNotifications/markNotification/sendNotifications), смена готовности вехи ставит
   уведомление ответственной роли в очередь; отправка в Telegram (LocalAdapter — прямой
   вызов Bot API из браузера, Supabase — edge-функция supabase/functions/notify + README
   по созданию бота); раздел «Уведомления» и поле telegram_chat_id в админ-панели.
   P2.3: SupabaseAdapter (Postgres+Auth+RLS, schema.sql), переключатель
   адаптера и статус подключения в админ-панели, автоподключение при загрузке, вход/
   регистрация через Supabase Auth (DB.signIn/signUp). P3.1: модуль вех (шаблон этапов
   Концепция→Ввод, CRUD по заявке, % готовности, ответственный, журнал изменений) —
   views/milestones.js, кнопка «Вехи проекта» в заявках. P3.2: журнал результативных
   контактов (DB.logContact/getContacts, contacts_log) — фиксация из «Передать
   результативные контакты» и «Откликнуться», модальное окно журнала по заявке и
   экспорт CSV (доказательная база Tail Fee). Все параметры меняются администратором
   в UI, данные через слой DB (LocalAdapter/SupabaseAdapter). */
