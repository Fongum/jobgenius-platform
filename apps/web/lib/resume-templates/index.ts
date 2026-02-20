export type { StructuredResume, ResumeTemplateId } from "./types";
export { RESUME_TEMPLATES } from "./types";
export { ResumeDocBuilder } from "./pdf-builder";

import type { StructuredResume, ResumeTemplateId } from "./types";
import { renderClassicPdf } from "./templates/classic";
import { renderModernPdf } from "./templates/modern";
import { renderExecutivePdf } from "./templates/executive";
import { renderCompactPdf } from "./templates/compact";

export function renderResumePdf(
  resume: StructuredResume,
  templateId: ResumeTemplateId = "classic"
): Buffer {
  switch (templateId) {
    case "modern":
      return renderModernPdf(resume);
    case "executive":
      return renderExecutivePdf(resume);
    case "compact":
      return renderCompactPdf(resume);
    case "classic":
    default:
      return renderClassicPdf(resume);
  }
}
