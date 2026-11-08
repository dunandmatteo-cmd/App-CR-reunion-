"use strict";
// Exports Word (bibliothèque docx) et Excel (ExcelJS), générés dans le navigateur.

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function fileBase(cr) {
  const safe = `${cr.date || ""}_${cr.titre || "reunion"}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `CR_${safe || "reunion"}`;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------
async function exportWord(cr, { inclureVerifs = false } = {}) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType } = docx;

  const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text: text || "", ...opts })], spacing: { after: 80 } });
  const H = (text, level = HeadingLevel.HEADING_2) => new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
  const bullet = (text) => new Paragraph({ text, bullet: { level: 0 } });
  const labelLine = (label, value) =>
    value ? new Paragraph({ children: [new TextRun({ text: `${label} : `, bold: true }), new TextRun(value)], spacing: { after: 60 } }) : null;

  const cell = (text, header = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: text || "", bold: header, size: 20 })] })],
      shading: header ? { type: ShadingType.CLEAR, fill: "DCE6F1", color: "auto" } : undefined,
    });
  const table = (headers, data) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map((h) => cell(h, true)), tableHeader: true }),
        ...data.map((r) => new TableRow({ children: r.map((v) => cell(v)) })),
      ],
    });

  const body = [];
  body.push(new Paragraph({ text: `Compte rendu – ${cr.titre || "Réunion"}`, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
  body.push(P("Brouillon – à relire avant diffusion", { italics: true, color: "C00000" }));

  [
    labelLine("Date", cr.date),
    labelLine("Lieu", cr.lieu),
    labelLine("Type de réunion", cr.type_reunion),
    labelLine("Président(e) de séance", cr.president_seance),
    labelLine("Secrétaire de séance", cr.secretaire_seance),
    labelLine("Quorum", cr.quorum),
  ].forEach((p) => p && body.push(p));

  if (cr.participants.length) {
    body.push(H("Présents"));
    cr.participants.forEach((p) => body.push(bullet(p.qualite ? `${p.nom} (${p.qualite})` : p.nom)));
  }
  if (cr.absents_excuses.length) body.push(labelLine("Absents / excusés", cr.absents_excuses.join(", ")));
  if (cr.invites.length) body.push(labelLine("Invités", cr.invites.join(", ")));

  if (cr.ordre_du_jour.length) {
    body.push(H("Ordre du jour"));
    cr.ordre_du_jour.forEach((o, i) => body.push(P(`${i + 1}. ${o}`)));
  }

  if (cr.points.length) {
    body.push(H("Points abordés"));
    cr.points.forEach((p, i) => {
      body.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${p.sujet}`, bold: true })], spacing: { before: 120, after: 40 } }));
      body.push(P(p.resume));
    });
  }

  if (cr.deliberations.length) {
    body.push(H("Délibérations et votes"));
    body.push(
      table(
        ["Objet", "Décision", "Résultat", "Pour", "Contre", "Abst.", "Commentaire"],
        cr.deliberations.map((d) => [d.objet, d.decision, d.resultat, d.pour, d.contre, d.abstention, d.commentaire])
      )
    );
  }

  if (cr.actions.length) {
    body.push(H("Actions"));
    body.push(table(["Action", "Responsable", "Délai", "Priorité"], cr.actions.map((a) => [a.action, a.responsable, a.delai, a.priorite])));
  }

  if (cr.points_ouverts.length) {
    body.push(H("Points restant en suspens"));
    cr.points_ouverts.forEach((p) => body.push(bullet(p)));
  }

  if (cr.prochaine_reunion) {
    body.push(H("Prochaine réunion"));
    body.push(P(cr.prochaine_reunion));
  }

  if (inclureVerifs && (cr.points_sensibles.length || cr.points_a_verifier.length)) {
    body.push(H("À vérifier avant diffusion (à supprimer ensuite)"));
    cr.points_sensibles.forEach((p) => body.push(bullet(`[Sensible] ${p.passage} – ${p.raison}`)));
    cr.points_a_verifier.forEach((p) => body.push(bullet(`[Transcription] ${p.passage} – ${p.raison}`)));
  }

  const doc = new Document({
    creator: "App CR réunion",
    title: `Compte rendu – ${cr.titre}`,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: body }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${fileBase(cr)}.docx`);
}

// ---------------------------------------------------------------------------
// Excel : actions + délibérations
// ---------------------------------------------------------------------------
async function exportExcel(cr) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "App CR réunion";
  wb.created = new Date();

  const BORDER = { style: "thin", color: { argb: "FFBFBFBF" } };
  const borders = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

  function sheet(name, cols, data, configure) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4 }] });
    cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
    ws.mergeCells(1, 1, 1, cols.length);
    ws.getCell(1, 1).value = `${name} – ${cr.titre || "Réunion"}${cr.date ? ` – ${cr.date}` : ""}`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, cols.length);
    ws.getCell(2, 1).value = "Brouillon généré à partir d'un enregistrement : à relire.";
    ws.getCell(2, 1).font = { italic: true, color: { argb: "FFC00000" } };
    const head = ws.getRow(4);
    head.values = cols.map(([h]) => h);
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = borders;
    });
    head.height = 28;
    const total = Math.max(data.length, 1) + 3;
    for (let i = 0; i < total; i++) {
      const row = ws.getRow(5 + i);
      row.values = data[i] ? [i + 1, ...data[i]] : [i + 1];
      for (let c = 1; c <= cols.length; c++) {
        const cell = row.getCell(c);
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = borders;
      }
      configure?.(ws, 5 + i);
    }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
    return { ws, last: 4 + total };
  }

  const { ws, last } = sheet(
    "Actions",
    [["N°", 6], ["Action", 50], ["Responsable", 20], ["Délai", 14], ["Priorité", 12], ["Sujet", 28], ["Statut", 13], ["Fait le", 12], ["Commentaire", 30]],
    cr.actions.map((a) => [a.action, a.responsable, a.delai, a.priorite, a.sujet, "À faire"]),
    (w, r) => {
      w.getCell(`G${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"À faire,En cours,Fait,Abandonné"'] };
      w.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Haute,Moyenne,Basse,Non précisée"'] };
      w.getCell(`H${r}`).numFmt = "dd/mm/yyyy";
    }
  );
  ws.addConditionalFormatting({
    ref: `C5:D${last}`,
    rules: [{ type: "containsText", operator: "containsText", text: "À définir", priority: 1,
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE699" } } } }],
  });
  ws.addConditionalFormatting({
    ref: `G5:G${last}`,
    rules: [{ type: "containsText", operator: "containsText", text: "Fait", priority: 2,
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } } } }],
  });

  sheet(
    "Délibérations",
    [["N°", 6], ["Objet", 35], ["Décision", 45], ["Résultat", 12], ["Pour", 10], ["Contre", 10], ["Abst.", 10], ["Commentaire", 30]],
    cr.deliberations.map((d) => [d.objet, d.decision, d.resultat, d.pour, d.contre, d.abstention, d.commentaire])
  );

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(cr)}_actions.xlsx`);
}
