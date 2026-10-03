// One-time import of the old CSV files into SQLite. Safe to re-run: rows are
// upserted by primary key, so running it twice never duplicates anything.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { COLUMNS, NUMERIC_FIELDS, insertRows, readTable } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvDir = path.join(__dirname, "..", "data", "csv-backup-before-sqlite");

for (const table of ["riders", "rides", "locations", "counters"]) {
  const file = path.join(csvDir, `${table}.csv`);
  if (!fs.existsSync(file)) {
    console.log(`${table}: no CSV backup found, skipping`);
    continue;
  }

  const { data } = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true });
  const numeric = NUMERIC_FIELDS[table];
  const idCol = COLUMNS[table][0] === "id" ? "id" : "name";
  const rows = data
    .filter((r) => r[idCol] && String(r[idCol]).trim() !== "")
    .map((r) => {
      const out = {};
      for (const c of COLUMNS[table]) {
        let v = r[c];
        if (v === undefined || v === "") v = null;
        else if (numeric.has(c)) v = Number(v);
        out[c] = v;
      }
      return out;
    });

  insertRows(table, rows);
  const inDb = readTable(table).length;
  console.log(`${table}: CSV had ${rows.length} row(s), SQLite now has ${inDb}`);
}

console.log("Done. The CSV backup is untouched in data/csv-backup-before-sqlite/.");
