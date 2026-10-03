import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db, readTable, mutateTable, nextBibNumber } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { photosDir, photoUpload, validateRiderInput } from "../lib/riderShared.js";

const router = express.Router();
const REVIEW_STATUSES = ["approved", "rejected", "removed"];

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

router.get("/stats", requireAdmin, (_req, res) => {
  const stats = { pending: 0, approved: 0, rejected: 0, removed: 0 };
  for (const r of readTable("riders")) {
    if (stats[r.status] !== undefined) stats[r.status] += 1;
  }
  stats.total = stats.pending + stats.approved + stats.rejected + stats.removed;
  stats.flaggedRides = readTable("rides").filter((r) => r.flagged).length;
  res.json(stats);
});

router.get("/riders", requireAdmin, (req, res) => {
  const status = req.query.status;
  const valid = ["pending", "approved", "rejected", "removed"];

  let rows = readTable("riders");
  if (valid.includes(status)) rows = rows.filter((r) => r.status === status);
  rows = rows.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(rows.map(({ photoPath: _photo, ...rest }) => rest));
});

// Admin adds a rider they've verified themselves. Goes straight onto the board.
router.post("/riders", requireAdmin, photoUpload.single("profilePhoto"), (req, res) => {
  const photoFile = req.file;
  const errors = validateRiderInput(req.body);
  if (errors.length) {
    if (photoFile) fs.unlink(photoFile.path, () => {});
    return res.status(400).json({ error: errors.join(" ") });
  }

  const b = req.body;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const bibNumber = nextBibNumber();

  mutateTable("riders", (rows) => {
    rows.push({
      id,
      name: b.name.trim(),
      mobileNumber: b.mobileNumber,
      emergencyMobileNumber: b.emergencyMobileNumber,
      address: b.address.trim(),
      city: b.city.trim(),
      bloodGroup: b.bloodGroup,
      tshirtSize: b.tshirtSize,
      birthDate: b.birthDate,
      photoPath: photoFile ? photoFile.filename : null,
      status: "approved",
      bibNumber,
      reviewNote: "Added by admin",
      createdAt: now,
      reviewedAt: now,
    });
  });

  res.status(201).json({ id, bibNumber });
});

router.get("/riders/:id", requireAdmin, (req, res) => {
  const row = readTable("riders").find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  const { photoPath: _photo, ...rest } = row;
  res.json(rest);
});

// Permanently deletes a rider and everything tied to them (rides, GPS
// history, alerts) plus their photo. Use "remove" instead if you might want
// them back.
router.delete("/riders/:id", requireAdmin, (req, res) => {
  const row = readTable("riders").find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });

  db.transaction(() => {
    db.prepare("DELETE FROM locations WHERE riderId = ?").run(row.id);
    db.prepare("DELETE FROM rides WHERE riderId = ?").run(row.id);
    db.prepare("DELETE FROM alerts WHERE riderId = ?").run(row.id);
    db.prepare("DELETE FROM riders WHERE id = ?").run(row.id);
  })();

  if (row.photoPath) fs.unlink(path.join(photosDir, row.photoPath), () => {});
  res.json({ ok: true });
});

router.get("/riders/:id/photo", requireAdmin, (req, res) => {
  const row = readTable("riders").find((r) => r.id === req.params.id);
  if (!row || !row.photoPath) return res.status(404).end();

  const filePath = path.join(photosDir, row.photoPath);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  res.sendFile(filePath);
});

// A rider's ride history, admin view — includes the flagged/flagReason
// review fields that the public /api/riders/:id/rides deliberately omits.
router.get("/riders/:id/rides", requireAdmin, (req, res) => {
  const rider = readTable("riders").find((r) => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: "Not found." });

  const rows = readTable("rides")
    .filter((r) => r.riderId === req.params.id)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map(({ id, distanceKm, durationSeconds, avgSpeedKmh, startedAt, endedAt, flagged, flagReason }) => ({
      id,
      distanceKm,
      durationSeconds,
      avgSpeedKmh,
      startedAt,
      endedAt,
      flagged: !!flagged,
      flagReason,
    }));
  res.json(rows);
});

// Approve, reject, or remove from the board. "removed" hides a rider from the
// board and live map but keeps their record; approving again restores them.
router.patch("/riders/:id", requireAdmin, (req, res) => {
  const { status, reviewNote } = req.body || {};
  if (!REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Status must be 'approved', 'rejected' or 'removed'." });
  }

  const found = mutateTable("riders", (rows) => {
    const row = rows.find((r) => r.id === req.params.id);
    if (!row) return false;

    if (status === "approved" && !row.bibNumber) {
      row.bibNumber = nextBibNumber();
    }
    row.status = status;
    row.reviewNote = reviewNote || row.reviewNote || null;
    row.reviewedAt = new Date().toISOString();
    return true;
  });

  if (!found) return res.status(404).json({ error: "Not found." });
  res.json({ ok: true });
});

// Live map: each approved rider's most recent location ping. Riders who
// haven't sent a ping are still listed (lat/lng/recordedAt null) so admins
// can see who hasn't started tracking yet.
router.get("/live", requireAdmin, (_req, res) => {
  const riders = readTable("riders").filter((r) => r.status === "approved");
  const latest = new Map(
    db
      .prepare(
        `SELECT l.riderId, l.lat, l.lng, l.recordedAt FROM locations l
         JOIN (SELECT riderId, MAX(recordedAt) AS m FROM locations GROUP BY riderId) x
           ON l.riderId = x.riderId AND l.recordedAt = x.m`
      )
      .all()
      .map((r) => [r.riderId, r])
  );

  const rows = riders
    .map((r) => {
      const loc = latest.get(r.id);
      return {
        riderId: r.id,
        name: r.name,
        bibNumber: r.bibNumber,
        mobileNumber: r.mobileNumber,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        recordedAt: loc?.recordedAt ?? null,
      };
    })
    .sort((a, b) => {
      if (!a.recordedAt && !b.recordedAt) return (a.bibNumber ?? 0) - (b.bibNumber ?? 0);
      if (!a.recordedAt) return 1;
      if (!b.recordedAt) return -1;
      return new Date(b.recordedAt) - new Date(a.recordedAt);
    });

  res.json(rows);
});

// Recent breadcrumb trail for one rider — shown when an admin taps a marker.
router.get("/live/:riderId/trail", requireAdmin, (req, res) => {
  const rider = readTable("riders").find((r) => r.id === req.params.riderId);
  if (!rider) return res.status(404).json({ error: "Not found." });

  const points = db
    .prepare("SELECT lat, lng FROM locations WHERE riderId = ? ORDER BY recordedAt")
    .all(rider.id)
    .map((l) => [l.lat, l.lng]);

  res.json({ riderId: rider.id, name: rider.name, points });
});

// Every flagged ride, across all riders, for a single anti-cheat review queue.
router.get("/flagged-rides", requireAdmin, (_req, res) => {
  const riderById = new Map(readTable("riders").map((r) => [r.id, r]));

  const rows = readTable("rides")
    .filter((r) => r.flagged)
    .map((r) => {
      const rider = riderById.get(r.riderId);
      return {
        rideId: r.id,
        riderId: r.riderId,
        riderName: rider?.name ?? "Unknown rider",
        bibNumber: rider?.bibNumber ?? null,
        distanceKm: r.distanceKm,
        avgSpeedKmh: r.avgSpeedKmh,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        flagReason: r.flagReason,
      };
    })
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  res.json(rows);
});

export default router;
