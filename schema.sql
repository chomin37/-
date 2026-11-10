-- ABLE GYM START 28 / Supabase SQL Editor (run once)
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 member_no text unique not null,
 display_name text not null default '회원',
 role text not null default 'member' check (role in ('member','admin')),
 frequency integer not null default 2 check (frequency in (2,3,4)),
 created_at timestamptz not null default now()
);
create table if not exists public.workouts (
 id bigint generated always as identity primary key,
 frequency integer not null check (frequency in (2,3,4)),
 week integer not null check (week between 1 and 4),
 day integer not null check (day between 1 and 4),
 day_name text not null,
 weekday integer not null check (weekday between 0 and 6),
 exercises jsonb not null default '[]'::jsonb,
 unique(frequency,week,day)
);
create table if not exists public.workout_logs (
 id bigint generated always as identity primary key,
 member_id uuid not null references public.profiles(id) on delete cascade,
 workout_id bigint not null references public.workouts(id) on delete cascade,
 attended boolean not null default false,
 completed boolean not null default false,
 performed_on date not null default current_date,
 updated_at timestamptz not null default now(),
 unique(member_id,workout_id)
);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
create or replace function public.new_user_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,member_no,display_name)
 values(new.id, split_part(new.email,'@',1), coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'회원'));
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.new_user_profile();
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_logs enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists workouts_read on public.workouts;
create policy workouts_read on public.workouts for select to authenticated using (true);
drop policy if exists workouts_admin_insert on public.workouts;
create policy workouts_admin_insert on public.workouts for insert to authenticated with check ((select public.is_admin()));
drop policy if exists workouts_admin_update on public.workouts;
create policy workouts_admin_update on public.workouts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists workouts_admin_delete on public.workouts;
create policy workouts_admin_delete on public.workouts for delete to authenticated using ((select public.is_admin()));
drop policy if exists logs_read on public.workout_logs;
create policy logs_read on public.workout_logs for select to authenticated using (member_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists logs_insert on public.workout_logs;
create policy logs_insert on public.workout_logs for insert to authenticated with check (member_id = (select auth.uid()));
drop policy if exists logs_update on public.workout_logs;
create policy logs_update on public.workout_logs for update to authenticated using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
-- Initial shared workout plans (modifiable in admin UI)
insert into public.workouts(frequency,week,day,day_name,weekday,exercises)
select f, w, d,
 case when f=4 then (array['상체 A','하체 A','상체 B','하체 B'])[d] else (array['전신 A','전신 B','전신 C'])[d] end,
 case when f=2 then (array[1,4])[d] when f=3 then (array[1,3,5])[d] else (array[1,2,4,5])[d] end,
 case when f=4 and d in (2,4) then
 '[{"name":"사이클","sets":1,"reps":"7분"},{"name":"레그프레스","sets":2,"reps":"12회"},{"name":"레그컬","sets":2,"reps":"12회"},{"name":"힙어브덕션","sets":2,"reps":"15회"},{"name":"트레드밀","sets":1,"reps":"10분"}]'::jsonb
 when f=4 then
 '[{"name":"트레드밀","sets":1,"reps":"7분"},{"name":"체스트프레스","sets":2,"reps":"12회"},{"name":"랫풀다운","sets":2,"reps":"12회"},{"name":"시티드로우","sets":2,"reps":"12회"},{"name":"사이클","sets":1,"reps":"10분"}]'::jsonb
 else
 '[{"name":"트레드밀 걷기","sets":1,"reps":"7분"},{"name":"레그프레스","sets":2,"reps":"12회"},{"name":"체스트프레스","sets":2,"reps":"12회"},{"name":"랫풀다운","sets":2,"reps":"12회"},{"name":"사이클","sets":1,"reps":"10분"}]'::jsonb end
from (values(2),(3),(4)) fs(f)
cross join generate_series(1,4) ws(w)
cross join lateral generate_series(1,fs.f) ds(d)
on conflict(frequency,week,day) do nothing;
-- IMPORTANT: After signing up your manager account, promote ONLY that account manually:
-- update public.profiles set role='admin' where member_no='YOUR_ADMIN_NUMBER';
