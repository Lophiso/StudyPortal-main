import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

export async function GET(request: Request) {
  const url = new URL(request.url);

  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type');

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_URL and SUPABASE_KEY must be set' },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('JobOpportunity')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  }

  const job = data as any;

  const groqApiKey = process.env.GROQ_API_KEY || '';
  if (!groqApiKey) {
    return NextResponse.json({ summary: null }, { status: 200 });
  }

  const groq = new Groq({ apiKey: groqApiKey });

  try {
    const kindLabel = type === 'PHD' ? 'PhD / doctoral position' : 'job opportunity';

    const prompt = `You are helping summarize a ${kindLabel} for a student-facing portal.
Return the answer strictly in Markdown.

Do NOT include a title heading or restate the job title as a header. Start immediately with the paragraph.

Write:
1) A short paragraph (3-5 sentences) covering: focus, institution/employer, location, and key requirements.
2) Then a Markdown bullet list with 3-5 bullets of the most important details.

Title: ${job.full_title || job.title}
Company/Institution: ${job.company}
Location: ${job.city}, ${job.country}
Description: ${job.description}
Requirements: ${(job.requirements || []).join(' | ')}`;

    const completion = await groq.chat.completions.create({
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

    return NextResponse.json({ summary: text }, { status: 200 });
  } catch (e) {
    console.error('[summarize-job] AI error', e);
    return NextResponse.json({ summary: null }, { status: 200 });
  }
}
