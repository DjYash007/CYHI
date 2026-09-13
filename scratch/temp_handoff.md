## Current state
End-to-end member assignment, real-time collaboration updates, and response fetching now function as required. Complete backend API architecture maps strictly to specifications.

## Works
- `GET /api/join/:token`: Token correctly derives Member and Form objects, safely preventing ID spoofing.
- `POST /api/join/:token/responses`: Strictly validates incoming assigned fields. Batch process uses `upsert` and tracks latest state flawlessly. Socket.io `field_updated` event is emitted.
- `GET /api/forms/:formId/final`: Aggregates the absolute latest DB state accurately.
- `GET /api/forms/lookup`: Resolves existing collaborations for the Chrome extension safely based on `sourceUrl`.

## Broken
- Nothing broken on backend. Currently awaiting extension and frontend counterparts to adapt to the completed APIs.

## Next 3 things
- Update extension to utilize `/api/forms/lookup` when reopening original forms.
- Update frontend to render fields passed back from `/api/join/:token` rather than querying manually.
- Auto-fill extension logic using `/api/forms/:formId/final` output array structure.

## Decisions (and why)
- Chose strong token-driven member validation for `GET` and `POST` so `memberId` spoofing is impossible.
- Decided to validate entire arrays synchronously before saving to DB, avoiding a partial write if a user sends 1 valid and 1 unauthorized field ID.
- Switched final API to return an array of objects to better map to the extension `content.js` expected structure.

## Don't retry
- Do not build a second MemberResponse collection, `Response` combined with unique `formId + fieldId + memberId` is sufficient.
- Do not add fake or redundant completion statuses. Stick to pending -> opened -> completed.
- Do not trust client-supplied `memberId` for updates.
