ALTER TABLE sales
ADD COLUMN note TEXT NOT NULL DEFAULT ''
    CHECK (length(trim(note)) <= 2000);
