import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createServerSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey);
}
