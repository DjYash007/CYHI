const mongoose = require("mongoose");
const Invitation = require("../models/Invitation");
const Form = require("../models/Form");
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

    const assignments = await Assignment.find({ formId: form._id, memberId: invitation.memberId }).lean();
    
    // Create a map of assigned fieldIds
    const assignedFieldIds = new Set(assignments.map(a => a.fieldId));
    
    // Only return fields assigned to this member
    const fields = form.fields.filter(f => assignedFieldIds.has(f.fieldId)).map(f => ({
      fieldId: f.fieldId,
      type: f.type,
      label: f.label,
      placeholder: f.placeholder,
      required: f.required
    }));

    // Mark as opened
    if (invitation.status === "pending") {
      await Invitation.updateOne({ _id: invitation._id }, { status: "opened" });
    }

    res.json({
      formId: form._id,
      memberId: invitation.memberId,
      token: invitation.token,
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

    // Validate field ownership
    const assignments = await Assignment.find({ formId: invitation.formId, memberId: invitation.memberId }).lean();
    const assignedFieldIds = new Set(assignments.map(a => a.fieldId));

    const promises = responses.map(r => {
      if (!assignedFieldIds.has(r.fieldId)) {
        throw new ApiError(403, `Not authorized to submit fieldId: ${r.fieldId}`);
      }
      return Response.findOneAndUpdate(
        { formId: invitation.formId, fieldId: r.fieldId, memberId: invitation.memberId },
        { $set: { value: r.value } },
        { upsert: true, new: true, runValidators: true }
      );
    });

    if (promises.length > 0) {
      await Promise.all(promises);
    }
    
    await Invitation.updateOne({ _id: invitation._id }, { status: "completed" });
    await Assignment.updateMany(
      { formId: invitation.formId, memberId: invitation.memberId, fieldId: { $in: responses.map(r => r.fieldId) } },
      { $set: { status: "completed" } }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getInvitation, submitResponse };
