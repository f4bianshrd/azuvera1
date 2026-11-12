import * as React from 'react'
import { AzuveraEmail, Code, P } from './layout'
interface ReauthenticationEmailProps { token: string }
export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <AzuveraEmail preview="Dein Bestätigungscode für Azuvera" label="Sicherheit" tone="warning" title="Dein Bestätigungscode"
    note="Der Code ist nur kurz gültig. Gib ihn niemals an andere weiter.">
    <P>Bitte gib diesen Code in Azuvera ein, um die Aktion zu bestätigen:</P>
    <Code>{token}</Code>
  </AzuveraEmail>
)
export default ReauthenticationEmail
