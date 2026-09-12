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

  sendBtn.addEventListener('click', () => {
    if (members.length === 0) return;
    
    // In actual implementation, we would get form data here and send to backend
    console.log("Collected Member Data:", JSON.stringify(members, null, 2));
    
    statusMessage.textContent = 'Invitations are ready to be sent.';
    statusMessage.className = 'text-xs text-center font-medium p-2 mb-4 rounded bg-green-50 text-green-700 border border-green-200';
    statusMessage.classList.remove('hidden');
    
    // Disable inputs after successful send (mocking completion)
    sendBtn.disabled = true;
    addBtn.disabled = true;
    emailInput.disabled = true;
    roleInput.disabled = true;
  });

  // Initial render
  renderMembers();
});