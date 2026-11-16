// Phone notifications that work even when the browser is closed.
//  Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
//  ntfy.sh : NTFY_TOPIC (install the free ntfy app, subscribe to the same topic)
export function channels() {
  return {
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    ntfy: !!process.env.NTFY_TOPIC,
  };
}

export async function sendNotification(text, { title = 'Nifty 50 Terminal', tags = 'chart_with_upwards_trend', priority = 4 } = {}) {
  const results = {};
  const ch = channels();
  if (ch.telegram) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `${title}\n${text}` }),
      });
      results.telegram = res.ok ? 'sent' : `failed (HTTP ${res.status})`;
    } catch (e) {
      results.telegram = `failed (${e.message})`;
    }
  }
  if (ch.ntfy) {
    try {
      const base = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
      const res = await fetch(`${base}/${encodeURIComponent(process.env.NTFY_TOPIC)}`, {
        method: 'POST',
        headers: { Title: title, Tags: tags, Priority: String(priority) },
        body: text,
      });
      results.ntfy = res.ok ? 'sent' : `failed (HTTP ${res.status})`;
    } catch (e) {
      results.ntfy = `failed (${e.message})`;
    }
  }
  return results;
}
