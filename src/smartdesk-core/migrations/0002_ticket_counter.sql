-- Per-year工单号 sequence backing store.NextNumber → SD-YYYY-NNNNNN.
-- An upsert (INSERT ... ON CONFLICT DO UPDATE ... RETURNING seq) atomically
-- issues the next number per year without a race.
CREATE TABLE IF NOT EXISTS ticket_counters (
    year SMALLINT PRIMARY KEY,
    seq  INTEGER NOT NULL DEFAULT 0
);
