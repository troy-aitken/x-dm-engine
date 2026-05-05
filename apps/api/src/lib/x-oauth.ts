import crypto from 'node:crypto';
import type { Store } from './store.js';

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';

export const X_SCOPES = [
  'tweet.read',
  'users.read',
  'like.read',
  'dm.read',
  'dm.write',
  'offline.access',
].join(' ');

const pendingAuth = new Map<string, { verifier: string; createdAt: number }>();

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function buildAuthUrl(state: string): string {
  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('X_CLIENT_ID / X_REDIRECT_URI not set');
  }

  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  pendingAuth.set(state, { verifier, createdAt: Date.now() });

  // Cleanup entries older than 10 min
  for (const [k, v] of pendingAuth) {
    if (Date.now() - v.createdAt > 600_000) pendingAuth.delete(k);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCode(code: string, verifier: string) {
  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const redirectUri = process.env.X_REDIRECT_URI!;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: clientId,
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`token refresh failed ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export async function handleCallback(
  store: Store,
  account: string,
  code: string,
  state: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = pendingAuth.get(state);
  if (!entry) return { ok: false, error: 'invalid or expired state' };
  pendingAuth.delete(state);
  try {
    const { access_token, refresh_token, expires_in } = await exchangeCode(
      code,
      entry.verifier,
    );
    await store.saveTokens({
      account,
      access: access_token,
      refresh: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? String(e) };
  }
}

export async function getValidAccessToken(store: Store, account: string): Promise<string> {
  const t = await store.getTokens(account);
  if (!t) {
    throw new Error(
      `No X tokens for account "${account}". Run \`npm run oauth -- ${account}\` to connect.`,
    );
  }
  // Refresh if expiring within 60s
  if (t.expiresAt - Date.now() < 60_000) {
    const fresh = await refreshAccessToken(t.refresh);
    await store.saveTokens({
      account,
      access: fresh.access_token,
      refresh: fresh.refresh_token,
      expiresAt: Date.now() + fresh.expires_in * 1000,
    });
    return fresh.access_token;
  }
  return t.access;
}
