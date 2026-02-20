import type { StructuredResume } from "../types";
import { ResumeDocBuilder } from "../pdf-builder";

export function renderCompactPdf(resume: StructuredResume): Buffer {
  const doc = new ResumeDocBuilder({
    marginTop: 35,
    marginBottom: 35,
    marginLeft: 45,
    marginRight: 45,
    defaultFontSize: 9.5,
    defaultLineHeight: 12,
  });
  const c = resume.contact;

  // Name 14pt, tight
  doc.addText(c.fullName, { font: "Helvetica-Bold", fontSize: 14 });

  // Single-line contact
  const contactParts = [c.email, c.phone, c.location, c.linkedinUrl, c.portfolioUrl].filter(Boolean);
  if (contactParts.length) {
    doc.addText(contactParts.join(" | "), { fontSize: 8 });
  }

  doc.addSpacing(3);
  doc.addRule(0.3);
  doc.addSpacing(2);

  // Summary - compact
  if (resume.summary) {
    doc.addText("SUMMARY", { font: "Helvetica-Bold", fontSize: 10 });
    doc.addText(resume.summary, { fontSize: 9 });
    doc.addSpacing(3);
  }

  // Work Experience - title + company on same line
  if (resume.workExperience.length > 0) {
    doc.addText("EXPERIENCE", { font: "Helvetica-Bold", fontSize: 10 });
    doc.addSpacing(1);
    for (const w of resume.workExperience) {
      doc.addText(
        `${w.title}, ${w.company}${w.location ? ` - ${w.location}` : ""}`,
        { font: "Helvetica-Bold", fontSize: 9.5 }
      );
      doc.addText(`${w.startDate} - ${w.endDate}`, { fontSize: 8 });
      for (const bullet of w.bullets) {
        doc.addBullet(bullet, { fontSize: 9, prefix: "- " });
      }
      doc.addSpacing(2);
    }
  }

  // Education - compact
  if (resume.education.length > 0) {
    doc.addText("EDUCATION", { font: "Helvetica-Bold", fontSize: 10 });
    doc.addSpacing(1);
    for (const e of resume.education) {
      const line = `${e.degree}${e.field ? ` in ${e.field}` : ""}, ${e.institution} (${e.graduationDate})`;
      doc.addText(line, { fontSize: 9.5 });
      const extras = [e.gpa ? `GPA: ${e.gpa}` : null, e.honors].filter(Boolean);
      if (extras.length) {
        doc.addText(extras.join(" | "), { fontSize: 8 });
      }
      doc.addSpacing(1);
    }
  }

  // Skills - single line
  if (resume.skills.length > 0) {
    doc.addSpacing(1);
    doc.addText("SKILLS", { font: "Helvetica-Bold", fontSize: 10 });
    doc.addText(resume.skills.join(", "), { fontSize: 9 });
    doc.addSpacing(2);
  }

  // Certifications - compact
  if (resume.certifications.length > 0) {
    doc.addText("CERTIFICATIONS", { font: "Helvetica-Bold", fontSize: 10 });
    for (const cert of resume.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      doc.addText(parts.join(" - "), { fontSize: 9 });
    }
  }

  return doc.build();
}
