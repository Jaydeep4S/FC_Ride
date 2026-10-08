import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { db, readTable, mutateTable } from "../db.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { photosDir, photoUpload, validateRiderInput, MOBILE_RE } from "../lib/riderShared.js";
import { logAudit, riderActor, riderLabel } from "../lib/audit.js";

const router = express.Router();

// Public: submit a new rider registration.
router.post("/", photoUpload.single("profilePhoto"), (req, res) => {
  const photoFile = req.file;
  const cleanup = () => {
    if (photoFile) fs.unlink(photoFile.path, () => {});
  };

  const errors = validateRiderInput(req.body);
  if (!photoFile) errors.push("Profile photo is required.");
  if (errors.length) {
    cleanup();
    return res.status(400).json({ error: errors.join(" ") });
  }

  const id = crypto.randomUUID();
  const {
    name,
    mobileNumber,
    emergencyMobileNumber,
    address,
    city,
    bloodGroup,
    tshirtSize,
    birthDate,
  } = req.body;

  mutateTable("riders", (rows) => {
    rows.push({
      id,
      name: name.trim(),
      mobileNumber,
      emergencyMobileNumber,
      address: address.trim(),
      city: city.trim(),
      bloodGroup,
      tshirtSize,
      birthDate,
      photoPath: photoFile.filename,
      status: "pending",
      bibNumber: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    });
  });

  logAudit({
    riderId: id,
    actorType: "rider",
    actorId: id,
    actorName: name.trim(),
    action: "registered",
    details: `Registered from ${city.trim()}`,
  });

  res.status(201).json({ id, status: "pending" });
});

const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8 });

// Public: recover your own tracking link by mobile number, if you lost it.
router.post("/lookup", lookupLimiter, (req, res) => {
  const { mobileNumber } = req.body || {};
  if (!mobileNumber || !MOBILE_RE.test(mobileNumber)) {
    return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
  }

  const matches = readTable("riders")
    .filter((r) => r.mobileNumber === mobileNumber)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (matches.length === 0) {
    return res.status(404).json({ error: "No registration found for that mobile number." });
  }
  logAudit({ riderId: matches[0].id, ...riderActor(matches[0]), action: "link_lookup", details: "Recovered tracking link by mobile number" });
  res.json({ id: matches[0].id, name: matches[0].name });
});

const callLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

// An approved rider looks up another approved rider's number to call them
// from the board. Numbers are never on the public board itself — this hands
// out one number at a time, only to a known rider, and logs who called whom.
router.post("/:id/call", callLimiter, (req, res) => {
  const { callerId } = req.body || {};
  const riders = readTable("riders");
  const caller = riders.find((r) => r.id === callerId);
  const target = riders.find((r) => r.id === req.params.id);

  if (!caller || caller.status !== "approved") {
    return res.status(403).json({ error: "Only approved riders can call squad mates. Open your own tracker link first." });
  }
  if (!target || target.status !== "approved") {
    return res.status(404).json({ error: "Rider not found." });
  }
  if (caller.id === target.id) {
    return res.status(400).json({ error: "That's you!" });
  }

  logAudit({
    riderId: target.id,
    ...riderActor(caller),
    action: "call",
    details: `${riderLabel(caller)} called ${riderLabel(target)}`,
  });
  res.json({ name: target.name, mobileNumber: target.mobileNumber });
});

// Admin broadcasts addressed to this rider, newest first.
router.get("/:id/messages", (req, res) => {
  const rider = readTable("riders").find((r) => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: "Not found." });

  const rows = db
    .prepare(
      `SELECT id, body, createdAt FROM messages
       WHERE recipientIds LIKE ? ORDER BY createdAt DESC LIMIT 20`
    )
    .all(`%"${rider.id}"%`);
  res.json(rows);
});

// Public: the approved-rider board, ranked by total practice distance. Only
// non-sensitive fields are exposed.
router.get("/board", (_req, res) => {
  const riders = readTable("riders").filter((r) => r.status === "approved");
  const rides = readTable("rides");

  const rows = riders.map((r) => {
    const mine = rides.filter((rd) => rd.riderId === r.id);
    const totalKm = mine.reduce((sum, rd) => sum + rd.distanceKm, 0);
    const totalSeconds = mine.reduce((sum, rd) => sum + rd.durationSeconds, 0);
    const avgSpeedKmh = totalSeconds > 0 ? totalKm / (totalSeconds / 3600) : 0;
    return {
      id: r.id,
      bibNumber: r.bibNumber,
      name: r.name,
      bloodGroup: r.bloodGroup,
      tshirtSize: r.tshirtSize,
      city: r.city,
      totalKm,
      avgSpeedKmh,
    };
  });

  rows.sort((a, b) => b.totalKm - a.totalKm || (a.bibNumber ?? 0) - (b.bibNumber ?? 0));
  res.json(rows);
});

// Public: a rider's profile photo — only served once their registration is approved.
router.get("/:id/photo", (req, res) => {
  const row = readTable("riders").find((r) => r.id === req.params.id);
  if (!row || row.status !== "approved" || !row.photoPath) {
    return res.status(404).end();
  }
  res.sendFile(path.join(photosDir, row.photoPath));
});

// Public: check status of a submission by id (so a rider can follow up on their own request).
router.get("/:id/status", (req, res) => {
  const row = readTable("riders").find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json({ name: row.name, status: row.status, reviewNote: row.reviewNote, bibNumber: row.bibNumber });
});

// Public: a rider's own practice ride history (route path omitted — fetch /api/rides/:id for that).
router.get("/:id/rides", (req, res) => {
  const rider = readTable("riders").find((r) => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: "Not found." });

  const rows = readTable("rides")
    .filter((r) => r.riderId === req.params.id)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map(({ id, distanceKm, durationSeconds, avgSpeedKmh, startedAt, endedAt }) => ({
      id,
      distanceKm,
      durationSeconds,
      avgSpeedKmh,
      startedAt,
      endedAt,
    }));
  res.json(rows);
});

export default router;
