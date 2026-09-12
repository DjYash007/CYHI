const mongoose = require("mongoose");
const { Schema } = mongoose;

const FIELD_TYPES = ["text", "email", "number", "url", "select", "textarea"];

// Mirrors the normalized field contract shared with the browser extension.
// Do not change shape without updating extension/content.js in lockstep.
const selectorsSchema = new Schema(
  {
    id: { type: String, default: "" },
    name: { type: String, default: "" },
    cssPath: { type: String, default: "" },
  },
  { _id: false }
);

const fieldSchema = new Schema(
  {
    fieldId: { type: String, required: true }, // stable id assigned by the extension at extraction time
    index: { type: Number, required: true },
    type: { type: String, enum: FIELD_TYPES, required: true },
    label: { type: String, default: "" },
    placeholder: { type: String, default: "" },
    required: { type: Boolean, default: false },
    selectors: { type: selectorsSchema, default: () => ({}) },
  },
  { _id: false }
);

const formSchema = new Schema(
  {
    sourceUrl: { type: String, required: true },
    sourceType: { type: String, enum: ["html", "google_forms"], default: "html" },
    fields: {
      type: [fieldSchema],
      validate: {
        validator: (fields) => fields.length > 0,
        message: "A form needs at least one extracted field.",
      },
    },
  },
  { timestamps: true }
);

// fieldId only needs to be unique within a single form, not globally.
formSchema.path("fields").validate(function (fields) {
  const ids = fields.map((f) => f.fieldId);
  return new Set(ids).size === ids.length;
}, "Duplicate fieldId within a single form.");

module.exports = mongoose.model("Form", formSchema);
module.exports.FIELD_TYPES = FIELD_TYPES;
