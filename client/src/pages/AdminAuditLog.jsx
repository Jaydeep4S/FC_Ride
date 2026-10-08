import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken, isSessionError } from "../api.js";
import AuditList, { AUDIT_ACTIONS } from "../components/AuditList.jsx";

const PAGE_SIZE = 100;

export default function AdminAuditLog() {
  const navigate = useNavigate();
  const [riders, setRiders] = useState([]);
  const [riderId, setRiderId] = useState("");
  const [action, setAction] = useState("");
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleError = useCallback(
    (err) => {
      if (isSessionError(err)) {
        setAdminToken(null);
        navigate("/admin");
        return;
      }
      setError(err.message);
    },
    [navigate]
  );

  const load = useCallback(
    async (before) => {
      setLoading(true);
      setError("");
      try {
        const rows = await api.adminAudit({ riderId, action, before, limit: PAGE_SIZE });
        setEntries((cur) => (before ? [...cur, ...rows] : rows));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [riderId, action, handleError]
  );

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin");
      return;
    }
    api.adminListRiders("all").then(setRiders).catch(handleError);
  }, [navigate, handleError]);

  useEffect(() => {
    if (getAdminToken()) load();
  }, [load]);

  const sortedRiders = [...riders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Audit Log 📜</h1>
          <p className="text-sm text-muted">
            Everything that's happened: registrations, approvals, rides, SOS alerts, calls and messages.
          </p>
        </div>
        <Link to="/admin/dashboard" className="btn-ghost px-4 py-2 text-sm">
          ← Dashboard
        </Link>
      </div>

      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-display text-xs font-bold uppercase text-muted">Rider</span>
          <select className="input" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
            <option value="">All riders</option>
            {sortedRiders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.bibNumber ? ` #${r.bibNumber}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-display text-xs font-bold uppercase text-muted">Event</span>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All events</option>
            {Object.entries(AUDIT_ACTIONS).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.icon} {meta.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>}

      <div className="card p-4">
        {loading && entries.length === 0 ? (
          <p className="text-center text-muted">Loading…</p>
        ) : (
          <AuditList entries={entries} />
        )}
        {hasMore && (
          <button
            onClick={() => load(entries[entries.length - 1].createdAt)}
            disabled={loading}
            className="btn-ghost mt-3 w-full py-2 text-sm"
          >
            {loading ? "Loading…" : "Load older"}
          </button>
        )}
      </div>
    </div>
  );
}
