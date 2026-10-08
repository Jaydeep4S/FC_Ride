import { Link } from "react-router-dom";

export const AUDIT_ACTIONS = {
  registered: { icon: "📝", label: "Registered" },
  added_by_admin: { icon: "➕", label: "Added by admin" },
  approved: { icon: "✅", label: "Approved" },
  rejected: { icon: "❌", label: "Rejected" },
  removed: { icon: "🗑️", label: "Removed from board" },
  deleted: { icon: "⛔", label: "Deleted" },
  ride_saved: { icon: "🚴", label: "Ride saved" },
  ride_flagged: { icon: "🚩", label: "Ride flagged" },
  help_requested: { icon: "🆘", label: "Help requested" },
  help_resolved: { icon: "🤝", label: "Help resolved" },
  call: { icon: "📞", label: "Rider call" },
  admin_call: { icon: "📞", label: "Admin called rider" },
  admin_call_emergency: { icon: "🚑", label: "Admin called emergency contact" },
  message_sent: { icon: "📢", label: "Message sent" },
  link_lookup: { icon: "🔎", label: "Tracker link recovered" },
  admin_login: { icon: "🔐", label: "Admin login" },
  admin_login_failed: { icon: "⚠️", label: "Failed admin login" },
};

export default function AuditList({ entries, showRider = true }) {
  if (entries.length === 0) {
    return <p className="text-center text-sm text-muted">No activity recorded yet.</p>;
  }

  return (
    <ul className="divide-y divide-surface">
      {entries.map((e) => {
        const meta = AUDIT_ACTIONS[e.action] || { icon: "•", label: e.action };
        return (
          <li key={e.id} className="flex gap-3 py-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-surface">
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-ink">
                {meta.label}
                {showRider && e.riderName && (
                  <>
                    {" · "}
                    <Link to={`/admin/riders/${e.riderId}`} className="text-primary hover:underline">
                      {e.riderName}
                    </Link>
                  </>
                )}
              </p>
              {e.details && <p className="break-words text-sm text-muted">{e.details}</p>}
              <p className="text-xs text-muted">
                {new Date(e.createdAt).toLocaleString()} · by {e.actorType}
                {e.actorName ? ` (${e.actorName})` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
