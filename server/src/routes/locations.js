import express from "express";
import crypto from "node:crypto";
import { db, readTable } from "../db.js";

const router = express.Router();
const RETENTION_MS = 48 * 60 * 60 * 1000; // keep 48h of breadcrumb history
const MAX_POINTS_PER_REQUEST = 500;

const insertPoint = db.prepare(
  `INSERT INTO locations (id, riderId, lat, lng, recordedAt, receivedAt)
   VALUES (@id, @riderId, @lat, @lng, @recordedAt, @receivedAt)`
);
const pruneOld = db.prepare(`DELETE FROM locations WHERE recordedAt < ?`);

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidPoint(p) {
  return (
    p &&
    isFiniteNumber(p.lat) &&
    isFiniteNumber(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    !Number.isNaN(new Date(p.recordedAt).getTime())
  );
}

// Rider devices call this every ~20s while a ride is active, and again with
// whatever queued up locally once connectivity returns after a dead zone —
// so a single request can carry many backlogged points at once.
router.post("/", (req, res) => {
  const { riderId, points } = req.body || {};

  const rider = db.prepare("SELECT id FROM riders WHERE id = ?").get(riderId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });

  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: "At least one location point is required." });
  }
  if (points.length > MAX_POINTS_PER_REQUEST) {
    return res.status(400).json({ error: `No more than ${MAX_POINTS_PER_REQUEST} points per request.` });
  }
  if (!points.every(isValidPoint)) {
    return res.status(400).json({ error: "One or more location points are invalid." });
  }

  const now = Date.now();
  const receivedAt = new Date(now).toISOString();
  db.transaction(() => {
    pruneOld.run(new Date(now - RETENTION_MS).toISOString());
    for (const p of points) {
      insertPoint.run({
        id: crypto.randomUUID(),
        riderId,
        lat: p.lat,
        lng: p.lng,
        recordedAt: p.recordedAt,
        receivedAt,
      });
    }
  })();

  res.status(201).json({ ok: true, count: points.length });
});

export default router;
