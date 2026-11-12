import * as React from 'react'
import { AzuveraEmail, P } from './layout'
interface MagicLinkEmailProps { siteName: string; confirmationUrl: string }
export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <AzuveraEmail preview="Dein Anmeldelink für Azuvera" label="Anmeldung" title="Dein Anmeldelink"
    cta={{ href: confirmationUrl, label: 'Jetzt anmelden' }}
    note="Der Link ist nur kurz gültig. Du hast ihn nicht angefordert? Dann ignoriere diese E-Mail.">
    <P>Mit einem Klick bist du bei Azuvera angemeldet – ganz ohne Passwort.</P>
  </AzuveraEmail>
)
export default MagicLinkEmail
