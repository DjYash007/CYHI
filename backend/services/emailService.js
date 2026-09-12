const { Resend } = require("resend");
const ApiError = require("../utils/ApiError");

const INVITATION_SUBJECT = "You've been invited to collaborate on a form";

let customSender = null;

function setCustomSender(fn) {
  customSender = fn;
}

function resetCustomSender() {
  customSender = null;
}

function hasCustomSender() {
  return typeof customSender === "function";
}

function buildInvitationText(joinUrl) {
  return `You have been invited to fill your part of a form.\n\nOpen your form:\n${joinUrl}`;
}

function buildInvitationHtml(joinUrl) {
  return `<p>You have been invited to fill your part of a form.</p><p>Open your form:<br/><a href="${joinUrl}">${joinUrl}</a></p>`;
}

function verifyConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !apiKey.trim()) {
    throw new ApiError(500, "Email configuration error: RESEND_API_KEY is not set.");
  }
  if (!from || !from.trim()) {
    throw new ApiError(500, "Email configuration error: EMAIL_FROM is not set.");
  }

  return {
    apiKey: apiKey.trim(),
    from: from.trim(),
  };
}

async function sendInvitationEmail({ to, joinUrl }) {
  if (customSender) {
    return await customSender({ to, joinUrl });
  }

  const { apiKey, from } = verifyConfig();
  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    to,
    subject: INVITATION_SUBJECT,
    text: buildInvitationText(joinUrl),
    html: buildInvitationHtml(joinUrl),
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send email via Resend.");
  }

  return result.data;
}

module.exports = {
  INVITATION_SUBJECT,
  buildInvitationText,
  buildInvitationHtml,
  verifyConfig,
  sendInvitationEmail,
  setCustomSender,
  resetCustomSender,
  hasCustomSender,
};
