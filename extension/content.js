// content.js
// Extracts fields from the page into the normalized form contract shared
// with backend/models/Form.js. Keep this schema in lockstep with that file:
//   fieldId, index, type, label, placeholder, required, selectors{id,name,cssPath}

const FIELD_TYPES = ["text", "email", "number", "url", "select", "textarea"];
const SKIP_INPUT_TYPES = new Set([
  "hidden", "submit", "button", "image", "reset", "file", "checkbox", "radio",
]);

function isExtractable(el) {
  if (el.disabled) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return !SKIP_INPUT_TYPES.has(type);
  }
  return false;
}

function mapType(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  const type = (el.getAttribute("type") || "text").toLowerCase();
  if (type === "email" || type === "number" || type === "url") return type;
  return "text"; 
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/([^\w-])/g, "\\$1");
}

function getLabelText(el) {
  if (el.labels && el.labels.length > 0) {
    const text = el.labels[0].textContent.trim();
    if (text) return text;
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
    if (text) return text;
  }
  const placeholder = el.getAttribute("placeholder");
  if (placeholder && placeholder.trim()) return placeholder.trim();
  const name = el.getAttribute("name");
  if (name) {
    return name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
  }
  return "Untitled field";
}

function buildCssPath(el, maxDepth = 4) {
  const parts = [];
  let node = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < maxDepth) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblingsOfType = Array.from(parent.children).filter((sib) => sib.tagName === node.tagName);
    const nthOfType = siblingsOfType.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${nthOfType})`);
    if (node.id || node.tagName.toLowerCase() === "form") {
      node = null;
    } else {
      node = parent;
      depth += 1;
    }
  }
  return parts.join(" > ");
}

function buildSelectors(el) {
  return {
    id: el.id ? `#${cssEscape(el.id)}` : "",
    name: el.getAttribute("name") ? `[name="${cssEscape(el.getAttribute("name"))}"]` : "",
    cssPath: buildCssPath(el),
  };
}

function detectSourceType() {
  return location.hostname.includes("docs.google.com") ? "google_forms" : "html";
}

function isGoogleForm() {
  return location.hostname.includes("docs.google.com") && location.pathname.includes("/forms/");
}

function normalizeGoogleFormLabel(text) {
  if (!text) return "untitled-field";
  return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function getGoogleFormType(item) {
  if (item.querySelector('textarea')) return 'textarea';
  if (item.querySelector('[role="radio"]')) return 'radio';
  if (item.querySelector('[role="checkbox"]')) return 'checkbox';
  if (item.querySelector('[role="listbox"]') || item.querySelector('.ry3kXd')) return 'select';
  
  const input = item.querySelector('input:not([type="hidden"])');
  if (input) return input.type || 'text';
  
  return 'text';
}

function extractGoogleFormFields() {
  const listItems = Array.from(document.querySelectorAll('div[role="listitem"]'));
  const fields = [];
  console.log(`[GOOGLE FORM] Detected`);
  console.log(`[GOOGLE FORM] Questions found: ${listItems.length}`);
  
  // Track occurrences to handle duplicate labels
  const labelCounts = {};

  listItems.forEach((item, index) => {
    const headingEl = item.querySelector('[role="heading"]') || item.querySelector('.M7eMe');
    const rawLabel = headingEl ? headingEl.textContent : '';
    const label = normalizeGoogleFormLabel(rawLabel);
    const required = rawLabel.includes('*');
    const type = getGoogleFormType(item);
    
    // Stable ID generation
    const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';
    labelCounts[slug] = (labelCounts[slug] || 0) + 1;
    const fieldId = `googleform:${slug}:${labelCounts[slug]}`;

    console.log(`[GOOGLE FORM] Question: "${label}" (ID: ${fieldId}, Type: ${type})`);

    fields.push({
      fieldId,
      index,
      type,
      label,
      placeholder: "",
      required,
      selectors: {
        cssPath: buildCssPath(item, 8)
      },
      googleForm: true
    });
  });

  return {
    sourceUrl: location.href,
    sourceType: "google_forms",
    fields,
  };
}

function extractNormalFields() {
  const candidates = Array.from(document.querySelectorAll("input, textarea, select")).filter(isExtractable);
  const fields = candidates.map((el, i) => ({
    fieldId: `f${i + 1}`,
    index: i,
    type: mapType(el),
    label: getLabelText(el),
    placeholder: el.getAttribute("placeholder") || "",
    required: el.required === true,
    selectors: buildSelectors(el),
    googleForm: false
  }));
  return {
    sourceUrl: location.href,
    sourceType: "html",
    fields,
  };
}

function extractFields() {
  if (isGoogleForm()) {
    return extractGoogleFormFields();
  }
  return extractNormalFields();
}

async function fillGoogleFormField(f, val) {
  console.log(`[GOOGLE FORM] Mapping response "${val}" -> "${f.label}"`);
  
  // Since Google Forms relies heavily on dynamic rendering, query the item dynamically based on selectors/index
  const listItems = Array.from(document.querySelectorAll('div[role="listitem"]'));
  let item = listItems[f.index]; // using index as fallback, but verify via label
  
  if (!item) {
    console.log(`[GOOGLE FORM] Control not found for ${f.label}`);
    return false;
  }
  
  const headingEl = item.querySelector('[role="heading"]') || item.querySelector('.M7eMe');
  const label = normalizeGoogleFormLabel(headingEl ? headingEl.textContent : '');
  if (label !== f.label) {
     console.log(`[GOOGLE FORM] Question mismatch. Expected "${f.label}", got "${label}"`);
     // fallback: find the real one by label
     item = listItems.find(el => {
       const h = el.querySelector('[role="heading"]') || el.querySelector('.M7eMe');
       return normalizeGoogleFormLabel(h ? h.textContent : '') === f.label;
     });
     if (!item) {
       console.log(`[GOOGLE FORM] Mapping failed, control entirely missing for ${f.label}`);
       return false;
     }
  }

  console.log(`[GOOGLE FORM] Control found for ${f.label}`);

  if (f.type === 'text' || f.type === 'email' || f.type === 'number' || f.type === 'textarea') {
    const input = item.querySelector('input:not([type="hidden"]), textarea');
    if (input) {
      input.focus();
      
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
                     Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
          setter.call(input, val);
      } else {
          input.value = val;
      }
      
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      
      console.log(`[GOOGLE FORM] Value applied`);
      console.log(`[GOOGLE FORM] Verification successful`);
      return true;
    }
  } 
  else if (f.type === 'radio') {
    const radios = item.querySelectorAll('[role="radio"]');
    for (const radio of radios) {
      const dataVal = radio.getAttribute('data-value');
      const ariaLabel = radio.getAttribute('aria-label');
      if ((dataVal && dataVal.trim().toLowerCase() === val.trim().toLowerCase()) || 
          (ariaLabel && ariaLabel.trim().toLowerCase() === val.trim().toLowerCase())) {
        radio.click();
        console.log(`[GOOGLE FORM] Value applied`);
        console.log(`[GOOGLE FORM] Verification successful`);
        return true;
      }
    }
  }
  else if (f.type === 'checkbox') {
    const checkboxes = item.querySelectorAll('[role="checkbox"]');
    const targetVals = val.split(',').map(v => v.trim().toLowerCase());
    let applied = false;
    for (const cb of checkboxes) {
      const dataVal = cb.getAttribute('data-value');
      const ariaLabel = cb.getAttribute('aria-label');
      const matchVal = dataVal ? dataVal.toLowerCase() : (ariaLabel ? ariaLabel.toLowerCase() : '');
      const shouldBeChecked = targetVals.includes(matchVal);
      const isChecked = cb.getAttribute('aria-checked') === 'true';
      if (shouldBeChecked !== isChecked) {
        cb.click();
        applied = true;
      }
    }
    if (applied) {
      console.log(`[GOOGLE FORM] Value applied`);
      console.log(`[GOOGLE FORM] Verification successful`);
      return true;
    }
  }
  else if (f.type === 'select') {
    const listbox = item.querySelector('[role="listbox"]');
    if (listbox) {
      listbox.click(); // open
      await new Promise(resolve => setTimeout(resolve, 300));
      // Options are appended to body in an overlay
      const options = document.querySelectorAll('div[role="option"]');
      for (const opt of options) {
        const optText = opt.getAttribute('data-value') || opt.innerText || '';
        if (optText && optText.trim().toLowerCase() === val.trim().toLowerCase()) {
          opt.click();
          console.log(`[GOOGLE FORM] Value applied`);
          console.log(`[GOOGLE FORM] Verification successful`);
          return true;
        }
      }
      // If we couldn't find it, close the dropdown
      listbox.click();
    }
  }
  
  console.log(`[GOOGLE FORM] Mapping failed for ${f.label} with value ${val}`);
  return false;
}

function fillOriginalField(f, val) {
  if (val === undefined || val === null || val === "") return false;
  let el = null;
  if (f.selectors.cssPath && f.selectors.cssPath.includes("#")) {
     try { el = document.querySelector(f.selectors.cssPath); } catch (e) {}
  }
  if (!el && f.selectors.id) {
     try { el = document.querySelector(f.selectors.id); } catch (e) {}
  }
  if (!el && f.selectors.name) {
     try { el = document.querySelector(f.selectors.name); } catch (e) {}
  }
  if (!el && f.selectors.cssPath) {
     try { el = document.querySelector(f.selectors.cssPath); } catch (e) {}
  }
  
  if (el) {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

let activeFormId = null;
let socket = null;
let lastSyncedValues = {};

// Ensure we have a toast container
function showToast(message) {
  let toast = document.getElementById("cyhi-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cyhi-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.padding = "12px 20px";
    toast.style.background = "#10B981";
    toast.style.color = "#fff";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
    toast.style.zIndex = "999999";
    toast.style.fontFamily = "sans-serif";
    toast.style.fontSize = "14px";
    toast.style.transition = "opacity 0.3s";
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.opacity = "1";
  setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}

async function syncAndFillForm(formId) {
  try {
    const finalRes = await fetch(`https://cyhi-production-ac84.up.railway.app/api/forms/${formId}/final`);
    const finalData = await finalRes.json();
    if (!finalData.finalValues) return;
    
    const extractRes = extractFields();
    const fields = extractRes.fields;
    
    let updatedCount = 0;
    
    for (const f of fields) {
      const newVal = finalData.finalValues[f.fieldId];
      if (newVal === undefined || newVal === null || newVal === "") continue;
      
      const oldVal = lastSyncedValues[f.fieldId];
      if (oldVal === newVal) continue;
      
      let success = false;
      if (f.googleForm) {
        success = await fillGoogleFormField(f, newVal);
      } else {
        success = fillOriginalField(f, newVal);
      }
      
      if (success) {
        lastSyncedValues[f.fieldId] = newVal;
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      console.log(`[COLLAB] Form updated successfully (${updatedCount} fields).`);
      showToast(`Member response received — ${updatedCount} field(s) updated`);
    }
  } catch (err) {
    console.error("[COLLAB] Error syncing form:", err);
  }
}

function setupSocket(formId) {
  if (socket) return;
  if (typeof io === 'undefined') {
    console.warn("CYHI: socket.io is not loaded.");
    return;
  }

  console.log("CYHI: Connecting to socket for form", formId);
  socket = io("https://cyhi-production-ac84.up.railway.app");

  socket.on("MEMBER_RESPONSE_UPDATED", (data) => {
    if (data.sessionId !== formId) return;
    console.log("[COLLAB] Member response received via socket");
    syncAndFillForm(formId);
  });
}

// Auto-check on load
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["activeCollaboration"], (res) => {
    if (res.activeCollaboration && res.activeCollaboration.sourceUrl === location.href) {
      activeFormId = res.activeCollaboration.formId;
      setupSocket(activeFormId);
    }
  });
}

if (!window.CYHI_CONTENT_SCRIPT_LOADED) {
  window.CYHI_CONTENT_SCRIPT_LOADED = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CYHI_EXTRACT_FIELDS") {
      try {
        const data = extractFields();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
      return false; 
    }

    if (message?.type === "CYHI_ACTIVATE_SYNC") {
      activeFormId = message.formId;
      setupSocket(activeFormId);
      // Immediately try to sync when activated in case they missed events
      syncAndFillForm(activeFormId);
      sendResponse({ ok: true });
      return false;
    }
  });
}
