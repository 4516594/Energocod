"use strict";
/* ============================================================
   auth.js — экран входа и регистрации (P2.1).
   LocalAdapter: демо-профили (проверка пароля по полю pass).
   SupabaseAdapter (P2.3): вход через Supabase Auth email+пароль.
   Роль пользователя берётся из профиля; роль admin открывает
   вкладку «Администрирование» и просмотр платформы под любой ролью.
   Экран рендерится в #content, пока нет активной сессии.
   ============================================================ */

/* Текущий режим экрана: "login" | "register". */
let AUTH_MODE = "login";

function viewAuth() {
  const demo = DB.getUsers()
    .map(u => `<option value="${u.email}">${u.role === "admin" ? "★ " : ""}${u.name} (${u.email})</option>`)
    .join("");
  const roleOpts = Object.entries(ROLES)
    .filter(([k]) => k !== "admin")
    .map(([k, r]) => `<option value="${k}">${r.name}</option>`)
    .join("");

  const loginForm = `
    <div class="field"><label>E-mail</label><input type="text" id="auEmail" placeholder="admin@energocod.ru" autocomplete="username"></div>
    <div class="field"><label>Пароль</label><input type="text" id="auPass" placeholder="energocod" autocomplete="current-password"></div>
    <div id="auErr" class="muted" style="color:var(--red);min-height:16px;margin-bottom:8px"></div>
    <button class="btn" onclick="doLogin()">Войти</button>
    <span class="muted" style="margin-left:12px">Нет учётной записи? <a href="#" onclick="setAuthMode('register');return false">Зарегистрироваться</a></span>
    <hr class="sep">
    <div class="muted" style="margin-bottom:6px">Быстрый вход в тестовую среду (демо-профили, общий пароль energocod):</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="auDemo" style="min-width:280px">${demo}</select>
      <button class="btn sec" onclick="doDemoLogin()">Войти демо-пользователем</button>
    </div>`;

  const regForm = `
    <div class="field"><label>E-mail</label><input type="text" id="rgEmail" placeholder="you@company.ru"></div>
    <div class="field"><label>ФИО</label><input type="text" id="rgName" placeholder="Иванов Иван"></div>
    <div class="field"><label>Компания</label><input type="text" id="rgCompany" placeholder="ООО «Компания»"></div>
    <div class="field"><label>Роль на платформе</label><select id="rgRole">${roleOpts}</select></div>
    <div class="field"><label>Пароль</label><input type="text" id="rgPass" placeholder="задайте пароль"></div>
    <div id="auErr" class="muted" style="color:var(--red);min-height:16px;margin-bottom:8px"></div>
    <button class="btn" onclick="doRegister()">Зарегистрироваться</button>
    <span class="muted" style="margin-left:12px">Уже есть доступ? <a href="#" onclick="setAuthMode('login');return false">Войти</a></span>`;

  const isReg = AUTH_MODE === "register";
  return `<div style="max-width:520px;margin:6vh auto 0">
    <div class="card" style="padding:26px 30px">
      <h2 style="margin-bottom:4px">${isReg ? "Регистрация участника" : "Вход в платформу"}</h2>
      <div class="muted" style="margin-bottom:18px">Консорциум «ЭнергоЦОД» · онлайн-платформа кооперации (Production-версия, тестовая среда)</div>
      ${isReg ? regForm : loginForm}
    </div>
  </div>`;
}

function setAuthMode(m) { AUTH_MODE = m; render(); }

function authErr(msg) { const e = document.getElementById("auErr"); if (e) e.textContent = msg || ""; }

function doLogin() {
  const email = (document.getElementById("auEmail") || {}).value || "";
  const pass = (document.getElementById("auPass") || {}).value || "";
  // DB.signIn: LocalAdapter — синхронная проверка; Supabase — Supabase Auth.
  Promise.resolve(DB.signIn(email, pass)).then(r => {
    if (!r.ok) { authErr(r.error); return; }
    DB.setSession(r.user.email);
    enterApp();
  });
}

function doDemoLogin() {
  const email = (document.getElementById("auDemo") || {}).value || "";
  const u = DB.findUser(email);
  if (!u) { authErr("Демо-профиль не найден"); return; }
  DB.setSession(u.email);
  enterApp();
}

function doRegister() {
  const profile = {
    email: (document.getElementById("rgEmail") || {}).value || "",
    name: (document.getElementById("rgName") || {}).value || "",
    company: (document.getElementById("rgCompany") || {}).value || "",
    role: (document.getElementById("rgRole") || {}).value || "customer",
    pass: (document.getElementById("rgPass") || {}).value || "",
    status: "active",
  };
  if (!profile.email) { authErr("Укажите e-mail"); return; }
  if (!profile.pass) { authErr("Задайте пароль"); return; }
  // DB.signUp: LocalAdapter — создание демо-профиля; Supabase — Supabase Auth.
  Promise.resolve(DB.signUp(profile)).then(r => {
    if (!r.ok) { authErr(r.error); return; }
    DB.setSession(r.user.email);
    enterApp();
  });
}
