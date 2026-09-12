const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

const INVITATION_SUBJECT = "You've been invited to collaborate on a form";

function buildInvitationText(joinUrl) {
  return `You have been invited to fill your part of a form.\n\nOpen your form:\n${joinUrl}`;
}

function buildInvitationHtml(joinUrl) {
  return `<p>You have been invited to fill your part of a form.</p><p>Open your form:<br/><a href="${joinUrl}">${joinUrl}</a></p>`;
}

async function sendInvitationEmail({ to, joinUrl }) {
  console.log(`[CYHI EMAIL] Preparing invitation email`);
  console.log(`[CYHI EMAIL] Recipient: ${to}`);
  console.log(`[CYHI EMAIL] Sender: ${process.env.GMAIL_USER}`);
  console.log(`[CYHI EMAIL] Subject: ${INVITATION_SUBJECT}`);

  try {
    const result = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to, // Correctly use the passed argument 'to'
      subject: INVITATION_SUBJECT,
      text: buildInvitationText(joinUrl),
      html: buildInvitationHtml(joinUrl)
    });

    console.log(`[CYHI EMAIL] Gmail/Nodemailer response: accepted=${result.accepted.length}, rejected=${result.rejected.length}, messageId=${result.messageId}`);
    return result;
  } catch (error) {
    console.error(`[CYHI EMAIL] Error sending email via Nodemailer: ${error.message}`);
    throw error;
  }
}

async function verifyTransporter() {
  try {
    await transporter.verify();
    console.log("[CYHI EMAIL] SMTP connection verified successfully.");
    return true;
  } catch (error) {
    console.error("[CYHI EMAIL] SMTP verification failed:", error.message);
    return false;
  }
}

module.exports = {
  INVITATION_SUBJECT,
  buildInvitationText,
  buildInvitationHtml,
  sendInvitationEmail,
  verifyTransporter
};
