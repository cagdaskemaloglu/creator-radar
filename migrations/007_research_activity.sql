CREATE TABLE research_activity(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id bigint NOT NULL REFERENCES ingestion_jobs(id),started_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,ended_at timestamptz,active_ms bigint NOT NULL DEFAULT 0,wait_ms bigint NOT NULL DEFAULT 0,unobserved_ms bigint NOT NULL DEFAULT 0,start_inserted integer NOT NULL,end_inserted integer NOT NULL,start_saved integer NOT NULL,end_saved integer NOT NULL);
CREATE INDEX research_activity_job ON research_activity(job_id,id);
ALTER TABLE research_activity ENABLE ROW LEVEL SECURITY;
