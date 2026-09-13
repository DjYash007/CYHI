const mongoose = require("mongoose");
const Form = require("../models/Form");
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
    const responses = await Response.find({ formId }).lean();
    
    // Create a map of memberId+fieldId to check if response exists
    const responseKeys = new Set(responses.map(r => `${r.memberId.toString()}_${r.fieldId}`));

    const totalFields = assignments.length;
    let completedFields = 0;

    const memberProgress = {};
    for (const a of assignments) {
      const memberIdStr = a.memberId.toString();
      if (!memberProgress[memberIdStr]) {
        memberProgress[memberIdStr] = { total: 0, completed: 0 };
      }
      memberProgress[memberIdStr].total++;
      
      const isCompleted = responseKeys.has(`${memberIdStr}_${a.fieldId}`);
      if (isCompleted) {
        memberProgress[memberIdStr].completed++;
        completedFields++;
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

async function lookupForm(req, res, next) {
  try {
    const { sourceUrl } = req.query;
    if (!sourceUrl) {
      throw new ApiError(400, "sourceUrl query parameter is required.");
    }
    
    // Sort by createdAt desc to get the most recent collaboration for this URL
    const forms = await Form.find({ sourceUrl }).sort({ createdAt: -1 }).lean();
    
    res.json({ forms });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProgress, getFinalAggregation, lookupForm };
