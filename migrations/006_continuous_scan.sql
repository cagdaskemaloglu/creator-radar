CREATE TABLE continuous_scan(id integer PRIMARY KEY CHECK(id=1),enabled integer NOT NULL DEFAULT 0,generation integer NOT NULL DEFAULT 0,config text NOT NULL DEFAULT '{}',cycle integer NOT NULL DEFAULT 0,job_id bigint REFERENCES ingestion_jobs(id),next_at text,status text NOT NULL DEFAULT 'stopped',message text,updated_at text NOT NULL);
ALTER TABLE continuous_scan ENABLE ROW LEVEL SECURITY;
