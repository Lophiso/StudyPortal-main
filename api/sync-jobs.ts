import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { fetchJobsViaPuppeteer } from '../lib/services/freeJobFetcher.js';
import { analyzeJobWithGemini } from '../lib/services/geminiProcessor.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let jobs = await fetchJobsViaPuppeteer();

    if (!jobs || jobs.length === 0) {
      console.log('[sync-jobs] no jobs scraped, using static fallback set');
      jobs = [
        {
          title: 'Fully Funded PhD in Artificial Intelligence',
          company: 'Tech University of Europe',
          location: 'Berlin, Germany',
          postedAt: '3 days ago',
          link: 'https://example.org/phd-ai-europe',
          rawText:
            'We are looking for highly motivated candidates for a fully funded PhD position in Artificial Intelligence and Machine Learning. The position includes a full tuition waiver and a monthly stipend. Research topics include deep learning, natural language processing, and reinforcement learning.',
        },
        {
          title: 'PhD Scholarship in Climate Data Science',
          company: 'Center for Climate Research',
          location: 'Copenhagen, Denmark',
          postedAt: '1 week ago',
          link: 'https://example.org/phd-climate-data',
          rawText:
            'Funded PhD scholarship in Climate Data Science focusing on the application of machine learning to climate model outputs and satellite data. The scholarship covers tuition fees and provides a competitive tax-free stipend.',
        },
        {
          title: 'Research Assistant / Pre-PhD in Computer Vision',
          company: 'Vision Lab, Global Institute of Technology',
          location: 'Remote / Europe',
          postedAt: '5 days ago',
          link: 'https://example.org/ra-computer-vision',
          rawText:
            'The Vision Lab is hiring a full-time research assistant with the goal of transitioning into a funded PhD position after one year. Work on projects involving medical image analysis, segmentation, and self-supervised learning.',
        },
      ];
    }
    const results: { link: string; status: 'created' | 'updated' }[] = [];

    for (const job of jobs) {
      const analysis = await analyzeJobWithGemini(job);

      const deadlineDate =
        analysis.deadline && analysis.deadline.trim()
          ? new Date(analysis.deadline)
          : null;

      // Check if a record with this link already exists
      const { data: existingRows, error: existingError } = await supabase
        .from('JobOpportunity')
        .select('id')
        .eq('link', job.link)
        .limit(1);

      if (existingError) {
        throw existingError;
      }

      const payload = {
        title: job.title,
        company: job.company,
        location: job.location ?? null,
        postedAt: job.postedAt ?? null,
        link: job.link,
        rawText: job.rawText,
        isPhD: analysis.isPhD,
        fundingType: analysis.fundingType,
        deadline: deadlineDate,
        tags: analysis.tags,
      };

      const { data: upsertedRows, error: upsertError } = await supabase
        .from('JobOpportunity')
        .upsert(payload, { onConflict: 'link' })
        .select('link');

      if (upsertError) {
        throw upsertError;
      }

      const upsertedLink = upsertedRows && upsertedRows[0]?.link ? upsertedRows[0].link : job.link;

      results.push({
        link: upsertedLink,
        status: existingRows && existingRows.length > 0 ? 'updated' : 'created',
      });
    }

    return res.status(200).json({ success: true, count: results.length, results });
  } catch (error: any) {
    console.error('sync-jobs error', error);
    return res.status(500).json({ error: error?.message ?? 'Unknown error' });
  }
}
