const { Router } = require("express");
const { getProgress, getFinalAggregation } = require("../controllers/formController");

const router = Router();

router.get("/:formId/progress", getProgress);
router.get("/:formId/final", getFinalAggregation);

module.exports = router;
