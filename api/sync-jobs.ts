import type { VercelRequest, VercelResponse } from '@vercel/node';
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { fetchJobsViaPuppeteer } from '../lib/services/freeJobFetcher.js';
import { analyzeJobWithGemini } from '../lib/services/geminiProcessor.js';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jobs = await fetchJobsViaPuppeteer();
    const results: { link: string; status: 'created' | 'updated' }[] = [];

    for (const job of jobs) {
      const analysis = await analyzeJobWithGemini(job);

      const deadlineDate =
        analysis.deadline && analysis.deadline.trim()
          ? new Date(analysis.deadline)
          : null;

      const existing = await prisma.jobOpportunity.findUnique({
        where: { link: job.link },
        select: { id: true },
      });

      const upserted = await prisma.jobOpportunity.upsert({
        where: { link: job.link },
        create: {
          title: job.title,
          company: job.company,
          location: job.location ?? undefined,
          postedAt: job.postedAt ?? undefined,
          link: job.link,
          rawText: job.rawText,
          isPhD: analysis.isPhD,
          fundingType: analysis.fundingType,
          deadline: deadlineDate ?? undefined,
          tags: analysis.tags,
        },
        update: {
          title: job.title,
          company: job.company,
          location: job.location ?? undefined,
          postedAt: job.postedAt ?? undefined,
          rawText: job.rawText,
          isPhD: analysis.isPhD,
          fundingType: analysis.fundingType,
          deadline: deadlineDate ?? undefined,
          tags: analysis.tags,
        },
      });

      results.push({
        link: upserted.link,
        status: existing ? 'updated' : 'created',
      });
    }

    return res.status(200).json({ success: true, count: results.length, results });
  } catch (error: any) {
    console.error('sync-jobs error', error);
    return res.status(500).json({ error: error?.message ?? 'Unknown error' });
  } finally {
    await prisma.$disconnect();
  }
}
