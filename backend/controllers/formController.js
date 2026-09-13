const mongoose = require("mongoose");
const Form = require("../models/Form");
const Team = require("../models/Team");
const Assignment = require("../models/Assignment");
const Response = require("../models/Response");
const ApiError = require("../utils/ApiError");
const {
  sanitizeFormFields,
  sanitizeTeamMembers,
  callGemini,
  validateAiOutput,
} = require("../services/aiService");

async function getProgress(req, res, next) {
  try {
    const { formId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(formId)) {
      throw new ApiError(400, `Invalid formId: "${formId}".`);
    }

    const form = await Form.findById(formId).lean();
    if (!form) throw new ApiError(404, "Form not found.");

    const assignments = await Assignment.find({ formId }).lean();
    const totalFields = assignments.length;
    const completedFields = assignments.filter((a) => a.status === "completed").length;

    const memberProgress = {};
    for (const a of assignments) {
      const memberIdStr = a.memberId.toString();
      if (!memberProgress[memberIdStr]) {
        memberProgress[memberIdStr] = { total: 0, completed: 0 };
      }
      memberProgress[memberIdStr].total++;
      if (a.status === "completed") {
        memberProgress[memberIdStr].completed++;
      }
    }

    res.json({
      formId,
      totalFields,
      completedFields,
      progressPercentage: totalFields === 0 ? 0 : Math.round((completedFields / totalFields) * 100),
      memberProgress,
    });
  } catch (err) {
    next(err);
  }
}

async function getFinalAggregation(req, res, next) {
  try {
    const { formId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(formId)) {
      throw new ApiError(400, `Invalid formId: "${formId}".`);
    }

    const form = await Form.findById(formId).lean();
    if (!form) throw new ApiError(404, "Form not found.");

    const assignments = await Assignment.find({ formId }).lean();
    const responses = await Response.find({ formId }).lean();

    const finalValues = {};
    const missingFields = [];
    const duplicateConflicts = [];

    const responsesByField = {};
    for (const r of responses) {
      if (!responsesByField[r.fieldId]) responsesByField[r.fieldId] = [];
      responsesByField[r.fieldId].push(r);
    }

    const assignmentsByField = {};
    for (const a of assignments) {
      if (!assignmentsByField[a.fieldId]) assignmentsByField[a.fieldId] = [];
      assignmentsByField[a.fieldId].push(a);
    }

    for (const f of form.fields) {
      const fieldId = f.fieldId;
      const fieldAssignments = assignmentsByField[fieldId] || [];
      const fieldResponses = responsesByField[fieldId] || [];

      if (fieldAssignments.length === 0) {
        missingFields.push(fieldId);
        continue;
      }

      const validResponses = fieldResponses.filter((r) =>
        fieldAssignments.some((a) => a.memberId.toString() === r.memberId.toString())
      );

      if (validResponses.length === 0) {
        missingFields.push(fieldId);
        continue;
      }

      if (validResponses.length > 1) {
        duplicateConflicts.push(fieldId);
        validResponses.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      }

      finalValues[fieldId] = validResponses[0].value;
    }

    res.json({
      formId,
      finalValues,
      missingFields,
      duplicateConflicts,
      isComplete: missingFields.length === 0,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/forms/:formId/ai-assignments
 * Generates initial field assignments using Gemini AI and stores them.
 * Never overwrites assignments where source === "leader".
 */
async function generateAiAssignments(req, res, next) {
  try {
    const { formId } = req.params;
    const { teamId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(formId)) {
      throw new ApiError(400, `Invalid formId: "${formId}".`);
    }

    if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
      throw new ApiError(400, `Invalid or missing teamId: "${teamId}".`);
    }

    const form = await Form.findById(formId).lean();
    if (!form) {
      throw new ApiError(404, "Form not found.");
    }

    const team = await Team.findById(teamId).lean();
    if (!team) {
      throw new ApiError(404, "Team not found.");
    }

    if (team.formId.toString() !== form._id.toString()) {
      throw new ApiError(400, "Team does not belong to this form.");
    }

    if (!form.fields || form.fields.length === 0) {
      throw new ApiError(400, "Form has no fields to assign.");
    }

    // Prepare sanitized input for the AI
    const sanitizedFields = sanitizeFormFields(form.fields);
    const sanitizedMembers = sanitizeTeamMembers(team.members);

    // Call Gemini / AI Service
    const rawAiResult = await callGemini(sanitizedFields, sanitizedMembers);

    // Strictly validate AI suggestions
    const validAssignments = validateAiOutput(rawAiResult, form, team);

    // Fetch existing assignments to check for leader overrides
    const existingAssignments = await Assignment.find({ formId }).lean();
    const existingMap = new Map(existingAssignments.map((a) => [a.fieldId, a]));

    const protectedFields = [];
    const bulkOps = [];

    for (const item of validAssignments) {
      const existing = existingMap.get(item.fieldId);

      // Leader choices ALWAYS win: never overwrite leader assignments
      if (existing && existing.source === "leader") {
        protectedFields.push(item.fieldId);
        continue;
      }

      // Non-leader assignments (either new or previously suggested by AI) are upserted
      bulkOps.push({
        updateOne: {
          filter: { formId, fieldId: item.fieldId },
          update: {
            $set: {
              formId,
              fieldId: item.fieldId,
              memberId: new mongoose.Types.ObjectId(item.memberId),
              source: "ai",
              confidence: item.confidence,
              reason: item.reason,
              status: "pending",
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      await Assignment.bulkWrite(bulkOps);
    }

    // Return the complete current assignment set
    const currentAssignments = await Assignment.find({ formId }).lean();

    res.status(200).json({
      success: true,
      assignments: currentAssignments,
      protectedFields,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/forms/:formId/assignments?teamId=...
 * Provides flat assignment rows and grouped member columns for the leader review UI.
 */
async function getAssignmentsForReview(req, res, next) {
  try {
    const { formId } = req.params;
    const { teamId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(formId)) {
      throw new ApiError(400, `Invalid formId: "${formId}".`);
    }

    if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
      throw new ApiError(400, `Invalid or missing teamId: "${teamId}".`);
    }

    const form = await Form.findById(formId).lean();
    if (!form) {
      throw new ApiError(404, "Form not found.");
    }

    const team = await Team.findById(teamId).lean();
    if (!team) {
      throw new ApiError(404, "Team not found.");
    }

    if (team.formId.toString() !== form._id.toString()) {
      throw new ApiError(400, "Team does not belong to this form.");
    }

    const assignments = await Assignment.find({ formId }).lean();

    const fieldMap = new Map(form.fields.map((f) => [f.fieldId, f]));
    const memberMap = new Map(team.members.map((m) => [m._id.toString(), m]));

    // Flat rows
    const flatAssignments = assignments.map((a) => {
      const field = fieldMap.get(a.fieldId);
      const member = memberMap.get(a.memberId.toString());

      return {
        fieldId: a.fieldId,
        label: field ? field.label : "",
        type: field ? field.type : "",
        required: field ? Boolean(field.required) : false,
        memberId: a.memberId,
        memberEmail: member ? member.email : "",
        memberRole: member ? member.role : "",
        source: a.source,
        confidence: a.confidence,
        reason: a.reason || "",
        status: a.status || "pending",
      };
    });

    // Grouped by team member
    const grouped = team.members.map((m) => {
      const memberAssignments = assignments.filter(
        (a) => a.memberId.toString() === m._id.toString()
      );

      const fields = memberAssignments.map((a) => {
        const field = fieldMap.get(a.fieldId);
        return {
          fieldId: a.fieldId,
          label: field ? field.label : "",
          type: field ? field.type : "",
          required: field ? Boolean(field.required) : false,
          source: a.source,
          confidence: a.confidence,
          reason: a.reason || "",
          status: a.status || "pending",
        };
      });

      return {
        memberId: m._id,
        email: m.email,
        role: m.role,
        isLeader: Boolean(m.isLeader),
        fields,
      };
    });

    res.json({
      formId: form._id,
      teamId: team._id,
      assignments: flatAssignments,
      grouped,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/forms/:formId/assignments/:fieldId
 * Leader drags a field to another member. Sets source="leader" and clears AI confidence.
 */
async function updateAssignmentByLeader(req, res, next) {
  try {
    const { formId, fieldId } = req.params;
    const { teamId, memberId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(formId)) {
      throw new ApiError(400, `Invalid formId: "${formId}".`);
    }

    if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
      throw new ApiError(400, `Invalid or missing teamId: "${teamId}".`);
    }

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      throw new ApiError(400, `Invalid or missing memberId: "${memberId}".`);
    }

    const form = await Form.findById(formId).lean();
    if (!form) {
      throw new ApiError(404, "Form not found.");
    }

    const team = await Team.findById(teamId).lean();
    if (!team) {
      throw new ApiError(404, "Team not found.");
    }

    if (team.formId.toString() !== form._id.toString()) {
      throw new ApiError(400, "Team does not belong to this form.");
    }

    const fieldExists = form.fields.some((f) => f.fieldId === fieldId);
    if (!fieldExists) {
      throw new ApiError(404, `Field "${fieldId}" does not belong to this form.`);
    }

    const member = team.members.find((m) => m._id.toString() === memberId.toString());
    if (!member) {
      throw new ApiError(400, `Member "${memberId}" does not belong to this team.`);
    }

    // Update assignment with leader provenance, clearing AI confidence
    const update = {
      $set: {
        formId,
        fieldId,
        memberId: member._id,
        source: "leader",
        status: "pending",
        reason: "Assigned by leader",
      },
      $unset: {
        confidence: 1,
      },
    };

    const assignment = await Assignment.findOneAndUpdate({ formId, fieldId }, update, {
      new: true,
      upsert: true,
      runValidators: true,
    });

    res.json({
      success: true,
      assignment,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/forms/:formId/assignments/review
 * Optional bulk assignment review endpoint.
 */
async function bulkUpdateAssignments(req, res, next) {
  try {
    const { formId } = req.params;
    const { teamId, assignments } = req.body;

    if (!mongoose.Types.ObjectId.isValid(formId)) {
      throw new ApiError(400, `Invalid formId: "${formId}".`);
    }

    if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
      throw new ApiError(400, `Invalid or missing teamId: "${teamId}".`);
    }

    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new ApiError(400, "assignments must be a non-empty array.");
    }

    const form = await Form.findById(formId).lean();
    if (!form) throw new ApiError(404, "Form not found.");

    const team = await Team.findById(teamId).lean();
    if (!team) throw new ApiError(404, "Team not found.");

    if (team.formId.toString() !== form._id.toString()) {
      throw new ApiError(400, "Team does not belong to this form.");
    }

    const formFieldIds = new Set(form.fields.map((f) => f.fieldId));
    const teamMemberIds = new Set(team.members.map((m) => m._id.toString()));

    const seenFieldIds = new Set();
    for (const a of assignments) {
      if (!a.fieldId || !formFieldIds.has(a.fieldId)) {
        throw new ApiError(400, `Invalid fieldId in bulk update: "${a.fieldId}".`);
      }
      if (seenFieldIds.has(a.fieldId)) {
        throw new ApiError(400, `Duplicate fieldId in bulk update: "${a.fieldId}".`);
      }
      seenFieldIds.add(a.fieldId);

      if (!a.memberId || !teamMemberIds.has(a.memberId.toString())) {
        throw new ApiError(400, `Invalid memberId in bulk update: "${a.memberId}".`);
      }
    }

    const bulkOps = assignments.map((a) => ({
      updateOne: {
        filter: { formId, fieldId: a.fieldId },
        update: {
          $set: {
            formId,
            fieldId: a.fieldId,
            memberId: new mongoose.Types.ObjectId(a.memberId),
            source: "leader",
            status: "pending",
            reason: a.reason || "Assigned by leader",
          },
          $unset: {
            confidence: 1,
          },
        },
        upsert: true,
      },
    }));

    await Assignment.bulkWrite(bulkOps);

    const updatedAssignments = await Assignment.find({ formId }).lean();

    res.json({
      success: true,
      updatedCount: bulkOps.length,
      assignments: updatedAssignments,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProgress,
  getFinalAggregation,
  generateAiAssignments,
  getAssignmentsForReview,
  updateAssignmentByLeader,
  bulkUpdateAssignments,
};
