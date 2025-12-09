import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ScrapedJob } from './freeJobFetcher';

export interface GeminiJobAnalysis {
  isPhD: boolean;
  fundingType: string;
  deadline: string | null; // ISO date or null
  tags: string[];
}

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set – Gemini analysis will fail.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function analyzeJobWithGemini(
  job: ScrapedJob
): Promise<GeminiJobAnalysis> {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash-latest',
  });

  const prompt = `
You are analyzing a job or academic opportunity.

Job data:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'N/A'}
Posted: ${job.postedAt ?? 'N/A'}
Link: ${job.link}

Text:
${job.rawText}

Return ONLY a JSON object with this exact shape:

{
  "isPhD": boolean,
  "fundingType": string,        // e.g. "Fully funded", "Salary", "Stipend", "Unknown"
  "deadline": string | null,    // ISO date YYYY-MM-DD or null if not clear
  "tags": string[]              // 3-6 short tags like ["Computer Science","AI","Italy"]
}

Rules:
- If the position is clearly a PhD/doctoral program, isPhD = true.
- If no deadline is mentioned, deadline = null.
- If funding/salary is unclear, fundingType = "Unknown".
- Output must be valid JSON with double quotes and no trailing commas.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: Partial<GeminiJobAnalysis>;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse Gemini JSON: ' + text);
    parsed = JSON.parse(match[0]);
  }

  return {
    isPhD: Boolean(parsed.isPhD),
    fundingType: parsed.fundingType ?? 'Unknown',
    deadline: parsed.deadline ?? null,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}
