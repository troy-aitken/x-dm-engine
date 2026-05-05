import { logger } from './logger.js';

const TWEETS_URL = 'https://api.x.com/2/tweets';
const DM_URL = 'https://api.x.com/2/dm_conversations/with';
const SEARCH_URL = 'https://api.x.com/2/tweets/search/recent';

export type XUser = { id: string; username: string };

export async function getLikingUsers(
  tweetId: string,
  token: string,
  paginationToken?: string,
): Promise<{ users: XUser[]; nextToken: string | null }> {
  const params = new URLSearchParams({ 'user.fields': 'username' });
  if (paginationToken) params.set('pagination_token', paginationToken);

  const res = await fetch(`${TWEETS_URL}/${tweetId}/liking_users?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.warn({ status: res.status, body, tweetId }, 'getLikingUsers failed');
    return { users: [], nextToken: null };
  }

  const json: any = await res.json();
  const users = (json?.data ?? []).map((u: any) => ({
    id: u.id,
    username: u.username ?? 'unknown',
  }));
  const nextToken = json?.meta?.next_token ?? null;
  return { users, nextToken };
}

export async function getRepliers(
  tweetId: string,
  token: string,
): Promise<{ users: XUser[] }> {
  const query = `conversation_id:${tweetId} is:reply`;
  const params = new URLSearchParams({
    query,
    'tweet.fields': 'author_id',
    expansions: 'author_id',
    'user.fields': 'username',
    max_results: '100',
  });

  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.warn({ status: res.status, body, tweetId }, 'getRepliers failed');
    return { users: [] };
  }

  const json: any = await res.json();
  const includes = json?.includes?.users ?? [];
  const seen = new Set<string>();
  const users: XUser[] = [];
  for (const u of includes) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      users.push({ id: u.id, username: u.username ?? 'unknown' });
    }
  }
  return { users };
}

export async function sendDM(
  userId: string,
  message: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${DM_URL}/${userId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: message }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body}` };
  }
  return { ok: true };
}

export function extractTweetId(url: string): string | null {
  const m = url.match(/status\/(\d+)/);
  return m?.[1] ?? null;
}
