import type { Store } from './store.js';
import { NotionStore } from './store-notion.js';
import { JsonStore } from './store-json.js';

export function buildStore(): Store {
  const backend = (process.env.STORE_BACKEND ?? 'notion').toLowerCase();

  if (backend === 'json') {
    return new JsonStore(process.env.JSON_DATA_DIR ?? './data');
  }

  if (backend === 'notion') {
    const apiKey = process.env.NOTION_API_KEY;
    const tokensDbId = process.env.NOTION_TOKENS_DB_ID;
    const campaignsDbId = process.env.NOTION_CAMPAIGNS_DB_ID;
    const dmLogDbId = process.env.NOTION_DM_LOG_DB_ID;
    if (!apiKey || !tokensDbId || !campaignsDbId || !dmLogDbId) {
      throw new Error(
        'Notion store: NOTION_API_KEY, NOTION_TOKENS_DB_ID, NOTION_CAMPAIGNS_DB_ID, and NOTION_DM_LOG_DB_ID are all required. Run `npm run setup-notion` first.',
      );
    }
    return new NotionStore({ apiKey, tokensDbId, campaignsDbId, dmLogDbId });
  }

  throw new Error(`Unknown STORE_BACKEND: ${backend}. Use "notion" or "json".`);
}
