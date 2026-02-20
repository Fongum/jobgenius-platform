import type { StructuredResume } from "../types";
import { ResumeDocBuilder } from "../pdf-builder";

export function renderExecutivePdf(resume: StructuredResume): Buffer {
  const doc = new ResumeDocBuilder({
    marginTop: 60,
    marginBottom: 60,
    marginLeft: 65,
    marginRight: 65,
    defaultLineHeight: 15,
  });
  const c = resume.contact;

  // Name centered 20pt bold with generous spacing
  doc.addText(c.fullName, { font: "Helvetica-Bold", fontSize: 20, align: "center" });
  doc.addSpacing(4);

  // Contact centered
  const contactParts = [c.email, c.phone, c.location].filter(Boolean);
  if (contactParts.length) {
    doc.addText(contactParts.join("   |   "), { fontSize: 10, align: "center" });
  }
  const links = [c.linkedinUrl, c.portfolioUrl].filter(Boolean);
  if (links.length) {
    doc.addText(links.join("   |   "), { fontSize: 9, align: "center" });
  }

  doc.addSpacing(10);
  doc.addRule(0.5);
  doc.addSpacing(10);

  // Prominent summary
  if (resume.summary) {
    doc.addText("PROFESSIONAL SUMMARY", { font: "Helvetica-Bold", fontSize: 13, align: "center" });
    doc.addSpacing(6);
    doc.addText(resume.summary, { fontSize: 10.5 });
    doc.addSpacing(12);
  }

  // Work Experience - company-first
  if (resume.workExperience.length > 0) {
    doc.addText("PROFESSIONAL EXPERIENCE", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addSpacing(4);
    doc.addRule(0.3);
    doc.addSpacing(6);
    for (const w of resume.workExperience) {
      doc.addText(w.company.toUpperCase(), { font: "Helvetica-Bold", fontSize: 11 });
      const titleLine = [w.title, w.location].filter(Boolean).join("  |  ");
      doc.addText(titleLine, { font: "Helvetica-Oblique", fontSize: 10.5 });
      doc.addText(`${w.startDate} - ${w.endDate}`, { fontSize: 9 });
      doc.addSpacing(2);
      for (const bullet of w.bullets) {
        doc.addBullet(bullet, { fontSize: 10 });
      }
      doc.addSpacing(8);
    }
  }

  // Education
  if (resume.education.length > 0) {
    doc.addText("EDUCATION", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addSpacing(4);
    doc.addRule(0.3);
    doc.addSpacing(6);
    for (const e of resume.education) {
      const degreeLine = `${e.degree}${e.field ? ` in ${e.field}` : ""}`;
      doc.addText(degreeLine, { font: "Helvetica-Bold", fontSize: 11 });
      doc.addText(`${e.institution}  |  ${e.graduationDate}`, { fontSize: 10 });
      if (e.gpa) doc.addText(`GPA: ${e.gpa}`, { fontSize: 9 });
      if (e.honors) doc.addText(e.honors, { font: "Helvetica-Oblique", fontSize: 9 });
      doc.addSpacing(4);
    }
  }

  // Skills
  if (resume.skills.length > 0) {
    doc.addText("CORE COMPETENCIES", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addSpacing(4);
    doc.addRule(0.3);
    doc.addSpacing(6);
    doc.addText(resume.skills.join("  |  "), { fontSize: 10 });
    doc.addSpacing(8);
  }

  // Certifications
  if (resume.certifications.length > 0) {
    doc.addText("CERTIFICATIONS", { font: "Helvetica-Bold", fontSize: 13 });
    doc.addSpacing(4);
    doc.addRule(0.3);
    doc.addSpacing(6);
    for (const cert of resume.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      doc.addText(parts.join("  -  "), { fontSize: 10 });
      doc.addSpacing(2);
    }
  }

  return doc.build();
}
