import type { StructuredResume } from "../types";
import { ResumeDocBuilder } from "../pdf-builder";

const ACCENT: [number, number, number] = [0.12, 0.36, 0.77];

function cleanContactUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    // Strip tracking parameters to keep output ATS-friendly and compact.
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

function addCenteredSectionHeader(doc: ResumeDocBuilder, label: string) {
  doc.addSpacing(4);
  doc.addText(label, {
    font: "Helvetica-Bold",
    fontSize: 12,
    align: "center",
    color: ACCENT,
  });
  doc.addRule(0.6, ACCENT);
  doc.addSpacing(2);
}

export function renderClassicPdf(resume: StructuredResume): Buffer {
  const doc = new ResumeDocBuilder({ marginTop: 50, marginBottom: 50, marginLeft: 55, marginRight: 55 });
  const c = resume.contact;
  const linkedinUrl = cleanContactUrl(c.linkedinUrl);
  const portfolioUrl = cleanContactUrl(c.portfolioUrl);

  // Name centered with accent color.
  doc.addText(c.fullName, {
    font: "Helvetica-Bold",
    fontSize: 18,
    align: "center",
    color: ACCENT,
  });

  // Contact line centered
  const contactParts = [c.email, c.phone, c.location, linkedinUrl, portfolioUrl].filter(Boolean);
  if (contactParts.length) {
    doc.addText(contactParts.join("  |  "), { fontSize: 9, align: "center" });
  }

  doc.addRule(0.8, ACCENT);

  // Summary
  if (resume.summary) {
    addCenteredSectionHeader(doc, "SUMMARY");
    doc.addText(resume.summary, { fontSize: 10 });
    doc.addSpacing(6);
  }

  // Work Experience
  if (resume.workExperience.length > 0) {
    addCenteredSectionHeader(doc, "WORK EXPERIENCE");
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
    addCenteredSectionHeader(doc, "EDUCATION");
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
    addCenteredSectionHeader(doc, "SKILLS");
    doc.addText(resume.skills.join(", "), { fontSize: 10 });
    doc.addSpacing(6);
  }

  // Certifications
  if (resume.certifications.length > 0) {
    addCenteredSectionHeader(doc, "CERTIFICATIONS");
    for (const cert of resume.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      doc.addText(parts.join("  -  "), { fontSize: 10 });
    }
  }

  return doc.build();
}
