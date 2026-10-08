import { api } from "../api.js";
import Avatar from "./Avatar.jsx";

const BLOOD_TEXT = {
  "O+": "text-red-500", "O-": "text-red-500",
  "A+": "text-primary", "A-": "text-primary",
  "B+": "text-amber-500", "B-": "text-amber-500",
  "AB+": "text-emerald-500", "AB-": "text-emerald-500",
};

const MEDALS = ["🥇", "🥈", "🥉"];

// onCall is only passed when the viewer is an approved rider; it adds a call
// button to every row except their own.
export default function Leaderboard({ riders, myRiderId = null, onCall = null, callingId = null }) {
  const cols = onCall
    ? "grid-cols-[2.5rem_1fr_auto_2.75rem] sm:grid-cols-[3rem_1fr_auto_2.75rem]"
    : "grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_auto]";

  return (
    <div className="card overflow-hidden">
      <div className={`grid ${cols} items-center gap-2 bg-night px-4 py-3 text-xs font-bold uppercase tracking-wide text-white/70`}>
        <span>#</span>
        <span>Rider</span>
        <span className="text-right">Training</span>
        {onCall && <span className="text-center">Call</span>}
      </div>

      <div className="divide-y divide-surface">
        {riders.map((rider, i) => (
          <div
            key={rider.bibNumber}
            className={`grid ${cols} items-center gap-2 px-4 py-3 ${
              i % 2 === 1 ? "bg-surface/50" : ""
            }`}
          >
            <span className="font-display font-extrabold text-muted">
              {rider.totalKm > 0 && MEDALS[i] ? MEDALS[i] : `#${rider.bibNumber}`}
            </span>

            <span className="flex min-w-0 items-center gap-3">
              <Avatar src={api.photoUrl(rider.id)} name={rider.name} size={10} />
              <span className="min-w-0">
                <span className="block truncate font-display text-sm font-bold text-ink">
                  {rider.name}
                </span>
                <span className="flex items-center gap-2 truncate text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <span>📍</span> {rider.city}
                  </span>
                  <span className={`font-bold ${BLOOD_TEXT[rider.bloodGroup] || "text-ink"}`}>
                    {rider.bloodGroup}
                  </span>
                  <span>· {rider.tshirtSize}</span>
                </span>
              </span>
            </span>

            <span className="text-right">
              <span className="block font-display text-sm font-extrabold text-primary">
                {rider.totalKm.toFixed(1)} km
              </span>
              <span className="block text-xs text-muted">
                {rider.totalKm > 0 ? `${rider.avgSpeedKmh.toFixed(1)} km/h avg` : "No rides yet"}
              </span>
            </span>

            {onCall &&
              (rider.id === myRiderId ? (
                <span className="text-center text-xs font-bold text-muted">You</span>
              ) : (
                <button
                  onClick={() => onCall(rider)}
                  disabled={callingId === rider.id}
                  aria-label={`Call ${rider.name}`}
                  className="flex h-10 w-10 items-center justify-center justify-self-center rounded-full bg-emerald-100 text-lg transition active:scale-95 disabled:opacity-60"
                >
                  📞
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
