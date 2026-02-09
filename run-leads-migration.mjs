// Run only the new lead_lists and properties updates migrations
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4MDI3MCwiZXhwIjoyMDg1ODU2MjcwfQ.nVQOe_48V7ybCxZgwObT9VxEBdW0_mXlxjqYZ8jKZDQ';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'public' }
});

async function runSQL(sql, label) {
    console.log(`\n🔄 Running: ${label}...`);
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.error(`❌ ${label} failed:`, error.message);
        return false;
    }

    if (data && data.success === false) {
        console.error(`❌ ${label} SQL error:`, data.error);
        return false;
    }

    console.log(`✅ ${label} completed`);
    return true;
}

// Migration 10: Lead Lists Table
const M10 = `
create table if not exists public.lead_lists (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  created_by uuid references public.profiles(id),
  team_id uuid references public.teams(id),
  created_at timestamptz default now()
);

alter table public.lead_lists enable row level security;

create index if not exists idx_lead_lists_created_by on public.lead_lists(created_by);
`;

const M10_POLICIES = `
drop policy if exists "Users can read own or team lead lists" on public.lead_lists;
create policy "Users can read own or team lead lists"
  on public.lead_lists for select
  to authenticated
  using (
    created_by = auth.uid()
    OR team_id in (
      select team_id from public.profiles where id = auth.uid() and team_id is not null
    )
  );

drop policy if exists "Authenticated users can insert lead lists" on public.lead_lists;
create policy "Authenticated users can insert lead lists"
  on public.lead_lists for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Users can delete own lead lists" on public.lead_lists;
create policy "Users can delete own lead lists"
  on public.lead_lists for delete
  to authenticated
  using (created_by = auth.uid());
`;

// Migration 11: Update properties with new columns
const M11 = `
alter table public.properties drop constraint if exists properties_status_check;

alter table public.properties 
  add constraint properties_status_check 
  check (status in ('new', 'warm', 'reach_out', 'closed'));

update public.properties set status = 'warm' where status = 'hot';
update public.properties set status = 'reach_out' where status = 'cold';
update public.properties set status = 'closed' where status = 'archived';

alter table public.properties 
  add column if not exists follow_up_date date,
  add column if not exists priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  add column if not exists status_changed_at timestamptz default now(),
  add column if not exists list_id uuid references public.lead_lists(id) on delete set null;

create index if not exists idx_properties_follow_up on public.properties(follow_up_date asc nulls last);
create index if not exists idx_properties_list on public.properties(list_id);
create index if not exists idx_properties_priority on public.properties(priority);
`;

const migrations = [
    { sql: M10, label: 'Lead Lists (table + index)' },
    { sql: M10_POLICIES, label: 'Lead Lists (policies)' },
    { sql: M11, label: 'Properties Updates (status, columns, indexes)' },
];

async function main() {
    console.log('🚀 Running leads overhaul migrations...\n');

    for (const { sql, label } of migrations) {
        const success = await runSQL(sql, label);
        if (!success) {
            console.error(`\n💥 Migration failed at: ${label}. Stopping.`);
            process.exit(1);
        }
    }

    console.log('\n🎉 Leads overhaul migrations completed successfully!');

    // Verify lead_lists table
    const { data, error } = await supabase.from('lead_lists').select('*').limit(0);
    if (error) {
        console.log(`\n❌ lead_lists table: ${error.message}`);
    } else {
        console.log(`\n✅ lead_lists table verified`);
    }

    // Verify new columns on properties
    const { data: props, error: propsErr } = await supabase
        .from('properties')
        .select('id, follow_up_date, priority, status_changed_at, list_id')
        .limit(1);

    if (propsErr) {
        console.log(`❌ properties columns: ${propsErr.message}`);
    } else {
        console.log(`✅ properties new columns verified`);
    }
}

main().catch(console.error);
