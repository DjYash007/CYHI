const mongoose = require("mongoose");
const { Schema } = mongoose;

// A team member is a subdocument. Its auto-generated _id is the
// canonical "memberId" referenced by Assignment and Response documents.
const memberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, trim: true, default: "" }, // e.g. "backend", "frontend", "design" — used as an AI-assignment hint, not a hard rule
    isLeader: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const teamSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "Team.members",
      required: true,
      // References the leader's own member subdocument _id.
    },
    formId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
    members: {
      type: [memberSchema],
      validate: {
        validator: (members) => members.length > 0,
        message: "A team needs at least one member (the leader).",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", teamSchema);
