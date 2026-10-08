// Minimal in-memory rate limiter — fine for a single-process app like this one.
// Each limiter keeps its own buckets, so hitting one route's limit doesn't
// eat into another's.
export function rateLimit({ windowMs, max }) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      return res.status(429).json({ error: "Too many attempts. Please try again in a bit." });
    }
    bucket.count += 1;
    next();
  };
}
