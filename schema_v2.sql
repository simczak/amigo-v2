-- Schema V2: Clean Start

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.draws_v2 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    admin_token TEXT NOT NULL,
    participants JSONB NOT NULL,
    pairs JSONB NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.draws_v2 ENABLE ROW LEVEL SECURITY;

-- 3. Policies

-- Allow anyone to read draws (needed to load the game)
CREATE POLICY "Public Read Access"
ON public.draws_v2
FOR SELECT
TO public
USING (true);

-- Allow anyone to create a draw
CREATE POLICY "Public Insert Access"
ON public.draws_v2
FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to update a draw (application logic handles security via admin_token check before saving)
CREATE POLICY "Public Update Access"
ON public.draws_v2
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS draws_v2_slug_idx ON public.draws_v2 (slug);
