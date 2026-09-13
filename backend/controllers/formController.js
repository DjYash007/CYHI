const mongoose = require("mongoose");
const Form = require("../models/Form");
const Team = require("../models/Team");
const Assignment = require("../models/Assignment");
const Response = require("../models/Response");
const ApiError = require("../utils/ApiError");

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
    const completedFields = assignments.filter(a => a.status === "completed").length;
    
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
      memberProgress
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

    const fieldsData = [];

    for (const f of form.fields) {
      const fieldId = f.fieldId;
      const fieldAssignments = assignmentsByField[fieldId] || [];
      const fieldResponses = responsesByField[fieldId] || [];

      let value = null; // default empty/null

      if (fieldAssignments.length > 0) {
        // filter responses to only those submitted by a member actually assigned
        const validResponses = fieldResponses.filter(r => 
          fieldAssignments.some(a => a.memberId.toString() === r.memberId.toString())
        );

        if (validResponses.length > 0) {
          if (validResponses.length > 1) {
            // Sort by latest if duplicates exist somehow
            validResponses.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          }
          value = validResponses[0].value;
        }
      }

      fieldsData.push({
        fieldId: fieldId,
        label: f.label,
        value: value
      });
    }

    res.json({
      formId: form._id,
      sourceUrl: form.sourceUrl,
      fields: fieldsData
    });
  } catch (err) {
    next(err);
  }
}

async function lookupForm(req, res, next) {
  try {
    const { sourceUrl } = req.query;
    
    if (!sourceUrl || typeof sourceUrl !== "string") {
      throw new ApiError(400, "sourceUrl query parameter is required.");
    }
    
    // Exact match lookup
    const form = await Form.findOne({ sourceUrl }).lean();
    
    if (!form) {
      return res.json({ found: false });
    }
    
    const team = await Team.findOne({ formId: form._id }).lean();
    
    res.json({
      found: true,
      formId: form._id,
      teamId: team ? team._id : null,
      sourceUrl: form.sourceUrl
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProgress, getFinalAggregation, lookupForm };
