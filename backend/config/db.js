const mongoose = require("mongoose");
const dns = require("dns");

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to your .env file.");
  }

  // FIX: Node.js c-ares DNS resolver sometimes receives 127.0.0.1 from the OS
  // but gets ECONNREFUSED on port 53 (common on Windows/WSL/VPNs).
  // We append public DNS fallbacks so resolveSrv succeeds.
  try {
    const servers = dns.getServers();
    dns.setServers([...new Set([...servers, "8.8.8.8", "1.1.1.1"])]);
  } catch (err) {
    console.warn("Could not configure fallback DNS:", err.message);
  }

  let isConnected = false;

  mongoose.connection.on("connected", () => {
    isConnected = true;
    console.log("MongoDB connected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    if (isConnected) {
      console.warn("MongoDB disconnected");
    }
  });

  await mongoose.connect(uri);

  return mongoose.connection;
}

module.exports = connectDB;
