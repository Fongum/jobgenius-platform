/**
 * ResumeDocBuilder - Multi-font, multi-size PDF builder for ATS-friendly resumes.
 *
 * Uses raw PDF operators with built-in Type1 Helvetica fonts (no embedding).
 * Supports: multiple font sizes, bold/italic, word wrap, bullet points,
 * horizontal rules, configurable margins, auto page breaks.
 */

// Approximate character widths for Helvetica (proportional) at 1pt size.
// Sourced from the PDF spec Appendix D for standard Latin characters.
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667,
  "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333,
  ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556,
  "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278, ";": 278,
  "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, A: 667, B: 667,
  C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556,
  i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556,
  q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584,
};

const HELVETICA_BOLD_WIDTHS: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722,
  "'": 238, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333,
  ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556,
  "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 333, ";": 333,
  "<": 584, "=": 584, ">": 584, "?": 611, "@": 975, A: 722, B: 722,
  C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611,
  i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611,
  q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556,
  y: 556, z: 500, "{": 389, "|": 280, "}": 389, "~": 584,
};

const DEFAULT_CHAR_WIDTH = 556;
const DEFAULT_BOLD_WIDTH = 556;

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type FontName = "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique";
export type Align = "left" | "center" | "right";
export type RgbColor = [number, number, number];

interface TextSegment {
  text: string;
  font: FontName;
  fontSize: number;
  align: Align;
  color: RgbColor;
}

interface RuleSegment {
  type: "rule";
  thickness: number;
  color: RgbColor;
}

interface SpacingSegment {
  type: "spacing";
  height: number;
}

type PageSegment =
  | { type: "text"; segment: TextSegment }
  | RuleSegment
  | SpacingSegment;

interface PageContent {
  segments: PageSegment[];
}

export interface ResumeDocOptions {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  defaultFontSize?: number;
  defaultLineHeight?: number;
}

const FONT_MAP: Record<FontName, string> = {
  Helvetica: "/F1",
  "Helvetica-Bold": "/F2",
  "Helvetica-Oblique": "/F3",
};

const BLACK: RgbColor = [0, 0, 0];

function clampColor(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeColor(color?: RgbColor): RgbColor {
  if (!color) return BLACK;
  return [
    clampColor(color[0]),
    clampColor(color[1]),
    clampColor(color[2]),
  ];
}

function measureText(text: string, font: FontName, fontSize: number): number {
  const isBold = font === "Helvetica-Bold";
  const widths = isBold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const defaultW = isBold ? DEFAULT_BOLD_WIDTH : DEFAULT_CHAR_WIDTH;
  let w = 0;
  for (const ch of text) {
    w += widths[ch] ?? defaultW;
  }
  return (w / 1000) * fontSize;
}

function wrapLine(
  text: string,
  font: FontName,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text.trim()) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const test = `${current} ${word}`;
    if (measureText(test, font, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export class ResumeDocBuilder {
  private marginTop: number;
  private marginBottom: number;
  private marginLeft: number;
  private marginRight: number;
  private defaultFontSize: number;
  private defaultLineHeight: number;
  private pageWidth = 612;
  private pageHeight = 792;
  private segments: PageSegment[] = [];

  constructor(options?: ResumeDocOptions) {
    this.marginTop = options?.marginTop ?? 50;
    this.marginBottom = options?.marginBottom ?? 50;
    this.marginLeft = options?.marginLeft ?? 50;
    this.marginRight = options?.marginRight ?? 50;
    this.defaultFontSize = options?.defaultFontSize ?? 11;
    this.defaultLineHeight = options?.defaultLineHeight ?? 14;
  }

  private get contentWidth() {
    return this.pageWidth - this.marginLeft - this.marginRight;
  }

  addText(
    text: string,
    options?: {
      font?: FontName;
      fontSize?: number;
      align?: Align;
      color?: RgbColor;
    }
  ): this {
    const font = options?.font ?? "Helvetica";
    const fontSize = options?.fontSize ?? this.defaultFontSize;
    const align = options?.align ?? "left";
    const color = normalizeColor(options?.color);

    const lines = wrapLine(text, font, fontSize, this.contentWidth);
    for (const line of lines) {
      this.segments.push({
        type: "text",
        segment: { text: line, font, fontSize, align, color },
      });
    }
    return this;
  }

  addBullet(
    text: string,
    options?: {
      font?: FontName;
      fontSize?: number;
      indent?: number;
      prefix?: string;
      color?: RgbColor;
    }
  ): this {
    const font = options?.font ?? "Helvetica";
    const fontSize = options?.fontSize ?? this.defaultFontSize;
    const indent = options?.indent ?? 15;
    const prefix = options?.prefix ?? "\u2022 ";
    const color = normalizeColor(options?.color);

    const prefixWidth = measureText(prefix, font, fontSize);
    const availableWidth = this.contentWidth - indent - prefixWidth;
    const lines = wrapLine(text, font, fontSize, availableWidth);

    for (let i = 0; i < lines.length; i++) {
      const lineText = i === 0 ? `${prefix}${lines[i]}` : `  ${lines[i]}`;
      // We'll handle indent in the rendering by using left alignment with offset baked in
      this.segments.push({
        type: "text",
        segment: {
          text: " ".repeat(Math.ceil(indent / 3)) + lineText,
          font,
          fontSize,
          align: "left",
          color,
        },
      });
    }
    return this;
  }

  addRule(thickness = 0.5, color?: RgbColor): this {
    this.segments.push({ type: "rule", thickness, color: normalizeColor(color) });
    return this;
  }

  addSpacing(height?: number): this {
    this.segments.push({ type: "spacing", height: height ?? this.defaultLineHeight * 0.5 });
    return this;
  }

  private getLineHeight(fontSize: number): number {
    return fontSize * (this.defaultLineHeight / this.defaultFontSize);
  }

  private paginateSegments(): PageContent[] {
    const pages: PageContent[] = [];
    let currentPage: PageSegment[] = [];
    let yUsed = 0;
    const maxContentHeight = this.pageHeight - this.marginTop - this.marginBottom;

    for (const seg of this.segments) {
      let segHeight: number;
      if (seg.type === "text") {
        segHeight = this.getLineHeight(seg.segment.fontSize);
      } else if (seg.type === "rule") {
        segHeight = 8;
      } else {
        segHeight = seg.height;
      }

      if (yUsed + segHeight > maxContentHeight && currentPage.length > 0) {
        pages.push({ segments: currentPage });
        currentPage = [];
        yUsed = 0;
      }
      currentPage.push(seg);
      yUsed += segHeight;
    }

    if (currentPage.length > 0) {
      pages.push({ segments: currentPage });
    }

    if (pages.length === 0) {
      pages.push({ segments: [] });
    }

    return pages;
  }

  private renderPage(page: PageContent): string {
    const ops: string[] = [];
    let curY = this.pageHeight - this.marginTop;

    for (const seg of page.segments) {
      if (seg.type === "rule") {
        curY -= 4;
        ops.push(
          `${seg.color[0].toFixed(3)} ${seg.color[1].toFixed(3)} ${seg.color[2].toFixed(3)} RG`,
          `${seg.thickness} w`,
          `${this.marginLeft} ${curY} m`,
          `${this.pageWidth - this.marginRight} ${curY} l`,
          "S"
        );
        curY -= 4;
        continue;
      }

      if (seg.type === "spacing") {
        curY -= seg.height;
        continue;
      }

      const { text, font, fontSize, align, color } = seg.segment;
      const lineHeight = this.getLineHeight(fontSize);
      curY -= lineHeight;

      let x = this.marginLeft;
      if (align === "center") {
        const textWidth = measureText(text, font, fontSize);
        x = this.marginLeft + (this.contentWidth - textWidth) / 2;
      } else if (align === "right") {
        const textWidth = measureText(text, font, fontSize);
        x = this.pageWidth - this.marginRight - textWidth;
      }

      ops.push("BT");
      ops.push(`${FONT_MAP[font]} ${fontSize} Tf`);
      ops.push(`${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`);
      ops.push(`${x.toFixed(2)} ${curY.toFixed(2)} Td`);
      ops.push(`(${escapePdfText(text)}) Tj`);
      ops.push("ET");
    }

    return ops.join("\n");
  }

  build(): Buffer {
    const pages = this.paginateSegments();
    const pageStreams = pages.map((p) => this.renderPage(p));

    const objects: string[] = [];
    const fontObjStart = 3 + pages.length * 2;
    const pageRefs = pages.map((_, i) => `${3 + i} 0 R`).join(" ");

    objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
    objects.push(
      `2 0 obj << /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >> endobj`
    );

    // Page objects
    pages.forEach((_, i) => {
      const pageObj = 3 + i;
      const contentObj = 3 + pages.length + i;
      objects.push(
        `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontObjStart} 0 R /F2 ${fontObjStart + 1} 0 R /F3 ${fontObjStart + 2} 0 R >> >> >> endobj`
      );
    });

    // Content stream objects
    pageStreams.forEach((stream, i) => {
      const contentObj = 3 + pages.length + i;
      objects.push(
        `${contentObj} 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`
      );
    });

    // Font objects
    objects.push(
      `${fontObjStart} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`
    );
    objects.push(
      `${fontObjStart + 1} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`
    );
    objects.push(
      `${fontObjStart + 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >> endobj`
    );

    // Assemble PDF
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
      xrefLines.push(`${objOffset.toString().padStart(10, "0")} 00000 n `);
    });

    const xrefContent = `${xrefLines.join("\n")}\n`;
    parts.push(xrefContent);
    offset += Buffer.byteLength(xrefContent, "utf8");

    const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    parts.push(trailer);

    return Buffer.from(parts.join(""), "utf8");
  }
}
