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

app.use(helmet());

app.use(cookieParser(process.env.SESSION_SECRET || undefined));

const isProduction = process.env.NODE_ENV === 'production';

function buildCorsOrigins() {
  const origins = [];

  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    frontendUrl.split(',').forEach((url) => {
      const trimmed = url.trim();
      if (trimmed) origins.push(trimmed);
    });
  }

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
      if (!origin) return callback(null, true);

      if (allowedOrigins.length === 0) {
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

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

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

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api', authRoutes);

const testRoutes = require('./routes/test');
app.use('/api/test', testRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SecureID API is running.', env: process.env.NODE_ENV });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'API endpoint not found.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'register.html'));
});

app.use(errorHandler);

module.exports = app;
