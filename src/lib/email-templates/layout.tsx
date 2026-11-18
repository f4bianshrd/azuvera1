import * as React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'

export const BRAND = {
  blue: '#0056c5', navy: '#02071d', ink: '#13254a', muted: '#5b6781',
  bg: '#f9fcff', card: '#ffffff', line: '#e3eaf5', teal: '#14b8a6',
}
export const APP_URL = 'https://get.azuvera.de'
const LOGO = `${APP_URL}/icons/icon-192.png`

export type Tone = 'info' | 'success' | 'warning' | 'danger'
const TONES: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: '#e8f0fc', fg: BRAND.blue },
  success: { bg: '#e3f7f1', fg: '#0f7a5c' },
  warning: { bg: '#fdf3e1', fg: '#9a5b00' },
  danger: { bg: '#fdeaea', fg: '#b42318' },
}

export interface LayoutProps {
  preview: string
  label: string
  tone?: Tone
  title: string
  children: React.ReactNode
  cta?: { href: string; label: string }
  note?: React.ReactNode
  footer?: React.ReactNode
}

/** Gemeinsamer Azuvera-Rahmen: dunkler Kopf mit Logo, weiße Karte, blauer Button, ruhige Fußzeile. */
export const AzuveraEmail = ({ preview, label, tone = 'info', title, children, cta, note, footer }: LayoutProps) => (
  <Html lang="de" dir="ltr">
    <Head><style>{darkCss}</style></Head>
    <Preview>{preview}</Preview>
    <Body style={s.body}>
      <Container style={s.outer}>
        <Section style={s.header}>
          <Img src={LOGO} width="36" height="36" alt="Azuvera" style={s.logo} />
          <Text style={s.brand}>azuvera</Text>
        </Section>
        <Section style={s.accent} />
        <Section style={{ padding: '20px' }}><Section style={s.card}>
          <Text style={{ ...s.chip, backgroundColor: TONES[tone].bg, color: TONES[tone].fg }}>{label}</Text>
          <Heading style={s.h1}>{title}</Heading>
          {children}
          {cta && (
            <Section style={{ margin: '28px 0 8px' }}>
              <Button className="az-btn" href={cta.href} style={s.button}>{cta.label}</Button>
            </Section>
          )}
          {note && <Text style={s.note}>{note}</Text>}
        </Section></Section>
        <Section style={s.foot}>
          {footer && <Text style={s.footText}>{footer}</Text>}
          <Hr style={s.hr} />
          <Text style={s.footText}>
            Azuvera · Das digitale Berichtsheft für die Ausbildung<br />
            Eine Marke der Stage &amp; Spotlight · <Link href="https://www.stage-spotlight.de" style={s.footLink}>www.stage-spotlight.de</Link><br />
            <Link href={APP_URL} style={s.footLink}>get.azuvera.de</Link> · Fragen? <Link href="mailto:info@azuvera.de" style={s.footLink}>info@azuvera.de</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const P = ({ children }: { children: React.ReactNode }) => <Text style={s.text}>{children}</Text>
export const Code = ({ children }: { children: React.ReactNode }) => <Text style={s.code}>{children}</Text>

export const NotifyFooter = () => (
  <>Du erhältst diese Nachricht, weil du E-Mail-Benachrichtigungen in Azuvera eingeschaltet hast. Ändern kannst du das <Link href={`${APP_URL}/profil#benachrichtigungen`} style={s.footLink}>in deinem Profil</Link>.</>
)

const s = {
  body: { backgroundColor: '#ffffff', margin: 0, padding: '24px 0', fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' },
  outer: { maxWidth: '560px', margin: '0 auto', backgroundColor: BRAND.bg, borderRadius: '18px', overflow: 'hidden' as const, border: `1px solid ${BRAND.line}` },
  header: { backgroundColor: BRAND.navy, padding: '20px 28px' },
  logo: { display: 'inline-block', verticalAlign: 'middle', borderRadius: '9px' },
  brand: { display: 'inline-block', verticalAlign: 'middle', margin: '0 0 0 10px', color: '#ffffff', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.3px' },
  accent: { height: '4px', background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.teal})`, backgroundColor: BRAND.blue },
  card: { backgroundColor: BRAND.card, padding: '28px', borderRadius: '14px', border: `1px solid ${BRAND.line}` },
  chip: { display: 'inline-block', margin: '0 0 14px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2px' },
  h1: { margin: '0 0 14px', color: BRAND.ink, fontSize: '24px', lineHeight: '1.25', fontWeight: 700, letterSpacing: '-0.4px' },
  text: { margin: '0 0 12px', color: BRAND.muted, fontSize: '15px', lineHeight: '1.6' },
  code: { margin: '18px 0', padding: '16px', textAlign: 'center' as const, backgroundColor: BRAND.bg, border: `1px dashed ${BRAND.blue}`, borderRadius: '12px', color: BRAND.ink, fontSize: '28px', fontWeight: 700, letterSpacing: '6px', fontFamily: 'Menlo, Consolas, monospace' },
  button: { backgroundColor: BRAND.blue, color: '#ffffff', fontSize: '15px', fontWeight: 600, borderRadius: '12px', padding: '13px 22px', textDecoration: 'none' },
  note: { margin: '18px 0 0', color: '#8a93a8', fontSize: '13px', lineHeight: '1.5' },
  foot: { padding: '0 28px 24px' },
  footText: { margin: '8px 0', color: '#8a93a8', fontSize: '12px', lineHeight: '1.6' },
  footLink: { color: BRAND.blue, textDecoration: 'underline' },
  hr: { borderColor: BRAND.line, margin: '14px 0' },
}

// Bleibt Textinhalt: keine >, & oder Anführungszeichen.
const darkCss = `
  @media (prefers-color-scheme: dark) { .az-btn { background-color: #3d86ff !important; color: #ffffff !important; } }
`
