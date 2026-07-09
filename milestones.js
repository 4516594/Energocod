"use strict";
/* ============================================================
   views/milestones.js — модуль вех проекта (P3.1).
   Шаблон этапов (Концепция → ИРД → ПД → Экспертиза → РД → СМР →
   ПНР → ПСИ → Ввод) задаётся в настройках (milestoneTemplate) и
   меняется администратором. По каждой заявке: CRUD вех, процент
   готовности, срок, ответственный участник, журнал изменений
   (milestone_events — источник уведомлений P3.3). Данные — через
   слой DB (LocalAdapter/SupabaseAdapter).
   Права: УК и администратор правят любые вехи; ответственная роль
   правит свои этапы; остальные — только просмотр.
   ============================================================ */

/* Можно ли текущей роли править веху m. */
function msCanEdit(m) {
  return isAdmin() || role === "uk" || (m && m.owner_role && role === m.owner_role);
}

/* Полоса готовности (инлайн-стили, без внешних классов). */
function msBar(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const col = p >= 100 ? "var(--green,#2f9e57)" : (p > 0 ? "var(--amber,#c9971e)" : "#556");
  return `<div style="background:#2a3140;border-radius:6px;height:8px;overflow:hidden;min-width:90px">
    <div style="width:${p}%;height:100%;background:${col}"></div></div>`;
}

/* Открыть карточку вех заявки в модальном окне. */
function openMilestones(dealId) {
  const d = (typeof DEALS !== "undefined") ? DEALS.find(x => x.id === dealId) : null;
  const list = DB.getMilestones(dealId);
  const prog = DB.dealProgress(dealId);
  const roleName = r => (typeof ROLES !== "undefined" && ROLES[r]) ? ROLES[r].name : (r || "—");

  const rows = list.map(m => {
    const ed = msCanEdit(m);
    const pctCell = ed
      ? `<input type="number" min="0" max="100" step="5" value="${m.pct}" style="width:64px"
           onchange="msSetPct('${dealId}',${m.ord},this.value)">`
      : `${m.pct}%`;
    const dueCell = ed
      ? `<input type="date" value="${esc(m.due || "")}" onchange="msSetDue('${dealId}',${m.ord},this.value)">`
      : (m.due || "—");
    const ownCell = ed
      ? `<input type="text" value="${esc(m.owner_name || "")}" placeholder="исполнитель"
           style="width:150px" onchange="msSetOwner('${dealId}',${m.ord},this.value)">`
      : (m.owner_name || "—");
    return `<tr>
      <td>${m.ord + 1}</td>
      <td><b>${esc(m.stage)}</b></td>
      <td class="muted">${esc(roleName(m.owner_role))}</td>
      <td>${ownCell}</td>
      <td>${dueCell}</td>
      <td style="min-width:120px">${msBar(m.pct)}</td>
      <td style="text-align:right">${pctCell}</td>
    </tr>`;
  }).join("");

  const ev = DB.getMilestoneEvents(dealId).slice(-15).reverse();
  const fieldRu = { pct: "готовность", due: "срок", owner: "исполнитель", created: "создано" };
  const evRows = ev.map(e => `<tr>
      <td class="muted">${esc(String(e.changed_at || "").slice(0, 16).replace("T", " "))}</td>
      <td>${esc(e.stage)}</td>
      <td class="muted">${esc(fieldRu[e.field] || e.field)}</td>
      <td>${esc(e.old_value || "—")} → ${esc(e.new_value || "—")}</td>
      <td class="muted">${esc(e.changed_by || "")}</td>
    </tr>`).join("") || `<tr><td colspan="5" class="muted">Изменений пока нет</td></tr>`;

  const readonlyNote = (isAdmin() || role === "uk")
    ? ""
    : `<div class="muted" style="margin-bottom:8px">Вы можете править только этапы своей роли (${esc(roleName(role))}).</div>`;

  document.getElementById("modalBox").innerHTML = `<span class="x" onclick="closeModal()">×</span>
    <h2>Вехи проекта · ${esc(dealId)}${d ? " · " + esc(d.client) : ""}</h2>
    <div style="display:flex;align-items:center;gap:12px;margin:6px 0 14px">
      <span class="muted">Общая готовность:</span>${msBar(prog)}<b>${prog}%</b>
    </div>
    ${readonlyNote}
    <div style="overflow-x:auto">
      <table>
        <tr><th>#</th><th>Этап</th><th>Ответственная роль</th><th>Исполнитель</th><th>Срок</th><th>Готовность</th><th>%</th></tr>
        ${rows}
      </table>
    </div>
    <hr class="sep">
    <h3 style="font-size:13.5px">Журнал изменений вех</h3>
    <div style="overflow-x:auto;max-height:220px;overflow-y:auto">
      <table>
        <tr><th>Время</th><th>Этап</th><th>Поле</th><th>Изменение</th><th>Кто</th></tr>
        ${evRows}
      </table>
    </div>
    <div class="muted" style="margin-top:10px">Изменение готовности этапа фиксируется в журнале событий и ставит уведомление ответственному участнику в очередь Telegram (отправка — в админ-панели, раздел «Уведомления»).</div>`;
  document.getElementById("modalBg").style.display = "flex";
}

/* Обработчики правки: пишут через DB и перерисовывают модальное окно
   (не весь экран, чтобы фокус оставался на вехах). */
function msBy() { return (typeof sessionUser !== "undefined" && sessionUser) ? sessionUser.email : "admin"; }
function msSetPct(dealId, ord, val) {
  let p = Math.round(Number(val)); if (isNaN(p)) return;
  p = Math.max(0, Math.min(100, p));
  DB.setMilestone(dealId, ord, { pct: p }, msBy());
  openMilestones(dealId);
}
function msSetDue(dealId, ord, val) { DB.setMilestone(dealId, ord, { due: val || "" }, msBy()); openMilestones(dealId); }
function msSetOwner(dealId, ord, val) { DB.setMilestone(dealId, ord, { owner_name: (val || "").trim() }, msBy()); openMilestones(dealId); }

/* esc — определён в admin.js; страховочная копия, если milestones.js
   подключён без admin.js (порядок в index.html: admin.js раньше). */
if (typeof esc !== "function") {
  window.esc = function (s) { return String(s == null ? "" : s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); };
}
