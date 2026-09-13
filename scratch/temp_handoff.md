## Current state
End-to-end member assignment, real-time collaboration updates, and response fetching now function as required. Complete backend API architecture maps strictly to specifications.
MongoDB connection robustly handles Node.js SRV DNS limitations on Windows/WSL environments.

## Works
- MongoDB connection using `mongodb+srv://` dynamically appending fallback DNS servers (`8.8.8.8`, `1.1.1.1`) to Node's internal resolver, bypassing local 127.0.0.1 port 53 ECONNREFUSED errors.
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
- Maintained `mongodb+srv://` architecture instead of hardcoding replica set strings to preserve Atlas dynamic shard discovery.
- Appended `8.8.8.8` to Node's `dns.getServers()` via `dns.setServers()` in `config/db.js` because Node.js's native `c-ares` library was getting `ECONNREFUSED` from `127.0.0.1` locally, while Windows OS `nslookup` worked fine.
- Suppressed the initial `MongoDB disconnected` console warning if Mongoose hasn't connected yet, avoiding misleading error logs.

## Don't retry
- Do not build a second MemberResponse collection, `Response` combined with unique `formId + fieldId + memberId` is sufficient.
- Do not add fake or redundant completion statuses. Stick to pending -> opened -> completed.
- Do not trust client-supplied `memberId` for updates.
- Do not change Node's MONGODB_URI to `mongodb://` hardcoded shards - the custom DNS fallback is the correct fix.
