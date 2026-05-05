import { Client } from '@notionhq/client';
import type { Campaign, DMLogEntry, Store, StoredTokens } from './store.js';

function rt(prop: any): string {
  return (prop?.rich_text ?? []).map((r: any) => r.plain_text).join('');
}
function title(prop: any): string {
  return (prop?.title ?? []).map((r: any) => r.plain_text).join('');
}

export class NotionStore implements Store {
  private notion: Client;
  private tokensDb: string;
  private campaignsDb: string;
  private dmLogDb: string;

  constructor(opts: {
    apiKey: string;
    tokensDbId: string;
    campaignsDbId: string;
    dmLogDbId: string;
  }) {
    this.notion = new Client({ auth: opts.apiKey });
    this.tokensDb = opts.tokensDbId;
    this.campaignsDb = opts.campaignsDbId;
    this.dmLogDb = opts.dmLogDbId;
  }

  async getTokens(account: string): Promise<StoredTokens | null> {
    const result = await this.notion.databases.query({
      database_id: this.tokensDb,
      filter: { property: 'Account', rich_text: { equals: account } },
      page_size: 1,
    });
    const row = (result.results as any[])[0];
    if (!row) return null;
    const p = row.properties ?? {};
    const access = rt(p.AccessToken);
    const refresh = rt(p.RefreshToken);
    const expiresAt = p.ExpiresAt?.date?.start
      ? new Date(p.ExpiresAt.date.start).getTime()
      : 0;
    if (!access || !refresh) return null;
    return { account, access, refresh, expiresAt };
  }

  async saveTokens(t: StoredTokens): Promise<void> {
    const existing = await this.notion.databases.query({
      database_id: this.tokensDb,
      filter: { property: 'Account', rich_text: { equals: t.account } },
      page_size: 1,
    });
    const row = (existing.results as any[])[0];
    const properties: any = {
      Name: { title: [{ type: 'text', text: { content: t.account } }] },
      Account: { rich_text: [{ type: 'text', text: { content: t.account } }] },
      AccessToken: { rich_text: [{ type: 'text', text: { content: t.access } }] },
      RefreshToken: { rich_text: [{ type: 'text', text: { content: t.refresh } }] },
      ExpiresAt: { date: { start: new Date(t.expiresAt).toISOString() } },
      UpdatedAt: { date: { start: new Date().toISOString() } },
    };
    if (row) {
      await this.notion.pages.update({ page_id: row.id, properties });
    } else {
      await this.notion.pages.create({
        parent: { database_id: this.tokensDb },
        properties,
      });
    }
  }

  async createCampaign(c: Omit<Campaign, 'id'>): Promise<Campaign> {
    const page = await this.notion.pages.create({
      parent: { database_id: this.campaignsDb },
      properties: {
        Name: { title: [{ type: 'text', text: { content: c.name } }] },
        TweetId: { rich_text: [{ type: 'text', text: { content: c.tweetId } }] },
        TweetURL: { url: c.tweetUrl },
        DMMessage: { rich_text: [{ type: 'text', text: { content: c.dmMessage } }] },
        Status: { select: { name: c.status } },
        Owner: { rich_text: [{ type: 'text', text: { content: c.owner } }] },
        StartedAt: { date: { start: c.startedAt } },
        ExpiresAt: c.expiresAt ? { date: { start: c.expiresAt } } : { date: null },
        TotalDMsSent: { number: c.totalDMsSent },
      } as any,
    });
    return { ...c, id: page.id };
  }

  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
    const properties: any = {};
    if (patch.status) properties.Status = { select: { name: patch.status } };
    if (patch.totalDMsSent !== undefined)
      properties.TotalDMsSent = { number: patch.totalDMsSent };
    if (patch.likersPaginationToken !== undefined)
      properties.LikersPaginationToken = {
        rich_text: patch.likersPaginationToken
          ? [{ type: 'text', text: { content: patch.likersPaginationToken } }]
          : [],
      };
    if (Object.keys(properties).length === 0) return;
    await this.notion.pages.update({ page_id: id, properties });
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    try {
      const page = await this.notion.pages.retrieve({ page_id: id });
      return rowToCampaign(page);
    } catch {
      return null;
    }
  }

  async listActiveCampaigns(): Promise<Campaign[]> {
    const result = await this.notion.databases.query({
      database_id: this.campaignsDb,
      filter: { property: 'Status', select: { equals: 'Active' } },
    });
    return (result.results as any[]).map(rowToCampaign);
  }

  async listAllCampaigns(): Promise<Campaign[]> {
    const result = await this.notion.databases.query({
      database_id: this.campaignsDb,
      sorts: [{ property: 'StartedAt', direction: 'descending' }],
      page_size: 50,
    });
    return (result.results as any[]).map(rowToCampaign);
  }

  async logDM(entry: DMLogEntry): Promise<void> {
    await this.notion.pages.create({
      parent: { database_id: this.dmLogDb },
      properties: {
        Name: { title: [{ type: 'text', text: { content: `@${entry.username}` } }] },
        CampaignId: { rich_text: [{ type: 'text', text: { content: entry.campaignId } }] },
        UserId: { rich_text: [{ type: 'text', text: { content: entry.userId } }] },
        Username: { rich_text: [{ type: 'text', text: { content: entry.username } }] },
        EngagementType: { select: { name: entry.engagementType } },
        DMSentAt: { date: { start: entry.dmSentAt } },
        DMStatus: { select: { name: entry.dmStatus } },
      } as any,
    });
  }

  async getDMedUserIds(campaignId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    let cursor: string | undefined = undefined;
    do {
      const result: any = await this.notion.databases.query({
        database_id: this.dmLogDb,
        filter: {
          and: [
            { property: 'CampaignId', rich_text: { equals: campaignId } },
            { property: 'DMStatus', select: { does_not_equal: 'failed' } },
          ],
        },
        start_cursor: cursor,
        page_size: 100,
      });
      for (const row of result.results as any[]) {
        ids.add(rt(row.properties?.UserId));
      }
      cursor = result.has_more ? result.next_cursor : undefined;
    } while (cursor);
    return ids;
  }

  async getDMLog(campaignId: string, limit = 100): Promise<DMLogEntry[]> {
    const result = await this.notion.databases.query({
      database_id: this.dmLogDb,
      filter: { property: 'CampaignId', rich_text: { equals: campaignId } },
      sorts: [{ property: 'DMSentAt', direction: 'descending' }],
      page_size: limit,
    });
    return (result.results as any[]).map((row: any) => {
      const p = row.properties ?? {};
      return {
        campaignId,
        userId: rt(p.UserId),
        username: rt(p.Username),
        engagementType: (p.EngagementType?.select?.name ?? 'like') as 'like' | 'reply',
        dmStatus: (p.DMStatus?.select?.name ?? 'failed') as 'sent' | 'failed' | 'skipped',
        dmSentAt: p.DMSentAt?.date?.start ?? '',
      };
    });
  }
}

function rowToCampaign(row: any): Campaign {
  const p = row.properties ?? {};
  return {
    id: row.id,
    name: title(p.Name),
    tweetId: rt(p.TweetId),
    tweetUrl: p.TweetURL?.url ?? '',
    dmMessage: rt(p.DMMessage),
    status: (p.Status?.select?.name ?? 'Active') as Campaign['status'],
    owner: rt(p.Owner),
    startedAt: p.StartedAt?.date?.start ?? '',
    expiresAt: p.ExpiresAt?.date?.start ?? null,
    totalDMsSent: p.TotalDMsSent?.number ?? 0,
    likersPaginationToken: rt(p.LikersPaginationToken) || null,
  };
}
