import pino from 'pino';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { sendErrorToDiscord } from './discord-notify';

const isDev = process.env.NODE_ENV !== 'production';
const logDir = join(import.meta.dir, '..', '..', 'logs');

try {
  mkdirSync(logDir, { recursive: true });
} catch {}

const targets: pino.TransportTargetOptions[] = [
  // Error log — errors only, daily rotation, 7-day retention
  {
    target: 'pino-roll',
    level: 'error',
    options: {
      file: join(logDir, 'error.log'),
      frequency: 'daily',
      limit: { count: 7 },
      mkdir: true,
    },
  },
  // Combined log — info+, daily rotation, 14-day retention
  {
    target: 'pino-roll',
    level: 'info',
    options: {
      file: join(logDir, 'combined.log'),
      frequency: 'daily',
      limit: { count: 14 },
      mkdir: true,
    },
  },
];

// In dev, also pretty-print to stdout
if (isDev) {
  targets.push({
    target: 'pino-pretty',
    level: 'debug',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname',
    },
  });
}

const baseLogger = pino({
  level: isDev ? 'debug' : 'info',
  transport: { targets },
});

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
