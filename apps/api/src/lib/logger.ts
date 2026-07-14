import pino from 'pino';
import buildRoll from 'pino-roll';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { sendErrorToDiscord } from './discord-notify';

const isDev = process.env.NODE_ENV !== 'production';
const logDir = join(import.meta.dir, '..', '..', 'logs');

try {
  mkdirSync(logDir, { recursive: true });
} catch {}

const rollOptions = {
  // Error log — errors only, daily rotation, 7-day retention
  error: { file: join(logDir, 'error.log'), frequency: 'daily' as const, limit: { count: 7 }, mkdir: true },
  // Combined log — info+, daily rotation, 14-day retention
  combined: { file: join(logDir, 'combined.log'), frequency: 'daily' as const, limit: { count: 14 }, mkdir: true },
};

// pino's worker-thread `transport` option resolves targets like "pino-roll" by
// requiring them from a file path — that breaks inside a `bun build --compile`
// binary (no real node_modules on disk, so it crashes on startup with "unable to
// determine transport target for pino-roll"). Dev never runs compiled, so it
// keeps the transport-worker form (also needed for pino-pretty's colorized
// output, which leaks raw JSON to stdout under Bun when used outside a worker).
// Production builds the rolling file streams directly instead.
const baseLogger = isDev
  ? pino({
      level: 'debug',
      transport: {
        targets: [
          { target: 'pino-roll', level: 'error', options: rollOptions.error },
          { target: 'pino-roll', level: 'info', options: rollOptions.combined },
          {
            target: 'pino-pretty',
            level: 'debug',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        ],
      },
    })
  : pino(
      { level: 'info' },
      pino.multistream([
        { level: 'error', stream: await buildRoll(rollOptions.error) },
        { level: 'info', stream: await buildRoll(rollOptions.combined) },
      ]),
    );

// Wrap logger to intercept error+ calls and send to Discord
export const logger = new Proxy(baseLogger, {
  get(target, prop) {
    if (prop === 'error' || prop === 'fatal') {
      return (...args: any[]) => {
        (target as any)[prop](...args);
        // Extract message for Discord
        const msg = typeof args[0] === 'string' ? args[0] : args[1] || args[0]?.msg || 'Unknown error';
        const err = typeof args[0] === 'object' ? args[0] : undefined;
        sendErrorToDiscord(String(msg), err);
      };
    }
    return (target as any)[prop];
  },
});
