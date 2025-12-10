import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRealtimeIngestion } from '../lib/services/realtimeFetcher.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { results, skipped } = await runRealtimeIngestion();
    return res
      .status(200)
      .json({ success: true, count: results.length, results, skipped });
  } catch (error: any) {
    console.error('sync-jobs error', error);
    return res.status(500).json({ error: error?.message ?? 'Unknown error' });
  }
}
