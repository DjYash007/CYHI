## Current state
E2E workflow is verified. The backend progress and final endpoints correctly aggregate data. The frontend submits to the correct response endpoint. The extension correctly populates the final form fields using the CYHI_FILL_FIELDS content script logic.

## Works
- Form extraction
- Collaborative assignments
- Member response submission
- Final data aggregation and progress tracking
- Original web form DOM injection via extension

## Broken
None right now.

## Next 3 things
- Deploy to production / verify in real conditions.
- Design improvements for extension popup.
- End-user documentation for CYHI features.

## Decisions (and why)
- Fixed Progress to calculate based on actual Response existence instead of Assignment completion status to match the submission logic.
- Implemented lookup endpoint in backend for extension to determine if it should show the final auto-fill UI.

## Don't retry
- Dummy UI inputs in member view. It must render from the assignments MongoDB collection via /api/forms/:id/ai-assignments.
