import { BellRing,CalendarOff,CheckCircle2,FileText,Minus,Pencil,RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
const labels:Record<string,string>={missing:'Fehlt',draft:'Entwurf',submitted:'Eingereicht',approved:'Freigegeben',rejected:'Zurückgewiesen',absent:'Abwesend'};
const icons={missing:BellRing,draft:Pencil,submitted:FileText,approved:CheckCircle2,rejected:RotateCcw,absent:CalendarOff,unknown:Minus};
export function WeekBadge({status,week}:{status:string;week?:number}){const Icon=icons[status as keyof typeof icons]??Minus;return <Badge variant={status==='missing'||status==='rejected'?'destructive':'secondary'} className="max-w-full whitespace-normal"><Icon className="size-3 shrink-0"/>{status==='unknown'?'—':`${week?`KW ${week}: `:''}${labels[status]??'—'}`}</Badge>;}
