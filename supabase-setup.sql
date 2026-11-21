-- Marianville registration schema for Supabase. Run in Supabase SQL Editor.
-- All registration data is private. Policies authorize each student to their own row;
-- administrators are identified by trusted Supabase Auth app_metadata.role = 'admin'.

create table if not exists public.registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique,
  student_name text not null default '',
  form_data jsonb not null default '{}'::jsonb,
  receipt_path text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registrations enable row level security;

create or replace function public.is_school_admin()
returns boolean
language sql stable
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) $$;

drop policy if exists "Student and admin can read registrations" on public.registrations;
create policy "Student and admin can read registrations"
on public.registrations for select to authenticated
using (user_id = (select auth.uid()) or public.is_school_admin());

drop policy if exists "Student can create own registration" on public.registrations;
create policy "Student can create own registration"
on public.registrations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and lower(student_id) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
  and not public.is_school_admin()
);

drop policy if exists "Student can update own registration" on public.registrations;
create policy "Student can update own registration"
on public.registrations for update to authenticated
using (user_id = (select auth.uid()) and not public.is_school_admin())
with check (
  user_id = (select auth.uid())
  and lower(student_id) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
  and not public.is_school_admin()
);

-- Private receipt bucket. File size and MIME restrictions are enforced by Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fee-receipts', 'fee-receipts', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'];

drop policy if exists "Student/admin read fee receipts" on storage.objects;
create policy "Student/admin read fee receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'fee-receipts'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_school_admin()
  )
);

drop policy if exists "Student upload own fee receipts" on storage.objects;
create policy "Student upload own fee receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
);

drop policy if exists "Student replace own fee receipts" on storage.objects;
create policy "Student replace own fee receipts"
on storage.objects for update to authenticated
using (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
)
with check (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
);

drop policy if exists "Student delete own fee receipts" on storage.objects;
create policy "Student delete own fee receipts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
);
