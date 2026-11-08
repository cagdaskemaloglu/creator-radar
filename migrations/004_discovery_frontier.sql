create table discovery_frontier (
 id bigint generated always as identity primary key,
 scope_key text not null,provider text not null,keyword text not null,query_url text not null,
 origin text not null,priority integer not null default 0,evidence text not null,
 created_at timestamptz not null,updated_at timestamptz not null,
 unique(scope_key,provider,keyword)
);
create table discovery_observations (
 query_id bigint primary key references discovery_queries(id),frontier_id bigint not null references discovery_frontier(id),
 pages integer not null,new_profiles integer not null,matched_profiles integer not null,observed_at timestamptz not null
);
create index discovery_frontier_scope on discovery_frontier(scope_key,priority,id);
create index discovery_observations_frontier on discovery_observations(frontier_id,observed_at);
alter table discovery_frontier enable row level security;
alter table discovery_observations enable row level security;
