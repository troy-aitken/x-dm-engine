/**
 * Local OAuth flow — connects an X account and stores tokens in your configured store.
 *
 * Usage: npm run oauth -- <account_label>
 *   <account_label> is just a string you'll reference when starting campaigns.
 *   Use the X handle, your email, or any unique label you'll remember.
 *
 * Requires X_REDIRECT_URI to be set to http://localhost:8787/callback (or whatever
 * port you set in PORT) AND that exact URL to be registered in your X app settings.
 */
import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { buildStore } from '../src/lib/store-factory.js';
import { buildAuthUrl, handleCallback } from '../src/lib/x-oauth.js';

const account = process.argv[2];
if (!account) {
  console.error('Usage: npm run oauth -- <account_label>');
  console.error('Example: npm run oauth -- buzzlead_io');
  process.exit(1);
}

const redirectUri = process.env.X_REDIRECT_URI;
if (!redirectUri) {
  console.error('X_REDIRECT_URI not set in .env');
  process.exit(1);
}
const callbackUrl = new URL(redirectUri);
const port = Number(callbackUrl.port || 8787);

const store = buildStore();
const state = crypto.randomBytes(16).toString('hex');
const authUrl = buildAuthUrl(state);

const server = http.createServer(async (req, res) => {
  if (!req.url) return;
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== callbackUrl.pathname) {
    res.writeHead(404);
    res.end();
    return;
  }
  const code = url.searchParams.get('code');
  const cbState = url.searchParams.get('state');
  if (!code || !cbState) {
    res.writeHead(400);
    res.end('Missing code or state');
    return;
  }
  const result = await handleCallback(store, account, code, cbState);
  if (!result.ok) {
    res.writeHead(500);
    res.end(`OAuth failed: ${result.error}`);
    console.error('OAuth failed:', result.error);
    server.close();
    process.exit(1);
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    `<html><body style="font-family:sans-serif;padding:2rem"><h2>X connected for "${account}"</h2><p>You can close this window.</p></body></html>`,
  );
  console.log(`\n✓ Tokens saved for account "${account}".`);
  console.log(`You can now start campaigns with owner="${account}".\n`);
  server.close();
  process.exit(0);
});

server.listen(port, () => {
  console.log(`\nListening on ${callbackUrl.origin} for OAuth callback...\n`);
  console.log('Open this URL in your browser to authorize:\n');
  console.log(`  ${authUrl}\n`);
});
