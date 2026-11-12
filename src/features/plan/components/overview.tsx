import { Bar, BarChart, CartesianGrid, Cell as PieCell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Topic } from "../api";
import { plannedPerSection, skillsPerYear, topicsPerYear, type Cell, type Kpis } from "../stats";
import type { DrillState } from "./drilldown";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {empty ? <p className="mt-6 rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">Noch keine Daten für dieses Diagramm.</p> : <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Overview({ cells, topics, linkedTopics, kpis, allYears, years, onDrill }: {
  cells: Cell[]; topics: Topic[]; linkedTopics: Set<string>; kpis: Kpis; allYears: number[]; years: number[]; onDrill: (d: DrillState) => void;
}) {
  const tpy = topicsPerYear(topics, linkedTopics, allYears);
  const spy = skillsPerYear(cells, years);
  const dist = plannedPerSection(cells);
  const covered = kpis.coverage.covered, open = kpis.coverage.all - covered;
  const ring = [{ name: "abgedeckt", value: covered, fill: "var(--chart-1)" }, { name: "offen", value: open, fill: "var(--muted)" }];
  const barCfg = { abgedeckt: { label: "abgedeckt", color: "var(--chart-1)" }, offen: { label: "offen", color: "var(--muted-foreground)" } } satisfies ChartConfig;
  const skillCfg = { geplant: { label: "geplant", color: "var(--chart-1)" }, beherrscht: { label: "beherrscht", color: "var(--success)" }, offen: { label: "offen", color: "var(--destructive)" } } satisfies ChartConfig;
  const distCfg = Object.fromEntries(dist.map((d, i) => [d.sectionId, { label: d.name, color: PALETTE[i % PALETTE.length] }])) as ChartConfig;

  const drillYear = (year: number) => {
    const c = cells.filter((x) => x.year === year && (x.planned || x.mastered));
    onDrill({ title: `${year}. Ausbildungsjahr · ${c.length} Einträge`, cells: c });
  };
  const drillSection = (sectionId: string, name: string) => {
    const c = cells.filter((x) => x.sectionId === sectionId && x.planned);
    onDrill({ title: `${name} · ${c.length} Einträge`, cells: c });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Themen pro Ausbildungsjahr" empty={topics.length === 0}>
        <ChartContainer config={barCfg} className="aspect-[16/10] w-full">
          <BarChart data={tpy}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="abgedeckt" stackId="a" fill="var(--color-abgedeckt)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="offen" stackId="a" fill="var(--color-offen)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Gesamt-Fortschritt" empty={kpis.coverage.all === 0}>
        <ChartContainer config={barCfg} className="mx-auto aspect-square max-h-[260px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={ring} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" strokeWidth={2}>
              {ring.map((r) => <PieCell key={r.name} fill={r.fill} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <p className="text-center text-sm text-muted-foreground"><span className="font-semibold text-foreground">{kpis.coverage.pct} %</span> abgedeckt ({covered} von {kpis.coverage.all})</p>
      </ChartCard>

      <ChartCard title="Rahmenplan · Fertigkeiten pro Jahr (Drill-Down)" empty={spy.every((x) => !x.geplant && !x.offen)}>
        <ChartContainer config={skillCfg} className="aspect-[16/10] w-full">
          <BarChart data={spy} onClick={(e) => { const i = e?.activeTooltipIndex; const row = typeof i === "number" ? spy[i] : undefined; if (row) drillYear(row.year); }} className="cursor-pointer">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="geplant" fill="var(--color-geplant)" radius={4} />
            <Bar dataKey="beherrscht" fill="var(--color-beherrscht)" radius={4} />
            <Bar dataKey="offen" fill="var(--color-offen)" radius={4} />
          </BarChart>
        </ChartContainer>
        <div className="mt-2 flex flex-wrap gap-2">
          {spy.map((r) => (
            <button key={r.year} type="button" onClick={() => drillYear(r.year)} className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {r.name} öffnen
            </button>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Rahmenplan-Verteilung" empty={dist.length === 0}>
        <ChartContainer config={distCfg} className="mx-auto aspect-square max-h-[260px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="sectionId" />} />
            <Pie data={dist} dataKey="value" nameKey="sectionId" innerRadius="50%" outerRadius="85%" strokeWidth={2} className="cursor-pointer"
              onClick={(d: { sectionId?: string; name?: string }) => d.sectionId && drillSection(d.sectionId, dist.find((x) => x.sectionId === d.sectionId)?.name ?? "")}>
              {dist.map((d, i) => <PieCell key={d.sectionId} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="mt-2 space-y-1">
          {dist.map((d, i) => (
            <li key={d.sectionId}>
              <button type="button" onClick={() => drillSection(d.sectionId, d.name)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="size-3 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="tabular-nums text-muted-foreground">{d.value}</span>
              </button>
            </li>
          ))}
        </ul>
      </ChartCard>
    </div>
  );
}
