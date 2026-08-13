import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Koreň repa — packages/db/src → ../../.. */
export const repoRoot = resolve(here, '../../..');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = resolve(repoRoot, process.env.DB_PATH ?? 'data/listings.db');
  db = new Database(dbPath);

  // WAL nechá scraper zapisovať, kým API súčasne číta.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // dlhé crawly viacerých zdrojov sa prekrývajú — radšej počkať než spadnúť na SQLITE_BUSY
  db.pragma('busy_timeout = 15000');

  const schema = readFileSync(resolve(here, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrate(db);

  return db;
}

/**
 * `CREATE TABLE IF NOT EXISTS` nepridá stĺpec do už existujúcej tabuľky,
 * takže nové stĺpce dopĺňame ručne. Držíme to takto jednoducho, kým je
 * databáza kedykoľvek znovu naplniteľná scraperom.
 */
function migrate(db: Database.Database): void {
  const info = db.pragma('table_info(listings)') as { name: string }[];
  const columns = new Set(info.map((c) => c.name));

  if (!columns.has('duplicate_of')) {
    db.exec('ALTER TABLE listings ADD COLUMN duplicate_of TEXT');
  }
  if (!columns.has('area_price_per_m2')) {
    db.exec('ALTER TABLE listings ADD COLUMN area_price_per_m2 REAL');
    db.exec('ALTER TABLE listings ADD COLUMN price_ratio REAL');
  }
  if (!columns.has('estimated_rent')) {
    db.exec('ALTER TABLE listings ADD COLUMN estimated_rent INTEGER');
    db.exec('ALTER TABLE listings ADD COLUMN gross_yield REAL');
  }

  // index až tu, nie v schema.sql — tam by na staršej databáze bežal skôr,
  // než by stĺpec vôbec existoval
  db.exec('CREATE INDEX IF NOT EXISTS idx_listings_duplicate ON listings (duplicate_of)');
}

export function closeDb(): void {
  db?.close();
  db = null;
}
