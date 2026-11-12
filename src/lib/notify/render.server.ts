import { deliveryText } from "./texts";

const base = () => (process.env["APP_BASE_URL"] ?? "https://get.azuvera.de").replace(/\/$/, "");

/** Rendert die Azuvera-Vorlage für einen Typ; unbekannte Typen bekommen eine allgemeine Nachricht. */
export async function renderTemplate(type: string, link: string | null) {
  const React = await import("react");
  const { render } = await import("@react-email/render");
  const { TEMPLATES } = await import("@/lib/email-templates/registry");
  const tpl = TEMPLATES[type];
  const t = deliveryText(type);
  const path = link && link.startsWith("/") ? link : "/notifications";
  const footer = `Du erhältst diese Nachricht, weil du E-Mail-Benachrichtigungen in Azuvera eingeschaltet hast. Ändern kannst du das hier: ${base()}/profil#benachrichtigungen`;
  const text = `${t.body}\n\nÖffnen: ${base()}${path}\n\n${footer}`;
  if (!tpl) {
    const html = `<div style="font-family:Arial,sans-serif;color:#02071d;max-width:520px;margin:0 auto;padding:24px"><h1 style="font-size:20px">${t.title}</h1><p>${t.body}</p><p><a href="${base()}${path}" style="display:inline-block;background:#0056c5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">In Azuvera öffnen</a></p><p style="font-size:12px;color:#5b6170">${footer}</p></div>`;
    return { subject: t.title, html, text };
  }
  const el = React.createElement(tpl.component, { link: path });
  const subject = typeof tpl.subject === "string" ? tpl.subject : tpl.subject({});
  return { subject, html: await render(el), text };
}
