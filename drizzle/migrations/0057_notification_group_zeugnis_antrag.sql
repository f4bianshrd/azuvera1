CREATE OR REPLACE FUNCTION public.notification_group(_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when _type in ('report_submitted','report_approved','report_rejected','report_reopened','comment',
                   'instruction_submitted','instruction_confirmed','instruction_rejected',
                   'experience_submitted','experience_approved','experience_rejected','experience_reopened','experience_comment',
                   'leittext_submitted','leittext_approved','leittext_rejected','leittext_reopened','leittext_comment',
                   'certificate_requested','certificate_issued',
                   'exam_application_submitted','exam_application_confirmed','exam_application_returned') then 'reports'
    when _type in ('absence_requested','absence_approved','absence_rejected') then 'absences'
    when _type in ('report_reminder','deadline_soon','deadline_today','deadline_overdue','review_pending','daily_nudge','instruction_due','experience_due') then 'reminders'
    when _type in ('deputy_assigned','deputy_ended') then 'deputy'
    else null end
$function$;