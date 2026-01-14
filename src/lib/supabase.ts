import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const resolvedUrl = supabaseUrl || 'http://localhost:54321';
const resolvedAnonKey = supabaseAnonKey || 'public-anon-key-not-configured';

export const supabase = createClient<Database>(resolvedUrl, resolvedAnonKey);
