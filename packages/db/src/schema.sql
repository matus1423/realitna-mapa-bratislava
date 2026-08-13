CREATE TABLE IF NOT EXISTS listings (
  id                TEXT PRIMARY KEY,
  source            TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  source_url        TEXT NOT NULL,

  deal_type         TEXT NOT NULL,
  property_type     TEXT NOT NULL,

  price             INTEGER,
  price_currency    TEXT NOT NULL DEFAULT 'EUR',
  price_per_m2      REAL,

  lat               REAL NOT NULL,
  lng               REAL NOT NULL,
  location_radius   INTEGER,

  address           TEXT,
  street            TEXT,
  city              TEXT,
  district          TEXT,

  area_m2           REAL,
  land_area_m2      REAL,
  rooms             INTEGER,
  rooms_raw         TEXT,
  floor             INTEGER,
  condition         TEXT,
  has_elevator      INTEGER,

  title             TEXT NOT NULL,
  description       TEXT,
  image_urls        TEXT NOT NULL DEFAULT '[]',  -- JSON pole

  advertiser_name   TEXT,
  advertiser_type   TEXT,

  published_at      TEXT,
  first_seen_at     TEXT NOT NULL,
  scraped_at        TEXT NOT NULL,

  -- inzerát zmizol z portálu; z mapy ho vyradíme, ale históriu si necháme
  is_active         INTEGER NOT NULL DEFAULT 1,

  -- id "kanonického" inzerátu, ak ide o tú istú nehnuteľnosť z iného portálu.
  -- NULL = toto je kanonický záznam a patrí na mapu.
  duplicate_of      TEXT,

  -- medián €/m² v okolí a pomer ceny bytu k nemu (0,85 = o 15 % pod okolím).
  -- Prepočítava sa po každom crawle, nie pri dotaze — na tisíckach bodov by
  -- to inak mapu položilo.
  area_price_per_m2 REAL,
  price_ratio       REAL
);

-- Hlavný dotaz mapy je "daj inzeráty vo výreze". SQLite nemá priestorový index,
-- ale zložený index nad (lat, lng) zvládne rozsahový sken bboxu bez problémov
-- aj pri stotisícoch riadkov.
CREATE INDEX IF NOT EXISTS idx_listings_bbox ON listings (lat, lng);
CREATE INDEX IF NOT EXISTS idx_listings_filters ON listings (deal_type, property_type, price);
CREATE INDEX IF NOT EXISTS idx_listings_active ON listings (is_active);
CREATE INDEX IF NOT EXISTS idx_listings_source_id ON listings (source_id);

-- Cenová história: bez nej sa nedá ukázať "zlacnelo o 20 000 €",
-- čo je na referenčnej mape vizuálne najsilnejší prvok.
CREATE TABLE IF NOT EXISTS price_history (
  listing_id  TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  price       INTEGER NOT NULL,
  seen_at     TEXT NOT NULL,
  PRIMARY KEY (listing_id, seen_at)
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history (listing_id);
