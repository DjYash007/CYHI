const mongoose = require("mongoose");
const Invitation = require("../models/Invitation");
const Form = require("../models/Form");
const Team = require("../models/Team");
const Assignment = require("../models/Assignment");
const Response = require("../models/Response");
const ApiError = require("../utils/ApiError");

async function getInvitation(req, res, next) {
  try {
    const { token } = req.params;
    const invitation = await Invitation.findOne({ token }).lean();
    if (!invitation) throw new ApiError(404, "Invalid or expired invitation token.");

    const form = await Form.findById(invitation.formId).lean();
    if (!form) throw new ApiError(404, "Form not found.");

    const team = await Team.findOne({ formId: form._id, "members._id": invitation.memberId }).lean();
    if (!team) throw new ApiError(404, "Team or member not found.");

    const member = team.members.find(m => m._id.toString() === invitation.memberId.toString());
    if (!member) throw new ApiError(404, "Member not found in team.");

    const assignments = await Assignment.find({ formId: form._id, memberId: invitation.memberId }).lean();
    console.log(`[ASSIGNMENT] Found ${assignments.length} assignments for memberId ${invitation.memberId}`);
    
    const assignedFieldIds = new Set(assignments.map(a => a.fieldId));
    console.log(`[ASSIGNMENT] Assigned field IDs:`, Array.from(assignedFieldIds));

    // Get existing responses
    const responses = await Response.find({ formId: form._id, memberId: invitation.memberId }).lean();
    const responseMap = {};
    for (const r of responses) {
      responseMap[r.fieldId] = r.value;
    }

    // Map to the requested output format
    const fields = form.fields
      .filter(f => assignedFieldIds.has(f.fieldId))
      .map(f => ({
        fieldId: f.fieldId,
        label: f.label,
        type: f.type,
        required: f.required,
        value: responseMap[f.fieldId] || ""
      }));
      
    console.log(`[MEMBER FORM] Returning ${fields.length} mapped fields to member ${member.email}`);

    if (invitation.status === "pending") {
      await Invitation.updateOne({ _id: invitation._id }, { status: "opened" });
    }

    res.json({
      formId: form._id,
      member: {
        memberId: member._id,
        email: member.email,
        role: member.role,
        name: member.name
      },
      form: {
        sourceUrl: form.sourceUrl,
        sourceType: form.sourceType
      },
      fields
    });
  } catch (err) {
    next(err);
  }
}

async function submitResponse(req, res, next) {
  try {
    const { token } = req.params;
    const { responses } = req.body;

    if (!Array.isArray(responses)) {
      throw new ApiError(400, "responses must be an array");
    }

    const invitation = await Invitation.findOne({ token }).lean();
    if (!invitation) throw new ApiError(404, "Invalid or expired invitation token.");

    const form = await Form.findById(invitation.formId).lean();
    if (!form) throw new ApiError(404, "Form not found.");

    const assignments = await Assignment.find({ formId: invitation.formId, memberId: invitation.memberId }).lean();
    const assignedFieldIds = new Set(assignments.map(a => a.fieldId));

    // Validate entire batch first
    const formFieldsMap = new Map(form.fields.map(f => [f.fieldId, f]));
    for (const r of responses) {
      if (!r.fieldId) {
        throw new ApiError(400, "Every response must include a fieldId.");
      }
      if (!formFieldsMap.has(r.fieldId)) {
        throw new ApiError(400, `fieldId not found in form: ${r.fieldId}`);
      }
      if (!assignedFieldIds.has(r.fieldId)) {
        throw new ApiError(403, `Not authorized to submit fieldId: ${r.fieldId}`);
      }
      if (typeof r.value !== "string") {
        throw new ApiError(400, `Value for fieldId ${r.fieldId} must be a string.`);
      }
    }

    // Batch valid, write to DB
    const savedResponses = [];
    const io = req.app.get("io");

    for (const r of responses) {
      const saved = await Response.findOneAndUpdate(
        { formId: invitation.formId, fieldId: r.fieldId, memberId: invitation.memberId },
        { $set: { value: r.value } },
        { upsert: true, new: true, runValidators: true }
      );
      
      savedResponses.push({
        fieldId: saved.fieldId,
        value: saved.value
      });

      // Emit Socket.IO event if io exists
      if (io) {
        io.emit("field_updated", {
          formId: invitation.formId.toString(),
          fieldId: saved.fieldId,
          memberId: invitation.memberId.toString(),
          value: saved.value
        });
      }
    }

    // Check completion status
    const allResponses = await Response.find({ formId: invitation.formId, memberId: invitation.memberId }).lean();
    const allResponseValues = new Map(allResponses.map(r => [r.fieldId, r.value]));

    let isComplete = true;
    for (const a of assignments) {
      const fieldDef = formFieldsMap.get(a.fieldId);
      if (fieldDef && fieldDef.required) {
        const val = allResponseValues.get(a.fieldId);
        if (!val || val.trim() === "") {
          isComplete = false;
          break;
        }
      }
    }

    if (isComplete) {
      await Invitation.updateOne({ _id: invitation._id }, { status: "completed" });
    }

    res.json({
      success: true,
      responses: savedResponses
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getInvitation, submitResponse };
