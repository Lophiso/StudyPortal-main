import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const CANDIDATE_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-001',
  'gemini-1.0-pro',
  'gemini-pro',
  'gemini-1.5-pro',
];

async function main() {
  const key = process.env.GEMINI_API_KEY;
  console.log('Checking Key:', key ? 'Present' : 'MISSING');

  if (!key) {
    console.error('GEMINI_API_KEY is missing. Set it in your environment or .env file.');
    return;
  }

  const genAI = new GoogleGenerativeAI(key);

  for (const modelName of CANDIDATE_MODELS) {
    console.log(`\n=== Testing model: ${modelName} ===`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      });
      const text = res.response.text();
      console.log('SUCCESS: Found working model:', modelName);
      console.log('Sample response:', text);
      return;
    } catch (err: any) {
      console.error(`Failed: ${modelName}`);
      console.error(err?.message ?? err);
    }
  }

  console.error('No working model found from candidate list.');
}

main().catch((e) => {
  console.error('Fatal error in find-model script:', e);
  process.exitCode = 1;
});
