require('dotenv').config();
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { connectDB } = require('./utils/db');
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

// Cookie parsing (with optional SESSION_SECRET for signed cookies)
app.use(cookieParser(process.env.SESSION_SECRET || undefined));

// CORS configuration
const isProduction = process.env.NODE_ENV === 'production';

function buildCorsOrigins() {
  const origins = [];

  // Add configured frontend URL(s) — supports comma-separated list
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    frontendUrl.split(',').forEach((url) => {
      const trimmed = url.trim();
      if (trimmed) origins.push(trimmed);
    });
  }

  // In development/test, also allow common local origins
  if (!isProduction) {
    origins.push(
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    );
  }

  return origins;
}

const allowedOrigins = buildCorsOrigins();

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (same-origin, Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.length === 0) {
        // If no explicit origins configured, allow same-origin only
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure DB connection on every request (cached — no overhead after first call)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database connection unavailable. Please try again later.',
    });
  }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api', authRoutes);

// Test-only routes — completely disabled in production
if (!isProduction) {
  const testRoutes = require('./routes/test');
  app.use('/api/test', testRoutes);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SecureID API is running.', env: process.env.NODE_ENV });
});

// 404 for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'API endpoint not found.' });
});

// Serve frontend for non-API routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'register.html'));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
