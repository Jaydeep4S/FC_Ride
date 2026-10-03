import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken } from "../api.js";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const initialForm = {
  name: "",
  mobileNumber: "",
  emergencyMobileNumber: "",
  address: "",
  city: "",
  bloodGroup: "",
  tshirtSize: "",
  birthDate: "",
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-display text-sm font-bold text-ink">{label}</span>
      {children}
    </label>
  );
}

export default function AdminAddRider() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) navigate("/admin");
  }, [navigate]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (photoFile) fd.append("profilePhoto", photoFile);

    setSaving(true);
    try {
      await api.adminCreateRider(fd);
      navigate("/admin/dashboard");
    } catch (err) {
      if (err.message.includes("Invalid or expired") || err.message.includes("Missing admin")) {
        setAdminToken(null);
        navigate("/admin");
        return;
      }
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <Link to="/admin/dashboard" className="mb-4 inline-block font-display text-sm font-bold text-muted">
        ← Back to dashboard
      </Link>
      <h1 className="mb-1 font-display text-2xl font-extrabold text-ink">Add a rider</h1>
      <p className="mb-5 text-sm text-muted">
        Riders you add here go straight onto the board with a bib number. Photo is optional.
      </p>

      <form onSubmit={handleSubmit} className="card space-y-4 p-5 sm:p-6">
        <Field label="Full name">
          <input className="input" required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mobile number">
            <input
              className="input"
              required
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={form.mobileNumber}
              onChange={(e) => update("mobileNumber", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Emergency contact number">
            <input
              className="input"
              required
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={form.emergencyMobileNumber}
              onChange={(e) => update("emergencyMobileNumber", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>

        <Field label="Address">
          <textarea className="input" required rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} />
        </Field>

        <Field label="City">
          <input className="input" required value={form.city} onChange={(e) => update("city", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Blood group">
            <select className="input" required value={form.bloodGroup} onChange={(e) => update("bloodGroup", e.target.value)}>
              <option value="" disabled>Select</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
            </select>
          </Field>
          <Field label="T-shirt size">
            <select className="input" required value={form.tshirtSize} onChange={(e) => update("tshirtSize", e.target.value)}>
              <option value="" disabled>Select</option>
              {TSHIRT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Birth date">
          <input
            type="date"
            className="input"
            required
            max={new Date().toISOString().split("T")[0]}
            value={form.birthDate}
            onChange={(e) => update("birthDate", e.target.value)}
          />
        </Field>

        <Field label="Profile photo (optional, JPG/PNG/WEBP, max 5MB)">
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="input file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-display file:font-bold file:text-white"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
        </Field>

        {error && <p className="rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>}

        <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-lg">
          {saving ? "Adding…" : "Add rider to the board"}
        </button>
      </form>
    </div>
  );
}
