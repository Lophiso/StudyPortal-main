import { canadaSupabase } from './db';

export async function runCanadaReaper() {
  const supabase = canadaSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('canada_opportunity')
    .update({ status: 'EXPIRED', status_reason: 'deadline_passed' })
    .not('deadline_date', 'is', null)
    .lt('deadline_date', today)
    .in('status', ['ACTIVE', 'NEEDS_REVIEW'])
    .select('id');

  if (error) throw new Error(error.message);

  return { expiredCount: data?.length ?? 0 };
}
