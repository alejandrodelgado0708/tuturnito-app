-- Ejecuta en Supabase SQL Editor
alter table public.team_members add column if not exists can_upload boolean default true;
alter table public.share_invites add column if not exists can_upload boolean default true;
update public.team_members set can_upload = true where can_upload is null;
update public.share_invites set can_upload = true where can_upload is null;
