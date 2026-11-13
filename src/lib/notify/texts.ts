/** Allgemeine Zustelltexte – nie Namen, Berichts- oder Abwesenheitsinhalte. */
const T: Record<string, [string, string]> = {
  report_submitted: ["Neuer Bericht zur Prüfung", "Es wartet ein Bericht auf deine Prüfung."],
  report_approved: ["Bericht freigegeben", "Dein Bericht wurde freigegeben."],
  report_rejected: ["Bericht zurückgewiesen", "Dein Bericht wurde zurückgewiesen. Lies die Korrekturnotiz in der App."],
  report_reopened: ["Bericht wieder geöffnet", "Einer deiner Berichte wurde wieder geöffnet."],
  comment: ["Neuer Kommentar", "Zu einem Bericht gibt es einen neuen Kommentar."],
  absence_requested: ["Neuer Abwesenheitsantrag", "Ein Antrag auf Abwesenheit wartet auf deine Entscheidung."],
  absence_approved: ["Abwesenheit genehmigt", "Dein Antrag auf Abwesenheit wurde genehmigt."],
  absence_rejected: ["Abwesenheit abgelehnt", "Dein Antrag auf Abwesenheit wurde abgelehnt."],
  report_reminder: ["Erinnerung: Bericht fehlt", "Es fehlt noch mindestens ein Bericht. Öffne Azuvera, um ihn nachzutragen."],
  deadline_soon: ["Abgabefrist rückt näher", "Dein Wochenbericht ist noch nicht eingereicht. Die Frist läuft bald ab."],
  deadline_today: ["Heute ist Abgabefrist", "Heute läuft die Frist für deinen Wochenbericht ab."],
  deadline_overdue: ["Bericht überfällig", "Mindestens ein Wochenbericht ist überfällig."],
  review_pending: ["Berichte warten auf Prüfung", "Es warten Berichte seit längerer Zeit auf deine Prüfung."],
  daily_nudge: ["Berichtseintrag nicht vergessen", "Du hast heute noch keinen Berichtseintrag angelegt."],
  instruction_due: ["Unterweisung fällig", "Eine Unterweisung ist fällig."],
  instruction_submitted: ["Neue Unterweisung zur Bestätigung", "Es wartet eine Unterweisung auf deine Bestätigung."],
  instruction_confirmed: ["Unterweisung bestätigt", "Deine Unterweisung wurde bestätigt."],
  instruction_rejected: ["Unterweisung zurückgewiesen", "Deine Unterweisung wurde zurückgewiesen. Lies die Notiz in der App."],
  deputy_assigned: ["Vertretung eingetragen", "Für dich wurde eine Vertretung eingetragen."],
  deputy_ended: ["Vertretung beendet", "Eine Vertretung wurde beendet."],
};

export function deliveryText(type: string): { title: string; body: string } {
  const [title, body] = T[type] ?? ["Neue Benachrichtigung", "Öffne Azuvera, um sie zu lesen."];
  return { title, body };
}
