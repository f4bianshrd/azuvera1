import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { KeyRound, Loader2, Lock, MonitorSmartphone, RefreshCw } from "lucide-react";
import { NATIVE_LICENSE as C } from "@/config/native-license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared";
import { useNative } from "@/lib/use-native";
import { currentPlatformId, openExternal } from "@/lib/platform";
import { formatKeyInput, normalizeLicenseKey } from "./key";
import {
  activate,
  checkNow,
  FORMAT_TEXT,
  forgetLicense,
  startLicenseScheduler,
  type CheckResult,
} from "./service";
import { useLicense } from "./store";
import { defaultDeviceName, fmtDate, platformLabel } from "./labels";
import { ExternalLink } from "./external-link";
import type { LockReason, UsedDevice } from "./types";

const ALWAYS_OPEN = ["/impressum", "/datenschutz"];

/** Sperrt die native App ohne gültige Lizenz. Im Browser: nichts außer den Kindern. */
export function NativeLicenseGate({ children }: { children: ReactNode }) {
  const native = useNative();
  if (!native) return <>{children}</>;
  return <NativeGateInner>{children}</NativeGateInner>;
}

function NativeGateInner({ children }: { children: ReactNode }) {
  const lic = useLicense();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => startLicenseScheduler(), []);

  if (ALWAYS_OPEN.includes(pathname)) return <>{children}</>;
  if (lic.phase === "active") return <>{children}</>;
  if (lic.phase === "loading") {
    return (
      <GateFrame>
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-4 py-6 text-center"
        >
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="text-muted-foreground">Lizenz wird geprüft …</p>
        </div>
      </GateFrame>
    );
  }
  if (lic.phase === "none") return <ActivationPage notice={lic.notice} busy={lic.busy} />;
  return <LockPage reason={lic.reason ?? "invalid"} busy={lic.busy} />;
}

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-gradient-subtle px-4 py-8"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <main className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size={40} />
        </div>
        <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-elegant sm:p-8">
          {children}
        </div>
        <nav aria-label="Rechtliches" className="mt-6 flex justify-center gap-6 text-sm">
          <Link
            to="/impressum"
            className="inline-flex min-h-11 items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Impressum
          </Link>
          <Link
            to="/datenschutz"
            className="inline-flex min-h-11 items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Datenschutz
          </Link>
        </nav>
      </main>
    </div>
  );
}

const schema = z.object({
  key: z.string().refine((v) => normalizeLicenseKey(v) !== null, FORMAT_TEXT),
  deviceName: z
    .string()
    .trim()
    .min(1, "Gib einen Gerätenamen ein.")
    .max(80, "Höchstens 80 Zeichen."),
});

function ActivationPage({ notice, busy }: { notice: string | null; busy: boolean }) {
  const [key, setKey] = useState("");
  const [deviceName, setDeviceName] = useState(() => defaultDeviceName(currentPlatformId()));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<{ limit: number; devices: UsedDevice[] } | null>(null);

  const parsed = useMemo(() => schema.safeParse({ key, deviceName }), [key, deviceName]);
  const keyInvalid = key.length > 0 && normalizeLicenseKey(key) === null;
  const nameError = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === "deviceName")?.message ?? null);

  const submit = async () => {
    setTouched(true);
    if (!parsed.success || busy) return;
    setError(null);
    setLimit(null);
    const r = await activate({ keyInput: key, deviceName });
    if (r.ok) return;
    if (r.deviceLimit) setLimit(r.deviceLimit);
    else setError(r.message);
  };

  return (
    <GateFrame>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Azuvera freischalten</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Gib den Lizenzschlüssel ein, den du auf www.azuvera.de gekauft hast. Du findest ihn dort
        unter Mein Konto.
      </p>

      <div aria-live="polite" role="status" className="empty:hidden">
        {notice && !error && !limit && (
          <p className="mt-4 rounded-xl border border-warning bg-warning/15 p-3 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">
            {error}
          </p>
        )}
      </div>

      {limit ? (
        <DeviceLimit limit={limit} onRetry={() => void submit()} busy={busy} />
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="license-key">Lizenzschlüssel</Label>
            <Input
              id="license-key"
              value={key}
              onChange={(e) => setKey(formatKeyInput(e.target.value))}
              onBlur={() => setTouched(true)}
              placeholder="AZV-XXXX-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              maxLength={23}
              className="h-12 font-mono text-base tracking-wider"
              aria-invalid={touched && keyInvalid}
              aria-describedby={touched && keyInvalid ? "license-key-hint" : undefined}
            />
            {touched && keyInvalid && (
              <p id="license-key-hint" className="text-sm text-destructive">
                {FORMAT_TEXT}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="device-name">Gerätename</Label>
            <Input
              id="device-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value.slice(0, 80))}
              maxLength={80}
              className="h-12 text-base"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "device-name-hint" : undefined}
            />
            {nameError && (
              <p id="device-name-hint" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={!parsed.success || busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? "Wird freigeschaltet …" : "Freischalten"}
          </Button>
        </form>
      )}

      <div className="mt-5 flex flex-col items-start border-t pt-3 text-sm">
        {C.SHOW_PURCHASE_LINKS && (
          <ExternalLink href={C.PRICES_URL}>Noch keinen Schlüssel? Preise ansehen</ExternalLink>
        )}
        <ExternalLink href={C.ACCOUNT_URL}>Mein Konto öffnen</ExternalLink>
        <ExternalLink href={C.WEB_APP_URL}>Azuvera kostenlos im Browser nutzen</ExternalLink>
      </div>
    </GateFrame>
  );
}

function DeviceLimit({
  limit,
  onRetry,
  busy,
}: {
  limit: { limit: number; devices: UsedDevice[] };
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div role="alert" className="mt-5 rounded-xl border border-warning bg-warning/15 p-4 text-sm">
      <p className="font-semibold">Alle {limit.limit} Plätze deiner Lizenz sind belegt.</p>
      {limit.devices.length > 0 && (
        <ul className="mt-3 space-y-2">
          {limit.devices.map((d, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg bg-background/70 p-2">
              <MonitorSmartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium">{d.deviceName || "Gerät"}</span>
                <span className="block text-muted-foreground">
                  {platformLabel(d.platform)} · aktiviert am {fmtDate(d.activated_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3">Entferne in deinem Konto ein Gerät und versuche es dann erneut.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-11">
          <a
            href={C.ACCOUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              openExternal(C.ACCOUNT_URL);
            }}
          >
            Mein Konto öffnen
          </a>
        </Button>
        <Button className="h-11" onClick={onRetry} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}

const LOCK_TEXT: Record<LockReason, { title: string; text: string }> = {
  ended: {
    title: "Lizenz beendet",
    text: "Deine Lizenz ist beendet. Das Abo wurde gekündigt und der bezahlte Zeitraum ist vorbei.",
  },
  refunded: {
    title: "Kauf erstattet",
    text: "Dein Kauf wurde erstattet. Damit ist die Lizenz beendet.",
  },
  revoked: { title: "Lizenz gesperrt", text: "Diese Lizenz wurde gesperrt." },
  payment: {
    title: "Zahlung fehlt",
    text: "Die letzte Zahlung ist nicht eingegangen und die Frist ist abgelaufen.",
  },
  lease_expired: {
    title: "Lizenz prüfen",
    text: "Die Lizenz konnte zu lange nicht geprüft werden. Verbinde dich mit dem Internet und tippe auf Erneut prüfen.",
  },
  clock: {
    title: "Uhrzeit prüfen",
    text: "Datum und Uhrzeit dieses Geräts stimmen nicht. Stelle sie richtig ein und tippe auf Erneut prüfen.",
  },
  invalid: {
    title: "Lizenz nicht bestätigt",
    text: "Die Lizenz konnte nicht bestätigt werden. Tippe auf Erneut prüfen oder installiere die neueste Version der App.",
  },
  setup: {
    title: "Update nötig",
    text: "Diese App-Version ist noch nicht für die Lizenzprüfung eingerichtet. Bitte installiere eine neuere Version.",
  },
};

function checkMessage(r: CheckResult): string | null {
  switch (r.status) {
    case "offline":
      return "Keine Verbindung. Versuche es mit Internet noch einmal.";
    case "error":
      return r.message;
    case "blocked":
      return null;
    default:
      return null;
  }
}

function LockPage({ reason, busy }: { reason: LockReason; busy: boolean }) {
  const t = LOCK_TEXT[reason];
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMsg(null), [reason]);
  const retry = async () => {
    setMsg(null);
    setMsg(checkMessage(await checkNow({ force: true })));
  };
  const showNewKey = reason === "ended" || reason === "refunded";
  return (
    <GateFrame>
      <div className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-muted text-foreground">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          {t.text}
        </p>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {msg && (
          <p className="mt-4 rounded-xl border border-warning bg-warning/15 p-3 text-sm">{msg}</p>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <Button className="h-12 w-full text-base" onClick={() => void retry()} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Erneut prüfen
        </Button>
        {showNewKey && C.SHOW_PURCHASE_LINKS && (
          <ExternalButton href={C.PRICES_URL}>Neue Lizenz kaufen</ExternalButton>
        )}
        {showNewKey && (
          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => void forgetLicense()}
            disabled={busy}
          >
            Anderen Schlüssel eingeben
          </Button>
        )}
        {reason === "revoked" && (
          <ExternalButton href={C.CONTACT_URL}>Kontakt aufnehmen</ExternalButton>
        )}
        {reason === "payment" && (
          <ExternalButton href={C.ACCOUNT_URL}>Mein Konto öffnen</ExternalButton>
        )}
      </div>
      <p className="mt-6 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
        Deine Daten bleiben erhalten. Bereits synchronisierte Berichte findest du auch in der
        kostenlosen Web-App unter{" "}
        <ExternalLink href={C.WEB_APP_URL} className="min-h-0">
          get.azuvera.de
        </ExternalLink>
        .
      </p>
    </GateFrame>
  );
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild variant="outline" className="h-12 w-full">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          openExternal(href);
        }}
      >
        {children}
      </a>
    </Button>
  );
}
