import crypto from "node:crypto";
import { db } from "../db.js";

const insert = db.prepare(
  `INSERT INTO audit_logs (id, riderId, actorType, actorId, actorName, action, details, createdAt)
   VALUES (@id, @riderId, @actorType, @actorId, @actorName, @action, @details, @createdAt)`
);

// Record one event. Never throws — a failed audit write must not fail the
// request it's describing.
export function logAudit({ riderId = null, actorType, actorId = null, actorName = null, action, details = null }) {
  try {
    insert.run({
      id: crypto.randomUUID(),
      riderId,
      actorType,
      actorId,
      actorName,
      action,
      details,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

export function riderActor(rider) {
  return { actorType: "rider", actorId: rider.id, actorName: riderLabel(rider) };
}

export function adminActor(req) {
  const username = req.admin?.username || "admin";
  return { actorType: "admin", actorId: username, actorName: username };
}

export function riderLabel(rider) {
  return rider.bibNumber ? `${rider.name} #${rider.bibNumber}` : rider.name;
}
