-- Ejecuta en Supabase SQL Editor
create table if not exists public.public_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  slug text unique,
  token text unique not null default encode(gen_random_bytes(12),'hex'),
  created_at timestamptz default now(),
  unique(owner_id)
);
alter table public.public_links enable row level security;
drop policy if exists "public read" on public.public_links;
create policy "public read" on public.public_links for select using (true);
drop policy if exists "owner all" on public.public_links;
create policy "owner all" on public.public_links for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_public_links_slug on public.public_links(slug);
create index if not exists idx_public_links_token on public.public_links(token);
create index if not exists idx_public_links_owner on public.public_links(owner_id);
