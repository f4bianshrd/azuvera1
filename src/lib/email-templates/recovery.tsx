import * as React from 'react'
import { AzuveraEmail, P } from './layout'
interface RecoveryEmailProps { siteName: string; confirmationUrl: string }
export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <AzuveraEmail preview="Setze dein Azuvera-Passwort zurück" label="Sicherheit" tone="warning" title="Neues Passwort festlegen"
    cta={{ href: confirmationUrl, label: 'Passwort zurücksetzen' }}
    note="Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.">
    <P>Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Lege über den Button ein neues fest.</P>
  </AzuveraEmail>
)
export default RecoveryEmail
