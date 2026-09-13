const { Router } = require("express");
const { getInvitation, submitResponse } = require("../controllers/joinController");

const router = Router();

router.get("/:token", getInvitation);
router.post("/:token/responses", submitResponse);

module.exports = router;
