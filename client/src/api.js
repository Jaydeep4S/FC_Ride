const BASE = "/api";

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export function getAdminToken() {
  return localStorage.getItem("fc_ride_squad_admin_token");
}

export function setAdminToken(token) {
  if (token) localStorage.setItem("fc_ride_squad_admin_token", token);
  else localStorage.removeItem("fc_ride_squad_admin_token");
}

export function isSessionError(err) {
  return err.message.includes("Invalid or expired") || err.message.includes("Missing admin");
}

function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async registerRider(formData) {
    const res = await fetch(`${BASE}/riders`, { method: "POST", body: formData });
    return handle(res);
  },

  async getBoard() {
    const res = await fetch(`${BASE}/riders/board`);
    return handle(res);
  },

  async getStatus(id) {
    const res = await fetch(`${BASE}/riders/${id}/status`);
    return handle(res);
  },

  async lookupRider(mobileNumber) {
    const res = await fetch(`${BASE}/riders/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobileNumber }),
    });
    return handle(res);
  },

  async adminLogin(username, password) {
    const res = await fetch(`${BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return handle(res);
  },

  async adminStats() {
    const res = await fetch(`${BASE}/admin/stats`, { headers: authHeaders() });
    return handle(res);
  },

  async adminListRiders(status) {
    const qs = status && status !== "all" ? `?status=${status}` : "";
    const res = await fetch(`${BASE}/admin/riders${qs}`, { headers: authHeaders() });
    return handle(res);
  },

  async adminGetRider(id) {
    const res = await fetch(`${BASE}/admin/riders/${id}`, { headers: authHeaders() });
    return handle(res);
  },

  async adminCreateRider(formData) {
    const res = await fetch(`${BASE}/admin/riders`, { method: "POST", headers: authHeaders(), body: formData });
    return handle(res);
  },

  async adminDeleteRider(id) {
    const res = await fetch(`${BASE}/admin/riders/${id}`, { method: "DELETE", headers: authHeaders() });
    return handle(res);
  },

  async adminReview(id, status, reviewNote) {
    const res = await fetch(`${BASE}/admin/riders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status, reviewNote }),
    });
    return handle(res);
  },

  async saveRide(payload) {
    const res = await fetch(`${BASE}/rides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handle(res);
  },

  async getRiderRides(riderId) {
    const res = await fetch(`${BASE}/riders/${riderId}/rides`);
    return handle(res);
  },

  async getRide(rideId) {
    const res = await fetch(`${BASE}/rides/${rideId}`);
    return handle(res);
  },

  async sendLocationPing(riderId, points) {
    const res = await fetch(`${BASE}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riderId, points }),
    });
    return handle(res);
  },

  async adminGetLiveRiders() {
    const res = await fetch(`${BASE}/admin/live`, { headers: authHeaders() });
    return handle(res);
  },

  async adminGetRiderTrail(riderId) {
    const res = await fetch(`${BASE}/admin/live/${riderId}/trail`, { headers: authHeaders() });
    return handle(res);
  },

  async adminGetRiderRides(riderId) {
    const res = await fetch(`${BASE}/admin/riders/${riderId}/rides`, { headers: authHeaders() });
    return handle(res);
  },

  async adminGetFlaggedRides() {
    const res = await fetch(`${BASE}/admin/flagged-rides`, { headers: authHeaders() });
    return handle(res);
  },

  async createAlert(riderId, lat, lng) {
    const res = await fetch(`${BASE}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riderId, lat, lng }),
    });
    return handle(res);
  },

  async getActiveAlerts() {
    const res = await fetch(`${BASE}/alerts/active`);
    return handle(res);
  },

  async resolveAlert(id, riderId) {
    const res = await fetch(`${BASE}/alerts/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ riderId }),
    });
    return handle(res);
  },

  // Returns { name, mobileNumber } for an approved squad mate; the caller
  // must be an approved rider themselves.
  async callRider(targetId, callerId) {
    const res = await fetch(`${BASE}/riders/${targetId}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callerId }),
    });
    return handle(res);
  },

  async getMyMessages(riderId) {
    const res = await fetch(`${BASE}/riders/${riderId}/messages`);
    return handle(res);
  },

  // Fire-and-forget: records that the admin dialed this rider. keepalive lets
  // it finish even as the tel: link hands off to the phone app.
  adminLogCall(riderId, which = "mobile") {
    fetch(`${BASE}/admin/riders/${riderId}/call-log`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ which }),
    }).catch(() => {});
  },

  async adminListAlerts(status) {
    const qs = status && status !== "all" ? `?status=${status}` : "";
    const res = await fetch(`${BASE}/admin/alerts${qs}`, { headers: authHeaders() });
    return handle(res);
  },

  async adminSendMessage(body, audience, riderIds) {
    const res = await fetch(`${BASE}/admin/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ body, audience, riderIds }),
    });
    return handle(res);
  },

  async adminListMessages() {
    const res = await fetch(`${BASE}/admin/messages`, { headers: authHeaders() });
    return handle(res);
  },

  async adminAudit({ riderId, action, before, limit } = {}) {
    const qs = new URLSearchParams();
    if (riderId) qs.set("riderId", riderId);
    if (action) qs.set("action", action);
    if (before) qs.set("before", before);
    if (limit) qs.set("limit", String(limit));
    const res = await fetch(`${BASE}/admin/audit?${qs}`, { headers: authHeaders() });
    return handle(res);
  },

  photoUrl(id) {
    return `${BASE}/riders/${id}/photo`;
  },

  adminPhotoUrl(id) {
    return `${BASE}/admin/riders/${id}/photo`;
  },

  authHeaders,
};
