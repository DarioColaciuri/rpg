-- Characters table
CREATE TABLE IF NOT EXISTS characters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  class TEXT NOT NULL CHECK (class IN ('WARRIOR', 'MAGE')),
  race TEXT NOT NULL CHECK (race IN ('HUMAN', 'GNOME')),
  sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  hp INTEGER NOT NULL DEFAULT 20,
  max_hp INTEGER NOT NULL DEFAULT 20,
  mana INTEGER NOT NULL DEFAULT 10,
  max_mana INTEGER NOT NULL DEFAULT 10,
  stamina INTEGER NOT NULL DEFAULT 20,
  max_stamina INTEGER NOT NULL DEFAULT 20,
  food INTEGER NOT NULL DEFAULT 100,
  drink INTEGER NOT NULL DEFAULT 100,
  gold INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  map TEXT NOT NULL DEFAULT 'city',
  x INTEGER NOT NULL DEFAULT 10,
  y INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own characters"
  ON characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own characters"
  ON characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own characters"
  ON characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);

-- Inventory items table
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot >= 0),
  item_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(character_id, slot)
);

-- RLS for inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory"
  ON inventory_items FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM characters WHERE id = character_id));

CREATE POLICY "Users can insert own inventory"
  ON inventory_items FOR INSERT
  WITH CHECK (auth.uid() = (SELECT user_id FROM characters WHERE id = character_id));

CREATE POLICY "Users can update own inventory"
  ON inventory_items FOR UPDATE
  USING (auth.uid() = (SELECT user_id FROM characters WHERE id = character_id));

CREATE POLICY "Users can delete own inventory"
  ON inventory_items FOR DELETE
  USING (auth.uid() = (SELECT user_id FROM characters WHERE id = character_id));

-- Index for faster inventory lookups
CREATE INDEX IF NOT EXISTS idx_inventory_character ON inventory_items(character_id);
