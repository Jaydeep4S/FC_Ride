import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken, isSessionError } from "../api.js";

const AUDIENCES = [
  { key: "approved", label: "All approved riders" },
  { key: "pending", label: "Pending riders" },
  { key: "all", label: "Approved + pending" },
  { key: "selected", label: "Pick riders" },
];
const MAX_LEN = 1000;

export default function AdminMessages() {
  const navigate = useNavigate();
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("approved");
  const [riders, setRiders] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

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

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin");
      return;
    }
    Promise.all([api.adminListRiders("all"), api.adminListMessages()])
      .then(([riderData, messageData]) => {
        setRiders(riderData.filter((r) => r.status === "approved" || r.status === "pending"));
        setHistory(messageData);
      })
      .catch(handleError);
  }, [navigate, handleError]);

  function toggle(id) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(e) {
    e.preventDefault();
    setError("");
    setSent(null);
    if (audience === "selected" && selected.size === 0) {
      setError("Pick at least one rider.");
      return;
    }
    setSending(true);
    try {
      const result = await api.adminSendMessage(body, audience, [...selected]);
      setSent({ ...result, body });
      setBody("");
      setSelected(new Set());
      setHistory(await api.adminListMessages());
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  async function copyNumbers() {
    const text = sent.numbers.join(", ");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy these numbers:", text);
    }
  }

  const q = search.trim().toLowerCase();
  const visibleRiders = q
    ? riders.filter((r) => r.name.toLowerCase().includes(q) || String(r.bibNumber ?? "").includes(q))
    : riders;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Bulk Message 📢</h1>
          <p className="text-sm text-muted">
            Shows up on each rider's tracker page. You can also send it as a text from your phone.
          </p>
        </div>
        <Link to="/admin/dashboard" className="btn-ghost px-4 py-2 text-sm">
          ← Dashboard
        </Link>
      </div>

      <form onSubmit={send} className="card space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 block font-display text-sm font-bold text-ink">Message</span>
          <textarea
            className="input min-h-[120px]"
            required
            maxLength={MAX_LEN}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Flag-off moved to 5:30am at the clock tower. Bring lights!"
          />
          <span className="mt-1 block text-right text-xs text-muted">
            {body.length}/{MAX_LEN}
          </span>
        </label>

        <div>
          <span className="mb-1.5 block font-display text-sm font-bold text-ink">Send to</span>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => (
              <button
                type="button"
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`pill px-4 py-2 text-sm ${
                  audience === a.key ? "bg-primary text-white" : "bg-surface text-ink"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {audience === "selected" && (
          <div>
            <input
              className="input mb-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or bib number"
            />
            <div className="max-h-64 overflow-y-auto rounded-2xl bg-surface p-2">
              {visibleRiders.length === 0 && <p className="p-2 text-sm text-muted">No riders match.</p>}
              {visibleRiders.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="text-sm text-ink">
                    {r.name} {r.bibNumber ? <span className="text-muted">#{r.bibNumber}</span> : null}
                    {r.status === "pending" && <span className="ml-1 text-xs text-amber-600">(pending)</span>}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{selected.size} selected</p>
          </div>
        )}

        {error && <p className="rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>}

        <button type="submit" disabled={sending} className="btn-primary w-full">
          {sending ? "Sending…" : "📢 Send message"}
        </button>
      </form>

      {sent && (
        <div className="card mt-4 p-5">
          <p className="font-display font-bold text-ink">
            ✅ Sent to {sent.recipientCount} rider{sent.recipientCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-1 text-sm text-muted">
            They'll see it next time their tracker page refreshes. To also text it:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`sms:${sent.numbers.join(",")}?body=${encodeURIComponent(sent.body)}`}
              className="pill bg-emerald-100 px-3 py-1.5 text-emerald-700"
            >
              💬 Open in SMS app
            </a>
            <button onClick={copyNumbers} className="pill bg-surface px-3 py-1.5 text-ink">
              📋 Copy numbers
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Group SMS links work best on Android; some phones only pick up the first number.
          </p>
        </div>
      )}

      <h2 className="mb-3 mt-6 font-display text-lg font-extrabold text-ink">Sent messages</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">Nothing sent yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((m) => (
            <div key={m.id} className="card p-4">
              <p className="whitespace-pre-wrap text-sm text-ink">{m.body}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(m.createdAt).toLocaleString()} · {m.recipientCount} recipient
                {m.recipientCount === 1 ? "" : "s"} ({m.audience}) · by {m.sentBy}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
