import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { defaultBranding, isHex, resolveBranding, storeBranding, templateDef, type Branding, type TemplateId } from "../prefs";

const MAX_LOGO = 400 * 1024;

export function BrandingDialog({ open, onOpenChange, template, company }: {
  open: boolean; onOpenChange: (o: boolean) => void; template: TemplateId; company: { name: string | null; address: string | null };
}) {
  const [b, setB] = useState<Branding>(() => resolveBranding(template, company));
  useEffect(() => { if (open) setB(resolveBranding(template, company)); }, [open, template, company]);

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > MAX_LOGO) { toast.error("Logo konnte nicht geladen werden"); return; }
    try {
      const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("read")); r.readAsDataURL(file); });
      await new Promise<void>((res, rej) => { const img = new Image(); img.onload = () => res(); img.onerror = () => rej(new Error("img")); img.src = url; });
      setB((x) => ({ ...x, logoDataUrl: url }));
    } catch {
      toast.error("Logo konnte nicht geladen werden");
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Branding · ${templateDef(template).label}`}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5"><Label htmlFor="b-name">Firmen-/Absendername</Label><Input id="b-name" maxLength={120} value={b.senderName} onChange={(e) => setB({ ...b, senderName: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="b-lines">Absenderzeilen (eine pro Zeile, max. 4)</Label>
          <Textarea id="b-lines" rows={4} placeholder={"Musterbetrieb GmbH\nHauptstraße 1, 49326 Melle\n+49 …"} value={b.senderLines}
            onChange={(e) => setB({ ...b, senderLines: e.target.value.split("\n").slice(0, 4).join("\n") })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label htmlFor="b-primary">Hauptfarbe</Label><Input id="b-primary" type="color" className="h-10 p-1" value={isHex(b.primary) ? b.primary : "#000000"} onChange={(e) => setB({ ...b, primary: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="b-accent">Akzentfarbe</Label><Input id="b-accent" type="color" className="h-10 p-1" value={isHex(b.accent) ? b.accent : "#000000"} onChange={(e) => setB({ ...b, accent: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-logo">Logo (PNG/JPG, max. 400 KB)</Label>
          <Input id="b-logo" type="file" accept="image/png,image/jpeg" onChange={(e) => void onLogo(e.target.files?.[0])} />
          {b.logoDataUrl && (
            <div className="flex items-center gap-3">
              <img src={b.logoDataUrl} alt="Gewähltes Logo" className="h-12 max-w-[160px] rounded border bg-background object-contain p-1" />
              <Button variant="ghost" size="sm" onClick={() => setB({ ...b, logoDataUrl: null })}>Azuvera-Logo verwenden</Button>
            </div>
          )}
        </div>
        <div className="space-y-1.5"><Label htmlFor="b-footer">Fußzeilen-Hinweis</Label><Input id="b-footer" maxLength={160} placeholder="z. B. Vertraulich – nur für interne Zwecke" value={b.footer} onChange={(e) => setB({ ...b, footer: e.target.value })} /></div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { storeBranding(template, null); setB(defaultBranding(company)); toast.success("Branding zurückgesetzt"); }}>Zurücksetzen</Button>
          <Button onClick={() => { storeBranding(template, b); toast.success("Branding gespeichert"); onOpenChange(false); }}>Speichern</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
