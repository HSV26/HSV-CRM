-- HotelStory CRM: Website Lead Ingestion Migration & RLS Policies
-- Safe to run multiple times (idempotent).

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_name text,
  hotel_name text,
  email text,
  phone text,
  website_or_city text,
  service_interest text,
  message text,
  lead_source text not null default 'Manual',
  pipeline_stage text not null default 'New Lead',
  is_unread boolean not null default true
);

-- Add requested columns if upgrading an existing HotelStory CRM `leads` table
alter table public.leads
  add column if not exists contact_name text,
  add column if not exists hotel_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists website_or_city text,
  add column if not exists service_interest text,
  add column if not exists message text,
  add column if not exists lead_source text default 'Manual',
  add column if not exists pipeline_stage text default 'New Lead',
  add column if not exists is_unread boolean default true;

-- Backfill newly added columns from legacy CRM columns if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'business_name'
  ) then
    update public.leads
    set
      contact_name = coalesce(contact_name, full_name),
      hotel_name = coalesce(hotel_name, business_name),
      website_or_city = coalesce(website_or_city, city, landing_page),
      service_interest = coalesce(service_interest, interested_in),
      lead_source = coalesce(nullif(lead_source, ''), nullif(source, ''), 'Manual'),
      pipeline_stage = coalesce(
        nullif(pipeline_stage, ''),
        case
          when status is null or lower(status) = 'new' then 'New Lead'
          else status
        end
      ),
      is_unread = coalesce(is_unread, case when is_read is false then true else false end)
    where
      contact_name is null
      or hotel_name is null
      or website_or_city is null
      or service_interest is null
      or lead_source is null
      or pipeline_stage is null
      or is_unread is null;
  end if;
end
$$;

-- Helpful indexes for filtering, ordering, and unread counts
create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_lead_source on public.leads (lead_source);
create index if not exists idx_leads_pipeline_stage on public.leads (pipeline_stage);
create index if not exists idx_leads_is_unread on public.leads (is_unread) where is_unread = true;

-- Enable Row Level Security (RLS)
alter table public.leads enable row level security;

drop policy if exists "Allow CRM read leads" on public.leads;
drop policy if exists "Allow CRM insert leads" on public.leads;
drop policy if exists "Allow CRM update leads" on public.leads;
drop policy if exists "Allow CRM delete leads" on public.leads;

-- If your CRM uses Supabase Auth login, change `to anon, authenticated` to `to authenticated`.
create policy "Allow CRM read leads"
  on public.leads
  for select
  to anon, authenticated
  using (true);

create policy "Allow CRM insert leads"
  on public.leads
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow CRM update leads"
  on public.leads
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Allow CRM delete leads"
  on public.leads
  for delete
  to anon, authenticated
  using (true);

-- Enable Supabase Realtime broadcasts for public.leads
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end
$$;
