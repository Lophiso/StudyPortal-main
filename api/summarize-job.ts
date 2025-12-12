import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

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

  if (!genAI || !geminiApiKey) {
    res.status(200).json({ summary: null });
    return;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.text();

    res.status(200).json({ summary: text });
  } catch (e) {
    console.error('[summarize-job] AI error', e);
    res.status(200).json({ summary: null });
  }
}
