import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/dialogs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendReminder,type MissingWeek } from './api';
import { reminderMessage } from '@/features/team/team-utils';
export type ReminderTarget={id:string;name:string;weeks:MissingWeek[]};
export function ReminderDialog({target,onClose}:{target:ReminderTarget;onClose:()=>void}){const preset=reminderMessage(target.name,target.weeks);const [message,setMessage]=useState(preset.message);const [busy,setBusy]=useState(false);const client=useQueryClient();async function save(){setBusy(true);try{await sendReminder(target.id,preset.period,message.trim());await Promise.all([client.invalidateQueries({queryKey:['reminders']}),client.invalidateQueries({queryKey:['notifications']})]);toast.success('Erinnerung versendet');onClose();}catch(e){toast.error(e instanceof Error?e.message:(e as {message?:string}).message??'Erinnerung konnte nicht gesendet werden.');}finally{setBusy(false);}}return <ResponsiveDialog open onOpenChange={o=>!o&&onClose()} title="Erinnerung senden" description={target.name}><div className="space-y-4"><Label htmlFor="reminder-message">Nachricht</Label><Textarea id="reminder-message" rows={5} maxLength={500} value={message} onChange={e=>setMessage(e.target.value)}/><p className="text-right text-xs text-muted-foreground">{message.length}/500</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button disabled={busy||!message.trim()||message.length>500} onClick={()=>void save()}>Erinnerung senden</Button></div></div></ResponsiveDialog>;}
