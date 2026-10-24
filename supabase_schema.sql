-- Run this SQL in your Supabase SQL Editor:
-- (Dashboard -> SQL Editor -> New Query -> Run)

CREATE TABLE IF NOT EXISTS tally_config (
    id TEXT PRIMARY KEY DEFAULT 'primary',
    tally_url TEXT NOT NULL,
    company_name TEXT NOT NULL DEFAULT 'Spj',
    shop_name TEXT DEFAULT 'Mithai Mahal Sweets',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert initial record if not exists
INSERT INTO tally_config (id, tally_url, company_name, shop_name)
VALUES ('primary', 'https://year-wood-within-back.trycloudflare.com/?key=infra_15db9942eb4443d1', 'Spj', 'Mithai Mahal Sweets')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (RLS) and allow public read/update with anon key
ALTER TABLE tally_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
ON tally_config FOR SELECT
USING (true);

CREATE POLICY "Allow public update access"
ON tally_config FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public insert access"
ON tally_config FOR INSERT
WITH CHECK (true);
