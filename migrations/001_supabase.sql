-- Target schema for a future PostgreSQL storage adapter. Current executable uses SQLite.
begin;
create table creators (
 id bigint generated always as identity primary key,
 instagram_user_id text unique, username text not null unique check(username=lower(username)),
 profile_url text not null, payload jsonb not null, validation_status text not null default 'needs_review',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table creator_sources (
 id bigint generated always as identity primary key,creator_id bigint not null references creators on delete cascade,
 provider text not null,source_identifier text not null,permission_reference text not null,collected_at timestamptz not null default now()
);
create table creator_metrics (
 id bigint generated always as identity primary key,creator_id bigint not null references creators on delete cascade,
 followers_count bigint check(followers_count>=0), measured_at timestamptz not null default now(),data_source text not null
);
create table suppressions(username text primary key,instagram_user_id text);
create table ingestion_jobs (
 id bigint generated always as identity primary key,kind text not null,payload jsonb not null,status text not null default 'queued',
 processed integer not null default 0,inserted integer not null default 0,updated integer not null default 0,
 cancel_requested boolean not null default false,created_at timestamptz not null default now(),completed_at timestamptz,error text
);
create table logs(id bigint generated always as identity primary key,job_id bigint references ingestion_jobs,message text not null,created_at timestamptz not null default now());
create index sources_creator on creator_sources(creator_id);
create index metrics_creator on creator_metrics(creator_id,measured_at);
create index jobs_status on ingestion_jobs(status,created_at);
-- No browser/anonymous access to internal research data.
alter table creators enable row level security;
alter table creator_sources enable row level security;
alter table creator_metrics enable row level security;
alter table suppressions enable row level security;
alter table ingestion_jobs enable row level security;
alter table logs enable row level security;
commit;
