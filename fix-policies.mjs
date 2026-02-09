import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4MDI3MCwiZXhwIjoyMDg1ODU2MjcwfQ.nVQOe_48V7ybCxZgwObT9VxEBdW0_mXlxjqYZ8jKZDQ';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

async function runSQL(sql, label) {
  console.log(`🔄 ${label}...`);
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error(`❌ ${label} failed:`, error.message);
    return false;
  }
  if (data && data.success === false) {
    console.error(`❌ ${label} SQL error:`, data.error);
    return false;
  }
  console.log(`✅ ${label}`);
  return true;
}

async function main() {
  console.log('🔧 Fixing RLS policies...\n');

  // Fix 1: Create a security definer function to get team_id without recursion
  await runSQL(`
    create or replace function public.get_my_team_id()
    returns uuid as $$
      select team_id from public.profiles where id = auth.uid()
    $$ language sql security definer stable;
  `, 'Create get_my_team_id() function');

  // Fix 2: Drop the recursive "Users can view team members" policy and recreate it
  await runSQL(`
    drop policy if exists "Users can view team members" on public.profiles;
    create policy "Users can view team members"
      on public.profiles for select
      using (
        team_id is not null
        and team_id = public.get_my_team_id()
      );
  `, 'Fix profiles team members policy');

  // Fix 3: Also fix the teams policy that references profiles
  await runSQL(`
    drop policy if exists "Team members can view their team" on public.teams;
    create policy "Team members can view their team"
      on public.teams for select
      using (
        id = public.get_my_team_id()
      );
  `, 'Fix teams view policy');

  // Verify by querying profiles
  console.log('\n📋 Verifying fix...');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .limit(5);

  if (error) {
    console.error('❌ Profiles query still failing:', error.message);
  } else {
    console.log(`✅ Profiles query works. Found ${data.length} profile(s).`);
  }

  console.log('\n🎉 Done!');
}

main().catch(console.error);
