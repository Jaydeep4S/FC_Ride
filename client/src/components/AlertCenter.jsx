import { useEffect, useState } from "react";
import { api, getAdminToken } from "../api.js";
import { unlockAudio, isAudioRunning, startSiren, stopSiren } from "../lib/siren.js";
import { formatRelativeTime } from "../lib/rideMath.js";

const SILENCED_KEY = "fc_silenced_alerts";
const POLL_MS = 5000;

function loadSilenced() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SILENCED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveSilenced(set) {
  try {
    localStorage.setItem(SILENCED_KEY, JSON.stringify([...set]));
  } catch {
    // storage unavailable — silence lasts for this page only
  }
}

export default function AlertCenter() {
  const [alerts, setAlerts] = useState([]);
  const [silenced, setSilenced] = useState(loadSilenced);
  const [audioReady, setAudioReady] = useState(isAudioRunning());
  const isAdmin = !!getAdminToken();

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const data = await api.getActiveAlerts();
        if (alive) setAlerts(data);
      } catch {
        // offline — keep showing the last known alerts
      }
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const unlock = () => unlockAudio((ok) => setAudioReady(ok));
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const ringing = alerts.some((a) => !silenced.has(a.id));
  useEffect(() => {
    if (ringing && audioReady) startSiren();
    else stopSiren();
  }, [ringing, audioReady]);
  useEffect(() => () => stopSiren(), []);

  function silence(id) {
    const next = new Set(silenced);
    next.add(id);
    setSilenced(next);
    saveSilenced(next);
  }

  function silenceAll() {
    const next = new Set([...silenced, ...alerts.map((a) => a.id)]);
    setSilenced(next);
    saveSilenced(next);
  }

  async function resolve(alert) {
    try {
      await api.resolveAlert(alert.id, null);
      setAlerts((cur) => cur.filter((a) => a.id !== alert.id));
    } catch {
      // will show up again on the next poll if it failed
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 space-y-2 p-3">
      {!audioReady && (
        <button
          onClick={() => unlockAudio((ok) => setAudioReady(ok))}
          className="w-full rounded-2xl bg-amber-400 px-4 py-2 text-sm font-bold text-black shadow-softSm"
        >
          🔊 Tap here to enable the alarm sound
        </button>
      )}

      {alerts.map((a) => {
        const muted = silenced.has(a.id);
        return (
          <div
            key={a.id}
            className={`mx-auto max-w-xl rounded-2xl border-2 p-4 shadow-softSm ${
              muted ? "border-red-200 bg-red-50" : "animate-pulse border-red-600 bg-red-600 text-white"
            }`}
          >
            <p className={`font-display text-lg font-extrabold ${muted ? "text-red-700" : "text-white"}`}>
              🆘 {a.riderName} {a.bibNumber ? `#${a.bibNumber}` : ""} needs help
            </p>
            <p className={`text-xs ${muted ? "text-red-600" : "text-white/90"}`}>
              {formatRelativeTime(a.createdAt)}
              {a.message ? ` · "${a.message}"` : ""}
              {a.lat != null && (
                <>
                  {" · "}
                  <a
                    className="underline"
                    href={`https://maps.google.com/?q=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    open location
                  </a>
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!muted && (
                <button
                  onClick={() => silence(a.id)}
                  className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-red-700"
                >
                  🔇 Silence
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => resolve(a)}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white"
                >
                  ✅ Mark resolved
                </button>
              )}
            </div>
          </div>
        );
      })}

      {alerts.length > 1 && alerts.some((a) => !silenced.has(a.id)) && (
        <div className="mx-auto max-w-xl text-center">
          <button onClick={silenceAll} className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-red-700 shadow-card">
            🔇 Silence all
          </button>
        </div>
      )}
    </div>
  );
}
