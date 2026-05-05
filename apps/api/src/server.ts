import 'dotenv/config';
import express from 'express';
import { logger } from './lib/logger.js';
import { buildStore } from './lib/store-factory.js';
import { pollAllActiveCampaigns } from './lib/engine.js';
import { requireAuth } from './lib/auth.js';
import { buildCampaignsRouter } from './routes/campaigns.js';
import { buildOAuthRouter } from './routes/oauth.js';

const PORT = Number(process.env.PORT ?? 8787);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15 * 60 * 1000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

async function main() {
  const store = buildStore();
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // CORS — permissive by default, lock down via CORS_ORIGIN.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));
  // OAuth routes are unauthenticated by design — anyone with X_REDIRECT_URI can land on /oauth/callback.
  // /oauth/start is also public so the operator can paste the URL into a browser without an API token.
  app.use('/oauth', buildOAuthRouter(store));
  // Campaign routes require API_TOKEN if set.
  app.use('/campaigns', requireAuth, buildCampaignsRouter(store));

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err: String(err) }, 'request error');
    res.status(err?.status ?? 500).json({ error: err?.message ?? 'internal error' });
  });

  app.listen(PORT, () => {
    logger.info({ port: PORT, authEnabled: Boolean(process.env.API_TOKEN) }, 'x-dm-engine listening');
  });

  // Background poller
  const tick = async () => {
    try {
      const result = await pollAllActiveCampaigns(store);
      if (result.campaigns > 0) {
        logger.info(result, 'poll cycle complete');
      }
    } catch (err) {
      logger.error({ err: String(err) }, 'poll cycle failed');
    }
  };
  setInterval(tick, POLL_INTERVAL_MS);
  // Run one poll shortly after startup
  setTimeout(tick, 5000);
}

main().catch((err) => {
  logger.error({ err: String(err) }, 'fatal startup error');
  process.exit(1);
});
