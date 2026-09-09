-- Copia y pega esto en Supabase Dashboard > SQL Editor > Run

-- 1) team_members: tablero persistido
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  email text,
  role text check (role in ('own','all')) default 'own',
  shifts jsonb default '{}' not null,
  created_at timestamptz default now(),
  unique(owner_id, email)
);
alter table public.team_members enable row level security;
drop policy if exists "allow authenticated all" on public.team_members;
create policy "allow authenticated all" on public.team_members for all to authenticated using (true) with check (true);
create index if not exists idx_team_members_owner on public.team_members(owner_id);
create index if not exists idx_team_members_email on public.team_members(email);

-- 2) patch share_invites para link sin registro
alter table public.share_invites add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_share_invites_owner on public.share_invites(owner_id);
create index if not exists idx_share_invites_token on public.share_invites(token);

-- 3) opcional: limpia datos de prueba si querés
-- delete from public.team_members where email like '%demo.com';
