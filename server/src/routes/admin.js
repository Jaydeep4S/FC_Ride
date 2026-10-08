import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db, readTable, mutateTable, nextBibNumber } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { photosDir, photoUpload, validateRiderInput } from "../lib/riderShared.js";
import { logAudit, adminActor, riderLabel } from "../lib/audit.js";

const router = express.Router();
const REVIEW_STATUSES = ["approved", "rejected", "removed"];

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    const tried = typeof username === "string" ? username.slice(0, 60) : null;
    logAudit({
      actorType: "admin",
      actorId: tried,
      actorName: tried,
      action: "admin_login_failed",
      details: `Failed admin login from ${req.ip}`,
    });
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: "12h" });
  logAudit({ actorType: "admin", actorId: username, actorName: username, action: "admin_login", details: `Logged in from ${req.ip}` });
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

  logAudit({ riderId: id, ...adminActor(req), action: "added_by_admin", details: `Added ${b.name.trim()} as bib #${bibNumber}` });

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
  // Audit entries outlive the rider; the name goes in details since the rider
  // row it would be looked up from is gone.
  logAudit({ riderId: row.id, ...adminActor(req), action: "deleted", details: `Permanently deleted ${riderLabel(row)}` });
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

  let previous = null;
  const found = mutateTable("riders", (rows) => {
    const row = rows.find((r) => r.id === req.params.id);
    if (!row) return false;
    previous = { status: row.status };

    if (status === "approved" && !row.bibNumber) {
      row.bibNumber = nextBibNumber();
    }
    row.status = status;
    row.reviewNote = reviewNote || row.reviewNote || null;
    row.reviewedAt = new Date().toISOString();
    previous.label = riderLabel(row);
    return true;
  });

  if (!found) return res.status(404).json({ error: "Not found." });
  logAudit({
    riderId: req.params.id,
    ...adminActor(req),
    action: status,
    details: `${previous.label}: ${previous.status} → ${status}${reviewNote ? ` (${reviewNote})` : ""}`,
  });
  res.json({ ok: true });
});

// The admin's phone does the actual dialing (a tel: link); this just records
// that the call was placed.
router.post("/riders/:id/call-log", requireAdmin, (req, res) => {
  const rider = readTable("riders").find((r) => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: "Not found." });

  const emergency = req.body?.which === "emergency";
  logAudit({
    riderId: rider.id,
    ...adminActor(req),
    action: emergency ? "admin_call_emergency" : "admin_call",
    details: emergency ? `Called emergency contact of ${riderLabel(rider)}` : `Called ${riderLabel(rider)}`,
  });
  res.json({ ok: true });
});

// Help desk: every SOS alert (active first), with the phone numbers an
// admin needs to follow up. The public /api/alerts/active omits those.
router.get("/alerts", requireAdmin, (req, res) => {
  const which = req.query.status;
  const riderById = new Map(readTable("riders").map((r) => [r.id, r]));

  let rows = readTable("alerts");
  if (which === "active") rows = rows.filter((a) => !a.resolvedAt);
  if (which === "resolved") rows = rows.filter((a) => a.resolvedAt);

  rows.sort((a, b) => !!a.resolvedAt - !!b.resolvedAt || new Date(b.createdAt) - new Date(a.createdAt));
  res.json(
    rows.slice(0, 300).map((a) => {
      const rider = riderById.get(a.riderId);
      return {
        ...a,
        riderName: rider?.name ?? "Deleted rider",
        bibNumber: rider?.bibNumber ?? null,
        mobileNumber: rider?.mobileNumber ?? null,
        emergencyMobileNumber: rider?.emergencyMobileNumber ?? null,
        bloodGroup: rider?.bloodGroup ?? null,
      };
    })
  );
});

const AUDIENCES = ["approved", "pending", "all", "selected"];

// Bulk message. Stored and shown on each recipient's tracker page; the
// response also returns their numbers so the admin can optionally send the
// same text as an SMS from their own phone.
router.post("/messages", requireAdmin, (req, res) => {
  const { body, audience, riderIds } = req.body || {};
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return res.status(400).json({ error: "Message can't be empty." });
  if (text.length > 1000) return res.status(400).json({ error: "Keep messages under 1000 characters." });
  if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: "Pick who to send this to." });

  const riders = readTable("riders");
  let recipients;
  if (audience === "selected") {
    const wanted = new Set(Array.isArray(riderIds) ? riderIds : []);
    recipients = riders.filter((r) => wanted.has(r.id));
  } else if (audience === "all") {
    recipients = riders.filter((r) => r.status === "approved" || r.status === "pending");
  } else {
    recipients = riders.filter((r) => r.status === audience);
  }
  if (recipients.length === 0) return res.status(400).json({ error: "No riders match that audience." });

  const id = crypto.randomUUID();
  const actor = adminActor(req);
  db.prepare(
    `INSERT INTO messages (id, body, audience, recipientIds, recipientCount, sentBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    text,
    audience,
    JSON.stringify(recipients.map((r) => r.id)),
    recipients.length,
    actor.actorName,
    new Date().toISOString()
  );

  const to = recipients.length === 1 ? riderLabel(recipients[0]) : `${recipients.length} riders (${audience})`;
  logAudit({
    riderId: recipients.length === 1 ? recipients[0].id : null,
    ...actor,
    action: "message_sent",
    details: `To ${to}: ${text.slice(0, 140)}`,
  });

  res.status(201).json({ id, recipientCount: recipients.length, numbers: recipients.map((r) => r.mobileNumber) });
});

router.get("/messages", requireAdmin, (_req, res) => {
  const rows = db
    .prepare("SELECT id, body, audience, recipientCount, sentBy, createdAt FROM messages ORDER BY createdAt DESC LIMIT 100")
    .all();
  res.json(rows);
});

// Audit trail. Filter by rider (events about them or done by them) and
// action; page backwards with ?before=<createdAt of the last row seen>.
router.get("/audit", requireAdmin, (req, res) => {
  const { riderId, action, before } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

  const where = [];
  const params = [];
  if (riderId) {
    where.push("(riderId = ? OR (actorType = 'rider' AND actorId = ?))");
    params.push(riderId, riderId);
  }
  if (action) {
    where.push("action = ?");
    params.push(action);
  }
  if (before) {
    where.push("createdAt < ?");
    params.push(before);
  }

  const rows = db
    .prepare(
      `SELECT * FROM audit_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY createdAt DESC LIMIT ?`
    )
    .all(...params, limit);

  const riderById = new Map(readTable("riders").map((r) => [r.id, r]));
  res.json(
    rows.map((r) => {
      const rider = r.riderId ? riderById.get(r.riderId) : null;
      return { ...r, riderName: rider ? riderLabel(rider) : null };
    })
  );
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
