import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH = process.env.BOLGERADAR_DB || path.join(DATA_DIR, 'bolgeradar.db')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`PRAGMA journal_mode = WAL;`)
db.exec(`PRAGMA foreign_keys = ON;`)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  side TEXT,
  lat REAL, lng REAL,
  benchmark_sale_m2 REAL,
  benchmark_rent_m2 REAL,
  population INTEGER,
  sales_12m INTEGER,
  heat REAL
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'demo',
  url TEXT,
  title TEXT,
  property_type TEXT NOT NULL DEFAULT 'daire',
  deal_type TEXT NOT NULL,
  district TEXT NOT NULL,
  neighborhood TEXT,
  lat REAL, lng REAL,
  m2_net REAL, m2_gross REAL,
  rooms TEXT,
  floor INTEGER, total_floors INTEGER,
  building_age INTEGER,
  heating TEXT,
  dues REAL,
  price REAL NOT NULL,
  price_per_m2 REAL,
  seller_type TEXT,
  office_name TEXT,
  first_seen TEXT,
  last_seen TEXT,
  price_drops INTEGER DEFAULT 0,
  price_delta_pct REAL DEFAULT 0,
  status TEXT DEFAULT 'aktif',
  fingerprint TEXT UNIQUE,
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_listings_district ON listings(district);
CREATE INDEX IF NOT EXISTS idx_listings_deal ON listings(deal_type);
CREATE INDEX IF NOT EXISTS idx_listings_ppm2 ON listings(price_per_m2);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  price REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ph_listing ON price_history(listing_id);

CREATE TABLE IF NOT EXISTS benchmarks (
  district TEXT NOT NULL,
  deal_type TEXT NOT NULL,
  rooms TEXT NOT NULL,
  median_m2 REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  updated_at TEXT,
  PRIMARY KEY (district, deal_type, rooms)
);

CREATE TABLE IF NOT EXISTS market_index (
  district TEXT NOT NULL,
  month TEXT NOT NULL,
  sale_m2 REAL,
  rent_m2 REAL,
  volume INTEGER,
  PRIMARY KEY (district, month)
);

CREATE TABLE IF NOT EXISTS pois (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  line TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  criteria TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT,
  last_run TEXT,
  last_match_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT,
  district TEXT,
  budget_min REAL, budget_max REAL,
  rooms TEXT,
  lawful_basis TEXT NOT NULL,
  consent_ref TEXT,
  source TEXT,
  notes TEXT,
  stage TEXT DEFAULT 'yeni',
  created_at TEXT,
  retention_until TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  last_sync TEXT,
  record_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT,
  file_name TEXT,
  rows_total INTEGER,
  rows_imported INTEGER,
  rows_skipped INTEGER,
  created_at TEXT,
  detail TEXT
);
`

export function migrate() {
  db.exec(SCHEMA)
}

export function nowISO() {
  return new Date().toISOString()
}

export function audit(action, entity, entityId, meta = {}, actor = 'sistem') {
  db.prepare(
    `INSERT INTO audit_log (actor, action, entity, entity_id, meta, created_at) VALUES (?,?,?,?,?,?)`
  ).run(actor, action, entity, entityId == null ? null : String(entityId), JSON.stringify(meta), nowISO())
}

export function getSetting(key, fallback = null) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key)
  return row ? row.value : fallback
}

export function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    key,
    String(value)
  )
}

export function tableCount(table) {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()
    return Number(row?.c || 0)
  } catch {
    return 0
  }
}
