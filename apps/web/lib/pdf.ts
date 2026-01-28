function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildSimplePdf(lines: string[]) {
  const sanitizedLines = lines.map((line) => escapePdfText(line));
  const contentLines = ["BT", "/F1 11 Tf", "14 TL", "50 760 Td"];
  sanitizedLines.forEach((line, index) => {
    if (index > 0) {
      contentLines.push("T*");
    }
    contentLines.push(`(${line}) Tj`);
  });
  contentLines.push("ET");

  const contentStream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj"
  );
  objects.push(
    `4 0 obj << /Length ${Buffer.byteLength(contentStream, "utf8")} >> stream\n${contentStream}\nendstream endobj`
  );
  objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");

  let offset = 0;
  const parts: string[] = [];
  const offsets: number[] = [];

  const header = "%PDF-1.4\n";
  parts.push(header);
  offset += Buffer.byteLength(header, "utf8");

  for (const obj of objects) {
    offsets.push(offset);
    const chunk = `${obj}\n`;
    parts.push(chunk);
    offset += Buffer.byteLength(chunk, "utf8");
  }

  const xrefStart = offset;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  offsets.forEach((objOffset) => {
    const line = `${objOffset.toString().padStart(10, "0")} 00000 n `;
    xrefLines.push(line);
  });

  const xrefContent = `${xrefLines.join("\n")}\n`;
  parts.push(xrefContent);
  offset += Buffer.byteLength(xrefContent, "utf8");

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(trailer);

  return Buffer.from(parts.join(""), "utf8");
}
