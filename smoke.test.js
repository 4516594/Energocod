"use strict";
/* ============================================================
   Смоук-тест логики платформы (P5).
   Запуск из каталога platform_v4:  node tests/smoke.test.js
   Код возврата 0 — все проверки прошли, 1 — есть падения.

   Как это работает: реальные src/data.js и src/db.js склеиваются в один
   скрипт и исполняются в общем контексте. Это повторяет модель браузера:
   несколько тегов <script> делят общую глобальную лексическую область,
   поэтому const PARAMS из data.js виден в db.js. (Раздельный запуск через
   vm такую видимость не даёт, поэтому файлы именно склеиваются.)
   Проверяются инварианты слоя данных:
   сид настроек, параметры и расчётные константы конфигуратора, веса
   скоринга, сид пользователей и вход, заявки, вехи и % готовности,
   журнал результативных контактов, очередь уведомлений (P3.3).
   Логика представлений (расчёт, скоринг, i18n) валидируется отдельными
   изолированными копиями функций — см. историю STATUS_v4.md.
   ============================================================ */
const fs = require("fs"), path = require("path"), vm = require("vm");

const ctx = {
  module: { exports: {} }, console, JSON, Date, Math, Object, Array,
  String, Number, Boolean, isNaN, parseInt, parseFloat,
};
ctx.global = ctx;
try { ctx.crypto = require("crypto").webcrypto; } catch (e) { /* uid деградирует к Date+random */ }
vm.createContext(ctx);

const base = path.join(__dirname, "..", "src");
const src = ["data.js", "db.js"]
  .map(f => fs.readFileSync(path.join(base, f), "utf8"))
  .join("\n;\n");
vm.runInContext(src, ctx, { filename: "bundle.js" });
const DB = ctx.module.exports.DB; // db.js экспортирует { DB, ... } в Node

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL: " + m); } };

/* --- настройки и расчётные константы --- */
const st = DB.getSettings();
ok(st && st.version >= 1, "настройки засеяны");
ok(Array.isArray(DB.getParams()) && DB.getParams().length > 0, "параметры конфигуратора не пусты");
ok(DB.getCalcConst().ndsPct === 22, "константа НДС = 22");
ok(DB.getCalcConst().tpPerMW === 8, "ТП = 8 млн ₽/МВт");
ok(DB.getLandScore().grid.grid === 40, "вес сети (профиль grid) = 40");

/* --- версионирование настроек --- */
const v0 = DB.getSettings().version;
DB.saveSettings({ calc: Object.assign({}, DB.getCalcConst(), { ndsPct: 20 }) }, "smoke");
ok(DB.getSettings().version === v0 + 1, "сохранение поднимает версию");
ok(DB.getCalcConst().ndsPct === 20, "новое значение НДС применилось");
ok(DB.getSettingsHistory().length >= 1, "прежняя версия ушла в историю");
DB.resetSettings();
ok(DB.getCalcConst().ndsPct === 22, "сброс вернул исходную НДС");

/* --- пользователи и вход --- */
const users = DB.getUsers();
ok(users.length >= 11, "сид >= 11 профилей (admin + 10 ролей)");
ok(DB.findUser("admin@energocod.ru").role === "admin", "профиль admin определён");
ok(DB.authenticate("admin@energocod.ru", "energocod").ok, "вход admin по демо-паролю");
ok(!DB.authenticate("admin@energocod.ru", "неверно").ok, "неверный пароль отклонён");
DB.updateUser("admin@energocod.ru", { status: "blocked" });
ok(!DB.authenticate("admin@energocod.ru", "energocod").ok, "заблокированный не входит");
DB.updateUser("admin@energocod.ru", { status: "active" });

/* --- заявки, вехи, прогресс --- */
const deals = DB.getDeals();
ok(deals.length > 0, "заявки есть");
const did = deals[0].id;
const ms = DB.getMilestones(did);
ok(ms.length === 9, "9 этапов вех по шаблону");
ok(DB.dealProgress(did) === 0, "стартовая готовность 0%");
DB.setMilestone(did, ms[0].ord, { pct: 50 }, "smoke");
ok(DB.dealProgress(did) > 0, "готовность выросла после setMilestone");
ok(DB.getMilestoneEvents(did).some(e => e.field === "pct"), "событие смены pct записано");

/* --- P3.3: очередь уведомлений --- */
const nq = DB.getNotifications({ status: "queued" });
ok(nq.length >= 1, "смена готовности поставила уведомление в очередь");
ok(nq.some(n => n.deal_id === did && /готовность/.test(n.body)), "текст уведомления корректен");
const anyId = DB.getNotifications()[0].id;
ok(DB.markNotification(anyId, { status: "sent" }).status === "sent", "markNotification обновляет статус");

/* --- журнал результативных контактов (P3.2) --- */
DB.logContact({ deal_id: did, member: "ООО «Тест»", member_role: "dc", status: "передан", created_by: "smoke" });
ok(DB.getContacts(did).length === 1, "контакт записан в журнал");

/* --- overrides по заявке (приоритет заявка > глобальные) --- */
const pid = DB.getParams()[0].id;
DB.setOverride(did, pid, 777);
ok(DB.effectiveParams(did).find(p => p.id === pid).v === 777, "override заявки перекрывает глобальное значение");
DB.clearOverride(did, pid);
ok(DB.effectiveParams(did).find(p => p.id === pid).v !== 777, "очистка override вернула глобальное значение");

console.log("\nИТОГ смоук: " + pass + " PASS, " + fail + " FAIL");
if (fail) process.exit(1);
