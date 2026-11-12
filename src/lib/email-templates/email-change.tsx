import * as React from 'react'
import { AzuveraEmail, P } from './layout'
interface EmailChangeEmailProps { siteName: string; oldEmail: string; email: string; newEmail: string; confirmationUrl: string }
export const EmailChangeEmail = ({ oldEmail, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <AzuveraEmail preview="Bestätige deine neue E-Mail-Adresse" label="Sicherheit" tone="warning" title="Neue E-Mail-Adresse bestätigen"
    cta={{ href: confirmationUrl, label: 'Änderung bestätigen' }}
    note="Du hast diese Änderung nicht angefordert? Sichere bitte sofort dein Konto und ändere dein Passwort.">
    <P>Du möchtest deine Adresse bei Azuvera von {oldEmail} auf {newEmail} ändern.</P>
  </AzuveraEmail>
)
export default EmailChangeEmail
