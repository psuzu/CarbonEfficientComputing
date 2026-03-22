alter table public.jobs
  add column if not exists carbon_baseline numeric,
  add column if not exists carbon_optimized numeric,
  add column if not exists scheduled_start integer,
  add column if not exists workload_class text,
  add column if not exists source_archive text,
  add column if not exists file_bytes bigint;

with curve(hour_idx, intensity) as (
  values
    (0, 420::numeric), (1, 410::numeric), (2, 395::numeric), (3, 380::numeric),
    (4, 370::numeric), (5, 365::numeric), (6, 370::numeric), (7, 385::numeric),
    (8, 400::numeric), (9, 420::numeric), (10, 430::numeric), (11, 425::numeric),
    (12, 410::numeric), (13, 390::numeric), (14, 360::numeric), (15, 330::numeric),
    (16, 300::numeric), (17, 280::numeric), (18, 265::numeric), (19, 260::numeric),
    (20, 270::numeric), (21, 290::numeric), (22, 320::numeric), (23, 360::numeric),
    (24, 400::numeric), (25, 410::numeric), (26, 395::numeric), (27, 375::numeric),
    (28, 360::numeric), (29, 355::numeric), (30, 360::numeric), (31, 380::numeric),
    (32, 400::numeric), (33, 415::numeric), (34, 425::numeric), (35, 420::numeric),
    (36, 405::numeric), (37, 385::numeric), (38, 355::numeric), (39, 325::numeric),
    (40, 295::numeric), (41, 275::numeric), (42, 260::numeric), (43, 255::numeric),
    (44, 265::numeric), (45, 285::numeric), (46, 315::numeric), (47, 355::numeric)
),
jobs_to_fill as (
  select
    j.id,
    greatest(0, least(47, floor(coalesce(j.submit_hour, 0))::int)) as hour_index,
    greatest(1, coalesce(j.runtime_hours, 0))::int as runtime_hours,
    greatest(1, coalesce(j.requested_cpus, 0))::numeric as requested_cpus,
    case lower(coalesce(j.flexibility_class, 'semi-flexible'))
      when 'rigid' then 0
      when 'flexible' then 24
      else 6
    end as max_delay
  from public.jobs j
  where j.carbon_baseline is null
     or j.carbon_optimized is null
     or j.scheduled_start is null
),
baseline as (
  select
    j.id,
    round((j.requested_cpus * 0.15 * j.runtime_hours) * avg(c.intensity), 1) as baseline_co2_g
  from jobs_to_fill j
  join curve c
    on c.hour_idx >= j.hour_index
   and c.hour_idx < least(j.hour_index + j.runtime_hours, 48)
  group by j.id, j.requested_cpus, j.runtime_hours
),
candidate_windows as (
  select
    j.id,
    gs.start_hour,
    avg(c.intensity) as avg_intensity
  from jobs_to_fill j
  join lateral generate_series(j.hour_index, least(j.hour_index + j.max_delay, 47)) as gs(start_hour)
    on true
  join curve c
    on c.hour_idx >= gs.start_hour
   and c.hour_idx < gs.start_hour + j.runtime_hours
  where gs.start_hour + j.runtime_hours <= 48
  group by j.id, gs.start_hour, j.runtime_hours
),
best_window as (
  select distinct on (id)
    id,
    start_hour,
    avg_intensity
  from candidate_windows
  order by id, avg_intensity asc, start_hour asc
),
computed as (
  select
    j.id,
    b.baseline_co2_g,
    round((j.requested_cpus * 0.15 * j.runtime_hours) * bw.avg_intensity, 1) as optimized_co2_g,
    bw.start_hour as scheduled_start
  from jobs_to_fill j
  join baseline b
    on b.id = j.id
  join best_window bw
    on bw.id = j.id
)
update public.jobs as target
set
  carbon_baseline = computed.baseline_co2_g,
  carbon_optimized = computed.optimized_co2_g,
  scheduled_start = computed.scheduled_start
from computed
where target.id = computed.id;

select
  id,
  job_id,
  submit_hour,
  requested_cpus,
  runtime_hours,
  flexibility_class,
  scheduled_start,
  carbon_baseline,
  carbon_optimized
from public.jobs
order by created_at desc nulls last, id desc
limit 25;
