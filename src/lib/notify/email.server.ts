import nodemailer from "nodemailer";

export class EmailNotConfigured extends Error {
  code = "not_configured" as const;
}

export function emailConfigured() {
  return !!(process.env["SMTP_HOST"] && process.env["SMTP_USER"] && process.env["SMTP_PASS"] && process.env["SMTP_FROM"]);
}

/** Einzige Stelle, die den Versandweg kennt: SMTP über Port 465 mit implizitem TLS. */
export async function sendEmail(m: { to: string; subject: string; text: string; html: string }) {
  const env = process.env;
  const SMTP_HOST = env["SMTP_HOST"], SMTP_USER = env["SMTP_USER"], SMTP_PASS = env["SMTP_PASS"], SMTP_FROM = env["SMTP_FROM"];
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) throw new EmailNotConfigured("not_configured");
  const t = nodemailer.createTransport({ host: SMTP_HOST, port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await t.sendMail({ from: SMTP_FROM, replyTo: "info@azuvera.de", ...m });
}
