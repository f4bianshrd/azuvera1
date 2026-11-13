import type { ComponentType } from 'react'
import * as N from './notifications'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/** Eine Vorlage je Benachrichtigungsart (Schlüssel = notifications.type) plus Test-E-Mail. */
export const TEMPLATES: Record<string, TemplateEntry> = {
  report_submitted: N.report_submitted,
  report_approved: N.report_approved,
  report_rejected: N.report_rejected,
  report_reopened: N.report_reopened,
  report_reminder: N.report_reminder,
  comment: N.comment,
  absence_requested: N.absence_requested,
  absence_approved: N.absence_approved,
  absence_rejected: N.absence_rejected,
  deputy_assigned: N.deputy_assigned,
  deputy_ended: N.deputy_ended,
  instruction_submitted: N.instruction_submitted,
  instruction_confirmed: N.instruction_confirmed,
  instruction_rejected: N.instruction_rejected,
  email_test: N.email_test,
}
