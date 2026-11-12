import * as React from 'react'
import { AzuveraEmail, P } from './layout'
interface InviteEmailProps { siteName: string; siteUrl: string; confirmationUrl: string }
export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <AzuveraEmail preview="Du wurdest zu Azuvera eingeladen" label="Einladung" title="Du wurdest eingeladen"
    cta={{ href: confirmationUrl, label: 'Einladung annehmen' }}
    note="Du erwartest keine Einladung? Dann ignoriere diese E-Mail einfach.">
    <P>Dein Ausbildungsbetrieb nutzt Azuvera für digitale Ausbildungsnachweise.</P>
    <P>Nimm die Einladung an und lege dein Konto in wenigen Sekunden an.</P>
  </AzuveraEmail>
)
export default InviteEmail
