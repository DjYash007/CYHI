const mongoose = require("mongoose");
const { Schema } = mongoose;

const responseSchema = new Schema(
  {
    formId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
    fieldId: { type: String, required: true }, // matches Form.fields[].fieldId
    memberId: { type: Schema.Types.ObjectId, required: true }, // Team.members[]._id
    value: { type: Schema.Types.Mixed, default: "" },
  },
  { timestamps: true } // updatedAt covers the spec's "updatedAt" field
);

// A member can only have one stored response per field on a given form;
// re-saving updates the existing document instead of creating a duplicate.
responseSchema.index({ formId: 1, fieldId: 1, memberId: 1 }, { unique: true });

module.exports = mongoose.model("Response", responseSchema);
