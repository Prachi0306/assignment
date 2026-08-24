require('dotenv').config();
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const authRoutes = require('./routes/auth');
const testRoutes = require('./routes/test');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

// Cookie parsing
app.use(cookieParser());

// CORS
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
app.use(
  cors({
    origin: [frontendUrl, 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api', authRoutes);

// Test-only routes (guarded internally by NODE_ENV check)
app.use('/api/test', testRoutes);

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
