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

  photoUrl(id) {
    return `${BASE}/riders/${id}/photo`;
  },

  adminPhotoUrl(id) {
    return `${BASE}/admin/riders/${id}/photo`;
  },

  authHeaders,
};
