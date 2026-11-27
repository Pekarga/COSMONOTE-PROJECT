import fs from "node:fs/promises";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  type TableVerticalAlign,
  WidthType,
} from "docx";
import { imageSize } from "./extract";
import { ligneDate } from "./style";
import type { Courrier } from "./types";

// Page A4, en vingtièmes de point (twips) : 1 cm = 567.
const PAGE = { width: 11906, height: 16838 };
const MARGES = { top: 709, bottom: 1134, left: 1418, right: 1133, footer: 340 };
const LARGEUR = PAGE.width - MARGES.left - MARGES.right;
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const AUCUN = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const SANS_BORD = { top: AUCUN, bottom: AUCUN, left: AUCUN, right: AUCUN, insideHorizontal: AUCUN, insideVertical: AUCUN };

/** Une ligne de séparation (« ______ », « ------ ») ou une ville en capitales espacées. */
const SEPARATEUR = /^[-_—–=*.\s]{3,}$/;
const VILLE_ESPACEE = /^([A-ZÀ-Ý] ){2,}[A-ZÀ-Ý]$/;
const MAJUSCULES = /^[^a-zà-ÿ]*[A-ZÀ-Ý]{3}[^a-zà-ÿ]*$/;

function para(text: string, opts: { bold?: boolean; size?: number; align?: Align; underline?: boolean; after?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 0 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, underline: opts.underline ? {} : undefined })],
  });
}

/** Bloc d'en-tête centré ; les intitulés en capitales (« DIRECTION DU CONTROLE », « LE DIRECTEUR ») en gras. */
function timbre(text: string): Paragraph[] {
  return text
    .split("\n")
    .map((l) => para(l, { align: AlignmentType.CENTER, size: 20, bold: MAJUSCULES.test(l) && !SEPARATEUR.test(l) && !/^MINIST/i.test(l) && !/^R[ÉE]PUBLIQUE/i.test(l) }));
}

async function image(p: string | null, maxW: number, maxH: number): Promise<ImageRun | null> {
  if (!p) return null;
  try {
    const data = await fs.readFile(p);
    const size = imageSize(data);
    if (!size) return null;
    const scale = Math.min(maxW / size.width, maxH / size.height, 1);
    return new ImageRun({
      type: size.type,
      data,
      transformation: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
    });
  } catch {
    return null;
  }
}

function cell(children: Paragraph[], width: number, align: TableVerticalAlign = VerticalAlignTable.TOP) {
  return new TableCell({
    borders: SANS_BORD,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: align,
    children: children.length ? children : [new Paragraph({ children: [] })],
  });
}

function tableau(colonnes: number[], rows: Paragraph[][][]) {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: LARGEUR, type: WidthType.DXA },
    columnWidths: colonnes,
    borders: SANS_BORD,
    rows: rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, colonnes[i])) })),
  });
}

/** Construit le document au format Word (.docx), avec la même mise en page que l'aperçu. */
export async function courrierDocx(c: Courrier, images: { logo: string | null; signature: string | null }): Promise<Buffer> {
  const note = c.genre === "note";
  const f = c.forme;
  const align = f.alignement === "left" ? AlignmentType.LEFT : AlignmentType.JUSTIFIED;
  const interligne = Math.round(240 * 1.1 * f.interligne);
  const deuxColonnes = Boolean(c.enteteDroite.trim());
  const logo = await image(images.logo, deuxColonnes ? 90 : 170, deuxColonnes ? 90 : 100);
  const signatureImg = await image(images.signature, 200, 90);
  const blocs: (Paragraph | Table)[] = [];

  // 1. Timbre : à gauche le ministère, au centre le logo (armoiries), à droite la République.
  if (!f.entete) {
    // En-tête officiel retiré dans les options d'édition.
  } else if (deuxColonnes) {
    const w = [Math.round(LARGEUR * 0.42), Math.round(LARGEUR * 0.16), LARGEUR - Math.round(LARGEUR * 0.42) - Math.round(LARGEUR * 0.16)];
    blocs.push(
      tableau(w, [
        [timbre(c.entete), logo ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [logo] })] : [], timbre(c.enteteDroite)],
      ]),
    );
  } else {
    const gauche = [...(logo ? [new Paragraph({ spacing: { after: 120 }, children: [logo] })] : []), ...timbre(c.entete)];
    blocs.push(tableau([Math.round(LARGEUR * 0.5), LARGEUR - Math.round(LARGEUR * 0.5)], [[gauche, []]]));
  }

  // 2. Références à gauche ; date puis destinataire à droite.
  const refs = f.refs ? [c.refs.trim(), c.vref.trim() ? `V/Réf. : ${c.vref.trim()}` : ""].filter(Boolean).join("\n") : "";
  const droite: Paragraph[] = [para(ligneDate(c.lieu, c.date), { after: note ? 0 : 360 })];
  if (!note) {
    for (const l of c.destinataire.split("\n")) {
      droite.push(para(l, { bold: true, underline: VILLE_ESPACEE.test(l.trim()) }));
    }
  }
  const wRefs = Math.round(LARGEUR * 0.5);
  blocs.push(para("", { after: 240 }));
  blocs.push(
    tableau([wRefs, LARGEUR - wRefs], [[refs ? refs.split("\n").map((l) => para(l, { size: 20 })) : [], droite]]),
  );

  // 3. Pour une note : « NOTE A / MONSIEUR LE DIRECTEUR… » centré, en gras souligné.
  if (note && c.destinataire.trim()) {
    blocs.push(para("", { after: 360 }));
    for (const l of c.destinataire.split("\n")) blocs.push(para(l, { bold: true, underline: true, align: AlignmentType.CENTER }));
  }

  // 4. Objet et pièces jointes.
  blocs.push(para("", { after: 360 }));
  if (c.objet.trim()) {
    blocs.push(
      new Paragraph({
        indent: { left: 1701, hanging: 1134 },
        spacing: { after: 120 },
        children: [new TextRun({ text: "Objet", bold: true, underline: {} }), new TextRun({ text: " : ", bold: true }), new TextRun(c.objet.trim())],
      }),
    );
  }
  const pj = c.pj.split("\n").map((l) => l.trim()).filter(Boolean);
  if (pj.length) {
    blocs.push(
      new Paragraph({
        indent: { left: 1701, hanging: 1134 },
        spacing: { after: 120 },
        children: [new TextRun({ text: "P.J.", bold: true, underline: {} }), new TextRun({ text: " : ", bold: true }), new TextRun(pj.join(" ; "))],
      }),
    );
  }
  blocs.push(para("", { after: 240 }));

  // 5. Appel, corps justifié, politesse.
  if (c.appel.trim()) blocs.push(para(c.appel.trim(), { bold: true, after: 240 }));
  for (const p of c.corps.split(/\n\s*\n/).map((x) => x.replace(/\n/g, " ").trim()).filter(Boolean)) {
    blocs.push(new Paragraph({ alignment: align, spacing: { after: 160, line: interligne }, children: [new TextRun(p)] }));
  }
  if (c.politesse.trim()) {
    blocs.push(new Paragraph({ alignment: align, spacing: { after: 160, line: interligne }, children: [new TextRun(c.politesse.trim())] }));
  }

  // 6. Signature dans la moitié droite (souvent manuscrite : on laisse l'espace).
  blocs.push(para("", { after: 600 }));
  const milieu = Math.round(LARGEUR / 2);
  let imagePlacee = !signatureImg;
  for (const l of c.signature.split("\n")) {
    if (!l.trim() && !imagePlacee && signatureImg) {
      blocs.push(new Paragraph({ indent: { left: milieu }, alignment: AlignmentType.CENTER, children: [signatureImg] }));
      imagePlacee = true;
      continue;
    }
    blocs.push(new Paragraph({ indent: { left: milieu }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: l, bold: true })] }));
  }
  if (!imagePlacee && signatureImg) {
    blocs.push(new Paragraph({ indent: { left: milieu }, alignment: AlignmentType.CENTER, children: [signatureImg] }));
  }

  // 7. Ampliation, en bas à gauche.
  const ampliation = c.ampliation.split("\n").map((l) => l.trim()).filter(Boolean);
  if (ampliation.length) {
    blocs.push(para("", { after: 480 }));
    blocs.push(new Paragraph({ children: [new TextRun({ text: "Ampliation", size: 18, underline: {} }), new TextRun({ text: " :", size: 18 })] }));
    for (const l of ampliation) blocs.push(para(l, { size: 18 }));
  }

  const pied = f.pied ? c.pied.trim() : "";
  const doc = new Document({
    creator: "Le rédacteur",
    title: c.objet || (note ? "Note" : "Courrier"),
    styles: { default: { document: { run: { font: c.police || "Arial", size: Math.round(f.taille * 2) } } } },
    sections: [
      {
        properties: { page: { size: PAGE, margin: MARGES } },
        footers: pied
          ? {
              default: new Footer({
                children: pied.split("\n").map(
                  (l, i) =>
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      border: i === 0 ? { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } } : undefined,
                      children: [new TextRun({ text: l, bold: true, italics: true, size: 18 })],
                    }),
                ),
              }),
            }
          : undefined,
        children: blocs,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
