import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const TABS = [
  { key: "pending", label: "Pending", icon: "⏳" },
  { key: "approved", label: "Approved", icon: "✅" },
  { key: "rejected", label: "Rejected", icon: "❌" },
  { key: "removed", label: "Removed", icon: "🗑️" },
  { key: "all", label: "All riders", icon: "📋" },
];

function calcAge(birthDate) {
  const dob = new Date(birthDate);
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function StatCard({ icon, label, value, tone }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-lg ${tone}`}>
        {icon}
      </span>
      <div>
        <p className="font-display text-xl font-extrabold text-ink">{value}</p>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("pending");
  const [riders, setRiders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const navigate = useNavigate();

  const bounceToLogin = useCallback(
    (message) => {
      if (message.includes("Invalid or expired") || message.includes("Missing admin")) {
        setAdminToken(null);
        navigate("/admin");
        return true;
      }
      return false;
    },
    [navigate]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [riderData, statData] = await Promise.all([
        api.adminListRiders(tab),
        api.adminStats(),
      ]);
      setRiders(riderData);
      setStats(statData);
    } catch (err) {
      if (!bounceToLogin(err.message)) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, bounceToLogin]);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin");
      return;
    }
    load();
  }, [load, navigate]);

  async function review(id, status) {
    let reviewNote;
    if (status === "rejected") {
      reviewNote = window.prompt("Optional note for this rejection (shown only to admins):") || "";
    }
    setBusyId(id);
    try {
      await api.adminReview(id, status, reviewNote);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRider(r) {
    if (!window.confirm(`Permanently delete ${r.name}? This also removes their rides, GPS history and alerts. It cannot be undone.`)) {
      return;
    }
    setBusyId(r.id);
    try {
      await api.adminDeleteRider(r.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function copyTrackingLink(id) {
    const url = `${window.location.origin}/rides/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      window.prompt("Copy this tracking link:", url);
    }
  }

  function logout() {
    setAdminToken(null);
    navigate("/admin");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="lg:flex lg:items-start lg:gap-6">
        <aside className="mb-4 lg:sticky lg:top-24 lg:mb-0 lg:w-56 lg:flex-shrink-0">
          <div className="card hidden p-3 lg:block">
            <div className="mb-2 flex items-center gap-2 px-2 py-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primaryDark text-base">
                🛠️
              </span>
              <span className="font-display font-extrabold text-ink">Admin</span>
            </div>
            <nav className="flex flex-col gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-display text-sm font-bold transition ${
                    tab === t.key ? "bg-primary text-white" : "text-ink hover:bg-surface"
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>
            <Link
              to="/admin/riders/new"
              className="mt-2 flex items-center gap-3 rounded-2xl bg-primary px-3 py-2.5 text-left font-display text-sm font-bold text-white transition hover:opacity-90"
            >
              ➕ Add rider
            </Link>
            <Link
              to="/admin/live"
              className="mt-2 flex items-center gap-3 rounded-2xl bg-night px-3 py-2.5 text-left font-display text-sm font-bold text-white transition hover:opacity-90"
            >
              🛰️ Live Map
            </Link>
            <Link
              to="/admin/flagged"
              className="mt-2 flex items-center gap-3 rounded-2xl bg-red-50 px-3 py-2.5 text-left font-display text-sm font-bold text-red-600 transition hover:bg-red-100"
            >
              🚩 Flagged Rides
            </Link>
            <button
              onClick={logout}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-display text-sm font-bold text-muted hover:bg-surface"
            >
              🚪 Log out
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 lg:hidden">
            <h1 className="font-display text-2xl font-extrabold text-ink">Admin 🛠️</h1>
            <div className="flex gap-2">
              <Link to="/admin/live" className="pill bg-night px-3 py-2 text-white">
                🛰️ Live
              </Link>
              <Link to="/admin/flagged" className="pill bg-red-50 px-3 py-2 text-red-600">
                🚩 Flagged
              </Link>
              <button onClick={logout} className="btn-ghost px-4 py-2 text-sm">
                Log out
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {stats && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard icon="📋" label="Total" value={stats.total} tone="bg-primary/10 text-primary" />
              <StatCard icon="⏳" label="Pending" value={stats.pending} tone="bg-amber-100 text-amber-600" />
              <StatCard icon="✅" label="Approved" value={stats.approved} tone="bg-emerald-100 text-emerald-600" />
              <StatCard icon="❌" label="Rejected" value={stats.rejected} tone="bg-red-100 text-red-500" />
              <Link to="/admin/flagged" className="block">
                <StatCard icon="🚩" label="Flagged Rides" value={stats.flaggedRides} tone="bg-red-100 text-red-500" />
              </Link>
            </div>
          )}

          <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pill whitespace-nowrap px-4 py-2 text-sm transition ${
                  tab === t.key ? "bg-primary text-white" : "bg-white text-ink shadow-card"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {loading && <p className="text-center text-muted">Loading…</p>}
          {error && (
            <p className="mb-4 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>
          )}

          {!loading && riders.length === 0 && (
            <div className="card p-8 text-center">
              <p className="font-display font-bold text-ink">No riders here.</p>
            </div>
          )}

          <div className="space-y-4">
            {riders.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link to={`/admin/riders/${r.id}`} className="flex items-center gap-3">
                    <Avatar src={api.adminPhotoUrl(r.id)} name={r.name} size={14} />
                    <div>
                      <p className="font-display text-lg font-bold text-ink hover:underline">
                        {r.name} {r.bibNumber ? <span className="text-muted">#{r.bibNumber}</span> : null}
                      </p>
                      <p className="text-sm text-muted">
                        Submitted {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </Link>
                  <StatusBadge status={r.status} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-ink sm:grid-cols-2">
                  <p><span className="font-bold">Mobile:</span> {r.mobileNumber}</p>
                  <p><span className="font-bold">Emergency:</span> {r.emergencyMobileNumber}</p>
                  <p><span className="font-bold">Blood group:</span> {r.bloodGroup}</p>
                  <p><span className="font-bold">T-shirt:</span> {r.tshirtSize}</p>
                  <p><span className="font-bold">Age:</span> {calcAge(r.birthDate)} yrs</p>
                  <p><span className="font-bold">City:</span> {r.city}</p>
                  <p className="sm:col-span-2"><span className="font-bold">Address:</span> {r.address}</p>
                  {r.reviewNote && (
                    <p className="sm:col-span-2 text-muted"><span className="font-bold">Note:</span> {r.reviewNote}</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/admin/riders/${r.id}`} className="pill bg-primary/10 px-3 py-1.5 text-primary">
                    📊 View details & rides
                  </Link>
                  <button
                    onClick={() => copyTrackingLink(r.id)}
                    className="pill bg-surface px-3 py-1.5 text-ink"
                  >
                    {copiedId === r.id ? "✅ Copied!" : "🔗 Copy tracking link"}
                  </button>
                  {r.status !== "approved" && (
                    <button
                      onClick={() => review(r.id, "approved")}
                      disabled={busyId === r.id}
                      className="pill bg-emerald-100 px-3 py-1.5 text-emerald-600 disabled:opacity-60"
                    >
                      ✅ Approve
                    </button>
                  )}
                  {r.status !== "rejected" && (
                    <button
                      onClick={() => review(r.id, "rejected")}
                      disabled={busyId === r.id}
                      className="pill bg-red-100 px-3 py-1.5 text-red-500 disabled:opacity-60"
                    >
                      ❌ Reject
                    </button>
                  )}
                  {r.status === "approved" && (
                    <button
                      onClick={() => review(r.id, "removed")}
                      disabled={busyId === r.id}
                      className="pill bg-amber-100 px-3 py-1.5 text-amber-700 disabled:opacity-60"
                    >
                      🗑 Remove from board
                    </button>
                  )}
                  <button
                    onClick={() => deleteRider(r)}
                    disabled={busyId === r.id}
                    className="pill bg-red-600 px-3 py-1.5 text-white disabled:opacity-60"
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
