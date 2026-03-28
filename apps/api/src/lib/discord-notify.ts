/**
 * Discord Error Notification
 * Sends error logs to Discord webhook with rate limiting.
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1487313296993288193/pT6GOgi6d0txaKugYIngyhzjYxgJQ7zQrcPkRRvf6LRHelgrar1rRadbdf0p325iT2HS';

const RATE_LIMIT_MS = 5_000;
let lastSentAt = 0;
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (pending.length === 0) return;

  const now = Date.now();
  if (now - lastSentAt < RATE_LIMIT_MS) {
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, RATE_LIMIT_MS);
    }
    return;
  }

  const batch = pending.splice(0, 5).join('\n---\n');
  lastSentAt = now;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '🚨 API Error',
          description: batch.slice(0, 4000),
          color: 0xff0000,
          timestamp: new Date().toISOString(),
          footer: { text: 'VBeyond Car Sales API' },
        }],
      }),
    });
  } catch {
    // Silently fail — Discord issues must not crash the app
  }
}

export function sendErrorToDiscord(message: string, err?: any) {
  let content = `**${message}**`;
  if (err?.stack) {
    content += `\n\`\`\`\n${String(err.stack).slice(0, 1500)}\n\`\`\``;
  } else if (err?.message && err.message !== message) {
    content += `\n\`${err.message}\``;
  }

  pending.push(content);
  flush();
}
