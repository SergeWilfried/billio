-- ============================================================
-- Billio — onboarding data migration
-- Adds invoice-default columns to organizations and a
-- pending_invitations table for team-invite step.
-- ============================================================

-- Invoice defaults on organizations
alter table public.organizations
  add column if not exists inv_prefix           text not null default 'INV-',
  add column if not exists inv_next_number      text not null default '0001',
  add column if not exists payment_terms        text not null default 'Net 14 jours',
  add column if not exists default_tax_rate     numeric(5,2) not null default 18,
  add column if not exists default_pay_method   text not null default 'Mobile Money (MTN / Orange / Wave)',
  add column if not exists invoice_footer       text not null default '';

-- Pending team invitations (email → org, role, status)
create table if not exists public.pending_invitations (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references public.organizations on delete cascade,
  email      text        not null,
  role       text        not null default 'member'
               check (role in ('owner', 'admin', 'member', 'accountant', 'observer')),
  invited_by uuid        references auth.users on delete set null,
  status     text        not null default 'pending'
               check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (org_id, email)
);

alter table public.pending_invitations enable row level security;

create policy "invitations: members can read own org"
  on public.pending_invitations for select
  using (org_id in (select public.my_org_ids()));

create policy "invitations: admins/owners can insert"
  on public.pending_invitations for insert
  with check (org_id in (select public.my_org_ids()));

create policy "invitations: admins/owners can delete"
  on public.pending_invitations for delete
  using (org_id in (select public.my_org_ids()));
