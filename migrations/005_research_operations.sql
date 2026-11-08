create table candidate_work (
 candidate_id bigint primary key references research_candidates(id) on delete cascade,
 work_kind text not null check (work_kind in ('discovery','enrichment'))
);
create table creator_evaluations (
 id bigint generated always as identity primary key,
 creator_id bigint not null references creators(id) on delete cascade,
 verdict text not null check (verdict in ('correct','wrong','insufficient')),
 predicted_category text,expected_category text,model_version text not null,created_at timestamptz not null
);
create index creator_evaluations_creator on creator_evaluations(creator_id,id);
alter table candidate_work enable row level security;
alter table creator_evaluations enable row level security;
