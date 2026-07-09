// ============================================================
// ЭнергоЦОД · edge-функция notify (P3.3)
// Отправляет уведомления из очереди notifications в Telegram.
// Запускается вручную (кнопка «Отправить очередь» в админ-панели,
// клиент вызывает supabase.functions.invoke('notify')) или по
// расписанию (Supabase → Database → Cron: select net.http_post(...)).
//
// Логика:
//   1. Читает записи notifications со статусом queued и каналом tg.
//   2. Берёт токен бота: сначала переменная окружения TG_BOT_TOKEN,
//      иначе settings.data.integrations.tgBotToken (тот же, что
//      администратор вводит в разделе «Интеграции»).
//   3. Шлёт каждое сообщение через Telegram Bot API sendMessage.
//   4. Проставляет статус sent|error и sent_at.
// Работает под service_role (переменные подставляет Supabase),
// поэтому RLS на notifications не мешает.
//
// Развёртывание:
//   supabase functions deploy notify --no-verify-jwt
//   (--no-verify-jwt, чтобы вызывать из cron без пользовательского JWT;
//    для вызова только из UI можно оставить проверку JWT)
// Переменные окружения (Dashboard → Edge Functions → notify → Secrets):
//   TG_BOT_TOKEN  — токен бота от @BotFather (необязательно, если задан
//                   в настройках платформы). Остальное (SUPABASE_URL,
//                   SUPABASE_SERVICE_ROLE_KEY) Supabase подставляет сам.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supa = createClient(url, serviceKey);

  // Токен бота: окружение имеет приоритет, иначе — настройки платформы.
  let token = Deno.env.get("TG_BOT_TOKEN") ?? "";
  if (!token) {
    const { data } = await supa.from("settings").select("data").eq("id", 1).maybeSingle();
    token = data?.data?.integrations?.tgBotToken ?? "";
  }

  const { data: rows, error } = await supa
    .from("notifications")
    .select("*")
    .eq("status", "queued")
    .eq("channel", "tg")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const n of rows ?? []) {
    if (!token) {
      await supa.from("notifications").update({ status: "error", error: "Не задан токен Telegram-бота" }).eq("id", n.id);
      failed++; continue;
    }
    if (!n.recipient) {
      await supa.from("notifications").update({ status: "error", error: "Не указан telegram_chat_id получателя" }).eq("id", n.id);
      failed++; continue;
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: n.recipient,
          text: (n.subject ? n.subject + "\n" : "") + (n.body ?? ""),
        }),
      });
      const j = await resp.json();
      if (j?.ok) {
        await supa.from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", n.id);
        sent++;
      } else {
        await supa.from("notifications").update({ status: "error", error: j?.description ?? "Ошибка Telegram API" }).eq("id", n.id);
        failed++;
      }
    } catch (e) {
      await supa.from("notifications").update({ status: "error", error: String(e) }).eq("id", n.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, skipped }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
