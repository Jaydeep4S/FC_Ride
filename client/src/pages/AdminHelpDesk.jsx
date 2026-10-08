import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken, isSessionError } from "../api.js";
import AdminCallButtons from "../components/AdminCallButtons.jsx";
import { formatRelativeTime } from "../lib/rideMath.js";

const TABS = [
  { key: "active", label: "Active", icon: "🆘" },
  { key: "resolved", label: "Resolved", icon: "🤝" },
  { key: "all", label: "All", icon: "📋" },
];
const POLL_MS = 10000;

export default function AdminHelpDesk() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("active");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setAlerts(await api.adminListAlerts(tab));
      setError("");
    } catch (err) {
      if (isSessionError(err)) {
        setAdminToken(null);
        navigate("/admin");
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, navigate]);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin");
      return;
    }
    setLoading(true);
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load, navigate]);

  async function resolve(alert) {
    setBusyId(alert.id);
    try {
      await api.resolveAlert(alert.id, null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Help Desk 🆘</h1>
          <p className="text-sm text-muted">
            Every SOS raised by a rider. Call them or their emergency contact, then mark it resolved.
          </p>
        </div>
        <Link to="/admin/dashboard" className="btn-ghost px-4 py-2 text-sm">
          ← Dashboard
        </Link>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto">
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

      {error && <p className="mb-4 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>}

      {loading ? (
        <p className="text-center text-muted">Loading…</p>
      ) : alerts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-2 font-display font-bold text-ink">
            {tab === "active" ? "Nobody needs help right now." : "No help requests here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className={`card p-4 ${a.resolvedAt ? "" : "ring-2 ring-red-500"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/admin/riders/${a.riderId}`} className="font-display text-base font-bold text-ink hover:underline">
                    {a.riderName} {a.bibNumber ? <span className="text-muted">#{a.bibNumber}</span> : null}
                  </Link>
                  <p className="text-xs text-muted">
                    Raised {new Date(a.createdAt).toLocaleString()} ({formatRelativeTime(a.createdAt)})
                    {a.bloodGroup && ` · Blood group ${a.bloodGroup}`}
                  </p>
                </div>
                <span
                  className={`pill ${a.resolvedAt ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}
                >
                  {a.resolvedAt ? `Resolved by ${a.resolvedBy}` : "Active"}
                </span>
              </div>

              {a.message && <p className="mt-2 text-sm text-ink">“{a.message}”</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                <AdminCallButtons
                  riderId={a.riderId}
                  mobileNumber={a.mobileNumber}
                  emergencyMobileNumber={a.emergencyMobileNumber}
                />
                {a.lat != null && (
                  <a
                    href={`https://maps.google.com/?q=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="pill bg-primary/10 px-3 py-1.5 text-primary"
                  >
                    📍 Open location
                  </a>
                )}
                {!a.resolvedAt && (
                  <button
                    onClick={() => resolve(a)}
                    disabled={busyId === a.id}
                    className="pill bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-60"
                  >
                    ✅ Mark resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
