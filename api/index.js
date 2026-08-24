/**
 * Vercel Serverless Function Entrypoint
 * Exports the Express app for Vercel's @vercel/node builder.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { connectDB } = require('../backend/utils/db');
const app = require('../backend/app');

// Ensure DB is connected before handling requests
let dbConnected = false;

module.exports = async (req, res) => {
  if (!dbConnected) {
    await connectDB();
    dbConnected = true;
  }
  return app(req, res);
};
