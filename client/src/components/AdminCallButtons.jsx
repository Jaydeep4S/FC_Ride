import { api } from "../api.js";

// tel: links for a rider and their emergency contact. The phone does the
// dialing; each tap is also recorded in the audit log.
export default function AdminCallButtons({ riderId, mobileNumber, emergencyMobileNumber }) {
  return (
    <>
      {mobileNumber && (
        <a
          href={`tel:${mobileNumber}`}
          onClick={() => api.adminLogCall(riderId, "mobile")}
          className="pill bg-emerald-100 px-3 py-1.5 text-emerald-700"
        >
          📞 Call rider
        </a>
      )}
      {emergencyMobileNumber && (
        <a
          href={`tel:${emergencyMobileNumber}`}
          onClick={() => api.adminLogCall(riderId, "emergency")}
          className="pill bg-amber-100 px-3 py-1.5 text-amber-700"
        >
          🚑 Call emergency contact
        </a>
      )}
    </>
  );
}
