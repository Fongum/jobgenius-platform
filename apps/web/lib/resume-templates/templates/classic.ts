import type { StructuredResume } from "../types";
import { ResumeDocBuilder } from "../pdf-builder";

export function renderClassicPdf(resume: StructuredResume): Buffer {
  const doc = new ResumeDocBuilder({ marginTop: 50, marginBottom: 50, marginLeft: 55, marginRight: 55 });
  const c = resume.contact;

  // Name centered 16pt bold
  doc.addText(c.fullName, { font: "Helvetica-Bold", fontSize: 16, align: "center" });

  // Contact line centered
  const contactParts = [c.email, c.phone, c.location, c.linkedinUrl, c.portfolioUrl].filter(Boolean);
  if (contactParts.length) {
    doc.addText(contactParts.join("  |  "), { fontSize: 9, align: "center" });
  }

  doc.addRule(0.5);

  // Summary
  if (resume.summary) {
    doc.addSpacing(4);
    doc.addText("SUMMARY", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addSpacing(2);
    doc.addText(resume.summary, { fontSize: 10 });
    doc.addSpacing(6);
  }

  // Work Experience
  if (resume.workExperience.length > 0) {
    doc.addText("WORK EXPERIENCE", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    for (const w of resume.workExperience) {
      doc.addText(`${w.title} - ${w.company}`, { font: "Helvetica-Bold", fontSize: 11 });
      const dateLine = [w.location, `${w.startDate} - ${w.endDate}`].filter(Boolean).join("  |  ");
      doc.addText(dateLine, { font: "Helvetica-Oblique", fontSize: 9 });
      for (const bullet of w.bullets) {
        doc.addBullet(bullet, { fontSize: 10 });
      }
      doc.addSpacing(4);
    }
  }

  // Education
  if (resume.education.length > 0) {
    doc.addText("EDUCATION", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    for (const e of resume.education) {
      const degreeLine = `${e.degree}${e.field ? ` in ${e.field}` : ""}`;
      doc.addText(degreeLine, { font: "Helvetica-Bold", fontSize: 11 });
      doc.addText(`${e.institution}  |  ${e.graduationDate}`, { fontSize: 10 });
      if (e.gpa) doc.addText(`GPA: ${e.gpa}`, { fontSize: 9 });
      if (e.honors) doc.addText(e.honors, { font: "Helvetica-Oblique", fontSize: 9 });
      doc.addSpacing(3);
    }
  }

  // Skills
  if (resume.skills.length > 0) {
    doc.addText("SKILLS", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    doc.addText(resume.skills.join(", "), { fontSize: 10 });
    doc.addSpacing(6);
  }

  // Certifications
  if (resume.certifications.length > 0) {
    doc.addText("CERTIFICATIONS", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addRule(0.3);
    doc.addSpacing(2);
    for (const cert of resume.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      doc.addText(parts.join("  -  "), { fontSize: 10 });
    }
  }

  return doc.build();
}
