import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import LiveMap from "../components/LiveMap.jsx";
import { formatRelativeTime } from "../lib/rideMath.js";

const POLL_MS = 15000;
const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;

function statusInfo(recordedAt) {
  if (!recordedAt) return { label: "Not tracking", dot: "bg-slate-300" };
  const age = Date.now() - new Date(recordedAt).getTime();
  if (age < FIVE_MIN) return { label: "Live", dot: "bg-emerald-500" };
  if (age < THIRTY_MIN) return { label: "Stale", dot: "bg-amber-500" };
  return { label: "Out of range?", dot: "bg-red-500" };
}

export default function AdminLiveMap() {
  const navigate = useNavigate();
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [trail, setTrail] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminGetLiveRiders();
      setRiders(data);
      setError("");
    } catch (err) {
      if (err.message.includes("Invalid or expired") || err.message.includes("Missing admin")) {
        setAdminToken(null);
        navigate("/admin");
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin");
      return;
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load, navigate]);

  async function selectRider(riderId) {
    setSelectedId(riderId);
    try {
      const detail = await api.adminGetRiderTrail(riderId);
      setTrail(detail.points);
    } catch {
      setTrail(null);
    }
  }

  const trackedCount = riders.filter((r) => r.recordedAt).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Live Map 🛰️</h1>
          <p className="text-sm text-muted">
            {trackedCount} of {riders.length} approved rider{riders.length === 1 ? "" : "s"} are
            currently tracking. Refreshes every 15s.
          </p>
        </div>
        <Link to="/admin/dashboard" className="btn-ghost px-4 py-2 text-sm">
          ← Dashboard
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>
      )}

      {loading ? (
        <p className="text-center text-muted">Loading…</p>
      ) : riders.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-4xl">🛰️</p>
          <p className="mt-2 font-display font-bold text-ink">No approved riders yet.</p>
          <p className="text-muted">Riders show up here once they're approved.</p>
        </div>
      ) : (
        <div className="lg:flex lg:items-start lg:gap-5">
          <div className="card mb-4 overflow-hidden lg:mb-0 lg:flex-1">
            <LiveMap
              riders={riders}
              trail={trail}
              selectedId={selectedId}
              onSelectRider={selectRider}
              height={460}
            />
          </div>

          <div className="space-y-2 lg:w-80 lg:flex-shrink-0">
            {riders.map((r) => {
              const status = statusInfo(r.recordedAt);
              return (
                <button
                  key={r.riderId}
                  onClick={() => selectRider(r.riderId)}
                  className={`card flex w-full items-center gap-3 p-3 text-left transition ${
                    selectedId === r.riderId ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <Avatar src={api.adminPhotoUrl(r.riderId)} name={r.name} size={10} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-ink">
                      {r.name} {r.bibNumber ? <span className="text-muted">#{r.bibNumber}</span> : null}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                      {status.label}
                      {r.recordedAt && ` · ${formatRelativeTime(r.recordedAt)}`}
                    </p>
                  </div>
                  <a
                    href={`tel:${r.mobileNumber}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      api.adminLogCall(r.riderId, "mobile");
                    }}
                    className="pill bg-surface px-2.5 py-1 text-ink"
                  >
                    📞
                  </a>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
