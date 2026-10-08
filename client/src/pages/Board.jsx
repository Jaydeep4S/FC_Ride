import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { getMyRiderId } from "../lib/myRider.js";
import Hero from "../components/Hero.jsx";
import Leaderboard from "../components/Leaderboard.jsx";

export default function Board() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [callingId, setCallingId] = useState(null);
  const [callError, setCallError] = useState("");
  const myRiderId = getMyRiderId();

  useEffect(() => {
    let alive = true;
    api
      .getBoard()
      .then((data) => alive && setRiders(data))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => (alive = false);
  }, []);

  const totalSquadKm = riders.reduce((sum, r) => sum + (r.totalKm || 0), 0);
  const iAmOnBoard = !!myRiderId && riders.some((r) => r.id === myRiderId);

  async function callRider(rider) {
    setCallError("");
    setCallingId(rider.id);
    try {
      const { mobileNumber } = await api.callRider(rider.id, myRiderId);
      window.location.href = `tel:${mobileNumber}`;
    } catch (err) {
      setCallError(err.message);
    } finally {
      setCallingId(null);
    }
  }

  return (
    <div>
      <Hero
        eyebrow="RIDER BOARD"
        title="The Squad 🔥"
        subtitle="Ranked by practice distance — every rider approved for the 450km ride."
        stats={[
          { icon: "🚴", label: `${riders.length} Confirmed` },
          { icon: "🔥", label: `${totalSquadKm.toFixed(0)} Squad KM` },
        ]}
      />

      <div className="mx-auto max-w-2xl px-4 py-6">
        {loading && <p className="text-center text-muted">Loading riders…</p>}
        {error && <p className="text-center font-bold text-red-500">{error}</p>}

        {!loading && !error && riders.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-4xl">🚴</p>
            <p className="mt-2 font-display font-bold text-ink">No riders approved yet.</p>
            <p className="text-muted">Be the first — register and wait for admin approval!</p>
          </div>
        )}

        {riders.length > 0 && !iAmOnBoard && (
          <p className="mb-4 rounded-2xl bg-primary/10 p-3 text-center text-sm font-bold text-primary">
            📞 Riding with the squad? Open your tracker once on this phone (
            <Link to="/rides" className="underline">My Rides</Link>) to call squad mates from here.
          </p>
        )}

        {callError && (
          <p className="mb-4 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{callError}</p>
        )}

        {riders.length > 0 && (
          <Leaderboard
            riders={riders}
            myRiderId={myRiderId}
            onCall={iAmOnBoard ? callRider : null}
            callingId={callingId}
          />
        )}
      </div>
    </div>
  );
}
