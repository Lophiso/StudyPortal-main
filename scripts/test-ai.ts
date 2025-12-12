import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function main() {
  const key = process.env.GEMINI_API_KEY;
  console.log('Checking Key:', key ? 'Present' : 'MISSING');

  if (!key) {
    console.error('GEMINI_API_KEY is missing. Set it in your environment or .env file.');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Hello, are you working?' }] }],
    });

    console.log('AI response text:');
    console.log(res.response.text());
    console.log('Full response object:');
    console.dir(res, { depth: null });
  } catch (err: any) {
    console.error('Gemini test failed. Full error:');
    console.error(err);
    if (err instanceof Error) {
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
    }
  }
}

main().catch((e) => {
  console.error('Fatal error in test-ai script:', e);
  process.exitCode = 1;
});
