import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Campaign, DMLogEntry, Store, StoredTokens } from './store.js';

type FileShape = {
  tokens: Record<string, StoredTokens>;
  campaigns: Record<string, Campaign>;
  dmLog: DMLogEntry[];
};

const empty: FileShape = { tokens: {}, campaigns: {}, dmLog: [] };

export class JsonStore implements Store {
  private file: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir = './data') {
    this.file = path.resolve(dataDir, 'x-dm-engine.json');
  }

  private async read(): Promise<FileShape> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...empty, ...parsed };
    } catch (err: any) {
      if (err.code === 'ENOENT') return { ...empty };
      throw err;
    }
  }

  private async write(data: FileShape): Promise<void> {
    // Serialize writes to avoid clobber
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(data, null, 2), 'utf-8');
    });
    return this.writeQueue;
  }

  async getTokens(account: string): Promise<StoredTokens | null> {
    const data = await this.read();
    return data.tokens[account] ?? null;
  }

  async saveTokens(t: StoredTokens): Promise<void> {
    const data = await this.read();
    data.tokens[t.account] = t;
    await this.write(data);
  }

  async createCampaign(c: Omit<Campaign, 'id'>): Promise<Campaign> {
    const data = await this.read();
    const id = crypto.randomUUID();
    const campaign: Campaign = { ...c, id };
    data.campaigns[id] = campaign;
    await this.write(data);
    return campaign;
  }

  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<void> {
    const data = await this.read();
    const c = data.campaigns[id];
    if (!c) return;
    data.campaigns[id] = { ...c, ...patch };
    await this.write(data);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const data = await this.read();
    return data.campaigns[id] ?? null;
  }

  async listActiveCampaigns(): Promise<Campaign[]> {
    const data = await this.read();
    return Object.values(data.campaigns).filter((c) => c.status === 'Active');
  }

  async listAllCampaigns(): Promise<Campaign[]> {
    const data = await this.read();
    return Object.values(data.campaigns).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  async logDM(entry: DMLogEntry): Promise<void> {
    const data = await this.read();
    data.dmLog.push(entry);
    await this.write(data);
  }

  async getDMedUserIds(campaignId: string): Promise<Set<string>> {
    const data = await this.read();
    return new Set(
      data.dmLog
        .filter((e) => e.campaignId === campaignId && e.dmStatus !== 'failed')
        .map((e) => e.userId),
    );
  }

  async getDMLog(campaignId: string, limit = 100): Promise<DMLogEntry[]> {
    const data = await this.read();
    return data.dmLog
      .filter((e) => e.campaignId === campaignId)
      .sort((a, b) => b.dmSentAt.localeCompare(a.dmSentAt))
      .slice(0, limit);
  }
}
