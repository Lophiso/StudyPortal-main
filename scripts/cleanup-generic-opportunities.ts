import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TITLE_PATTERNS = [
  'privacy policy',
  'terms & conditions',
  'terms and conditions',
  'contact us',
  'create an account',
  'create account',
  'my account',
  'cookie',
  'cookie settings',
  'cookie preferences',
  'impostazioni dei cookie',
  'data protection',
  'disclaimer',
  'sitemap',
  'accessibility',
  'skip to main content',
  'job sorting option',
  'create alert',
  'direct employer',
  'australian dollars',
  'south australia',
  'western australia',
  'new south wales',
];

async function runCleanup() {
  console.log('[cleanup] starting generic opportunities cleanup');

  const orFilter = TITLE_PATTERNS.map((p) => `title.ilike.%${p}%`).join(',');

  const { data, error } = await supabase
    .from('JobOpportunity')
    .delete()
    .or(orFilter)
    .select('id, title, source');

  if (error) {
    console.error('[cleanup] delete error', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`[cleanup] deleted ${data?.length ?? 0} rows`);
  if (data && data.length > 0) {
    for (const row of data) {
      console.log('-', row.id, '|', row.title, '|', row.source);
    }
  }

  console.log('[cleanup] done');
}

runCleanup().catch((e) => {
  console.error('[cleanup] fatal error', e);
  process.exitCode = 1;
});
