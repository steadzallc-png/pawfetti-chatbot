import express from "express";
import nodemailer from "nodemailer";
import { processChatMessage } from "./app/mcp-client.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Basic CORS so the storefront can call this API from a different origin during development.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@steadza.com";

let mailer = null;
function getMailer() {
  if (mailer) return mailer;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    console.warn(
      "Email support is not fully configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SUPPORT_EMAIL to enable notifications."
    );
    return null;
  }

  mailer = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });

  return mailer;
}

async function sendSupportEmail(customerEmail, message, reply) {
  const transport = getMailer();
  if (!transport) return;

  const subject = `New Pawfetti chat from ${customerEmail || "unknown customer"}`;
  const text = [
    `A customer started a chat on your store.`,
    ``,
    `Customer email: ${customerEmail || "not provided"}`,
    ``,
    `Latest message:`,
    message,
    ``,
    `Assistant reply:`,
    reply || "(no reply generated)",
  ].join("\n");

  try {
    await transport.sendMail({
      from: SUPPORT_EMAIL,
      to: SUPPORT_EMAIL,
      subject,
      text,
    });
  } catch (error) {
    console.error("Failed to send support email:", error);
  }
}

app.get("/", (_req, res) => {
  res.send("Pawfetti Chatbot server is running.");
});

app.post("/api/chat", async (req, res) => {
  const { message, history, email } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Request body must include a 'message' string." });
  }

  try {
    const reply = await processChatMessage(message, Array.isArray(history) ? history : []);

    if (email) {
      // Fire and forget; don't block the response on email sending.
      void sendSupportEmail(email, message, reply);
    }

    res.json({ reply });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: "Failed to process chat message." });
  }
});

app.listen(PORT, () => {
  console.log(`Pawfetti Chatbot server listening on port ${PORT}`);
});

