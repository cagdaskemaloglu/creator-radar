create table research_runs (
 job_id bigint primary key references ingestion_jobs(id), settings jsonb not null,
 page_requests integer not null default 0, started_at timestamptz not null, finished_at timestamptz,
 stop_reason text
);
create table research_candidates (
 id bigint generated always as identity primary key,job_id bigint not null references research_runs(job_id),
 url text not null,depth integer not null default 0,status text not null default 'pending',attempts integer not null default 0,
 profile_data jsonb, outcome text,category text,fit_score integer,reason text,
 created_at timestamptz not null,updated_at timestamptz not null,unique(job_id,url)
);
create table research_posts (
 id bigint generated always as identity primary key,candidate_id bigint not null references research_candidates(id),
 url text not null,status text not null default 'pending',attempts integer not null default 0,evidence jsonb,reason text,
 unique(candidate_id,url)
);
create index research_candidates_queue on research_candidates(job_id,status,depth,id);
create index research_posts_candidate on research_posts(candidate_id,status,id);
alter table research_runs enable row level security;
alter table research_candidates enable row level security;
alter table research_posts enable row level security;
