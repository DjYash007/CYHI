// content.js
// Extracts fields from the page into the normalized form contract shared
// with backend/models/Form.js. Keep this schema in lockstep with that file:
//   fieldId, index, type, label, placeholder, required, selectors{id,name,cssPath}

const FIELD_TYPES = ["text", "email", "number", "url", "select", "textarea"];

// Types we don't support extracting yet (MVP: ordinary text-ish inputs only).
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
  return "text"; // covers text, tel, password, date, search, etc.
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
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder && placeholder.trim()) return placeholder.trim();

  const name = el.getAttribute("name");
  if (name) {
    return name
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
  }

  return "Untitled field";
}

// Builds a short, reasonably stable path from a nearby ancestor down to the
// element, using tag + nth-of-type at each level. Not guaranteed unique on
// wildly dynamic pages, but good enough as a fallback when id/name are absent.
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
    const siblingsOfType = Array.from(parent.children).filter(
      (sib) => sib.tagName === node.tagName
    );
    const nthOfType = siblingsOfType.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${nthOfType})`);

    if (node.id || node.tagName.toLowerCase() === "form") {
      node = null; // stop climbing once we hit something anchorable
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

function extractFields() {
  const candidates = Array.from(document.querySelectorAll("input, textarea, select")).filter(
    isExtractable
  );

  const fields = candidates.map((el, i) => ({
    fieldId: `f${i + 1}`, // 1-based ID
    index: i,             // 0-based index
    type: mapType(el),
    label: getLabelText(el),
    placeholder: el.getAttribute("placeholder") || "",
    required: el.required === true,
    selectors: buildSelectors(el),
  }));

  return {
    sourceUrl: location.href,
    sourceType: detectSourceType(),
    fields,
  };
}

let activeFormId = null;
let socket = null;

function fillOriginalField(f, val) {
  if (val === undefined || val === null || val === "") return false;
  
  let el = null;
  
  // Strategy 1: Try CSS path if highly specific
  if (f.selectors.cssPath && f.selectors.cssPath.includes("#")) {
     try { el = document.querySelector(f.selectors.cssPath); } catch (e) {}
  }
  
  // Strategy 2: ID
  if (!el && f.selectors.id) {
     try { el = document.querySelector(f.selectors.id); } catch (e) {}
  }
  
  // Strategy 3: Name
  if (!el && f.selectors.name) {
     try { el = document.querySelector(f.selectors.name); } catch (e) {}
  }
  
  // Strategy 4: Fallback to CSS Path
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

function setupSocket(formId) {
  if (socket) return;
  if (typeof io === 'undefined') {
    console.warn("CYHI: socket.io is not loaded.");
    return;
  }

  console.log("CYHI: Connecting to socket for form", formId);
  socket = io("http://localhost:5000");

  socket.on("field_updated", (data) => {
    if (data.formId !== formId) return;
    
    // On every update, extract fields to map the ID to current DOM element
    const fields = extractFields().fields;
    const targetField = fields.find(f => f.fieldId === data.fieldId);
    
    if (targetField) {
      console.log(`CYHI: Real-time autofill for ${data.fieldId}`);
      fillOriginalField(targetField, data.value);
    }
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
      return false; // Synchronous response
    }

    if (message?.type === "CYHI_ACTIVATE_SYNC") {
      activeFormId = message.formId;
      setupSocket(activeFormId);
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "CYHI_FILL_FIELDS") {
      try {
        const { finalValues, fields } = message.data;
        const filled = [];
        const failed = [];
        
        for (const f of fields) {
          const val = finalValues[f.fieldId];
          if (val === undefined || val === null || val === "") {
             continue;
          }
          
          if (fillOriginalField(f, val)) {
            filled.push({ fieldId: f.fieldId, status: "filled" });
          } else {
            failed.push({ fieldId: f.fieldId, status: "not_found" });
          }
        }
        
        sendResponse({ ok: true, filledCount: filled.length, filled, failed, success: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
      return false;
    }
  });
}