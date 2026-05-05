/**
 * One-time setup: creates three Notion databases under NOTION_PARENT_PAGE_ID.
 *   1. X Tokens         — OAuth tokens (one row per X account)
 *   2. DM Campaigns     — active auto-DM campaigns per tweet
 *   3. DM Log           — every DM attempt (deduplication + audit)
 *
 * Usage: npm run setup-notion
 * Then paste the printed IDs into your .env (or Railway variables).
 */
import 'dotenv/config';
import { Client } from '@notionhq/client';

const apiKey = process.env.NOTION_API_KEY;
const parent = process.env.NOTION_PARENT_PAGE_ID;
if (!apiKey) throw new Error('NOTION_API_KEY not set');
if (!parent) throw new Error('NOTION_PARENT_PAGE_ID not set');

const notion = new Client({ auth: apiKey });

async function main() {
  console.log('Creating "X Tokens" DB...');
  const tokens = await notion.databases.create({
    parent: { type: 'page_id', page_id: parent! },
    title: [{ type: 'text', text: { content: 'X Tokens' } }],
    properties: {
      Name: { title: {} },
      Account: { rich_text: {} },
      AccessToken: { rich_text: {} },
      RefreshToken: { rich_text: {} },
      ExpiresAt: { date: {} },
      UpdatedAt: { date: {} },
    } as any,
  });
  console.log(`  X Tokens → ${tokens.id}`);

  console.log('Creating "DM Campaigns" DB...');
  const campaigns = await notion.databases.create({
    parent: { type: 'page_id', page_id: parent! },
    title: [{ type: 'text', text: { content: 'DM Campaigns' } }],
    properties: {
      Name: { title: {} },
      TweetId: { rich_text: {} },
      TweetURL: { url: {} },
      DMMessage: { rich_text: {} },
      Status: {
        select: {
          options: [{ name: 'Active' }, { name: 'Paused' }, { name: 'Done' }],
        },
      },
      Owner: { rich_text: {} },
      StartedAt: { date: {} },
      ExpiresAt: { date: {} },
      TotalDMsSent: { number: {} },
      LikersPaginationToken: { rich_text: {} },
    } as any,
  });
  console.log(`  DM Campaigns → ${campaigns.id}`);

  console.log('Creating "DM Log" DB...');
  const log = await notion.databases.create({
    parent: { type: 'page_id', page_id: parent! },
    title: [{ type: 'text', text: { content: 'DM Log' } }],
    properties: {
      Name: { title: {} },
      CampaignId: { rich_text: {} },
      UserId: { rich_text: {} },
      Username: { rich_text: {} },
      EngagementType: {
        select: { options: [{ name: 'like' }, { name: 'reply' }] },
      },
      DMSentAt: { date: {} },
      DMStatus: {
        select: {
          options: [{ name: 'sent' }, { name: 'failed' }, { name: 'skipped' }],
        },
      },
    } as any,
  });
  console.log(`  DM Log → ${log.id}`);

  console.log('\n>>> ADD THESE TO YOUR .env (and Railway variables) <<<');
  console.log(`NOTION_TOKENS_DB_ID=${tokens.id}`);
  console.log(`NOTION_CAMPAIGNS_DB_ID=${campaigns.id}`);
  console.log(`NOTION_DM_LOG_DB_ID=${log.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
