import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ridersRouter from "./routes/riders.js";
import adminRouter from "./routes/admin.js";
import ridesRouter from "./routes/rides.js";
import locationsRouter from "./routes/locations.js";
import alertsRouter from "./routes/alerts.js";

const requiredEnv = ["ADMIN_USERNAME", "ADMIN_PASSWORD", "JWT_SECRET"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/riders", ridersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/rides", ridesRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/alerts", alertsRouter);

// In production, serve the built React app (client/dist) from this same server
// so the client's relative "/api" calls hit this API with no extra config.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err, req, res, _next) => {
  if (err?.message) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`FC RIDE SQUAD API listening on http://localhost:${port}`));
