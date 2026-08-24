const mongoose = require('mongoose');

/**
 * Cached MongoDB connection for serverless environments (Vercel).
 * In traditional server mode (server.js), this also works — it just reuses
 * the existing connection if already established.
 *
 * Supports both MONGODB_URI and MONGO_URI environment variable names.
 */

let cached = global.__mongooseConnection;

if (!cached) {
  cached = global.__mongooseConnection = { conn: null, promise: null };
}

async function connectDB() {
  // If already connected, return immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error(
      'MongoDB connection URI is not configured. ' +
      'Set MONGODB_URI or MONGO_URI in your environment variables.'
    );
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(uri, opts).then((m) => {
      console.log('✅ Connected to MongoDB');
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = { connectDB };
