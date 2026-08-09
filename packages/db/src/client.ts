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

  const schema = readFileSync(resolve(here, 'schema.sql'), 'utf8');
  db.exec(schema);

  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
