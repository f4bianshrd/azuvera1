import * as React from 'react'
import { AzuveraEmail, P } from './layout'
interface SignupEmailProps { siteName: string; siteUrl: string; recipient: string; confirmationUrl: string }
export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <AzuveraEmail preview="Bestätige deine E-Mail-Adresse für Azuvera" label="Willkommen" tone="success" title="Willkommen bei Azuvera!"
    cta={{ href: confirmationUrl, label: 'E-Mail bestätigen' }}
    note="Du hast dich nicht registriert? Dann kannst du diese E-Mail einfach ignorieren.">
    <P>Schön, dass du da bist. Bitte bestätige noch kurz deine Adresse ({recipient}), dann kann es losgehen.</P>
    <P>Danach führst du dein Berichtsheft digital – auch offline, auf jedem Gerät.</P>
  </AzuveraEmail>
)
export default SignupEmail
