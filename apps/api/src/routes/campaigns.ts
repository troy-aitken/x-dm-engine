import { Router } from 'express';
import { z } from 'zod';
import type { Store } from '../lib/store.js';
import {
  createCampaign,
  pollCampaign,
  resumeCampaign,
  stopCampaign,
} from '../lib/engine.js';

export function buildCampaignsRouter(store: Store): Router {
  const router = Router();

  router.post('/start', async (req, res, next) => {
    try {
      const body = z
        .object({
          tweetUrl: z.string().url(),
          dmMessage: z.string().min(1).max(1000),
          owner: z.string().min(1),
          campaignName: z.string().trim().min(1).max(120).optional(),
          durationDays: z.number().int().min(1).max(30).optional(),
        })
        .parse(req.body);

      const campaign = await createCampaign(store, body);
      res.json({ ok: true, campaign });
    } catch (err) {
      next(err);
    }
  });

  router.post('/stop/:id', async (req, res, next) => {
    try {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      await stopCampaign(store, id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/resume/:id', async (req, res, next) => {
    try {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      await resumeCampaign(store, id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (_req, res, next) => {
    try {
      const campaigns = await store.listAllCampaigns();
      res.json({ campaigns });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/log', async (req, res, next) => {
    try {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const log = await store.getDMLog(id);
      res.json({ log });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/poll', async (req, res, next) => {
    try {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const campaign = await store.getCampaign(id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const result = await pollCampaign(store, campaign);
      res.json({ ok: true, dmsSent: result.dmsSent });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
