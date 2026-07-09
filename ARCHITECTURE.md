# ЭнергоЦОД · платформа v4 (структура проекта)

Онлайн-версия платформы консорциума. Каркас без бандлера: обычные скрипты
(ES-модули отключены намеренно, чтобы платформа открывалась напрямую с диска,
file://). Порядок подключения задан в `index.html`.

## Структура

- `index.html` — разметка каркаса (шапка, вкладки, контейнер, модальное окно) и подключение модулей.
- `styles.css` — тёмная тема и все стили (вынесены из монолита).
- `src/data.js` — статические данные: роли, каталоги (LAND, EC, DC, DCREG, LEADS), заявки (DEALS), участники (MEMBERS, MEMBERS_ALL), параметры конфигуратора (PARAMS, PRESETS, PSRC_ITEMS), НПА (NPA), геоданные карты.
- `src/db.js` — слой данных DB (заготовка). Цель: LocalAdapter и SupabaseAdapter, шаг P1.2 / P2.3.
- `src/i18n.js` — интернационализация (заготовка). Словари `i18n/{ru,en,zh}.json`, шаг P1.3.
- `src/views/dash.js` — Кабинет (viewDash).
- `src/views/assets.js` — Каталог активов и скоринг площадок (viewAssets, openAsset, editAsset, scoreLand, runScoring, openScore).
- `src/views/calc.js` — Конфигуратор проекта, экспорт в Excel (viewCalc, calc, powerStatus, exportXls).
- `src/views/deals.js` — Заявки и проекты, формирование пула исполнителей (viewDeals, addDeal, matchTeam).
- `src/views/npa.js` — НПА и стандарты (viewNpa, openNpa).
- `src/views/map.js` — Карта размещения и карточка объекта реестра (viewMap, initMap, openDcReg).
- `src/views/members.js` — Реестр участников (viewMembers).
- `src/app.js` — каркас: состояние, маршрутизация по вкладкам, инициализация (init, setRole, setTab, render, closeModal). Подключается последним.

## Служебные каталоги

- `i18n/` — словари интерфейса (наполняются в P1.3).
- `supabase/` — `schema.sql` и Edge Functions (P2.3, P3.3).
- `docs/` — документация. README, ADMIN_GUIDE, DEPLOY_GUIDE пишутся в P5.

## Статус

P1.1 выполнен: код монолита `platforma_mvp.html` разбит на модули без изменения поведения.
Дальнейшие шаги: слой DB (P1.2), i18n (P1.3), Auth и админ-панель (P2), вехи и уведомления (P3).
