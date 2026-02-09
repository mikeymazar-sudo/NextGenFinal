// Run SQL migrations against Supabase using the supabase-js client
// The service role key + supabase-js can execute SQL via the built-in rpc

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4MDI3MCwiZXhwIjoyMDg1ODU2MjcwfQ.nVQOe_48V7ybCxZgwObT9VxEBdW0_mXlxjqYZ8jKZDQ';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

// Step 1: Bootstrap - create an exec_sql function using REST API directly
async function bootstrap() {
  console.log('🔧 Bootstrapping SQL executor function...');

  // Use the REST API to call a raw SQL function
  // First, let's try creating it via the PostgREST SQL endpoint
  const bootstrapSQL = `
    create or replace function exec_sql(query text)
    returns json as $$
    begin
      execute query;
      return json_build_object('success', true);
    exception when others then
      return json_build_object('success', false, 'error', SQLERRM);
    end;
    $$ language plpgsql security definer;
  `;

  // Try using the special pg-meta endpoint
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ query: 'SELECT 1' }),
  });

  if (res.ok) {
    console.log('✅ exec_sql function already exists');
    return true;
  }

  // Function doesn't exist yet - we need another way to create it
  console.log('ℹ️  exec_sql not found. Need to create it first.');
  console.log('');
  console.log('Please run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor):');
  console.log('');
  console.log(bootstrapSQL);
  console.log('');
  console.log('Then re-run this script.');
  return false;
}

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

// Migration 1: Teams
const M1 = `
create extension if not exists "uuid-ossp";

create table if not exists public.teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  slug text unique not null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.teams enable row level security;
`;

const M1_POLICIES = `
drop policy if exists "Team members can view their team" on public.teams;
create policy "Team members can view their team"
  on public.teams for select
  using (
    id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Team owners can update their team" on public.teams;
create policy "Team owners can update their team"
  on public.teams for update
  using (owner_id = auth.uid());
`;

// Migration 2: Profiles
const M2 = `
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  role text check (role in ('admin', 'agent')) default 'agent',
  team_id uuid references public.teams(id) on delete set null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
`;

const M2_POLICIES = `
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can view team members" on public.profiles;
create policy "Users can view team members"
  on public.profiles for select
  using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);
`;

// Migration 3: Properties
const M3 = `
create table if not exists public.properties (
  id uuid default uuid_generate_v4() primary key,
  address text not null,
  city text,
  state text,
  zip text,
  list_price numeric,
  bedrooms integer,
  bathrooms numeric,
  sqft integer,
  year_built integer,
  lot_size numeric,
  property_type text,
  status text check (status in ('new', 'hot', 'cold', 'archived')) default 'new',
  owner_name text,
  owner_phone text[],
  raw_attom_data jsonb,
  rental_data jsonb,
  rental_fetched_at timestamptz,
  ai_analysis jsonb,
  ai_analyzed_at timestamptz,
  created_by uuid references public.profiles(id),
  team_id uuid references public.teams(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(address, city, state, zip)
);

alter table public.properties enable row level security;

create index if not exists idx_properties_address on public.properties(address, city, state, zip);
create index if not exists idx_properties_team on public.properties(team_id);
create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_properties_created on public.properties(created_at desc);
`;

const M3_POLICIES = `
drop policy if exists "Users can read own or team properties" on public.properties;
create policy "Users can read own or team properties"
  on public.properties for select
  to authenticated
  using (
    created_by = auth.uid()
    OR
    team_id in (
      select team_id from public.profiles where id = auth.uid() and team_id is not null
    )
  );

drop policy if exists "Authenticated users can insert properties" on public.properties;
create policy "Authenticated users can insert properties"
  on public.properties for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Users can update own or team properties" on public.properties;
create policy "Users can update own or team properties"
  on public.properties for update
  to authenticated
  using (
    created_by = auth.uid()
    OR (
      team_id in (
        select team_id from public.profiles
        where id = auth.uid() and team_id is not null and role = 'admin'
      )
    )
  );
`;

// Migration 4: Contacts
const M4 = `
create table if not exists public.contacts (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id) on delete cascade,
  name text,
  phone_numbers text[],
  emails text[],
  raw_batchdata_response jsonb,
  created_at timestamptz default now()
);

alter table public.contacts enable row level security;
`;

const M4_POLICIES = `
drop policy if exists "Users can read contacts on accessible properties" on public.contacts;
create policy "Users can read contacts on accessible properties"
  on public.contacts for select
  to authenticated
  using (
    property_id in (
      select id from public.properties
      where created_by = auth.uid()
      OR team_id in (
        select team_id from public.profiles where id = auth.uid() and team_id is not null
      )
    )
  );

drop policy if exists "Authenticated users can insert contacts" on public.contacts;
create policy "Authenticated users can insert contacts"
  on public.contacts for insert
  to authenticated
  with check (true);
`;

// Migration 5: Calls
const M5 = `
create table if not exists public.calls (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id),
  contact_id uuid references public.contacts(id),
  caller_id uuid references public.profiles(id),
  twilio_call_sid text unique,
  from_number text,
  to_number text,
  status text,
  duration integer,
  recording_url text,
  notes text,
  created_at timestamptz default now(),
  ended_at timestamptz
);

alter table public.calls enable row level security;

create index if not exists idx_calls_caller on public.calls(caller_id, created_at desc);
create index if not exists idx_calls_property on public.calls(property_id);
`;

const M5_POLICIES = `
drop policy if exists "Users can read their calls" on public.calls;
create policy "Users can read their calls"
  on public.calls for select
  to authenticated
  using (caller_id = auth.uid());

drop policy if exists "Users can insert calls" on public.calls;
create policy "Users can insert calls"
  on public.calls for insert
  to authenticated
  with check (caller_id = auth.uid());

drop policy if exists "Users can update their calls" on public.calls;
create policy "Users can update their calls"
  on public.calls for update
  to authenticated
  using (caller_id = auth.uid());
`;

// Migration 6: Notes
const M6 = `
create table if not exists public.notes (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.notes enable row level security;

create index if not exists idx_notes_property on public.notes(property_id, created_at desc);
`;

const M6_POLICIES = `
drop policy if exists "Users can read notes on accessible properties" on public.notes;
create policy "Users can read notes on accessible properties"
  on public.notes for select
  to authenticated
  using (
    property_id in (
      select id from public.properties
      where created_by = auth.uid()
      OR team_id in (
        select team_id from public.profiles where id = auth.uid() and team_id is not null
      )
    )
  );

drop policy if exists "Users can insert notes on accessible properties" on public.notes;
create policy "Users can insert notes on accessible properties"
  on public.notes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    AND property_id in (
      select id from public.properties
      where created_by = auth.uid()
      OR team_id in (
        select team_id from public.profiles where id = auth.uid() and team_id is not null
      )
    )
  );
`;

// Migration 7: Communication Logs
const M7 = `
create table if not exists public.communication_logs (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  type text check (type in ('email', 'call', 'sms')) not null,
  direction text check (direction in ('inbound', 'outbound')) default 'outbound',
  subject text,
  content text,
  recipient text,
  status text,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table public.communication_logs enable row level security;

create index if not exists idx_comm_logs_property on public.communication_logs(property_id, created_at desc);
`;

const M7_POLICIES = `
drop policy if exists "Users can read communication logs on accessible properties" on public.communication_logs;
create policy "Users can read communication logs on accessible properties"
  on public.communication_logs for select
  to authenticated
  using (
    property_id in (
      select id from public.properties
      where created_by = auth.uid()
      OR team_id in (
        select team_id from public.profiles where id = auth.uid() and team_id is not null
      )
    )
  );

drop policy if exists "Users can insert communication logs" on public.communication_logs;
create policy "Users can insert communication logs"
  on public.communication_logs for insert
  to authenticated
  with check (auth.uid() = user_id);
`;

// Migration 8: Activity Log
const M8 = `
create table if not exists public.activity_log (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_value text,
  new_value text,
  metadata jsonb,
  created_at timestamptz default now()
);

create or replace function public.log_property_status_change()
returns trigger as $$
begin
  if OLD.status is distinct from NEW.status then
    insert into public.activity_log (property_id, user_id, action, old_value, new_value)
    values (NEW.id, auth.uid(), 'status_change', OLD.status, NEW.status);
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_property_status_change on public.properties;
create trigger on_property_status_change
  after update on public.properties
  for each row execute procedure public.log_property_status_change();

alter table public.activity_log enable row level security;

create index if not exists idx_activity_property on public.activity_log(property_id, created_at desc);
`;

const M8_POLICIES = `
drop policy if exists "Users can read activity on accessible properties" on public.activity_log;
create policy "Users can read activity on accessible properties"
  on public.activity_log for select
  to authenticated
  using (
    property_id in (
      select id from public.properties
      where created_by = auth.uid()
      OR team_id in (
        select team_id from public.profiles where id = auth.uid() and team_id is not null
      )
    )
  );
`;

// Migration 9: Rate Limiting
const M9 = `
create table if not exists public.api_usage (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  endpoint text not null,
  called_at timestamptz default now()
);

create index if not exists idx_api_usage_user_endpoint on public.api_usage(user_id, endpoint, called_at);

create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_calls integer,
  p_window_minutes integer
)
returns boolean as $$
declare
  call_count integer;
begin
  select count(*) into call_count
  from public.api_usage
  where user_id = p_user_id
    and endpoint = p_endpoint
    and called_at > now() - (p_window_minutes || ' minutes')::interval;

  return call_count < p_max_calls;
end;
$$ language plpgsql security definer;
`;

// Migration 10: Lead Lists and Properties Updates
const M10 = `
-- Create lead_lists table for organizing imports
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
-- Update status constraint to new values
alter table public.properties drop constraint if exists properties_status_check;

alter table public.properties 
  add constraint properties_status_check 
  check (status in ('new', 'warm', 'reach_out', 'closed'));

-- Migrate existing status values
update public.properties set status = 'warm' where status = 'hot';
update public.properties set status = 'reach_out' where status = 'cold';
update public.properties set status = 'closed' where status = 'archived';

-- Add new columns
alter table public.properties 
  add column if not exists follow_up_date date,
  add column if not exists priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  add column if not exists status_changed_at timestamptz default now(),
  add column if not exists list_id uuid references public.lead_lists(id) on delete set null;

-- Add indexes
create index if not exists idx_properties_follow_up on public.properties(follow_up_date asc nulls last);
create index if not exists idx_properties_list on public.properties(list_id);
create index if not exists idx_properties_priority on public.properties(priority);
`;


const migrations = [
  { sql: M1, label: 'Migration 1: Teams (table)' },
  { sql: M2, label: 'Migration 2: Profiles (table + trigger)' },
  { sql: M1_POLICIES, label: 'Migration 1b: Teams (policies)' },
  { sql: M2_POLICIES, label: 'Migration 2b: Profiles (policies)' },
  { sql: M3, label: 'Migration 3: Properties (table + indexes)' },
  { sql: M3_POLICIES, label: 'Migration 3b: Properties (policies)' },
  { sql: M4, label: 'Migration 4: Contacts (table)' },
  { sql: M4_POLICIES, label: 'Migration 4b: Contacts (policies)' },
  { sql: M5, label: 'Migration 5: Calls (table + indexes)' },
  { sql: M5_POLICIES, label: 'Migration 5b: Calls (policies)' },
  { sql: M6, label: 'Migration 6: Notes (table + index)' },
  { sql: M6_POLICIES, label: 'Migration 6b: Notes (policies)' },
  { sql: M7, label: 'Migration 7: Communication Logs (table + index)' },
  { sql: M7_POLICIES, label: 'Migration 7b: Communication Logs (policies)' },
  { sql: M8, label: 'Migration 8: Activity Log (table + trigger + index)' },
  { sql: M8_POLICIES, label: 'Migration 8b: Activity Log (policies)' },
  { sql: M9, label: 'Migration 9: Rate Limiting (table + function)' },
  { sql: M10, label: 'Migration 10: Lead Lists (table + index)' },
  { sql: M10_POLICIES, label: 'Migration 10b: Lead Lists (policies)' },
  { sql: M11, label: 'Migration 11: Properties Updates (status, columns, indexes)' },
];

async function main() {
  console.log('🚀 Starting database migrations...\n');

  // Check if exec_sql exists
  const canRun = await bootstrap();
  if (!canRun) {
    process.exit(1);
  }

  for (const { sql, label } of migrations) {
    const success = await runSQL(sql, label);
    if (!success) {
      console.error(`\n💥 Migration failed at: ${label}. Stopping.`);
      process.exit(1);
    }
  }

  console.log('\n🎉 All 11 migrations completed successfully!');

  // Verify tables exist
  console.log('\n📋 Verifying tables...');
  const tables = ['teams', 'profiles', 'properties', 'contacts', 'calls', 'notes', 'communication_logs', 'activity_log', 'api_usage', 'lead_lists'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(0);
    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}`);
    }
  }
}

main().catch(console.error);
