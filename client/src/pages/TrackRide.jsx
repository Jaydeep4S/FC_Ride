import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import Hero from "../components/Hero.jsx";
import RideMap from "../components/RideMap.jsx";
import StatBlock from "../components/StatBlock.jsx";
import RideHistoryList from "../components/RideHistoryList.jsx";
import DateRangeFilter from "../components/DateRangeFilter.jsx";
import { haversineKm, formatDuration, isWithinDateRange, formatRelativeTime } from "../lib/rideMath.js";
import {
  loadPendingLocations,
  savePendingLocations,
  loadPendingRides,
  savePendingRides,
  loadActiveRide,
  saveActiveRide,
  clearActiveRide,
} from "../lib/offlineStore.js";
import { setMyRiderId } from "../lib/myRider.js";

const MIN_ACCURACY_M = 50;
const SYNC_INTERVAL_MS = 20000;
const LOCATION_BATCH_SIZE = 200;
const STALE_RIDE_MS = 24 * 60 * 60 * 1000; // don't silently resume a days-old abandoned ride
const MESSAGES_POLL_MS = 60000;

function geoErrorMessage(err) {
  if (err.code === err.PERMISSION_DENIED) {
    return "Location access was denied. Allow location permission for this site to track a ride.";
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return "Couldn't determine your location. Try again outdoors with GPS enabled.";
  }
  if (err.code === err.TIMEOUT) {
    return "Still waiting for a GPS fix — this can take up to 30s outdoors, longer indoors. Tracking will pick up automatically once found.";
  }
  return "Something went wrong reading your location.";
}

export default function TrackRide() {
  const { riderId } = useParams();
  const [rider, setRider] = useState(null);
  const [riderError, setRiderError] = useState("");
  const [rides, setRides] = useState([]);

  const [tracking, setTracking] = useState(false);
  const [points, setPoints] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [geoError, setGeoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(null);
  const [resumedNotice, setResumedNotice] = useState(false);
  const [pendingCounts, setPendingCounts] = useState({ locations: 0, rides: 0 });
  const [syncFailedRide, setSyncFailedRide] = useState(null);
  const [myAlertId, setMyAlertId] = useState(() => localStorage.getItem(`fc_my_alert_${riderId}`));
  const [sosBusy, setSosBusy] = useState(false);
  const [sosError, setSosError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [messages, setMessages] = useState([]);

  const watchIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const distanceKmRef = useRef(0);
  const pendingLocationsRef = useRef([]);
  const pendingRidesRef = useRef([]);

  useEffect(() => {
    api
      .getStatus(riderId)
      .then((data) => {
        setRider(data);
        setMyRiderId(riderId);
      })
      .catch((err) => {
        // A TypeError means the request never reached the server (offline,
        // opened from the cached app shell) — not proof the rider doesn't
        // exist, so let tracking proceed rather than showing a scary error.
        if (!(err instanceof TypeError)) {
          setRiderError("We couldn't find a rider with this link.");
        }
      });
    api
      .getRiderRides(riderId)
      .then(setRides)
      .catch(() => {});
  }, [riderId]);

  // Admin broadcasts. Polled so a message sent mid-ride still shows up.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getMyMessages(riderId)
        .then((data) => alive && setMessages(data))
        .catch(() => {});
    load();
    const interval = setInterval(load, MESSAGES_POLL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [riderId]);

  // Pick up any location pings / finished rides that never made it to the
  // server last time (dead zone, tab killed, etc.) and keep retrying them.
  useEffect(() => {
    pendingLocationsRef.current = loadPendingLocations(riderId);
    pendingRidesRef.current = loadPendingRides(riderId);
    updatePendingCounts();

    const flush = () => flushQueues();
    flush();
    const interval = setInterval(flush, SYNC_INTERVAL_MS);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId]);

  // If a ride was left mid-flight (app closed, phone died, dead zone the
  // whole time), pick GPS tracking back up right where it left off.
  useEffect(() => {
    const saved = loadActiveRide(riderId);
    if (saved && saved.points?.length > 0 && Date.now() - saved.startedAtMs < STALE_RIDE_MS) {
      setPoints(saved.points);
      setDistanceKm(saved.distanceKm);
      distanceKmRef.current = saved.distanceKm;
      startTimeRef.current = saved.startedAtMs;
      setNow(Date.now());
      setTracking(true);
      setResumedNotice(true);
      armWatch();
    } else if (saved) {
      clearActiveRide(riderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId]);

  useEffect(() => {
    if (!tracking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [tracking]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const elapsedSeconds = tracking && startTimeRef.current ? Math.floor((now - startTimeRef.current) / 1000) : 0;
  const liveAvgSpeed = elapsedSeconds > 0 ? distanceKm / (elapsedSeconds / 3600) : 0;

  function updatePendingCounts() {
    setPendingCounts({
      locations: pendingLocationsRef.current.length,
      rides: pendingRidesRef.current.length,
    });
  }

  function queueLocation(point) {
    pendingLocationsRef.current = [...pendingLocationsRef.current, point];
    savePendingLocations(riderId, pendingLocationsRef.current);
    updatePendingCounts();
  }

  function queueRide(payload) {
    pendingRidesRef.current = [...pendingRidesRef.current, payload];
    savePendingRides(riderId, pendingRidesRef.current);
    updatePendingCounts();
  }

  async function flushQueues() {
    if (pendingLocationsRef.current.length > 0) {
      const batch = pendingLocationsRef.current.slice(0, LOCATION_BATCH_SIZE);
      try {
        await api.sendLocationPing(riderId, batch);
        pendingLocationsRef.current = pendingLocationsRef.current.slice(batch.length);
        savePendingLocations(riderId, pendingLocationsRef.current);
        updatePendingCounts();
      } catch {
        // still offline — retried on the next tick
      }
    }

    if (pendingRidesRef.current.length > 0) {
      const [next, ...rest] = pendingRidesRef.current;
      try {
        const { id } = await api.saveRide(next);
        pendingRidesRef.current = rest;
        savePendingRides(riderId, rest);
        updatePendingCounts();
        setJustSaved({ id, ...next });
        const refreshed = await api.getRiderRides(riderId);
        setRides(refreshed);
      } catch (err) {
        if (err instanceof TypeError) {
          // No signal reached at all — stays queued, retried next tick.
        } else {
          // The server was reached and rejected this ride outright — retrying
          // forever won't fix that, so stop looping on it and say so clearly
          // instead of it just silently never showing up.
          pendingRidesRef.current = rest;
          savePendingRides(riderId, rest);
          updatePendingCounts();
          setSyncFailedRide({ ...next, reason: err.message });
        }
      }
    }
  }

  function armWatch() {
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError("");
        const { latitude, longitude, accuracy } = pos.coords;
        if (accuracy && accuracy > MIN_ACCURACY_M) return;

        const fixTimeMs = pos.timestamp || Date.now();
        const nextPoint = [latitude, longitude, fixTimeMs];
        const recordedAt = new Date(fixTimeMs).toISOString();

        setPoints((prev) => {
          const nextPoints = [...prev, nextPoint];
          if (prev.length > 0) {
            distanceKmRef.current += haversineKm(prev[prev.length - 1], nextPoint);
          }
          setDistanceKm(distanceKmRef.current);
          saveActiveRide(riderId, {
            points: nextPoints,
            distanceKm: distanceKmRef.current,
            startedAtMs: startTimeRef.current,
          });
          return nextPoints;
        });

        queueLocation({ lat: latitude, lng: longitude, recordedAt });
      },
      (err) => setGeoError(geoErrorMessage(err)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  }

  function startRide() {
    if (!navigator.geolocation) {
      setGeoError("This browser doesn't support location tracking.");
      return;
    }
    setGeoError("");
    setJustSaved(null);
    setResumedNotice(false);
    setPoints([]);
    setDistanceKm(0);
    distanceKmRef.current = 0;
    startTimeRef.current = Date.now();
    setNow(Date.now());
    setTracking(true);
    saveActiveRide(riderId, { points: [], distanceKm: 0, startedAtMs: startTimeRef.current });
    armWatch();
  }

  async function stopRide() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    setResumedNotice(false);

    if (points.length < 2) {
      setGeoError("That ride was too short to save — try tracking a bit longer.");
      clearActiveRide(riderId);
      return;
    }

    const durationSeconds = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
    const avgSpeedKmh = distanceKm / (durationSeconds / 3600);
    const payload = {
      riderId,
      distanceKm,
      durationSeconds,
      avgSpeedKmh,
      startedAt: new Date(startTimeRef.current).toISOString(),
      endedAt: new Date().toISOString(),
      path: points,
    };

    clearActiveRide(riderId);
    setSaving(true);
    try {
      const { id } = await api.saveRide(payload);
      setJustSaved({ id, ...payload });
      const refreshed = await api.getRiderRides(riderId);
      setRides(refreshed);
    } catch {
      // No signal right now — queue it and it'll save automatically once
      // you're back in range, same as the location pings.
      queueRide(payload);
      setJustSaved({ ...payload, queued: true });
    } finally {
      setSaving(false);
    }
  }

  async function sendSos() {
    if (!window.confirm("Send a HELP alert to everyone on the ride? Every open screen will sound an alarm until silenced.")) {
      return;
    }
    const last = points[points.length - 1];
    setSosBusy(true);
    setSosError("");
    try {
      const { id } = await api.createAlert(riderId, last?.[0] ?? null, last?.[1] ?? null);
      localStorage.setItem(`fc_my_alert_${riderId}`, id);
      setMyAlertId(id);
    } catch (err) {
      setSosError(err.message);
    } finally {
      setSosBusy(false);
    }
  }

  async function imSafe() {
    setSosBusy(true);
    setSosError("");
    try {
      await api.resolveAlert(myAlertId, riderId);
      localStorage.removeItem(`fc_my_alert_${riderId}`);
      setMyAlertId(null);
    } catch (err) {
      setSosError(err.message);
    } finally {
      setSosBusy(false);
    }
  }

  if (riderError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="card p-8">
          <p className="text-4xl">🔗</p>
          <p className="mt-3 font-display font-bold text-ink">{riderError}</p>
          <p className="mt-1 text-sm text-muted">
            Use the personal tracking link you got after registering.
          </p>
        </div>
      </div>
    );
  }

  const hasPending = pendingCounts.locations > 0 || pendingCounts.rides > 0;
  const filteredRides = rides.filter((r) => isWithinDateRange(r.startedAt, dateFrom, dateTo));

  return (
    <div>
      <Hero
        eyebrow="PRACTICE TRACKER"
        title={rider ? `Ride on, ${rider.name.split(" ")[0]}! 🚴` : "Practice Tracker"}
        subtitle="Track distance, speed, time, and your route — keeps recording even with no signal."
        stats={[{ icon: "📈", label: `${rides.length} Rides Logged` }]}
      />

      <div className="mx-auto max-w-xl px-4 py-6 space-y-5">
        {hasPending && (
          <div className="card flex items-center gap-3 border-2 border-amber-300 bg-amber-50 p-4">
            <span className="text-2xl">📡</span>
            <p className="text-sm font-bold text-amber-700">
              No signal right now — {pendingCounts.locations > 0 && `${pendingCounts.locations} location update(s)`}
              {pendingCounts.locations > 0 && pendingCounts.rides > 0 && " and "}
              {pendingCounts.rides > 0 && `${pendingCounts.rides} ride(s)`} waiting to sync. This
              happens automatically once you're back in range.
            </p>
          </div>
        )}

        {resumedNotice && (
          <div className="card border-2 border-primary/30 bg-primary/5 p-4 text-center text-sm font-bold text-primary">
            ▶️ Picked up your in-progress ride right where it left off.
          </div>
        )}

        {syncFailedRide && (
          <div className="card border-2 border-red-300 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-700">
              ⚠️ A ride couldn't be saved and was dropped: {syncFailedRide.reason}
            </p>
            <p className="mt-1 text-xs text-red-600">
              {syncFailedRide.distanceKm.toFixed(2)} km on{" "}
              {new Date(syncFailedRide.startedAt).toLocaleString()}. If this keeps happening,
              tell whoever manages this app.
            </p>
            <button
              onClick={() => setSyncFailedRide(null)}
              className="mt-2 pill bg-white px-3 py-1 text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {messages.length > 0 && (
          <div className="card border-2 border-primary/30 p-5">
            <p className="mb-3 font-display text-base font-extrabold text-ink">📢 Messages from the organisers</p>
            <ul className="space-y-2">
              {messages.slice(0, 5).map((m) => (
                <li key={m.id} className="rounded-2xl bg-primary/5 p-3">
                  <p className="whitespace-pre-wrap text-sm text-ink">{m.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatRelativeTime(m.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card border-2 border-red-200 p-5">
          <p className="font-display text-base font-extrabold text-ink">Need help?</p>
          <p className="mb-3 text-sm text-muted">
            Raises an alarm on every rider's and admin's screen until someone silences it.
          </p>
          {myAlertId ? (
            <div className="space-y-2">
              <p className="rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-700">
                🆘 Help request sent — the group has been alerted.
              </p>
              <button
                onClick={imSafe}
                disabled={sosBusy}
                className="w-full rounded-2xl bg-emerald-600 px-5 py-3 font-display text-lg font-bold text-white disabled:opacity-60"
              >
                ✅ I'm safe now
              </button>
            </div>
          ) : (
            <button
              onClick={sendSos}
              disabled={sosBusy}
              className="w-full rounded-2xl bg-red-600 px-5 py-3 font-display text-lg font-bold text-white shadow-softSm disabled:opacity-60"
            >
              🆘 I need help
            </button>
          )}
          {sosError && <p className="mt-2 text-sm font-bold text-red-600">{sosError}</p>}
        </div>

        <div className="card p-5">
          <RideMap points={points} live={tracking} height={240} />

          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatBlock label="Distance" value={distanceKm.toFixed(2)} unit="km" />
            <StatBlock label="Avg Speed" value={liveAvgSpeed.toFixed(1)} unit="km/h" />
            <StatBlock label="Time" value={formatDuration(elapsedSeconds)} />
          </div>

          {geoError && (
            <p
              className={`mt-4 rounded-2xl p-3 text-sm font-bold ${
                tracking ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
              }`}
            >
              {geoError}
            </p>
          )}

          <div className="mt-4">
            {!tracking ? (
              <button onClick={startRide} className="btn-primary w-full py-3 text-lg">
                ▶️ Start Ride
              </button>
            ) : (
              <button
                onClick={stopRide}
                disabled={saving}
                className="w-full rounded-2xl bg-red-500 px-5 py-3 font-display text-lg font-bold text-white shadow-softSm transition active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "Saving…" : "⏹ End Ride"}
              </button>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-muted">
            Keep this page open while riding. GPS keeps working with no signal — your ride and
            location updates just queue up and sync automatically once you're back in range.
          </p>
        </div>

        {justSaved && (
          <div className="card p-5 text-center">
            <p className="text-3xl">{justSaved.queued ? "📡" : "🎉"}</p>
            <p className="mt-1 font-display font-bold text-ink">
              {justSaved.queued ? "Ride finished — will sync when back online" : "Ride saved!"}
            </p>
            <p className="text-sm text-muted">
              {justSaved.distanceKm.toFixed(2)} km at {justSaved.avgSpeedKmh.toFixed(1)} km/h avg
            </p>
          </div>
        )}

        <div>
          <h2 className="mb-3 font-display text-lg font-extrabold text-ink">
            Ride History
            {(dateFrom || dateTo) && (
              <span className="ml-2 text-sm font-medium text-muted">
                ({filteredRides.length} of {rides.length})
              </span>
            )}
          </h2>

          {rides.length > 0 && (
            <div className="mb-3">
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

          <RideHistoryList
            rides={filteredRides}
            emptyMessage={
              rides.length === 0
                ? "No practice rides logged yet — start your first one above."
                : "No rides in that date range."
            }
          />
        </div>
      </div>
    </div>
  );
}
