const { Router } = require("express");
const { getProgress, getFinalAggregation, lookupForm } = require("../controllers/formController");

const router = Router();

router.get("/lookup", lookupForm);
router.get("/:formId/progress", getProgress);
router.get("/:formId/final", getFinalAggregation);

module.exports = router;
