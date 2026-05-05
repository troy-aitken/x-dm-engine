type Level = 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: unknown) {
  const line = { t: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (meta: unknown, msg: string) => emit('info', msg, meta),
  warn: (meta: unknown, msg: string) => emit('warn', msg, meta),
  error: (meta: unknown, msg: string) => emit('error', msg, meta),
};
