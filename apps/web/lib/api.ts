'use client';

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
};

export type DMLogEntry = {
  campaignId: string;
  userId: string;
  username: string;
  engagementType: 'like' | 'reply';
  dmStatus: 'sent' | 'failed' | 'skipped';
  dmSentAt: string;
};

function config() {
  if (typeof window === 'undefined') return { api: '', token: '' };
  return {
    api: (localStorage.getItem('xdm_api') ?? '').replace(/\/$/, ''),
    token: localStorage.getItem('xdm_token') ?? '',
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { api, token } = config();
  if (!api) throw new Error('Not connected. Go back to /');
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${api}${path}`, { ...init, headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/';
    throw new Error('Unauthorized');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const api = {
  listCampaigns: () => request<{ campaigns: Campaign[] }>('/campaigns'),
  startCampaign: (body: {
    tweetUrl: string;
    dmMessage: string;
    owner: string;
    campaignName?: string;
    durationDays?: number;
  }) =>
    request<{ ok: true; campaign: Campaign }>('/campaigns/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  stopCampaign: (id: string) =>
    request<{ ok: true }>(`/campaigns/stop/${id}`, { method: 'POST' }),
  resumeCampaign: (id: string) =>
    request<{ ok: true }>(`/campaigns/resume/${id}`, { method: 'POST' }),
  pollCampaign: (id: string) =>
    request<{ ok: true; dmsSent: number }>(`/campaigns/${id}/poll`, {
      method: 'POST',
    }),
  getLog: (id: string) => request<{ log: DMLogEntry[] }>(`/campaigns/${id}/log`),
};
