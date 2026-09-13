async function runTests() {
  const BASE_URL = "http://localhost:5000/api";

  try {
    console.log("Creating collaboration...");
    const collabResponse = await fetch(`${BASE_URL}/collaborations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: "https://example.com/test",
        sourceType: "html",
        fields: [
          { fieldId: "f1", index: 0, type: "text", label: "Team Name", required: true },
          { fieldId: "f2", index: 1, type: "text", label: "Project Title", required: true },
          { fieldId: "f3", index: 2, type: "text", label: "Dev Member", required: true }
        ],
        leader: {
          name: "Leader Alice",
          email: "alice@example.com",
          role: "Team Leader"
        },
        members: [
          { name: "Bob", email: "bob@example.com", role: "Developer" }
        ]
      })
    });
    
    const collabData = await collabResponse.json();
    if (!collabResponse.ok) throw new Error(JSON.stringify(collabData));

    const teamId = collabData.teamId;
    console.log(`Created Team: ${teamId}`);

    const stateResponse = await fetch(`${BASE_URL}/collaborations/${teamId}`);
    const stateData = await stateResponse.json();
    const { formId, invitations, assignments } = stateData;
    
    // Find Bob's invitation and assignments
    const bobInv = invitations.find(i => i.email === "bob@example.com");
    if (!bobInv) throw new Error("Bob's invitation not found");

    const token = bobInv.joinUrl.split('/').pop();
    console.log(`Bob's token: ${token}`);

    // GET /join/:token
    console.log("Testing GET /join/:token");
    const joinRes = await fetch(`${BASE_URL}/join/${token}`);
    const joinData = await joinRes.json();
    console.log(`Fields assigned to Bob:`, joinData.fields.map(f => f.fieldId));
    console.log(`Bob member info:`, joinData.member);

    // POST /join/:token/responses
    const assignedFields = joinData.fields;
    const responsePayload = assignedFields.map(f => ({
      fieldId: f.fieldId,
      value: `Answer for ${f.fieldId}`
    }));

    console.log("Testing POST /join/:token/responses");
    const submitRes = await fetch(`${BASE_URL}/join/${token}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: responsePayload })
    });
    const submitData = await submitRes.json();
    console.log("Submit success:", submitData.success);

    // GET /forms/:formId/final
    console.log("Testing GET /forms/:formId/final");
    const finalRes = await fetch(`${BASE_URL}/forms/${formId}/final`);
    const finalData = await finalRes.json();
    console.log("Final form fields:");
    console.log(JSON.stringify(finalData.fields, null, 2));

    // GET /forms/lookup?sourceUrl=...
    console.log("Testing GET /forms/lookup");
    const lookupRes = await fetch(`${BASE_URL}/forms/lookup?sourceUrl=https://example.com/test`);
    const lookupData = await lookupRes.json();
    console.log("Lookup result:", lookupData.found);

    console.log("ALL SMOKE TESTS PASSED!");
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}

runTests();
