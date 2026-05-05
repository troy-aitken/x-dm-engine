import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { Store } from '../lib/store.js';
import { buildAuthUrl, handleCallback } from '../lib/x-oauth.js';

export function buildOAuthRouter(store: Store): Router {
  const router = Router();

  // Map: state -> account label, so we know which account the callback belongs to.
  const stateToAccount = new Map<string, { account: string; createdAt: number }>();

  router.get('/start', (req, res, next) => {
    try {
      const { account } = z
        .object({ account: z.string().min(1) })
        .parse(req.query);
      const state = crypto.randomBytes(16).toString('hex');
      stateToAccount.set(state, { account, createdAt: Date.now() });
      // Cleanup
      for (const [k, v] of stateToAccount) {
        if (Date.now() - v.createdAt > 600_000) stateToAccount.delete(k);
      }
      const url = buildAuthUrl(state);
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  });

  router.get('/callback', async (req, res, next) => {
    try {
      const { code, state } = z
        .object({ code: z.string(), state: z.string() })
        .parse(req.query);
      const entry = stateToAccount.get(state);
      if (!entry) return res.status(400).send('invalid or expired state');
      stateToAccount.delete(state);

      const result = await handleCallback(store, entry.account, code, state);
      if (!result.ok) return res.status(500).send(`OAuth failed: ${result.error}`);
      res.send(
        `<html><body style="font-family:sans-serif;padding:2rem"><h2>X connected for ${entry.account}</h2><p>You can close this window.</p></body></html>`,
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
