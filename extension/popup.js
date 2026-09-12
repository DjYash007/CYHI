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
      chrome.tabs.sendMessage(tabId, { type: "CYHI_EXTRACT_FIELDS" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function injectContentScript(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }

  async function extractFromActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");

    try {
      return await sendExtractMessage(tab.id);
    } catch (err) {
      await injectContentScript(tab.id);
      return await sendExtractMessage(tab.id);
    }
  }

  // ---------- Send Invitations Flow ----------
  sendBtn.addEventListener('click', async () => {
    if (members.length === 0) return;
    
    sendBtn.disabled = true;
    sendBtn.textContent = 'Extracting & Sending...';
    hideError();
    resetStatus();

    try {
      const response = await extractFromActiveTab();

      if (!response || !response.ok) {
        throw new Error(response?.error || "Unable to read fields from this page. Please reload the page and try again.");
      }

      const extractedForm = response.data;
      if (!extractedForm || !extractedForm.fields || extractedForm.fields.length === 0) {
        throw new Error("No form fields detected on this page.");
      }

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

      console.log("[CYHI] Final collaboration payload:", payload);

      const res = await fetch("http://localhost:5000/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      let responseData;
      try {
        responseData = await res.json();
      } catch (jsonErr) {
        throw new Error(res.status >= 500 ? "CYHI server error. Check the backend console." : "Unable to send invitations. Please try again.");
      }
      
      if (!res.ok) {
        let errorMsg = "Unable to send invitations. Please try again.";
        if (responseData.details && Array.isArray(responseData.details)) {
          errorMsg = responseData.details.join(", ");
        } else if (responseData.error) {
          errorMsg = responseData.error;
        }
        throw new Error(errorMsg);
      }

      console.log("[CYHI] Backend response:", responseData);

      statusMessage.textContent = 'Invitations created successfully.';
      statusMessage.className = 'text-xs text-center font-medium p-2 mb-4 rounded bg-green-50 text-green-700 border border-green-200';
      statusMessage.classList.remove('hidden');
      
      // Disable inputs after successful mock send
      addBtn.disabled = true;
      emailInput.disabled = true;
      roleInput.disabled = true;
    } catch (err) {
      console.error("[CYHI] Error:", err);
      // Fallback for fetch failure where it completely throws (e.g., server offline)
      const errorMsg = err.message === "Failed to fetch" || err.message.includes("NetworkError")
        ? "Cannot connect to CYHI server. Make sure the backend is running."
        : err.message;
        
      statusMessage.textContent = errorMsg;
      statusMessage.className = 'text-xs text-center font-medium p-2 mb-4 rounded bg-red-50 text-red-700 border border-red-200';
      statusMessage.classList.remove('hidden');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Invitations';
    }
  });

  // Initial render
  renderMembers();
});