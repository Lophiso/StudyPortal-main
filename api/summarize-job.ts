import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  const type = typeof req.query.type === 'string' ? req.query.type : null;

  if (!id) {
    res.status(400).json({ error: 'Missing id parameter' });
    return;
  }

  const { data, error } = await supabase
    .from('JobOpportunity')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Opportunity not found' });
    return;
  }

  const job = data as any;

  try {
    const kindLabel = type === 'PHD' ? 'PhD / doctoral position' : 'job opportunity';

    const prompt = `You are helping summarize a ${kindLabel} for a student-facing portal.
Summarize the opportunity in a short paragraph (3-5 sentences) that covers:
- research / role focus
- institution or employer
- location
- any key requirements or background

Then list 3-5 concise bullet points with the most important details.

Title: ${job.title}
Company/Institution: ${job.company}
Location: ${job.city}, ${job.country}
Description: ${job.description}
Requirements: ${(job.requirements || []).join(' | ')}`;

    const completion = await groq.chat.completions.create({
      // Use a current Groq Llama 3.1 chat model.
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that writes clear, student-friendly summaries of academic and industry opportunities.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 512,
    });

    const text = completion.choices?.[0]?.message?.content || null;

    res.status(200).json({ summary: text });
  } catch (e) {
    console.error('[summarize-job] AI error', e);
    res.status(200).json({ summary: null });
  }
}
