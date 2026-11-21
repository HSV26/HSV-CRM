-- HotelStory CRM: Contracts Table & RLS Policies
-- Safe to run multiple times (idempotent).

create extension if not exists pgcrypto;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contract_number text not null unique,
  client_id uuid references public.clients(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  business_name text not null,
  contact_name text,
  client_designation text,
  client_email text,
  client_phone text,
  client_address text,
  business_type text,
  contract_date date not null default current_date,
  start_date date not null,
  term_type text not null default 'month-to-month',
  term_months integer,
  renewal_date date,
  package text not null default 'Growth',
  deliverables jsonb not null default '[]'::jsonb,
  monthly_fee numeric not null default 0,
  setup_fee numeric default 0,
  discount numeric default 0,
  gst_enabled boolean not null default true,
  gst_percent numeric not null default 18,
  payment_terms text,
  notice_period_days integer not null default 15,
  governing_law text not null default 'Mumbai, Maharashtra, India',
  clauses jsonb not null default '[]'::jsonb,
  status text not null default 'Draft',
  sent_at timestamptz,
  signed_at date,
  terminated_at date,
  notes text
);

-- Indexes for filtering, joins, and renewal tracking
create index if not exists idx_contracts_created_at on public.contracts (created_at desc);
create index if not exists idx_contracts_client_id on public.contracts (client_id);
create index if not exists idx_contracts_proposal_id on public.contracts (proposal_id);
create index if not exists idx_contracts_status on public.contracts (status);
create index if not exists idx_contracts_renewal_date on public.contracts (renewal_date);

-- Auto-update updated_at timestamp on edits
create or replace function public.set_contracts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contracts_updated_at on public.contracts;
create trigger trg_contracts_updated_at
  before update on public.contracts
  for each row
  execute function public.set_contracts_updated_at();

-- Enable Row Level Security & grant CRM access (matching proposals table access)
alter table public.contracts enable row level security;

grant select, insert, update, delete on table public.contracts to anon, authenticated;

drop policy if exists "Allow CRM read contracts" on public.contracts;
drop policy if exists "Allow CRM insert contracts" on public.contracts;
drop policy if exists "Allow CRM update contracts" on public.contracts;
drop policy if exists "Allow CRM delete contracts" on public.contracts;

create policy "Allow CRM read contracts"
  on public.contracts
  for select
  to anon, authenticated
  using (true);

create policy "Allow CRM insert contracts"
  on public.contracts
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow CRM update contracts"
  on public.contracts
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Allow CRM delete contracts"
  on public.contracts
  for delete
  to anon, authenticated
  using (true);
