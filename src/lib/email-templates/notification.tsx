import * as React from 'react'
import { AzuveraEmail, APP_URL, NotifyFooter, P, type Tone } from './layout'
import type { TemplateEntry } from './registry'

/** Jede Benachrichtigungsart bekommt eine eigene Vorlage. Bewusst ohne Namen oder Berichtstexte (Datenschutz). */
export interface NotificationEmailProps { link?: string }

export function notificationTemplate(cfg: {
  subject: string; label: string; tone: Tone; title: string; lines: string[]; cta: string; defaultLink: string; preview?: string
}): TemplateEntry {
  const Component = ({ link }: NotificationEmailProps) => (
    <AzuveraEmail preview={cfg.preview ?? cfg.lines[0] ?? cfg.title} label={cfg.label} tone={cfg.tone} title={cfg.title}
      cta={{ href: `${APP_URL}${link || cfg.defaultLink}`, label: cfg.cta }}
      note="Aus Datenschutzgründen stehen die Einzelheiten nur in der App, nach deiner Anmeldung."
      footer={<NotifyFooter />}>
      {cfg.lines.map((l) => <P key={l}>{l}</P>)}
    </AzuveraEmail>
  )
  return { component: Component, subject: cfg.subject, displayName: cfg.label, previewData: { link: cfg.defaultLink } }
}
