import type { Database } from '../../../src/lib/database.types';
import { createServerSupabaseClient } from '../../../src/lib/supabaseServer';

export function canadaSupabase() {
  return createServerSupabaseClient();
}

export type CanadaOpportunityRow = Database['public']['Tables']['canada_opportunity']['Row'];
export type CanadaOpportunityInsert = Database['public']['Tables']['canada_opportunity']['Insert'];
export type CanadaOpportunityUpdate = Database['public']['Tables']['canada_opportunity']['Update'];

export type CanadaSourceRow = Database['public']['Tables']['canada_sources']['Row'];
export type CanadaFetchLogInsert = Database['public']['Tables']['canada_fetch_logs']['Insert'];
export type CanadaSeedStatsRow = Database['public']['Tables']['canada_seed_stats']['Row'];
