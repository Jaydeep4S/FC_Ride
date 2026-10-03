import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { api } from "../api.js";
import Hero from "../components/Hero.jsx";

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

export default function Register() {
  const [form, setForm] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!photoFile) {
      setError("Please add a profile photo.");
      return;
    }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append("profilePhoto", photoFile);

    setSubmitting(true);
    try {
      const res = await api.registerRider(fd);
      setResult(res);
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
      setForm(initialForm);
      setPhotoFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <div className="card p-8">
          <p className="text-5xl">🎉</p>
          <h2 className="mt-3 font-display text-2xl font-extrabold text-ink">You're in the queue!</h2>
          <p className="mt-2 text-muted">
            Your registration was submitted. An admin will review your details — once approved,
            you'll show up on the <span className="font-bold text-ink">Board</span>.
          </p>
          <p className="mt-4 rounded-2xl bg-surface p-3 text-sm text-muted">
            Reference ID: <span className="font-mono">{result.id}</span>
          </p>

          <Link
            to={`/rides/${result.id}`}
            className="btn-primary mt-6 block bg-gradient-to-r from-primary to-primaryDark"
          >
            📍 Track your practice rides
          </Link>
          <p className="mt-2 text-xs text-muted">
            Bookmark this link — it's the only way back to your ride tracker.
          </p>

          <button
            className="btn-ghost mt-3 w-full"
            onClick={() => setResult(null)}
          >
            Register another rider
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Hero
        eyebrow="RIDER REGISTRATION"
        title="Join the 450km Ride 🚴‍♂️"
        subtitle="Fill this out and wait for approval — your name hits the board once you're locked in."
        stats={[{ icon: "📏", label: "450 KM Route" }]}
      />

      <div className="mx-auto max-w-xl px-4 py-6">
        <form onSubmit={handleSubmit} className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-col items-center">
          <label className="group relative cursor-pointer">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface shadow-softSm ring-4 ring-white">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl">🙂</span>
              )}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-white shadow-softSm">
              📷
            </span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              capture="user"
              className="hidden"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            />
          </label>
          <span className="mt-2 font-display text-sm font-bold text-ink">Add your photo</span>
        </div>

        <Field label="Full name">
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Riya Sharma"
          />
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
              placeholder="9876543210"
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
              placeholder="9876500000"
            />
          </Field>
        </div>

        <Field label="Address">
          <textarea
            className="input"
            required
            rows={2}
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="House no, street, area"
          />
        </Field>

        <Field label="City">
          <input
            className="input"
            required
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Ahmedabad"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Blood group">
            <select
              className="input"
              required
              value={form.bloodGroup}
              onChange={(e) => update("bloodGroup", e.target.value)}
            >
              <option value="" disabled>
                Select
              </option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </Field>
          <Field label="T-shirt size">
            <select
              className="input"
              required
              value={form.tshirtSize}
              onChange={(e) => update("tshirtSize", e.target.value)}
            >
              <option value="" disabled>
                Select
              </option>
              {TSHIRT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
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

        {error && (
          <p className="rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-600">{error}</p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-lg">
          {submitting ? "Submitting…" : "Submit registration 🔥"}
        </button>
        </form>
      </div>
    </div>
  );
}
