create table discovery_queries (
 id bigint generated always as identity primary key,job_id bigint not null references research_runs(job_id),
 provider text not null,keyword text not null,query_url text not null,status text not null default 'pending',
 attempts integer not null default 0,result_count integer not null default 0,error text,requested_at timestamptz,completed_at timestamptz,
 unique(job_id,provider,keyword)
);
create table discovery_results (
 id bigint generated always as identity primary key,query_id bigint not null references discovery_queries(id),
 source_url text not null,kind text not null,title text not null,status text not null default 'pending',
 attempts integer not null default 0,profile_url text,reason text,discovered_at timestamptz not null,
 unique(query_id,source_url)
);
create index discovery_queries_queue on discovery_queries(job_id,status,id);
create index discovery_results_queue on discovery_results(query_id,status,id);
alter table discovery_queries enable row level security;
alter table discovery_results enable row level security;
