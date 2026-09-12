# CYHI — COLLABORATIVE FORM FILLING PLATFORM
## Hackathon Implementation Context

We are building a 24-hour hackathon project called CYHI.

Repository:
https://github.com/Luffy-D-Zoro/CYHI

Core idea:
"One request. Many contributors. One final submission."

## 1. PROBLEM

Many team-based forms require information from multiple people, but the form itself is designed for one person to complete and submit.

Example:
A hackathon registration form asks for:

- Team name
- Team leader name/email/phone
- Member 2 name/email/GitHub/college
- Member 3 name/email/GitHub/college
- Member 4 resume/LinkedIn
- Project title
- Project description
- Team details

Normally one person collects everything manually through WhatsApp/Discord, waits for responses, copies everything into the form, checks missing fields, and finally submits.

This creates:
- coordination overhead
- missing information
- copy/paste mistakes
- last-minute delays

## 2. SOLUTION

CYHI is a browser-extension-assisted collaborative form-filling platform.

The team leader opens a form and clicks the CYHI extension.

The system:

1. Detects/extracts fields from the current form.
2. Asks the team leader for teammate email addresses.
3. Sends the extracted field structure to an AI classifier.
4. AI categorizes fields and suggests which teammate should fill each field.
5. Leader reviews/changes the AI assignments.
6. CYHI generates unique invitation links.
7. Emails are sent to the teammates.
8. Each teammate opens their link and sees ONLY the fields assigned to them.
9. They fill their information.
10. Responses are stored and synchronized.
11. Leader sees live completion progress.
12. Once all required fields are complete, CYHI aggregates the responses.
13. The browser extension receives the final data.
14. The extension fills the original form.
15. Leader reviews the completed original form.
16. Leader manually clicks Submit.

IMPORTANT:
The extension should NOT automatically click the final Submit button in the MVP.
The user should review the populated form and submit it themselves.

## 3. IMPORTANT AI ASSIGNMENT RULE

AI should NOT blindly decide field ownership.

Example:

Members:
- Rahul — backend developer
- Aman — frontend developer
- Priya — team leader

Fields:
- Full name
- Email
- Phone
- GitHub
- Backend experience
- UI/UX experience
- Project description

AI should produce SUGGESTIONS such as:

Full name → Rahul
Email → Rahul
Phone → Rahul
GitHub → Rahul
Backend experience → Rahul
UI/UX experience → Aman
Project description → Priya

But the team leader MUST be able to review/change assignments before invitations are sent.

### Assignment strategy

First classify fields:

PERSONAL:
- name
- email
- phone
- GitHub
- LinkedIn
- resume

TEAM:
- team name
- college
- team size

PROJECT:
- project title
- description
- tech stack

ROLE-SPECIFIC:
- backend experience
- frontend experience
- design experience

Rules:
- Obvious personal fields should be deterministically assigned to the corresponding person.
- Team/project fields can be assigned to the leader by default.
- Role-specific or ambiguous fields can be suggested by AI using member roles/descriptions.
- AI should return confidence/reasoning where useful.
- Leader can override everything.

We should NOT assume an email address alone tells us who owns a field.

## 4. REAL USER FLOW

### Leader

1. Open external form.
2. Click CYHI browser extension.
3. Extension detects form.
4. Extension popup asks for teammate emails.
5. Extension extracts form fields.
6. Backend/AI analyzes fields.
7. CYHI opens leader dashboard.
8. Leader sees suggested assignments.
9. Leader reviews/edits assignments.
10. Leader clicks "Send Invitations."
11. Invitation emails are sent.

### Teammate

1. Opens invitation email.
2. Clicks unique join link.
3. CYHI identifies the collaboration.
4. Teammate sees assigned fields.
5. Teammate enters information.
6. Clicks save/submit.
7. Backend stores responses.

### Leader after completion

1. Dashboard shows live progress.
2. When all required fields are complete:
   "Ready to fill original form."
3. Leader opens the original form.
4. Clicks CYHI extension.
5. Extension gets aggregated response data.
6. Extension populates the original form.
7. Leader reviews all fields.
8. Leader manually submits.

## 5. ARCHITECTURE

                 EXTERNAL FORM
                       |
                       v
                BROWSER EXTENSION
                       |
                  extract fields
                       |
                       v
                NORMALIZED FORM
                       |
                       v
                  BACKEND/API
                       |
                AI FIELD ANALYSIS
                       |
                       v
              LEADER DASHBOARD
                       |
              review assignments
                       |
              create invitations
                       |
            +----------+----------+
            |          |          |
            v          v          v
         Member A   Member B   Member C
            |          |          |
            +----------+----------+
                       |
                       v
                  RESPONSES
                       |
                 Socket.IO sync
                       |
                       v
                 AGGREGATION
                       |
                       v
                FINAL RESPONSE
                       |
                       v
                BROWSER EXTENSION
                       |
                       v
              FILL ORIGINAL FORM
                       |
                       v
                  USER REVIEW
                       |
                       v
                    SUBMIT

## 6. MONOREPO

Current repository structure:

/
├── backend/
├── frontend/
└── extension/

### backend
Node.js + Express
MongoDB/Mongoose
Socket.IO

Responsibilities:
- forms
- assignments
- invitation tokens
- responses
- aggregation
- AI integration
- WebSocket events

### frontend
React + Vite
Tailwind CSS

Two main UI experiences:
- Leader dashboard
- Member input page

### extension
Chrome Manifest V3
JavaScript/HTML/CSS

Responsibilities:
- detect external form
- extract basic fields
- communicate with backend
- launch collaboration
- receive final aggregated answers
- populate original form

The extension is a bridge, NOT the entire UI.

## 7. NORMALIZED FORM MODEL

The collaboration engine must not depend on Google Forms.

Example:

{
  "sourceUrl": "https://example.com/form",
  "sourceType": "html",
  "fields": [
    {
      "fieldId": "f1",
      "index": 0,
      "type": "text",
      "label": "Full Name",
      "placeholder": "",
      "required": true,
      "selectors": {
        "id": "#name",
        "name": "[name='name']",
        "cssPath": "form input:nth-of-type(1)"
      }
    }
  ]
}

The normalized form is the contract between:
Extension <-> Backend <-> Frontend.

## 8. DATA MODEL

Initial entities:

User:
- id
- name
- email

Form:
- id
- sourceUrl
- sourceType
- fields[]

Assignment:
- id
- formId
- fieldId
- memberId
- status

Response:
- id
- formId
- fieldId
- memberId
- value
- updatedAt

Invitation:
- id
- formId
- email
- token
- status
- createdAt

Team/collaboration:
- id
- ownerId
- members[]
- formId

Do not over-engineer authentication for the 24-hour MVP.

Invitation links should be token-based.

Example:
https://cyhi.app/join/8fK29x

## 9. IMPORTANT API CONTRACT

Initial APIs:

POST /api/forms
Create/store normalized form.

GET /api/forms/:formId
Retrieve form.

POST /api/forms/:formId/assignments
Create/update field assignments.

GET /api/join/:token
Resolve invitation and return assigned fields.

POST /api/forms/:formId/responses
Save a member's response.

GET /api/forms/:formId/progress
Get completion status.

GET /api/forms/:formId/final
Return aggregated response.

POST /api/forms/:formId/invitations
Create/send invitations.

AI endpoint/service:
POST /api/forms/:formId/analyze

The exact route structure can be changed if there is a good architectural reason.

## 10. REAL-TIME EVENTS

Use Socket.IO.

Room:
socket.join(formId)

Events:

field_updated
Payload:
{
  fieldId,
  memberId,
  value,
  completed
}

progress_updated

form_completed

leader_assignment_updated

The leader dashboard should update without page refresh.

## 11. AI OUTPUT

AI should return structured JSON rather than natural-language-only output.

Example:

{
  "assignments": [
    {
      "fieldId": "f1",
      "memberId": "rahul",
      "confidence": 1.0,
      "reason": "Personal field"
    },
    {
      "fieldId": "f8",
      "memberId": "aman",
      "confidence": 0.92,
      "reason": "Matches frontend role"
    }
  ]
}

The backend must validate that AI output refers only to real fieldIds and real memberIds.

Never trust raw AI output directly.

## 12. EXTENSION IMPLEMENTATION

The extension should initially support ordinary HTML forms.

Basic extraction:
- input
- textarea
- select

The extractor should try to determine:
- label
- type
- placeholder
- name
- id
- required
- stable selector

Do NOT attempt to perfectly support every form platform during the hackathon.

Build a generic HTML-form adapter first.

Then add Google Forms-specific handling if time allows.

## 13. FILLING THE ORIGINAL FORM

Final aggregated data is returned to the extension.

The extension locates the original field using stored selectors.

For ordinary inputs, use native property setters when necessary and dispatch:

- input
- change
- blur

Example concept:

const setter =
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  ).set;

setter.call(element, value);

element.dispatchEvent(
  new Event("input", { bubbles: true })
);

element.dispatchEvent(
  new Event("change", { bubbles: true })
);

Framework-specific/custom form handling may require adapters.

Do not claim this works universally.

## 14. 24-HOUR MVP PRIORITY

P0 — MUST WORK:

1. Extension detects a basic HTML form.
2. Extract fields.
3. Enter teammate emails.
4. Create collaboration.
5. AI/classifier produces field assignment suggestions.
6. Leader can edit assignments.
7. Generate invitation links.
8. Members open links.
9. Members fill assigned fields.
10. Store responses.
11. Show live progress.
12. Aggregate final response.
13. Extension fills original form.
14. Leader manually submits.

P1:
- Email delivery
- Google Forms-specific adapter
- Google OAuth
- field validation
- reminders
- file upload

P2:
- advanced AI field classification
- multiple form providers
- analytics
- organization accounts

Do not spend hackathon time on:
- billing
- mobile app
- complicated enterprise authentication
- supporting every form platform
- automatic submission
- excessive animations
- unnecessary microservices

## 15. DEVELOPMENT PRINCIPLES

When modifying the repository:

1. Read the existing code before changing it.
2. Do not rewrite working parts unnecessarily.
3. Keep backend/frontend/extension boundaries clean.
4. Use small, testable functions.
5. Validate API input.
6. Validate AI output.
7. Keep the normalized form schema stable.
8. Avoid hard-coding Google Forms into the collaboration engine.
9. Keep commits focused.
10. Explain major architectural changes before making them.
11. Prefer a working simple implementation over an over-engineered one.
12. When something cannot be supported generically, create an adapter instead of adding hacks to the core engine.

## 16. CURRENT STATE

The repository currently has only the initial monorepo scaffolding.

Backend:
- initial setup only
- no complete models yet

Frontend:
- initial React/Vite setup

Extension:
- only planned/initial scaffolding
- extraction/filling is NOT considered complete

Do not assume any of the above functionality already exists.

## 17. CURRENT IMMEDIATE GOAL

Build the project incrementally.

First:
1. Backend models
2. MongoDB connection
3. Express server
4. Form creation endpoint
5. Assignment endpoint
6. Response endpoint
7. Invitation-token flow
8. Socket.IO rooms/events

Then:
9. Leader dashboard
10. Member dashboard

Then:
11. Browser extension field extraction
12. AI field-assignment integration
13. Email invitations
14. Extension final-form population

Do not implement the whole project in one step.

For each task:
- inspect current repository
- explain files to change
- implement the smallest complete unit
- test it
- then move to the next piece.