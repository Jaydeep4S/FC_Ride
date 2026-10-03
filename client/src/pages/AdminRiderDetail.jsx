import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getAdminToken, setAdminToken } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import StatBlock from "../components/StatBlock.jsx";
import RideHistoryList from "../components/RideHistoryList.jsx";
import DateRangeFilter from "../components/DateRangeFilter.jsx";
import { isWithinDateRange } from "../lib/rideMath.js";

function calcAge(birthDate) {
  const dob = new Date(birthDate);
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export default function AdminRiderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [rider, setRider] = useState(null);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [riderData, rideData] = await Promise.all([
        api.adminGetRider(id),
        api.adminGetRiderRides(id),
      ]);
      setRider(riderData);
      setRides(rideData);
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
  }, [id, navigate]);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin");
      return;
    }
    load();
  }, [load, navigate]);

  async function review(status) {
    let reviewNote;
    if (status === "rejected") {
      reviewNote = window.prompt("Optional note for this rejection (shown only to admins):") || "";
    }
    setBusy(true);
    try {
      await api.adminReview(id, status, reviewNote);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRider() {
    if (!window.confirm(`Permanently delete ${rider.name}? This also removes their rides, GPS history and alerts. It cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.adminDeleteRider(id);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function copyTrackingLink() {
    const url = `${window.location.origin}/rides/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this tracking link:", url);
    }
  }

  const filteredRides = rides.filter((r) => isWithinDateRange(r.startedAt, dateFrom, dateTo));
  const totalKm = filteredRides.reduce((sum, r) => sum + r.distanceKm, 0);
  const totalSeconds = filteredRides.reduce((sum, r) => sum + r.durationSeconds, 0);
  const avgSpeed = totalSeconds > 0 ? totalKm / (totalSeconds / 3600) : 0;

  if (loading) {
    return <p className="py-16 text-center text-muted">Loading…</p>;
  }

  if (!rider) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="card p-8">
          <p className="font-display font-bold text-ink">{error || "Rider not found."}</p>
          <Link to="/admin/dashboard" className="btn-ghost mt-4 inline-block">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/admin/dashboard" className="mb-4 inline-flex items-center gap-1 font-display text-sm font-bold text-muted">
        ← Back to dashboard
      </Link>

      {error && (
        <p className="mb-4 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>
      )}

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Avatar src={api.adminPhotoUrl(id)} name={rider.name} size={24} rounded="rounded-3xl" />
            <div>
              <p className="font-display text-xl font-bold text-ink">
                {rider.name} {rider.bibNumber ? <span className="text-muted">#{rider.bibNumber}</span> : null}
              </p>
              <p className="text-sm text-muted">
                Submitted {new Date(rider.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <StatusBadge status={rider.status} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 text-sm text-ink sm:grid-cols-2">
          <p><span className="font-bold">Mobile:</span> {rider.mobileNumber}</p>
          <p><span className="font-bold">Emergency:</span> {rider.emergencyMobileNumber}</p>
          <p><span className="font-bold">Blood group:</span> {rider.bloodGroup}</p>
          <p><span className="font-bold">T-shirt:</span> {rider.tshirtSize}</p>
          <p><span className="font-bold">Age:</span> {calcAge(rider.birthDate)} yrs</p>
          <p><span className="font-bold">City:</span> {rider.city}</p>
          <p className="sm:col-span-2"><span className="font-bold">Address:</span> {rider.address}</p>
          {rider.reviewNote && (
            <p className="sm:col-span-2 text-muted"><span className="font-bold">Note:</span> {rider.reviewNote}</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={copyTrackingLink} className="pill bg-surface px-3 py-1.5 text-ink">
            {copied ? "✅ Copied!" : "🔗 Copy tracking link"}
          </button>
          {rider.status !== "approved" && (
            <button
              onClick={() => review("approved")}
              disabled={busy}
              className="pill bg-emerald-100 px-3 py-1.5 text-emerald-600 disabled:opacity-60"
            >
              ✅ Approve
            </button>
          )}
          {rider.status !== "rejected" && (
            <button
              onClick={() => review("rejected")}
              disabled={busy}
              className="pill bg-red-100 px-3 py-1.5 text-red-500 disabled:opacity-60"
            >
              ❌ Reject
            </button>
          )}
          {rider.status === "approved" && (
            <button
              onClick={() => review("removed")}
              disabled={busy}
              className="pill bg-amber-100 px-3 py-1.5 text-amber-700 disabled:opacity-60"
            >
              🗑 Remove from board
            </button>
          )}
          <button
            onClick={deleteRider}
            disabled={busy}
            className="pill bg-red-600 px-3 py-1.5 text-white disabled:opacity-60"
          >
            Delete permanently
          </button>
        </div>
      </div>

      <div className="card mt-5 p-5">
        <h2 className="mb-4 font-display text-lg font-extrabold text-ink">
          Practice Rides
          {(dateFrom || dateTo) && (
            <span className="ml-2 text-sm font-medium text-muted">
              ({filteredRides.length} of {rides.length})
            </span>
          )}
        </h2>

        {rides.length > 0 && (
          <div className="mb-4">
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
              onClear={() => {
                setDateFrom("");
                setDateTo("");
              }}
            />
          </div>
        )}

        <div className="mb-5 grid grid-cols-3 gap-2">
          <StatBlock label="Rides" value={filteredRides.length} />
          <StatBlock label="Total" value={totalKm.toFixed(1)} unit="km" />
          <StatBlock label="Avg Speed" value={avgSpeed.toFixed(1)} unit="km/h" />
        </div>

        <RideHistoryList
          rides={filteredRides}
          emptyMessage={
            rides.length === 0
              ? "This rider hasn't logged any practice rides yet."
              : "No rides in that date range."
          }
        />
      </div>
    </div>
  );
}
