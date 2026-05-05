import type { Request, Response, NextFunction } from 'express';

/**
 * Simple shared-secret bearer auth.
 *
 * If API_TOKEN is unset, auth is OFF (open API — useful for solo localhost).
 * If set, every request must send `Authorization: Bearer <API_TOKEN>`.
 *
 * For multi-user setups, replace this with a real auth provider.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.API_TOKEN;
  if (!expected) return next();

  const header = req.header('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
