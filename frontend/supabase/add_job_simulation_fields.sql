alter table public.jobs
  add column if not exists complexity_class text default 'HIGH',
  add column if not exists scheduled_end integer,
  add column if not exists scheduled_at timestamptz,
  add column if not exists simulation_duration_seconds integer,
  add column if not exists simulation_start_time timestamptz,
  add column if not exists simulation_end_time timestamptz,
  add column if not exists completed_at timestamptz;

update public.jobs
set complexity_class = upper(coalesce(complexity_class, 'HIGH'))
where complexity_class is null
   or upper(complexity_class) not in ('HIGH', 'LOW');

alter table public.jobs
  alter column complexity_class set default 'HIGH';

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_complexity_status_idx on public.jobs (complexity_class, status);
