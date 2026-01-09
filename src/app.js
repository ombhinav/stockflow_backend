const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.routes');
const stocksRoutes = require('./routes/stocks.routes');
const alertsRoutes = require('./routes/alerts.routes');
const notificationsRoutes = require('./routes/notifications.routes');

const app = express();

// Security middleware
app.use(helmet());

// CORS with restricted origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173', 'https://equisense-web.onrender.com'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit auth endpoints to 20 requests per windowMs (allow multiple attempts during testing)
  message: 'Too many authentication attempts, please try again later.'
});

app.use(limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Database connection error handler
app.use((req, res, next) => {
  // Attach a helper to check if DB is available
  req.dbAvailable = true; // Will be set false if pool is unhealthy
  next();
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;