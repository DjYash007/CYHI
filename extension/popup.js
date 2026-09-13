let members = [];

document.addEventListener('DOMContentLoaded', () => {
  const roleInput = document.getElementById('role-input');
  const emailInput = document.getElementById('email-input');
  const addBtn = document.getElementById('add-member-btn');
  const membersList = document.getElementById('members-list');
  const emptyState = document.getElementById('empty-state');
  const sendBtn = document.getElementById('send-invites-btn');
  const emailError = document.getElementById('email-error');
  const statusMessage = document.getElementById('status-message');

  function renderMembers() {
    // Clear list except empty state
    const items = membersList.querySelectorAll('.member-item');
    items.forEach(item => item.remove());

    if (members.length === 0) {
      emptyState.classList.remove('hidden');
      sendBtn.disabled = true;
    } else {
      emptyState.classList.add('hidden');
      sendBtn.disabled = false;

      members.forEach((member, index) => {
        const div = document.createElement('div');
        div.className = 'member-item bg-white border border-gray-200 rounded-md p-3 flex justify-between items-center shadow-sm';
        div.innerHTML = `
          <div class="overflow-hidden">
            <p class="text-xs font-semibold text-gray-800 truncate">${member.role}</p>
            <p class="text-xs text-gray-500 truncate">${member.email}</p>
          </div>
          <button class="remove-btn text-xs text-red-500 hover:text-red-700 ml-2 focus:outline-none" data-index="${index}">
            Remove
          </button>
        `;
        membersList.appendChild(div);
      });

      // Attach remove handlers
      const removeBtns = membersList.querySelectorAll('.remove-btn');
      removeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'), 10);
          members.splice(idx, 1);
          renderMembers();
          resetStatus();
        });
      });
    }
  }

  function showError(msg) {
    emailError.textContent = msg;
    emailError.classList.remove('hidden');
  }

  function hideError() {
    emailError.textContent = '';
    emailError.classList.add('hidden');
  }
  
  function resetStatus() {
    statusMessage.textContent = '';
    statusMessage.classList.add('hidden');
  }

  addBtn.addEventListener('click', () => {
    hideError();
    resetStatus();
    
    const role = roleInput.value.trim() || 'Member';
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
      showError('Email is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError('Please enter a valid email format.');
      return;
    }

    if (members.find(m => m.email === email)) {
      showError('This email is already added.');
      return;
    }

    members.push({ role, email });
    emailInput.value = '';
    roleInput.value = 'Member';
    renderMembers();
  });

  // ---------- Extraction & Messaging Helpers ----------
  function sendExtractMessage(tabId) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Extraction timed out. The page might be incompatible or restricted."));
      }, 3000);

      chrome.tabs.sendMessage(tabId, { type: "CYHI_EXTRACT_FIELDS" }, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function injectContentScript(tabId) {
    console.log("[CYHI POPUP] Injecting content script into tab", tabId);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch (e) {
      console.error("[CYHI POPUP] Injection failed:", e);
      throw new Error("Cannot access this page. Is it a restricted Chrome page?");
    }
  }

  async function extractFromActiveTab() {
    console.log("[CYHI POPUP] Querying active tab...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    console.log("[CYHI POPUP] Active tab:", tab.id, tab.url);

    try {
      console.log("[CYHI POPUP] Sending extraction message (attempt 1)");
      const res = await sendExtractMessage(tab.id);
      console.log("[CYHI POPUP] Extraction response (attempt 1):", res);
      return res;
    } catch (err) {
      console.log("[CYHI POPUP] Attempt 1 failed:", err.message);
      await injectContentScript(tab.id);
      console.log("[CYHI POPUP] Sending extraction message (attempt 2)");
      const res2 = await sendExtractMessage(tab.id);
      console.log("[CYHI POPUP] Extraction response (attempt 2):", res2);
      return res2;
    }
  }

  // ---------- Send Invitations Flow ----------
  sendBtn.addEventListener('click', async () => {
    console.log("[CYHI POPUP] Send button clicked");
    if (members.length === 0) return;
    
    sendBtn.disabled = true;
    sendBtn.textContent = 'Extracting...';
    hideError();
    resetStatus();

    try {
      console.log("[CYHI POPUP] Starting extraction...");
      const response = await extractFromActiveTab();
      console.log("[CYHI POPUP] Extraction successful");

      if (!response || !response.ok) {
        throw new Error(response?.error || "Unable to read fields from this page. Please reload the page and try again.");
      }

      const extractedForm = response.data;
      if (!extractedForm || !extractedForm.fields || extractedForm.fields.length === 0) {
        throw new Error("No form fields detected on this page.");
      }

      console.log("[CYHI POPUP] Changing button text to 'Creating Collaboration...'");
      sendBtn.textContent = 'Creating Collaboration...';

      const payload = {
        leader: {
          name: "Leader",
          email: "leader@example.com",
          role: "Team Leader"
        },
        sourceUrl: extractedForm.sourceUrl,
        sourceType: extractedForm.sourceType,
        fields: extractedForm.fields,
        members: members
      };

      console.log("[CYHI POPUP] Creating collaboration with payload:", payload);

      const res = await fetch("http://localhost:5000/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      console.log("[CYHI POPUP] Collaboration HTTP status:", res.status);

      let responseData;

      try {
          responseData = await res.json();
      } catch (jsonErr) {
          throw new Error(
              res.status >= 500
                  ? "CYHI server error. Check the backend console."
                  : "Invalid response from CYHI server."
          );
      }

      // Check FIRST API
      if (!res.ok) {
          let errorMsg = "Unable to create collaboration.";

          if (responseData.details && Array.isArray(responseData.details)) {
              errorMsg = responseData.details.join(", ");
          } else if (responseData.error) {
              errorMsg = responseData.error;
          }

          throw new Error(errorMsg);
      }

      console.log("[CYHI] Collaboration created:", responseData);

      // Get the REAL team ID and form ID
      const teamId = responseData.teamId;
      const formId = responseData.formId;

      if (!teamId || !formId) {
          throw new Error(
              "Collaboration was created, but the backend did not return a teamId or formId."
          );
      }

      console.log("[CYHI POPUP] Team ID:", teamId);
      
      // STEP 1.5: Generate AI Assignments
      console.log("[CYHI POPUP] Generating AI Assignments...");
      sendBtn.textContent = 'Generating AI Assignments...';
      
      try {
        const aiRes = await fetch(`http://localhost:5000/api/forms/${encodeURIComponent(formId)}/ai-assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId })
        });
        if (!aiRes.ok) {
            console.warn("[CYHI POPUP] AI assignment failed or returned non-OK. Continuing anyway.");
        } else {
            console.log("[CYHI POPUP] AI Assignments successful.");
        }
      } catch (aiErr) {
        console.warn("[CYHI POPUP] AI assignment network error. Continuing anyway.", aiErr);
      }

      console.log("[CYHI POPUP] Sending invitations...");
      sendBtn.textContent = 'Sending Invitations...';

      // STEP 2: Actually send invitations
      const sendRes = await fetch(
          `http://localhost:5000/api/collaborations/${encodeURIComponent(teamId)}/invitations/send`,
          {
              method: "POST",
              headers: {
                  "Content-Type": "application/json"
              }
          }
      );

      let sendData;

      try {
          sendData = await sendRes.json();
      } catch (jsonErr) {
          throw new Error(
              sendRes.status >= 500
                  ? "Email service/backend error. Check the backend console."
                  : "Invalid response from invitation service."
          );
      }

      console.log("[CYHI] Invitation send response:", sendData);

      // Check SECOND API
      if (!sendRes.ok) {
          throw new Error(
              sendData.error ||
              sendData.message ||
              "Failed to send invitations."
          );
      }

      // Check application-level failures
      if (sendData.failed && sendData.failed > 0) {
          throw new Error(
              `${sendData.failed} invitation(s) failed to send.`
          );
      }

      console.log("[CYHI] Invitations sent successfully:", sendData);

      statusMessage.textContent = "Invitations sent successfully.";
      statusMessage.className =
          "text-xs text-center font-medium p-2 mb-4 rounded bg-green-50 text-green-700 border border-green-200";
      statusMessage.classList.remove("hidden");

      sendBtn.textContent = 'Invitations Sent';

      // Disable inputs after successful mock send
      addBtn.disabled = true;
      emailInput.disabled = true;
      roleInput.disabled = true;
    } catch (err) {
      console.error("[CYHI POPUP] Error:", err);
      const errMsg = (err && err.message) ? err.message : String(err);
      
      const finalMsg = errMsg === "Failed to fetch" || errMsg.includes("NetworkError")
        ? "Cannot connect to CYHI server. Make sure the backend is running."
        : errMsg;
        
      statusMessage.textContent = finalMsg;
      statusMessage.className = 'text-xs text-center font-medium p-2 mb-4 rounded bg-red-50 text-red-700 border border-red-200';
      statusMessage.classList.remove('hidden');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Invitations';
    }
  });

  // ---------- Lookup / Auto-fill Flow ----------
  async function checkExistingCollaboration() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;
      
      const lookupRes = await fetch(`http://localhost:5000/api/forms/lookup?sourceUrl=${encodeURIComponent(tab.url)}`);
      if (!lookupRes.ok) return;
      const lookupData = await lookupRes.json();
      
      if (lookupData.forms && lookupData.forms.length > 0) {
        const formId = lookupData.forms[0]._id;
        
        const progRes = await fetch(`http://localhost:5000/api/forms/${formId}/progress`);
        if (!progRes.ok) return;
        const progData = await progRes.json();
        
        if (progData.progressPercentage === 100) {
          document.getElementById('final-fill-section').classList.remove('hidden');
          
          document.getElementById('fill-form-btn').addEventListener('click', async () => {
            const btn = document.getElementById('fill-form-btn');
            btn.disabled = true;
            btn.textContent = "Fetching...";
            
            try {
              const finalRes = await fetch(`http://localhost:5000/api/forms/${formId}/final`);
              const finalData = await finalRes.json();
              
              if (!finalData.finalValues) throw new Error("No final values available.");
              
              btn.textContent = "Injecting into page...";
              
              const extractRes = await extractFromActiveTab();
              if (!extractRes || !extractRes.ok) throw new Error("Could not extract target fields.");
              
              chrome.tabs.sendMessage(tab.id, {
                type: "CYHI_FILL_FIELDS",
                data: {
                  finalValues: finalData.finalValues,
                  fields: extractRes.data.fields
                }
              }, (response) => {
                if (response && response.ok) {
                  btn.textContent = `Success (${response.filledCount} fields)`;
                } else {
                  btn.textContent = "Failed to inject.";
                }
              });
              
            } catch (err) {
              console.error(err);
              btn.textContent = "Error";
            }
          });
        }
      }
    } catch (e) {
      console.warn("Lookup failed:", e);
    }
  }

  // Initial render
  renderMembers();
  checkExistingCollaboration();
});