import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { readTable, mutateTable } from "../db.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { logAudit, riderActor } from "../lib/audit.js";

const router = express.Router();
const raiseLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5 });

// Returns the admin's token payload, or null if this isn't an admin request.
function adminFrom(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// A rider raises a help request. Re-raising while one is already active
// returns the existing alert instead of stacking duplicates.
router.post("/", raiseLimiter, (req, res) => {
  const { riderId, lat, lng, message } = req.body || {};
  const rider = readTable("riders").find((r) => r.id === riderId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });

  const existing = readTable("alerts").find((a) => a.riderId === riderId && !a.resolvedAt);
  if (existing) return res.status(200).json({ id: existing.id, existing: true });

  const hasLocation =
    typeof lat === "number" && typeof lng === "number" &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const id = crypto.randomUUID();

  mutateTable("alerts", (rows) => {
    rows.push({
      id,
      riderId,
      lat: hasLocation ? lat : null,
      lng: hasLocation ? lng : null,
      message: typeof message === "string" && message.trim() ? message.trim().slice(0, 200) : null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  logAudit({
    riderId,
    ...riderActor(rider),
    action: "help_requested",
    details: hasLocation ? `SOS raised at ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "SOS raised (no location)",
  });

  res.status(201).json({ id });
});

// Public so every rider's and admin's open screen can sound the alarm.
// Deliberately omits phone numbers.
router.get("/active", (_req, res) => {
  const riders = new Map(readTable("riders").map((r) => [r.id, r]));
  const rows = readTable("alerts")
    .filter((a) => !a.resolvedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((a) => {
      const rider = riders.get(a.riderId);
      return {
        id: a.id,
        riderId: a.riderId,
        riderName: rider?.name ?? "Unknown rider",
        bibNumber: rider?.bibNumber ?? null,
        lat: a.lat,
        lng: a.lng,
        message: a.message,
        createdAt: a.createdAt,
      };
    });
  res.json(rows);
});

// Resolved by the rider who raised it ("I'm safe"), or by an admin.
router.post("/:id/resolve", (req, res) => {
  const { riderId } = req.body || {};
  const admin = adminFrom(req);
  let alertRiderId = null;

  const result = mutateTable("alerts", (rows) => {
    const alert = rows.find((a) => a.id === req.params.id);
    if (!alert) return "notfound";
    if (alert.resolvedAt) return "already";
    if (!admin && alert.riderId !== riderId) return "forbidden";
    alertRiderId = alert.riderId;
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = admin ? "admin" : "rider";
    return "ok";
  });

  if (result === "notfound") return res.status(404).json({ error: "Alert not found." });
  if (result === "forbidden") return res.status(403).json({ error: "Only the rider or an admin can resolve this." });

  if (result === "ok") {
    const rider = readTable("riders").find((r) => r.id === alertRiderId);
    const actor = admin
      ? { actorType: "admin", actorId: admin.username, actorName: admin.username }
      : rider
        ? riderActor(rider)
        : { actorType: "rider", actorId: alertRiderId };
    logAudit({
      riderId: alertRiderId,
      ...actor,
      action: "help_resolved",
      details: admin ? "Marked resolved by admin" : "Rider marked themselves safe",
    });
  }
  res.json({ ok: true });
});

export default router;
