import type { StructuredResume } from "../types";
import { ResumeDocBuilder } from "../pdf-builder";

export function renderModernPdf(resume: StructuredResume): Buffer {
  const doc = new ResumeDocBuilder({ marginTop: 45, marginBottom: 45, marginLeft: 55, marginRight: 55 });
  const c = resume.contact;

  // Name left-aligned 18pt bold
  doc.addText(c.fullName, { font: "Helvetica-Bold", fontSize: 18, align: "left" });

  // Stacked contact info
  if (c.email) doc.addText(c.email, { fontSize: 9 });
  if (c.phone) doc.addText(c.phone, { fontSize: 9 });
  if (c.location) doc.addText(c.location, { fontSize: 9 });
  if (c.linkedinUrl) doc.addText(c.linkedinUrl, { fontSize: 9 });
  if (c.portfolioUrl) doc.addText(c.portfolioUrl, { fontSize: 9 });

  doc.addSpacing(8);

  // Summary
  if (resume.summary) {
    doc.addText("Summary", { font: "Helvetica-Bold", fontSize: 12 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    doc.addText(resume.summary, { fontSize: 10 });
    doc.addSpacing(8);
  }

  // Work Experience - company bold, title italic
  if (resume.workExperience.length > 0) {
    doc.addText("Experience", { font: "Helvetica-Bold", fontSize: 12 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    for (const w of resume.workExperience) {
      doc.addText(w.company, { font: "Helvetica-Bold", fontSize: 11 });
      const titleLine = [w.title, w.location].filter(Boolean).join("  |  ");
      doc.addText(titleLine, { font: "Helvetica-Oblique", fontSize: 10 });
      doc.addText(`${w.startDate} - ${w.endDate}`, { fontSize: 9 });
      for (const bullet of w.bullets) {
        doc.addBullet(bullet, { fontSize: 10 });
      }
      doc.addSpacing(5);
    }
  }

  // Education
  if (resume.education.length > 0) {
    doc.addText("Education", { font: "Helvetica-Bold", fontSize: 12 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    for (const e of resume.education) {
      doc.addText(e.institution, { font: "Helvetica-Bold", fontSize: 11 });
      const degreeLine = `${e.degree}${e.field ? ` in ${e.field}` : ""}`;
      doc.addText(degreeLine, { font: "Helvetica-Oblique", fontSize: 10 });
      doc.addText(e.graduationDate, { fontSize: 9 });
      if (e.gpa) doc.addText(`GPA: ${e.gpa}`, { fontSize: 9 });
      if (e.honors) doc.addText(e.honors, { fontSize: 9 });
      doc.addSpacing(3);
    }
  }

  // Skills
  if (resume.skills.length > 0) {
    doc.addText("Skills", { font: "Helvetica-Bold", fontSize: 12 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    doc.addText(resume.skills.join(", "), { fontSize: 10 });
    doc.addSpacing(6);
  }

  // Certifications
  if (resume.certifications.length > 0) {
    doc.addText("Certifications", { font: "Helvetica-Bold", fontSize: 12 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    for (const cert of resume.certifications) {
      const line = [cert.name, cert.issuer, cert.date].filter(Boolean).join("  -  ");
      doc.addText(line, { fontSize: 10 });
    }
  }

  return doc.build();
}
