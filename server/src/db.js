import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "fc_ride_squad.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF");

db.exec(`
  CREATE TABLE IF NOT EXISTS riders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mobileNumber TEXT NOT NULL,
    emergencyMobileNumber TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    bloodGroup TEXT NOT NULL,
    tshirtSize TEXT NOT NULL,
    birthDate TEXT NOT NULL,
    photoPath TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    bibNumber INTEGER,
    reviewNote TEXT,
    createdAt TEXT NOT NULL,
    reviewedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    riderId TEXT NOT NULL,
    distanceKm REAL NOT NULL,
    durationSeconds INTEGER NOT NULL,
    avgSpeedKmh REAL NOT NULL,
    startedAt TEXT NOT NULL,
    endedAt TEXT NOT NULL,
    path TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    flagged INTEGER,
    flagReason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rides_rider ON rides (riderId);

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    riderId TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    recordedAt TEXT NOT NULL,
    receivedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_locations_rider_time ON locations (riderId, recordedAt);
  CREATE INDEX IF NOT EXISTS idx_locations_time ON locations (recordedAt);

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    riderId TEXT NOT NULL,
    lat REAL,
    lng REAL,
    message TEXT,
    createdAt TEXT NOT NULL,
    resolvedAt TEXT,
    resolvedBy TEXT
  );

  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
`);

export const COLUMNS = {
  riders: [
    "id", "name", "mobileNumber", "emergencyMobileNumber", "address", "city",
    "bloodGroup", "tshirtSize", "birthDate", "photoPath", "status", "bibNumber",
    "reviewNote", "createdAt", "reviewedAt",
  ],
  rides: [
    "id", "riderId", "distanceKm", "durationSeconds", "avgSpeedKmh",
    "startedAt", "endedAt", "path", "createdAt", "flagged", "flagReason",
  ],
  locations: ["id", "riderId", "lat", "lng", "recordedAt", "receivedAt"],
  alerts: ["id", "riderId", "lat", "lng", "message", "createdAt", "resolvedAt", "resolvedBy"],
  counters: ["name", "value"],
};

export const NUMERIC_FIELDS = {
  riders: new Set(["bibNumber"]),
  rides: new Set(["distanceKm", "durationSeconds", "avgSpeedKmh", "flagged"]),
  locations: new Set(["lat", "lng"]),
  alerts: new Set(["lat", "lng"]),
  counters: new Set(["value"]),
};

const KEYS = { riders: "id", rides: "id", locations: "id", alerts: "id", counters: "name" };

const statements = {};
for (const table of Object.keys(COLUMNS)) {
  const cols = COLUMNS[table];
  const key = KEYS[table];
  const updates = cols.filter((c) => c !== key).map((c) => `${c} = excluded.${c}`).join(", ");
  statements[table] = {
    upsert: db.prepare(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})
       ON CONFLICT(${key}) DO UPDATE SET ${updates}`
    ),
    remove: db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`),
  };
}

function toParams(table, row) {
  const params = {};
  for (const c of COLUMNS[table]) {
    const v = row[c];
    params[c] = v === undefined || v === "" ? null : typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  return params;
}

function readAll(table) {
  return db.prepare(`SELECT ${COLUMNS[table].join(", ")} FROM ${table} ORDER BY rowid`).all();
}

export function readTable(table) {
  return readAll(table);
}

export function insertRows(table, rows) {
  db.transaction(() => {
    for (const row of rows) statements[table].upsert.run(toParams(table, row));
  })();
}

// Read the table, let `mutator` change the row array (push, edit, filter in
// place), then write back only what changed and delete what was removed —
// all in one transaction, so a crash mid-write can't leave a half-updated table.
export function mutateTable(table, mutator) {
  const key = KEYS[table];
  const before = readAll(table);
  const snapshot = new Map(before.map((r) => [r[key], JSON.stringify(r)]));
  const rows = before.map((r) => ({ ...r }));
  const result = mutator(rows);

  db.transaction(() => {
    const kept = new Set();
    for (const row of rows) {
      kept.add(row[key]);
      if (snapshot.get(row[key]) !== JSON.stringify(row)) {
        statements[table].upsert.run(toParams(table, row));
      }
    }
    for (const id of snapshot.keys()) {
      if (!kept.has(id)) statements[table].remove.run(id);
    }
  })();

  return result;
}

export function nextBibNumber() {
  return mutateTable("counters", (rows) => {
    let counter = rows.find((r) => r.name === "bibNumber");
    if (!counter) {
      counter = { name: "bibNumber", value: 0 };
      rows.push(counter);
    }
    counter.value = (counter.value || 0) + 1;
    return counter.value;
  });
}
