const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const stocksRoutes = require("./routes/stocks.routes");
const alertsRoutes = require("./routes/alerts.routes");
const notificationsRoutes = require("./routes/notifications.routes");

const app = express();

/* =========================
   🛡️ Security (Helmet)
========================= */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "unsafe-none" }
  })
);

console.log("working 1");
/* =========================
   🌍 CORS CONFIGURATION
========================= */

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://equisense-web.onrender.com",
  "https://stockfloww.com"
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without origin (curl, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("❌ Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// IMPORTANT: Preflight must use SAME config
app.options("*", cors(corsOptions));

console.log("working 2");

/* =========================
   🚦 Rate Limiting
========================= */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later."
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again later."
});

// Allow OPTIONS preflight to bypass rate limiter
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }
  return limiter(req, res, next);
});

/* =========================
   📦 Body Parsers
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   📝 Request Logging
========================= */

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/* =========================
   🗄️ DB Health Placeholder
========================= */

app.use((req, res, next) => {
  req.dbAvailable = true;
  next();
});

/* =========================
   🚀 Routes
========================= */

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/stocks", stocksRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/notifications", notificationsRoutes);

/* =========================
   ❤️ Health Check
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

/* =========================
   ❌ 404 Handler
========================= */

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

/* =========================
   💥 Error Handler
========================= */

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message || err);
  res.status(500).json({ error: "Internal server error" });
});

console.log("working 3");

module.exports = app;
