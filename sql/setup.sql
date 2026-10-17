-- ============================================================
-- Mapped in Real Time — Supabase SQL Setup
-- Run this in the Supabase SQL Editor (supabase.com → project → SQL Editor)
-- ============================================================

-- 1. Pins table
CREATE TABLE IF NOT EXISTS pins (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  label      TEXT NOT NULL CHECK (char_length(label) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  icon       TEXT DEFAULT '📍' CHECK (char_length(icon) <= 4),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pins_user_id ON pins(user_id);
CREATE INDEX IF NOT EXISTS idx_pins_created_at ON pins(created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pins_updated_at
  BEFORE UPDATE ON pins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 2. User roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- 3. Row Level Security

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Pins: ANYONE can read (public viewers, no auth required)
CREATE POLICY "pins_select_public" ON pins
  FOR SELECT
  USING (true);

-- Pins: only authenticated editors can insert
CREATE POLICY "pins_insert" ON pins
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'editor'
    )
  );

-- Pins: only authenticated editors can update
CREATE POLICY "pins_update" ON pins
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'editor'
    )
  );

-- Pins: only authenticated editors can delete
CREATE POLICY "pins_delete" ON pins
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'editor'
    )
  );

-- User roles: users can read their own role
CREATE POLICY "roles_select_own" ON user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Rate limiting — max 10 pins per user per minute
CREATE OR REPLACE FUNCTION check_pin_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT count(*) FROM pins
    WHERE user_id = NEW.user_id
      AND created_at > now() - interval '1 minute'
  ) >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 10 pins per minute';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pin_rate_limit
  BEFORE INSERT ON pins
  FOR EACH ROW
  EXECUTE FUNCTION check_pin_rate_limit();

-- ============================================================
-- After running this SQL, enable Realtime for the pins table:
--
--   Database → Replication → supabase_realtime publication
--   → Add table → pins → Save
-- ============================================================

-- Grant editor role to a user by email (run manually):
--
-- INSERT INTO user_roles (user_id, role)
-- SELECT id, 'editor' FROM auth.users WHERE email = 'someone@example.com';
