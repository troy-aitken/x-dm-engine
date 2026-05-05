export type StoredTokens = {
  account: string;
  access: string;
  refresh: string;
  expiresAt: number;
};

export type Campaign = {
  id: string;
  name: string;
  tweetId: string;
  tweetUrl: string;
  dmMessage: string;
  status: 'Active' | 'Paused' | 'Done';
  owner: string;
  startedAt: string;
  expiresAt: string | null;
  totalDMsSent: number;
  likersPaginationToken: string | null;
};

export type DMLogEntry = {
  campaignId: string;
  userId: string;
  username: string;
  engagementType: 'like' | 'reply';
  dmStatus: 'sent' | 'failed' | 'skipped';
  dmSentAt: string;
};

export interface Store {
  // Tokens
  getTokens(account: string): Promise<StoredTokens | null>;
  saveTokens(t: StoredTokens): Promise<void>;

  // Campaigns
  createCampaign(c: Omit<Campaign, 'id'>): Promise<Campaign>;
  updateCampaign(id: string, patch: Partial<Campaign>): Promise<void>;
  getCampaign(id: string): Promise<Campaign | null>;
  listActiveCampaigns(): Promise<Campaign[]>;
  listAllCampaigns(): Promise<Campaign[]>;

  // DM log
  logDM(entry: DMLogEntry): Promise<void>;
  getDMedUserIds(campaignId: string): Promise<Set<string>>;
  getDMLog(campaignId: string, limit?: number): Promise<DMLogEntry[]>;
}
