import { logger } from './logger.js';
import type { Campaign, Store } from './store.js';
import { getValidAccessToken } from './x-oauth.js';
import { extractTweetId, getLikingUsers, getRepliers, sendDM } from './x-api.js';

const DM_BATCH_LIMIT = Number(process.env.DM_BATCH_LIMIT ?? 5);

export function slugifyCampaignName(name: string, fallbackTweetId: string): string {
  const base = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const slug = base.length > 0 ? base : `x-dm-${fallbackTweetId}`;
  return slug.slice(0, 60);
}

export function tagUrlsWithUtm(text: string, params: Record<string, string>): string {
  if (!text) return text;
  return text.replace(/(https?:\/\/[^\s)]+[^\s).,;:!?])/g, (rawUrl) => {
    try {
      const u = new URL(rawUrl);
      for (const [k, v] of Object.entries(params)) {
        if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
      }
      return u.toString();
    } catch {
      return rawUrl;
    }
  });
}

export async function createCampaign(
  store: Store,
  args: {
    tweetUrl: string;
    dmMessage: string;
    owner: string;
    campaignName?: string;
    durationDays?: number;
  },
): Promise<Campaign> {
  const { tweetUrl, dmMessage, owner } = args;
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) throw new Error('Could not extract tweet ID from URL');

  const name = (args.campaignName?.trim() || `DM Campaign: ${tweetId}`).slice(0, 120);
  const durationDays = Number.isFinite(args.durationDays)
    ? Math.max(1, args.durationDays!)
    : 7;
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  return store.createCampaign({
    name,
    tweetId,
    tweetUrl,
    dmMessage,
    status: 'Active',
    owner,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    totalDMsSent: 0,
    likersPaginationToken: null,
  });
}

export async function pollCampaign(
  store: Store,
  campaign: Campaign,
): Promise<{ dmsSent: number }> {
  let dmsSent = 0;

  const token = await getValidAccessToken(store, campaign.owner);
  const alreadyDMed = await store.getDMedUserIds(campaign.id);

  const newEngagers: { id: string; username: string; type: 'like' | 'reply' }[] = [];

  // Likers
  const likers = await getLikingUsers(
    campaign.tweetId,
    token,
    campaign.likersPaginationToken ?? undefined,
  );
  for (const u of likers.users) {
    if (!alreadyDMed.has(u.id)) {
      newEngagers.push({ ...u, type: 'like' });
    }
  }
  if (likers.nextToken !== campaign.likersPaginationToken) {
    await store.updateCampaign(campaign.id, {
      likersPaginationToken: likers.nextToken,
    });
  }

  // Repliers
  const repliers = await getRepliers(campaign.tweetId, token);
  for (const u of repliers.users) {
    if (!alreadyDMed.has(u.id) && !newEngagers.some((e) => e.id === u.id)) {
      newEngagers.push({ ...u, type: 'reply' });
    }
  }

  // Send (respect batch limit)
  const batch = newEngagers.slice(0, DM_BATCH_LIMIT);
  const utmCampaign = slugifyCampaignName(campaign.name, campaign.tweetId);
  for (let i = 0; i < batch.length; i++) {
    const engager = batch[i];
    const tagged = tagUrlsWithUtm(campaign.dmMessage, {
      utm_source: 'x',
      utm_medium: 'dm',
      utm_campaign: utmCampaign,
      utm_content: engager.type,
    });
    const result = await sendDM(engager.id, tagged, token);
    const logStatus: 'sent' | 'failed' | 'skipped' = result.ok
      ? 'sent'
      : result.error?.includes('403')
        ? 'skipped'
        : 'failed';

    await store.logDM({
      campaignId: campaign.id,
      userId: engager.id,
      username: engager.username,
      engagementType: engager.type,
      dmStatus: logStatus,
      dmSentAt: new Date().toISOString(),
    });

    if (result.ok) dmsSent++;
    else
      logger.warn(
        { userId: engager.id, username: engager.username, error: result.error },
        'DM failed',
      );

    if (i < batch.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (dmsSent > 0) {
    await store.updateCampaign(campaign.id, {
      totalDMsSent: campaign.totalDMsSent + dmsSent,
    });
  }

  return { dmsSent };
}

export async function pollAllActiveCampaigns(
  store: Store,
): Promise<{ campaigns: number; totalDMs: number; autoExpired: number }> {
  let totalDMs = 0;
  let autoExpired = 0;
  try {
    const campaigns = await store.listActiveCampaigns();
    if (campaigns.length === 0) {
      return { campaigns: 0, totalDMs: 0, autoExpired: 0 };
    }

    const now = Date.now();
    for (const campaign of campaigns) {
      try {
        if (campaign.expiresAt && new Date(campaign.expiresAt).getTime() < now) {
          await store.updateCampaign(campaign.id, { status: 'Done' });
          autoExpired++;
          logger.info(
            { campaignId: campaign.id, name: campaign.name },
            'campaign auto-expired',
          );
          continue;
        }
        const result = await pollCampaign(store, campaign);
        totalDMs += result.dmsSent;
      } catch (err) {
        logger.error({ campaignId: campaign.id, err: String(err) }, 'pollCampaign error');
      }
    }
    return { campaigns: campaigns.length, totalDMs, autoExpired };
  } catch (err) {
    logger.error({ err: String(err) }, 'pollAllActiveCampaigns error');
    return { campaigns: 0, totalDMs: 0, autoExpired: 0 };
  }
}

export async function stopCampaign(store: Store, id: string) {
  await store.updateCampaign(id, { status: 'Paused' });
}

export async function resumeCampaign(store: Store, id: string) {
  await store.updateCampaign(id, { status: 'Active' });
}
