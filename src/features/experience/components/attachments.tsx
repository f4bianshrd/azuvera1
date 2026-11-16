import { AttachmentSection, type AttachmentAdapter, type AttachmentLike } from "@/features/reports/attachment-section";
import { addExperienceAttachment, deleteExperienceAttachment, experienceAttachmentUrl, openExperienceAttachment, updateExperienceAttachment, type Experience } from "../api";

/** Anhänge mit derselben Oberfläche wie im Berichts-Editor, angebunden an die Erfahrungsberichte. */
export function ExperienceAttachments({ report, attachments, editable }: { report: Experience; attachments: AttachmentLike[]; editable: boolean }) {
  const adapter: AttachmentAdapter = {
    queryKey: ["experience"],
    limitMessage: "Höchstens 10 Anhänge je Erfahrungsbericht.",
    add: (input) => addExperienceAttachment(input),
    update: updateExperienceAttachment,
    remove: deleteExperienceAttachment,
    url: experienceAttachmentUrl,
    openExternal: openExperienceAttachment,
  };
  return <AttachmentSection report={report} attachments={attachments} editable={editable} adapter={adapter} />;
}
