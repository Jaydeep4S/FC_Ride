import express from "express";
import crypto from "node:crypto";
import { readTable, mutateTable } from "../db.js";
import { detectSuspiciousSpeed } from "../lib/cheatDetection.js";
import { logAudit, riderActor } from "../lib/audit.js";

const router = express.Router();

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

// Each point is [lat, lng, epochMs] — the timestamp is what lets us detect a
// sustained burst of vehicle-speed movement after the fact.
function isValidPath(path) {
  return (
    Array.isArray(path) &&
    path.length >= 2 &&
    path.length <= 20000 &&
    path.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 3 &&
        isFiniteNumber(p[0]) &&
        isFiniteNumber(p[1]) &&
        isFiniteNumber(p[2]) &&
        p[0] >= -90 &&
        p[0] <= 90 &&
        p[1] >= -180 &&
        p[1] <= 180
    )
  );
}

// Save a completed practice ride for a rider.
router.post("/", (req, res) => {
  const { riderId, distanceKm, durationSeconds, avgSpeedKmh, startedAt, endedAt, path } =
    req.body || {};

  const rider = readTable("riders").find((r) => r.id === riderId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });

  const errors = [];
  if (!isFiniteNumber(distanceKm) || distanceKm <= 0 || distanceKm > 1000) {
    errors.push("Distance must be a sane number of kilometres.");
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86400) {
    errors.push("Duration must be a sane number of seconds.");
  }
  // Generous ceiling — this only needs to catch corrupted/impossible data
  // (a GPS glitch computing thousands of km/h). Real vehicle speeds (a car,
  // a train) must be allowed through so the sustained-speed cheat detector
  // below actually gets a chance to flag them, instead of the ride being
  // silently rejected before it's ever saved.
  if (!isFiniteNumber(avgSpeedKmh) || avgSpeedKmh < 0 || avgSpeedKmh > 220) {
    errors.push("Average speed is not valid.");
  }
  if (Number.isNaN(new Date(startedAt).getTime()) || Number.isNaN(new Date(endedAt).getTime())) {
    errors.push("Start/end time is not valid.");
  }
  if (!isValidPath(path)) {
    errors.push("Route path must have at least 2 valid, timestamped GPS points.");
  }
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const { flagged, reason } = detectSuspiciousSpeed(path);

  const id = crypto.randomUUID();
  mutateTable("rides", (rows) => {
    rows.push({
      id,
      riderId,
      distanceKm,
      durationSeconds,
      avgSpeedKmh,
      startedAt,
      endedAt,
      path: JSON.stringify(path),
      createdAt: new Date().toISOString(),
      flagged: flagged ? 1 : 0,
      flagReason: reason,
    });
  });

  logAudit({
    riderId,
    ...riderActor(rider),
    action: flagged ? "ride_flagged" : "ride_saved",
    details: `${distanceKm.toFixed(2)} km at ${avgSpeedKmh.toFixed(1)} km/h${flagged ? ` — ${reason}` : ""}`,
  });

  res.status(201).json({ id });
});

// A single ride's full detail, including its route path. Public (keyed by
// the unguessable ride id) — deliberately omits flagged/flagReason, which is
// admin-only review information, not something to surface to the rider.
router.get("/:rideId", (req, res) => {
  const row = readTable("rides").find((r) => r.id === req.params.rideId);
  if (!row) return res.status(404).json({ error: "Not found." });
  const { flagged: _flagged, flagReason: _flagReason, ...rest } = row;
  res.json({ ...rest, path: JSON.parse(row.path) });
});

export default router;
