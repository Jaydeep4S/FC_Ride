# FC RIDE SQUAD 🚴

Registration + admin-approval + public board app for a 450km group bicycle ride.

- Riders fill out a form (contact info, emergency contact, blood group, T-shirt size, birth
  date) and upload a profile photo.
- Submissions sit as **pending** until an admin reviews them.
- Once **approved**, the rider is assigned a bib number and shows up on the public **Board**
  (name, blood group, T-shirt size, city only — no phone numbers or address are ever shown
  publicly).

## Stack

- `server/` — Node.js + Express, CSV file storage (`papaparse`), JWT admin auth, file uploads
  via `multer`.
- `client/` — React + Vite + Tailwind CSS.

## Setup

### 1. Backend

```
cd server
npm install
copy .env.example .env
```

Edit `server/.env` and set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `JWT_SECRET` to your own
values before you deploy this anywhere real.

```
npm run dev
```

Runs on http://localhost:4000.

### 2. Frontend

```
cd client
npm install
npm run dev
```

Runs on http://localhost:5173 and proxies `/api` requests to the backend.

## Using it

- **Join** (`/`) — public registration form for riders.
- **Board** (`/board`) — public list of approved riders.
- **Admin** (`/admin`) — log in with the credentials from `server/.env`, then approve/reject
  submissions from `/admin/dashboard`.

## Data storage

- Rider records live in `server/data/riders.csv`, practice rides in `server/data/rides.csv`,
  and the bib-number counter in `server/data/counters.csv` (all gitignored). You can open these
  directly in Excel/Sheets to eyeball the data.
- Uploaded profile photos live in `server/uploads/photos/` (gitignored).

All of this is local to the server — back it up if you redeploy or move hosts.

**Worth knowing:** CSV files aren't a real database — there's no indexing, no query language,
and every write rewrites the whole file (fine at hundreds of rows, would get slow at tens of
thousands). Concurrent writes are safe here because Node is single-threaded and every read+write
in this app happens synchronously with no gap for another request to interleave — but that also
means each write briefly blocks the server. If this ever needs to scale past a single club's
worth of riders, moving back to a real database (SQLite, Postgres) would be the first thing to
revisit.

## Deploying

Any host that can run a small Node process + persist a folder works (a small VPS, Render,
Railway, etc.). Build the frontend with `npm run build` inside `client/` and serve the `dist/`
folder (e.g. via the same Express server, Nginx, or a static host), pointing it at the deployed
API's URL.