import pino from 'pino';
import { join } from 'path';

const isDev = process.env.NODE_ENV !== 'production';
const logDir = join(import.meta.dir, '..', '..', 'logs');

// Ensure log directory exists
import { mkdirSync } from 'fs';
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

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: { targets },
});
