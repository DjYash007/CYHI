const mongoose = require("mongoose");
const { Schema } = mongoose;

const assignmentSchema = new Schema(
  {
    formId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
    fieldId: { type: String, required: true }, // matches Form.fields[].fieldId, not a Mongo _id
    memberId: { type: Schema.Types.ObjectId, required: true }, // Team.members[]._id

    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },

    // Provenance of the assignment — set when AI suggests it, cleared/overwritten
    // once the leader edits it. The backend must never accept an AI suggestion
    // referencing a fieldId/memberId that doesn't actually exist on the form/team.
    source: { type: String, enum: ["ai", "leader"], default: "leader" },
    confidence: { type: Number, min: 0, max: 1 },
    reason: { type: String, default: "" },
  },
  { timestamps: true }
);

// One assignment per field, per form.
assignmentSchema.index({ formId: 1, fieldId: 1 }, { unique: true });

module.exports = mongoose.model("Assignment", assignmentSchema);
