"use strict";
/* ============================================================
   db.js — слой данных (P1.2).
   Все чтения/записи модулей идут через DB.*. Реализация —
   адаптер: LocalAdapter (localStorage, работает сразу, в т.ч.
   с file://) и SupabaseAdapter (регистрируется на шаге P2.3,
   активируется администратором вводом URL + ключа, без правки
   кода). Активный адаптер выбирается полем DB.adapter.

   Настройки (settings) содержат ВСЕ изменяемые администратором
   значения: диапазоны и значения по умолчанию параметров
   конфигуратора, пресеты, расчётные константы (тарифы-ориентиры),
   веса скоринга площадок. Сид берётся из статических данных
   data.js — поэтому поведение по умолчанию не меняется. Настройки
   версионируются: при сохранении прежняя версия уходит в историю.

   overrides — локальные значения параметров на уровне заявки
   (manual override). Приоритет: заявка > глобальные настройки.
   ============================================================ */
const DB = (function () {
  /* Шаблон вех проекта по умолчанию (P3.1). Хранится в settings
     (milestoneTemplate) — администратор может изменить состав и
     ответственные роли этапов в UI. Этапы: Концепция → ИРД → ПД →
     Экспертиза → РД → СМР → ПНР → ПСИ → Ввод. */
  const MS_TEMPLATE_DEFAULT = [
    { stage: "Концепция",  role: "uk" },
    { stage: "ИРД",        role: "land" },
    { stage: "ПД",         role: "dc" },
    { stage: "Экспертиза", role: "dc" },
    { stage: "РД",         role: "dc" },
    { stage: "СМР",        role: "ec" },
    { stage: "ПНР",        role: "ec" },
    { stage: "ПСИ",        role: "op" },
    { stage: "Ввод",       role: "op" },
  ];

  /* Хранилище: реальный localStorage в браузере, in-memory заглушка
     в Node (для изолированного тестирования логики). */
  const LS = (typeof localStorage !== "undefined") ? localStorage : (function () {
    const m = Object.create(null);
    return {
      getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; },
    };
  })();

  const KEY = {
    settings: "ecod_settings",
    settingsHist: "ecod_settings_hist",
    deals: "ecod_deals",
    overrides: "ecod_overrides",
    role: "ecod_role",     // хранится сырой строкой (совместимость с монолитом)
    lang: "ecod_lang",     // язык интерфейса (ru|en|zh), P1.3
    users: "ecod_users",   // профили пользователей (P2.1)
    session: "ecod_session", // e-mail текущего пользователя (P2.1)
    psrc: "ecod_psrc",
    visits: "ecod_visits",
    ms: "ecod_ms",           // вехи проектов (P3.1), объект по dealId
    msEvents: "ecod_ms_events", // журнал изменений вех (P3.1)
    contacts: "ecod_contacts", // журнал результативных контактов (P3.2)
    notifications: "ecod_notifications", // очередь уведомлений (P3.3)
    adapterPref: "ecod_adapter", // выбранный адаптер (local|supabase), P2.3
    cat: t => "ecod_cat_" + t,
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const nowIso = () => new Date().toISOString();
  const uid = () => ((typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "n" + Date.now().toString(36) + Math.random().toString(16).slice(2, 8));

  function read(key, def) {
    try { const v = LS.getItem(key); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function write(key, val) { LS.setItem(key, JSON.stringify(val)); }

  /* ---- СИД НАСТРОЕК из текущих значений (data.js) ----
     Значения совпадают с прежними жёстко зашитыми константами,
     поэтому расчёты и скоринг по умолчанию не меняются. */
  function seedSettings() {
    return {
      version: 1,
      updatedAt: nowIso(),
      updatedBy: "seed",
      // диапазоны и дефолты бегунков конфигуратора
      params: (typeof PARAMS !== "undefined") ? clone(PARAMS) : [],
      // пресеты конфигуратора
      presets: (typeof PRESETS !== "undefined") ? clone(PRESETS) : {},
      // состав источников питания по умолчанию
      psrcDefault: { grid1: true, grid2: true, gpu: true, dgu: true, ups: true },
      // расчётные константы-ориентиры (ранее были зашиты в calc.js)
      calc: {
        tpPerMW: 8,        // техприсоединение к сети, млн ₽/МВт
        tpDualMult: 1.6,   // множитель за второй независимый ввод
        dguPerKw: 20,      // ДГУ, тыс ₽/кВт
        upsPerKwIt: 25,    // ИБП+АКБ, тыс ₽/кВт IT
        staffPct: 0.02,    // персонал ЭЦ, доля CAPEX ЭЦ в год
        dcMaintPct: 0.015, // обслуживание ЦОД, доля CAPEX ЦОД в год
        insPct: 0.004,     // страхование, доля суммарного CAPEX в год
        resMaintPct: 0.02, // ТО ДГУ и ИБП, доля их CAPEX в год
        lcoeYears: 10,     // горизонт LCOE, лет (без дисконтирования)
        ndsPct: 22,        // ставка НДС, %
      },
      // веса скоринга площадок (ранее зашиты в scoreLand)
      land: {
        gasRatePerMW: 267, // нм³/ч на 1 МВт (0,267 нм³/кВтч)
        gpu:  { gas: 28, grs: 10, grid: 14, fib: 12, dual: 8,  vri: 10, encumb: 4, status: 9, transport: 5 },
        grid: { gas: 4,  grs: 0,  grid: 40, fib: 15, dual: 15, vri: 10, encumb: 4, status: 9, transport: 5 },
      },
      // шаблон вех проекта (P3.1) — состав этапов и ответственные роли
      milestoneTemplate: clone(MS_TEMPLATE_DEFAULT),
      // настройки интеграций (заполняет администратор в UI, P2.2)
      integrations: {
        supabaseUrl: "",   // https://<project>.supabase.co
        supabaseKey: "",   // anon public key
        tgBotToken: "",    // токен Telegram-бота (BotFather)
      },
    };
  }

  /* ---- СИД ДЕМО-ПОЛЬЗОВАТЕЛЕЙ (P2.1) ----
     Тестовая среда: по одному профилю на каждую роль + администратор.
     Пароль демонстрационный и общий (задаётся администратором в проде,
     см. заметку P2.1). Реальная проверка учётных данных — на стороне
     SupabaseAdapter (email+пароль, Auth), LocalAdapter хранит хэш-заглушку. */
  const DEMO_PASS = "energocod";
  function seedUsers() {
    const roleList = (typeof ROLES !== "undefined") ? Object.keys(ROLES) : [];
    const companyByRole = {
      admin: "УК «Энергофит» (администратор платформы)",
      uk: "УК «Энергофит»",
      customer: "Демо-заказчик",
      investor: "«СеверКапитал»",
      land: "ГК «МосРегионЗем»",
      grid: "АО «СетьЭнергоРегион»",
      fiber: "«РусВОЛС Инфра»",
      ec: "УК «Энергофит»",
      dc: "ООО «ДатаСтрой»",
      it: "«Тера»",
      op: "«РусКолокейшн»",
    };
    const list = [{
      email: "admin@energocod.ru", name: "Администратор платформы", role: "admin",
      company: companyByRole.admin, pass: DEMO_PASS, status: "active",
      telegram_chat_id: "", lang: "ru", createdAt: nowIso(),
    }];
    roleList.filter(r => r !== "admin").forEach(r => {
      list.push({
        email: r + "@energocod.ru",
        name: "Демо: " + ((typeof ROLES !== "undefined" && ROLES[r]) ? ROLES[r].name : r),
        role: r, company: companyByRole[r] || "Демо-участник",
        pass: DEMO_PASS, status: "active",
        telegram_chat_id: "", lang: "ru", createdAt: nowIso(),
      });
    });
    return list;
  }

  /* ---- Каталоги: сид из статических массивов data.js ---- */
  function catSeed(type) {
    const map = {
      land:  (typeof LAND !== "undefined") ? LAND : [],
      ec:    (typeof EC !== "undefined") ? EC : [],
      dc:    (typeof DC !== "undefined") ? DC : [],
      dcreg: (typeof DCREG !== "undefined") ? DCREG : [],
    };
    return clone(map[type] || []);
  }

  /* ============ LocalAdapter ============ */
  const LocalAdapter = {
    name: "local",

    /* --- настройки --- */
    getSettings() {
      let s = read(KEY.settings, null);
      if (!s) { s = seedSettings(); write(KEY.settings, s); }
      return s;
    },
    saveSettings(patch, by) {
      const cur = this.getSettings();
      const hist = read(KEY.settingsHist, []);
      hist.push({ version: cur.version, updatedAt: cur.updatedAt, updatedBy: cur.updatedBy, snapshot: cur });
      write(KEY.settingsHist, hist.slice(-50));
      const next = Object.assign({}, cur, patch || {}, {
        version: (cur.version || 1) + 1,
        updatedAt: nowIso(),
        updatedBy: by || "admin",
      });
      write(KEY.settings, next);
      return next;
    },
    getSettingsHistory() { return read(KEY.settingsHist, []); },
    resetSettings() { const s = seedSettings(); write(KEY.settings, s); return s; },

    /* --- заявки --- */
    getDeals() {
      const d = read(KEY.deals, null);
      return d != null ? d : ((typeof DEALS !== "undefined") ? clone(DEALS) : []);
    },
    saveDeals(list) { write(KEY.deals, list); return list; },

    /* --- overrides (по заявке) --- */
    getOverrides(dealId) { const all = read(KEY.overrides, {}); return all[dealId] || {}; },
    getAllOverrides() { return read(KEY.overrides, {}); },
    setOverride(dealId, paramId, value) {
      const all = read(KEY.overrides, {});
      (all[dealId] = all[dealId] || {})[paramId] = value;
      write(KEY.overrides, all);
      return all[dealId];
    },
    clearOverride(dealId, paramId) {
      const all = read(KEY.overrides, {});
      if (all[dealId]) {
        if (paramId == null) delete all[dealId];
        else delete all[dealId][paramId];
        write(KEY.overrides, all);
      }
    },

    /* --- каталоги --- */
    getCatalog(type) { const v = read(KEY.cat(type), null); return v != null ? v : catSeed(type); },
    saveCatalog(type, arr) { write(KEY.cat(type), arr); return arr; },

    /* --- роль пользователя (сырая строка) --- */
    getRole(def) { const v = LS.getItem(KEY.role); return v || def || "uk"; },
    setRole(r) { LS.setItem(KEY.role, r); return r; },

    /* --- язык интерфейса (ru|en|zh), P1.3 --- */
    getLang(def) { const v = LS.getItem(KEY.lang); return v || def || "ru"; },
    setLang(l) { LS.setItem(KEY.lang, l); return l; },

    /* --- пользователи и сессия (P2.1) ---
       LocalAdapter: демо-профили, проверка пароля по полю pass (тестовая
       среда). В SupabaseAdapter (P2.3) вход идёт через Supabase Auth, pass
       не хранится. Нормализация e-mail: нижний регистр, обрезка пробелов. */
    _normEmail(e) { return String(e || "").trim().toLowerCase(); },
    getUsers() {
      let u = read(KEY.users, null);
      if (!u) { u = seedUsers(); write(KEY.users, u); }
      return u;
    },
    saveUsers(list) { write(KEY.users, list); return list; },
    findUser(email) {
      const e = this._normEmail(email);
      return this.getUsers().find(u => this._normEmail(u.email) === e) || null;
    },
    authenticate(email, pass) {
      const u = this.findUser(email);
      if (!u) return { ok: false, error: "Пользователь не найден" };
      if (u.status === "blocked") return { ok: false, error: "Учётная запись заблокирована" };
      if (String(u.pass) !== String(pass)) return { ok: false, error: "Неверный пароль" };
      return { ok: true, user: u };
    },
    createUser(profile) {
      const list = this.getUsers();
      const email = this._normEmail(profile.email);
      if (!email) return { ok: false, error: "Не указан e-mail" };
      if (list.some(u => this._normEmail(u.email) === email))
        return { ok: false, error: "Пользователь с таким e-mail уже есть" };
      const rec = Object.assign({
        name: "", role: "customer", company: "", pass: "energocod",
        status: "active", telegram_chat_id: "", lang: "ru",
      }, profile, { email: email, createdAt: nowIso() });
      list.push(rec);
      this.saveUsers(list);
      return { ok: true, user: rec };
    },
    updateUser(email, patch) {
      const list = this.getUsers();
      const e = this._normEmail(email);
      const i = list.findIndex(u => this._normEmail(u.email) === e);
      if (i < 0) return { ok: false, error: "Пользователь не найден" };
      list[i] = Object.assign({}, list[i], patch || {});
      this.saveUsers(list);
      return { ok: true, user: list[i] };
    },
    getSession() {
      const e = LS.getItem(KEY.session);
      if (!e) return null;
      return this.findUser(e);
    },
    setSession(email) { LS.setItem(KEY.session, this._normEmail(email)); return this.getSession(); },
    clearSession() { LS.removeItem(KEY.session); },

    /* --- источники питания конфигуратора --- */
    getPsrc() { const v = read(KEY.psrc, null); return v != null ? v : clone(this.getSettings().psrcDefault); },
    setPsrc(p) { write(KEY.psrc, p); return p; },

    /* --- журнал посещений (для админ-панели, P2.2) --- */
    logVisit(section, extra) {
      const log = read(KEY.visits, []);
      log.push(Object.assign({
        t: nowIso(),
        section: section,
        role: (typeof role !== "undefined") ? role : null,
      }, extra || {}));
      write(KEY.visits, log.slice(-500));
    },
    getVisits() { return read(KEY.visits, []); },

    /* --- вехи проекта (P3.1) ---
       Шаблон берётся из настроек (milestoneTemplate). При первом
       обращении к заявке вехи сидируются из шаблона (pct=0). Любое
       изменение вехи фиксируется в журнале событий (milestone_events)
       — источник уведомлений (P3.3). */
    _msTemplate() {
      const t = this.getSettings().milestoneTemplate;
      return (t && t.length) ? t : clone(MS_TEMPLATE_DEFAULT);
    },
    getMilestones(dealId) {
      const all = read(KEY.ms, {});
      if (all[dealId]) return all[dealId];
      const seed = this._msTemplate().map((s, i) => ({
        ord: i, stage: s.stage, pct: 0, due: "",
        owner_role: s.role || "", owner_name: s.name || "",
        updated_by: "seed", updated_at: nowIso(),
      }));
      all[dealId] = seed; write(KEY.ms, all);
      return seed;
    },
    saveMilestones(dealId, list) {
      const all = read(KEY.ms, {}); all[dealId] = list; write(KEY.ms, all); return list;
    },
    setMilestone(dealId, ord, patch, by) {
      const list = this.getMilestones(dealId);
      const i = list.findIndex(m => m.ord === ord);
      if (i < 0) return list;
      const before = list[i];
      const after = Object.assign({}, before, patch || {}, { updated_by: by || "admin", updated_at: nowIso() });
      const ev = read(KEY.msEvents, []);
      [["pct", "pct"], ["due", "due"], ["owner_name", "owner"]].forEach(([f, label]) => {
        if (String(before[f] == null ? "" : before[f]) !== String(after[f] == null ? "" : after[f])) {
          ev.push({
            deal_id: dealId, stage: after.stage, field: label,
            old_value: String(before[f] == null ? "" : before[f]),
            new_value: String(after[f] == null ? "" : after[f]),
            changed_by: by || "admin", changed_at: nowIso(),
          });
        }
      });
      write(KEY.msEvents, ev.slice(-1000));
      list[i] = after; this.saveMilestones(dealId, list);
      // P3.3: смена готовности ставит уведомление ответственной роли в очередь
      if (String(before.pct == null ? "" : before.pct) !== String(after.pct == null ? "" : after.pct)) {
        this._notifyMilestonePct(dealId, after);
      }
      return list;
    },
    getMilestoneEvents(dealId) {
      const ev = read(KEY.msEvents, []);
      return dealId ? ev.filter(e => e.deal_id === dealId) : ev;
    },
    dealProgress(dealId) {
      const l = this.getMilestones(dealId);
      if (!l.length) return 0;
      return Math.round(l.reduce((s, m) => s + (Number(m.pct) || 0), 0) / l.length);
    },

    /* --- журнал результативных контактов (P3.2) ---
       Фиксирует передачу результативного контакта (УК → участник) и
       отклик участника. Доказательная база для Tail Fee: кто, кому, по
       какой заявке, с каким результатом и когда. Экспорт CSV — в UI. */
    logContact(entry) {
      const log = read(KEY.contacts, []);
      const rec = Object.assign({
        deal_id: "", member: "", member_role: "", status: "передан", comment: "", created_by: "",
      }, entry || {}, { created_at: nowIso() });
      log.push(rec); write(KEY.contacts, log.slice(-2000));
      return rec;
    },
    getContacts(dealId) {
      const log = read(KEY.contacts, []);
      return dealId ? log.filter(e => e.deal_id === dealId) : log;
    },

    /* --- очередь уведомлений (P3.3) ---
       Источник — журнал изменений вех (milestone_events): смена
       готовности ставит уведомление ответственной роли в очередь со
       статусом «queued». Отправка в Telegram — sendNotifications (fetch
       к Bot API, токен из настроек интеграций). E-mail — вторая очередь.
       Канал, адресат, текст и статус хранятся в notifications (модель
       плана, раздел 2). Всё настраивается администратором в UI. */
    queueNotification(entry) {
      const log = read(KEY.notifications, []);
      const rec = Object.assign({
        id: uid(), channel: "tg", recipient: "", recipient_role: "",
        subject: "", body: "", deal_id: "", status: "queued", error: "",
      }, entry || {}, { created_at: nowIso(), sent_at: null });
      log.push(rec); write(KEY.notifications, log.slice(-2000));
      return rec;
    },
    getNotifications(filter) {
      const log = read(KEY.notifications, []);
      if (!filter) return log;
      if (filter.status) return log.filter(n => n.status === filter.status);
      if (filter.deal_id) return log.filter(n => n.deal_id === filter.deal_id);
      return log;
    },
    markNotification(id, patch) {
      const log = read(KEY.notifications, []);
      const i = log.findIndex(n => n.id === id);
      if (i < 0) return null;
      log[i] = Object.assign({}, log[i], patch || {});
      write(KEY.notifications, log);
      return log[i];
    },
    /* Уведомление о смене готовности вехи: адресат — участник с ролью
       ответственного этапа, у которого задан telegram_chat_id. Если
       chat_id не задан, запись всё равно попадает в очередь (адрес
       пустой) — при отправке отметится ошибкой, администратор увидит
       причину и заполнит chat_id профиля. */
    _notifyMilestonePct(dealId, m) {
      let recipient = "";
      try {
        const owner = this.getUsers().find(u => u.role === m.owner_role && u.telegram_chat_id);
        if (owner) recipient = owner.telegram_chat_id;
      } catch (e) { /* до сида пользователей */ }
      this.queueNotification({
        channel: "tg", recipient: recipient, recipient_role: m.owner_role || "",
        subject: "Веха проекта " + dealId,
        body: "Этап «" + m.stage + "»: готовность " + m.pct + "%",
        deal_id: dealId,
      });
    },
    /* Отправка очереди в Telegram (async). Проходит по записям со
       статусом queued и каналом tg, шлёт сообщение через Bot API,
       обновляет статус (sent|error). Токен берётся из настроек
       интеграций (администратор вводит в разделе «Интеграции»). */
    async sendNotifications(token) {
      const tok = token || ((this.getSettings().integrations || {}).tgBotToken || "");
      const log = read(KEY.notifications, []);
      let sent = 0, failed = 0, skipped = 0;
      for (const n of log) {
        if (n.status !== "queued") continue;
        if (n.channel !== "tg") { skipped++; continue; } // e-mail — фаза 2
        if (!tok) { n.status = "error"; n.error = "Не задан токен Telegram-бота"; failed++; continue; }
        if (!n.recipient) { n.status = "error"; n.error = "Не указан telegram_chat_id получателя"; failed++; continue; }
        try {
          const r = await fetch("https://api.telegram.org/bot" + tok + "/sendMessage", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: n.recipient, text: (n.subject ? n.subject + "\n" : "") + (n.body || "") }),
          });
          const j = await r.json();
          if (j && j.ok) { n.status = "sent"; n.sent_at = nowIso(); n.error = ""; sent++; }
          else { n.status = "error"; n.error = (j && j.description) || "Ошибка Telegram API"; failed++; }
        } catch (e) { n.status = "error"; n.error = (e && e.message) || String(e); failed++; }
      }
      write(KEY.notifications, log);
      return { sent, failed, skipped };
    },
  };

  /* ============ SupabaseAdapter (P2.3) ============
     Production-бэкенд Supabase (Postgres + Auth + RLS). Модули платформы
     ходят в DB.* синхронно, а Supabase асинхронен, поэтому адаптер
     работает по схеме «кэш + отложенная запись» (write-behind):
       • при подключении (connect) все таблицы читаются в память;
       • синхронные геттеры отдают данные из кэша;
       • сеттеры меняют кэш сразу и асинхронно отправляют изменения
         в Supabase (ошибки логируются, UI не блокируется).
     Так синхронный интерфейс сохраняется без переписывания вью.
     Активируется администратором в разделе «Интеграции» (URL + anon
     key), правка кода не требуется. Вход/регистрация — через Supabase
     Auth (async DB.signIn/DB.signUp), пароли на клиенте не хранятся. */
  const SupabaseAdapter = (function () {
    let client = null, ready = false, connErr = "";
    const c = {
      settings: null, hist: [], deals: null, overrides: {}, users: [],
      cat: {}, visits: [], ms: {}, msEvents: [], contacts: [], notifications: [],
      psrc: null, role: null, lang: null, session: null,
    };
    const norm = e => String(e || "").trim().toLowerCase();

    /* --- маппинг заявок между формой приложения и строкой БД --- */
    function fromDealRow(r) {
      return {
        id: r.id, client: r.client, type: r.type, mw: r.mw, region: r.region,
        budget: r.budget, need: r.needs || [], status: r.status,
        created: r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU") : "",
        desc: r.descr, model: r.model || null,
      };
    }
    function toDealRow(d) {
      return {
        id: d.id, client: d.client, type: d.type, mw: d.mw, region: d.region,
        budget: d.budget, needs: d.need || [], status: d.status,
        descr: d.desc, model: d.model || null,
      };
    }

    /* --- загрузка supabase-js из CDN (только браузер) --- */
    async function loadSdk() {
      if (typeof window !== "undefined" && window.supabase) return window.supabase;
      if (typeof document === "undefined") throw new Error("SDK доступен только в браузере");
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        s.onload = res; s.onerror = () => rej(new Error("Не удалось загрузить supabase-js"));
        document.head.appendChild(s);
      });
      if (!window.supabase) throw new Error("supabase-js не инициализировался");
      return window.supabase;
    }

    /* Отложенная запись: не блокирует синхронный вызов, ошибки в консоль. */
    function push(promiseFactory) {
      try {
        Promise.resolve().then(promiseFactory).catch(e => {
          if (typeof console !== "undefined") console.warn("Supabase write-behind:", e && e.message || e);
        });
      } catch (e) { /* игнор в тестовой среде */ }
    }

    async function hydrate() {
      // настройки (единственная строка id=1)
      const s = await client.from("settings").select("*").eq("id", 1).maybeSingle();
      if (s.data && s.data.data) {
        c.settings = Object.assign({}, s.data.data, {
          version: s.data.version, updatedAt: s.data.updated_at, updatedBy: s.data.updated_by,
        });
      } else {
        c.settings = seedSettings();
        push(() => client.from("settings").insert({ id: 1, data: c.settings, version: c.settings.version, updated_by: "seed" }));
      }
      const h = await client.from("settings_history").select("*").order("version", { ascending: true });
      c.hist = (h.data || []).map(r => ({ version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by, snapshot: r.data }));
      // заявки
      const d = await client.from("deals").select("*");
      c.deals = (d.data || []).map(fromDealRow);
      // override параметров
      const ov = await client.from("overrides").select("*");
      c.overrides = {};
      (ov.data || []).forEach(r => { (c.overrides[r.deal_id] = c.overrides[r.deal_id] || {})[r.param_id] = r.value; });
      // профили (пользователи)
      const p = await client.from("profiles").select("*");
      c.users = (p.data || []).map(r => ({
        email: r.email, name: r.name, role: r.role, company: r.company,
        status: r.status, telegram_chat_id: r.telegram_chat_id, lang: r.lang, id: r.id,
      }));
      // каталоги
      for (const [type, table] of [["land", "assets_land"], ["ec", "assets_ec"], ["dc", "assets_dc"], ["dcreg", "dc_registry"]]) {
        const q = await client.from(table).select("*");
        c.cat[type] = (q.data || []).map(r => r.data);
        if (!c.cat[type].length) c.cat[type] = catSeed(type);
      }
      // вехи и события
      const ms = await client.from("milestones").select("*").order("ord", { ascending: true });
      c.ms = {};
      (ms.data || []).forEach(r => {
        (c.ms[r.deal_id] = c.ms[r.deal_id] || []).push({
          ord: r.ord, stage: r.stage, pct: r.pct, due: r.due || "",
          owner_role: r.owner_role || "", owner_name: r.owner_name || "",
          updated_by: r.updated_by, updated_at: r.updated_at, _id: r.id,
        });
      });
      const mev = await client.from("milestone_events").select("*").order("changed_at", { ascending: true });
      c.msEvents = (mev.data || []).map(r => ({
        deal_id: r.deal_id, stage: r.stage, field: r.field,
        old_value: r.old_value, new_value: r.new_value, changed_by: r.changed_by, changed_at: r.changed_at,
      }));
      // журнал посещений (последние — для админа)
      const v = await client.from("visits_log").select("*").order("created_at", { ascending: true }).limit(500);
      c.visits = (v.data || []).map(r => ({ t: r.created_at, section: r.section, role: r.role, user: r.user_email, event: r.event }));
      // журнал результативных контактов (P3.2)
      const cl = await client.from("contacts_log").select("*").order("created_at", { ascending: true });
      c.contacts = (cl.data || []).map(r => ({
        deal_id: r.deal_id, member: r.member, member_role: r.member_role,
        status: r.status, comment: r.comment, created_by: r.created_by, created_at: r.created_at,
      }));
      // очередь уведомлений (P3.3) — наполняется триггером on_milestone_change
      const nf = await client.from("notifications").select("*").order("created_at", { ascending: true }).limit(500);
      c.notifications = (nf.data || []).map(r => ({
        id: r.id, channel: r.channel, recipient: r.recipient, recipient_role: "",
        subject: r.subject, body: r.body, deal_id: r.deal_id,
        status: r.status, error: r.error, created_at: r.created_at, sent_at: r.sent_at,
      }));
    }

    async function connect(url, key, injected) {
      connErr = "";
      try {
        client = injected ? injected : (await loadSdk()).createClient(url, key);
        await hydrate();
        // восстановить активную сессию из Supabase Auth (если есть)
        try {
          const sess = await client.auth.getUser();
          if (sess && sess.data && sess.data.user) {
            c.session = c.users.find(u => norm(u.email) === norm(sess.data.user.email)) || null;
          }
        } catch (e) { /* нет активной сессии */ }
        ready = true;
        return { ok: true };
      } catch (e) {
        connErr = (e && e.message) || String(e); ready = false;
        return { ok: false, error: connErr };
      }
    }
    function disconnect() { ready = false; client = null; }
    function isReady() { return ready; }
    function lastError() { return connErr; }

    /* --- аутентификация через Supabase Auth (async) --- */
    async function signIn(email, pass) {
      if (!client) return { ok: false, error: "Supabase не подключён" };
      const r = await client.auth.signInWithPassword({ email: norm(email), password: pass });
      if (r.error) return { ok: false, error: r.error.message };
      let u = c.users.find(x => norm(x.email) === norm(email));
      if (!u) { await hydrate(); u = c.users.find(x => norm(x.email) === norm(email)); }
      if (u && u.status === "blocked") { await client.auth.signOut(); return { ok: false, error: "Учётная запись заблокирована" }; }
      c.session = u || { email: norm(email), role: "customer" };
      return { ok: true, user: c.session };
    }
    async function signUp(profile) {
      if (!client) return { ok: false, error: "Supabase не подключён" };
      const r = await client.auth.signUp({
        email: norm(profile.email), password: profile.pass,
        options: { data: { name: profile.name || "", role: profile.role || "customer" } },
      });
      if (r.error) return { ok: false, error: r.error.message };
      // профиль создаётся триггером handle_new_user; дозаполняем компанию
      push(() => client.from("profiles").update({ company: profile.company || "" }).eq("email", norm(profile.email)));
      await hydrate();
      const u = c.users.find(x => norm(x.email) === norm(profile.email)) || { email: norm(profile.email), role: profile.role || "customer" };
      c.session = u;
      return { ok: true, user: u };
    }

    return {
      name: "supabase",
      connect, disconnect, isReady, lastError, signIn, signUp,

      /* --- настройки --- */
      getSettings() { return c.settings || (c.settings = seedSettings()); },
      saveSettings(patch, by) {
        const cur = this.getSettings();
        c.hist.push({ version: cur.version, updatedAt: cur.updatedAt, updatedBy: cur.updatedBy, snapshot: cur });
        c.hist = c.hist.slice(-50);
        const next = Object.assign({}, cur, patch || {}, {
          version: (cur.version || 1) + 1, updatedAt: nowIso(), updatedBy: by || "admin",
        });
        c.settings = next;
        push(() => client.from("settings_history").insert({ version: cur.version, data: cur, updated_by: cur.updatedBy }));
        push(() => client.from("settings").upsert({ id: 1, data: next, version: next.version, updated_by: next.updatedBy, updated_at: next.updatedAt }));
        return next;
      },
      getSettingsHistory() { return c.hist; },
      resetSettings() {
        const s = seedSettings(); c.settings = s;
        push(() => client.from("settings").upsert({ id: 1, data: s, version: s.version, updated_by: "seed" }));
        return s;
      },

      /* --- заявки --- */
      getDeals() { return c.deals != null ? c.deals : ((typeof DEALS !== "undefined") ? clone(DEALS) : []); },
      saveDeals(list) {
        c.deals = list;
        push(() => client.from("deals").upsert(list.map(toDealRow)));
        return list;
      },

      /* --- overrides --- */
      getOverrides(dealId) { return c.overrides[dealId] || {}; },
      getAllOverrides() { return c.overrides; },
      setOverride(dealId, paramId, value) {
        (c.overrides[dealId] = c.overrides[dealId] || {})[paramId] = value;
        push(() => client.from("overrides").upsert({ deal_id: dealId, param_id: paramId, value: value }));
        return c.overrides[dealId];
      },
      clearOverride(dealId, paramId) {
        if (c.overrides[dealId]) {
          if (paramId == null) { delete c.overrides[dealId]; push(() => client.from("overrides").delete().eq("deal_id", dealId)); }
          else { delete c.overrides[dealId][paramId]; push(() => client.from("overrides").delete().eq("deal_id", dealId).eq("param_id", paramId)); }
        }
      },

      /* --- каталоги --- */
      getCatalog(type) { return c.cat[type] != null ? c.cat[type] : catSeed(type); },
      saveCatalog(type, arr) {
        c.cat[type] = arr;
        const table = { land: "assets_land", ec: "assets_ec", dc: "assets_dc", dcreg: "dc_registry" }[type];
        if (table) push(() => client.from(table).upsert(arr.map(x => ({ id: x.id, data: x }))));
        return arr;
      },

      /* --- роль/язык (профиль текущего пользователя) --- */
      getRole(def) { return (c.session && c.session.role) || c.role || def || "uk"; },
      setRole(r) { c.role = r; return r; },
      getLang(def) { return c.lang || (c.session && c.session.lang) || def || "ru"; },
      setLang(l) {
        c.lang = l;
        if (c.session) push(() => client.from("profiles").update({ lang: l }).eq("email", norm(c.session.email)));
        return l;
      },

      /* --- пользователи и сессия (профили Supabase) --- */
      getUsers() { return c.users; },
      saveUsers(list) { c.users = list; return list; },
      findUser(email) { const e = norm(email); return c.users.find(u => norm(u.email) === e) || null; },
      authenticate() { return { ok: false, error: "В режиме Supabase вход выполняется через Supabase Auth (DB.signIn)" }; },
      createUser(profile) {
        // синхронный путь недоступен для Supabase Auth; регистрация идёт через signUp
        return { ok: false, error: "Регистрация в режиме Supabase выполняется через Supabase Auth (DB.signUp)" };
      },
      updateUser(email, patch) {
        const e = norm(email); const i = c.users.findIndex(u => norm(u.email) === e);
        if (i < 0) return { ok: false, error: "Пользователь не найден" };
        c.users[i] = Object.assign({}, c.users[i], patch || {});
        push(() => client.from("profiles").update(patch || {}).eq("email", e));
        return { ok: true, user: c.users[i] };
      },
      getSession() { return c.session; },
      setSession(email) { c.session = this.findUser(email) || c.session; return c.session; },
      clearSession() { c.session = null; if (client && client.auth) push(() => client.auth.signOut()); },

      /* --- источники питания --- */
      getPsrc() { return c.psrc != null ? c.psrc : clone(this.getSettings().psrcDefault); },
      setPsrc(p) { c.psrc = p; return p; },

      /* --- журнал посещений --- */
      logVisit(section, extra) {
        const rec = Object.assign({ t: nowIso(), section: section, role: c.role }, extra || {});
        c.visits.push(rec); c.visits = c.visits.slice(-500);
        push(() => client.from("visits_log").insert({
          section: section, role: rec.role, user_email: rec.user || (c.session && c.session.email) || null, event: rec.event || "переход",
        }));
      },
      getVisits() { return c.visits; },

      /* --- журнал результативных контактов (P3.2) --- */
      logContact(entry) {
        const rec = Object.assign({
          deal_id: "", member: "", member_role: "", status: "передан", comment: "", created_by: "",
        }, entry || {}, { created_at: nowIso() });
        c.contacts.push(rec);
        push(() => client.from("contacts_log").insert({
          deal_id: rec.deal_id || null, member: rec.member, member_role: rec.member_role,
          status: rec.status, comment: rec.comment, created_by: rec.created_by,
        }));
        return rec;
      },
      getContacts(dealId) { return dealId ? c.contacts.filter(e => e.deal_id === dealId) : c.contacts; },

      /* --- очередь уведомлений (P3.3) ---
         В Supabase-режиме запись в очередь при смене вехи формирует
         серверный триггер on_milestone_change (см. schema.sql), поэтому
         клиент не дублирует queueNotification в setMilestone. Отправку
         выполняет edge-функция notify (service_role, обходит RLS).
         getNotifications отдаёт кэш (обновляется при hydrate/Reload). */
      queueNotification(entry) {
        const rec = Object.assign({
          id: uid(), channel: "tg", recipient: "", recipient_role: "",
          subject: "", body: "", deal_id: "", status: "queued", error: "",
        }, entry || {}, { created_at: nowIso(), sent_at: null });
        c.notifications.push(rec);
        push(() => client.from("notifications").insert({
          channel: rec.channel, recipient: rec.recipient || null,
          subject: rec.subject, body: rec.body, deal_id: rec.deal_id || null,
        }));
        return rec;
      },
      getNotifications(filter) {
        const l = c.notifications;
        if (!filter) return l;
        if (filter.status) return l.filter(n => n.status === filter.status);
        if (filter.deal_id) return l.filter(n => n.deal_id === filter.deal_id);
        return l;
      },
      markNotification(id, patch) {
        const i = c.notifications.findIndex(n => n.id === id);
        if (i < 0) return null;
        c.notifications[i] = Object.assign({}, c.notifications[i], patch || {});
        push(() => client.from("notifications").update(patch || {}).eq("id", id));
        return c.notifications[i];
      },
      // Отправка очереди в проде выполняется edge-функцией notify.
      async sendNotifications() {
        if (!client) return { sent: 0, failed: 0, skipped: 0, error: "Supabase не подключён" };
        try {
          const r = await client.functions.invoke("notify", { body: {} });
          if (r && r.error) return { sent: 0, failed: 0, skipped: 0, error: (r.error.message || String(r.error)) };
          await hydrate();
          const d = (r && r.data) || {};
          return { sent: d.sent || 0, failed: d.failed || 0, skipped: d.skipped || 0 };
        } catch (e) { return { sent: 0, failed: 0, skipped: 0, error: (e && e.message) || String(e) }; }
      },

      /* --- вехи (P3.1) --- */
      _msTemplate() { const t = this.getSettings().milestoneTemplate; return (t && t.length) ? t : clone(MS_TEMPLATE_DEFAULT); },
      getMilestones(dealId) {
        if (c.ms[dealId]) return c.ms[dealId];
        const seed = this._msTemplate().map((s, i) => ({
          ord: i, stage: s.stage, pct: 0, due: "", owner_role: s.role || "", owner_name: s.name || "",
          updated_by: "seed", updated_at: nowIso(),
        }));
        c.ms[dealId] = seed;
        push(() => client.from("milestones").upsert(seed.map(m => ({
          deal_id: dealId, ord: m.ord, stage: m.stage, pct: m.pct, due: m.due || null,
          owner_role: m.owner_role, owner_name: m.owner_name, updated_by: "seed",
        })), { onConflict: "deal_id,ord" }));
        return seed;
      },
      saveMilestones(dealId, list) { c.ms[dealId] = list; return list; },
      setMilestone(dealId, ord, patch, by) {
        const list = this.getMilestones(dealId);
        const i = list.findIndex(m => m.ord === ord); if (i < 0) return list;
        const before = list[i];
        const after = Object.assign({}, before, patch || {}, { updated_by: by || "admin", updated_at: nowIso() });
        [["pct", "pct"], ["due", "due"], ["owner_name", "owner"]].forEach(([f, label]) => {
          if (String(before[f] == null ? "" : before[f]) !== String(after[f] == null ? "" : after[f])) {
            c.msEvents.push({
              deal_id: dealId, stage: after.stage, field: label,
              old_value: String(before[f] == null ? "" : before[f]),
              new_value: String(after[f] == null ? "" : after[f]),
              changed_by: by || "admin", changed_at: nowIso(),
            });
          }
        });
        list[i] = after;
        // событие и уведомление формирует триггер on_milestone_change на стороне БД
        push(() => client.from("milestones").update({
          pct: after.pct, due: after.due || null, owner_role: after.owner_role,
          owner_name: after.owner_name, updated_by: after.updated_by, updated_at: after.updated_at,
        }).eq("deal_id", dealId).eq("ord", ord));
        return list;
      },
      getMilestoneEvents(dealId) { return dealId ? c.msEvents.filter(e => e.deal_id === dealId) : c.msEvents; },
      dealProgress(dealId) {
        const l = this.getMilestones(dealId); if (!l.length) return 0;
        return Math.round(l.reduce((s, m) => s + (Number(m.pct) || 0), 0) / l.length);
      },
    };
  })();

  /* ============ Фасад DB (делегирует активному адаптеру) ============ */
  const adapters = { local: LocalAdapter, supabase: SupabaseAdapter };
  const DB = {
    adapter: "local", // "local" | "supabase" (P2.3)
    registerAdapter(name, impl) { adapters[name] = impl; },
    _a() { return adapters[this.adapter] || LocalAdapter; },

    // настройки
    getSettings() { return this._a().getSettings(); },
    saveSettings(patch, by) { return this._a().saveSettings(patch, by); },
    getSettingsHistory() { return this._a().getSettingsHistory(); },
    resetSettings() { return this._a().resetSettings(); },
    // удобные срезы настроек
    getParams() { return this.getSettings().params; },
    getPresets() { return this.getSettings().presets; },
    getCalcConst() { return this.getSettings().calc; },
    getLandScore() { return this.getSettings().land; },
    // эффективные параметры с учётом override заявки (приоритет: заявка > глобальные)
    effectiveParams(dealId) {
      const base = clone(this.getParams());
      if (!dealId) return base;
      const ov = this.getOverrides(dealId);
      return base.map(p => (p.id in ov ? Object.assign({}, p, { v: ov[p.id] }) : p));
    },

    // заявки
    getDeals() { return this._a().getDeals(); },
    saveDeals(list) { return this._a().saveDeals(list); },

    // overrides
    getOverrides(dealId) { return this._a().getOverrides(dealId); },
    getAllOverrides() { return this._a().getAllOverrides(); },
    setOverride(dealId, paramId, value) { return this._a().setOverride(dealId, paramId, value); },
    clearOverride(dealId, paramId) { return this._a().clearOverride(dealId, paramId); },

    // каталоги
    getCatalog(type) { return this._a().getCatalog(type); },
    saveCatalog(type, arr) { return this._a().saveCatalog(type, arr); },

    // роль
    getRole(def) { return this._a().getRole(def); },
    setRole(r) { return this._a().setRole(r); },

    // язык интерфейса (P1.3)
    getLang(def) { return this._a().getLang(def); },
    setLang(l) { return this._a().setLang(l); },

    // пользователи и сессия (P2.1)
    getUsers() { return this._a().getUsers(); },
    saveUsers(list) { return this._a().saveUsers(list); },
    findUser(email) { return this._a().findUser(email); },
    authenticate(email, pass) { return this._a().authenticate(email, pass); },
    createUser(profile) { return this._a().createUser(profile); },
    updateUser(email, patch) { return this._a().updateUser(email, patch); },
    getSession() { return this._a().getSession(); },
    setSession(email) { return this._a().setSession(email); },
    clearSession() { return this._a().clearSession(); },
    // удобный срез настроек интеграций
    getIntegrations() { return this.getSettings().integrations || {}; },

    // источники питания
    getPsrc() { return this._a().getPsrc(); },
    setPsrc(p) { return this._a().setPsrc(p); },

    // журнал посещений
    logVisit(section, extra) { return this._a().logVisit(section, extra); },
    getVisits() { return this._a().getVisits(); },

    // журнал результативных контактов (P3.2)
    logContact(entry) { return this._a().logContact(entry); },
    getContacts(dealId) { return this._a().getContacts(dealId); },

    // очередь уведомлений (P3.3)
    queueNotification(entry) { return this._a().queueNotification(entry); },
    getNotifications(filter) { return this._a().getNotifications(filter); },
    markNotification(id, patch) { return this._a().markNotification(id, patch); },
    sendNotifications(token) { return this._a().sendNotifications(token); },

    // вехи проекта (P3.1)
    getMilestones(dealId) { return this._a().getMilestones(dealId); },
    saveMilestones(dealId, list) { return this._a().saveMilestones(dealId, list); },
    setMilestone(dealId, ord, patch, by) { return this._a().setMilestone(dealId, ord, patch, by); },
    getMilestoneEvents(dealId) { return this._a().getMilestoneEvents(dealId); },
    dealProgress(dealId) { return this._a().dealProgress(dealId); },
    milestoneTemplate() { return this.getSettings().milestoneTemplate || []; },

    // ---- управление адаптером (P2.3) ----
    // Выбор адаптера сохраняется, чтобы при перезагрузке подключение
    // к Supabase восстанавливалось автоматически (см. autoConnect).
    getAdapterPref() { return LS.getItem(KEY.adapterPref) || "local"; },
    setAdapterPref(name) { LS.setItem(KEY.adapterPref, name); },
    isSupabase() { return this.adapter === "supabase"; },
    supabaseReady() { return typeof SupabaseAdapter.isReady === "function" && SupabaseAdapter.isReady(); },
    supabaseError() { return typeof SupabaseAdapter.lastError === "function" ? SupabaseAdapter.lastError() : ""; },
    // Подключение к Supabase (async). При успехе переключает активный
    // адаптер и запоминает выбор. injected — мок-клиент для тестов.
    async useSupabase(url, key, injected) {
      const r = await SupabaseAdapter.connect(url, key, injected);
      if (r.ok) { this.adapter = "supabase"; this.setAdapterPref("supabase"); }
      return r;
    },
    // Возврат в демо-режим (LocalAdapter), не удаляя реквизиты интеграции.
    useLocal() {
      SupabaseAdapter.disconnect();
      this.adapter = "local"; this.setAdapterPref("local");
      return { ok: true };
    },
    // Автоподключение при загрузке, если ранее был выбран Supabase и
    // заданы реквизиты. Вызывается из app.js (async).
    async autoConnect() {
      if (this.getAdapterPref() !== "supabase") return { ok: false, skipped: true };
      const ints = this.getIntegrations();
      if (!ints.supabaseUrl || !ints.supabaseKey) return { ok: false, error: "нет реквизитов Supabase" };
      return this.useSupabase(ints.supabaseUrl, ints.supabaseKey);
    },
    // Вход/регистрация с учётом активного адаптера (async).
    async signIn(email, pass) {
      if (this.isSupabase()) return SupabaseAdapter.signIn(email, pass);
      return this.authenticate(email, pass);
    },
    async signUp(profile) {
      if (this.isSupabase()) return SupabaseAdapter.signUp(profile);
      return this.createUser(profile);
    },
  };

  // Экспорт для изолированного тестирования в Node (в браузере игнорируется)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { DB, LocalAdapter, SupabaseAdapter, seedSettings, seedUsers, MS_TEMPLATE_DEFAULT };
  }
  return DB;
})();
