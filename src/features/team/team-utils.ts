import { differenceInCalendarDays, format, getISOWeek, getISOWeekYear, startOfWeek } from 'date-fns';
export function weekMonday(date=new Date()){return format(startOfWeek(date,{weekStartsOn:1}),'yyyy-MM-dd');}
export function weekLabel(date:string){const d=new Date(date+'T00:00:00');return `KW ${getISOWeek(d)}/${String(getISOWeekYear(d)).slice(-2)}`;}
export const urgency=['missing','rejected','submitted','draft','approved','absent','unknown'];
export function deputyStatus(d:{revoked_at:string|null;date_from:string;date_to:string},today= format(new Date(),'yyyy-MM-dd')){return d.revoked_at||d.date_to<today?'Beendet':d.date_from>today?'Geplant':'Aktiv';}
export function validDeputyDates(from:string,to:string){const days=differenceInCalendarDays(new Date(to+'T00:00:00'),new Date(from+'T00:00:00'));return Number.isFinite(days)&&days>=0&&days<180;}
export function reminderMessage(name:string,weeks:{week_start:string}[]){const labels=[...weeks].sort((a,b)=>b.week_start.localeCompare(a.week_start)).slice(0,5).map(w=>weekLabel(w.week_start)).join(', ');return {message:`Für ${name} fehlen ${weeks.length} Wochenbericht(e): ${labels}. Bitte zeitnah nachtragen.`,period:`${weeks.length} offene Woche(n) · zuletzt ${labels}`};}
