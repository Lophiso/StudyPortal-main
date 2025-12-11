import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ingestion is now handled by the GitHub Actions hunter bot.
    // This endpoint is kept as a lightweight health/check trigger for the frontend.
    return res.status(200).json({ success: true, message: 'Job hunter is scheduled via GitHub Actions.' });
  } catch (error: any) {
    console.error('sync-jobs error', error);
    return res.status(500).json({ error: error?.message ?? 'Unknown error' });
  }
}
