const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: "Validation failed.", details });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Invalid ${err.path}: "${err.value}".` });
  }

  if (err && err.code === 11000) {
    return res.status(409).json({ error: "Duplicate value.", details: err.keyValue });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error." });
}

module.exports = errorHandler;
