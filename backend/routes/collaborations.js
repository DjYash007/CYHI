const { Router } = require("express");
const { createCollaboration, getCollaboration } = require("../controllers/collaborationController");

const router = Router();

router.post("/", createCollaboration);
router.get("/:teamId", getCollaboration);

module.exports = router;
