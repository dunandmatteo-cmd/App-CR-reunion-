// Export Excel : plan d'actions (feuille principale), décisions, et compte rendu.

import ExcelJS from "exceljs";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const BORDER = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER;
  });
  row.height = 30;
}

function styleBody(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = BORDER;
  });
}

function addTitleBlock(ws, cr, label, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = `${label} – ${cr.titre || "Réunion"}`;
  t.font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = [
    cr.date && `Date : ${cr.date}`,
    cr.lieu && `Lieu : ${cr.lieu}`,
    cr.type_reunion && `Type : ${cr.type_reunion}`,
  ]
    .filter(Boolean)
    .join("   |   ");
  ws.mergeCells(3, 1, 3, lastCol);
  const w = ws.getCell(3, 1);
  w.value = "Document généré automatiquement à partir d'un enregistrement : BROUILLON à relire et valider avant diffusion.";
  w.font = { italic: true, color: { argb: "FFC00000" } };
}

export async function buildWorkbook(cr) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "App CR réunion";
  wb.created = new Date();

  // --- Plan d'actions -------------------------------------------------------
  const ws = wb.addWorksheet("Actions", { views: [{ state: "frozen", ySplit: 5 }] });
  const cols = [
    ["N°", 6],
    ["Action", 50],
    ["Responsable", 20],
    ["Délai", 14],
    ["Priorité", 12],
    ["Référence (NC / 8D / réclamation)", 22],
    ["Origine", 30],
    ["Statut", 13],
    ["Date de clôture", 14],
    ["Vérification de l'efficacité", 30],
    ["Commentaire", 30],
  ];
  cols.forEach(([, width], i) => (ws.getColumn(i + 1).width = width));
  addTitleBlock(ws, cr, "Plan d'actions", cols.length);

  const headerRow = ws.getRow(5);
  headerRow.values = cols.map(([h]) => h);
  styleHeader(headerRow);

  const actions = Array.isArray(cr.actions) ? cr.actions : [];
  // Au moins quelques lignes vides pour compléter à la main.
  const rowCount = Math.max(actions.length, 1) + 5;
  for (let i = 0; i < rowCount; i++) {
    const a = actions[i];
    const row = ws.getRow(6 + i);
    row.values = a
      ? [i + 1, a.action, a.responsable, a.delai, a.priorite, a.reference, a.origine, "Ouverte", null, "", ""]
      : [i + 1];
    styleBody(row);
    const r = 6 + i;
    ws.getCell(`H${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Ouverte,En cours,Clôturée,Annulée"'],
    };
    ws.getCell(`E${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Haute,Moyenne,Basse,Non précisée"'],
    };
    ws.getCell(`I${r}`).numFmt = "dd/mm/yyyy";
  }
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: cols.length } };

  // Mise en évidence des responsables / délais à définir.
  ws.addConditionalFormatting({
    ref: `C6:D${5 + rowCount}`,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "À définir",
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE699" } } },
        priority: 1,
      },
    ],
  });
  ws.addConditionalFormatting({
    ref: `H6:H${5 + rowCount}`,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "Clôturée",
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } } },
        priority: 2,
      },
    ],
  });

  // --- Décisions --------------------------------------------------------------
  const wd = wb.addWorksheet("Décisions", { views: [{ state: "frozen", ySplit: 5 }] });
  [6, 70, 25].forEach((w, i) => (wd.getColumn(i + 1).width = w));
  addTitleBlock(wd, cr, "Décisions", 3);
  const hd = wd.getRow(5);
  hd.values = ["N°", "Décision", "Porteur"];
  styleHeader(hd);
  (cr.decisions || []).forEach((d, i) => {
    const row = wd.getRow(6 + i);
    row.values = [i + 1, d.decision, d.porteur];
    styleBody(row);
  });

  // --- Compte rendu ---------------------------------------------------------------
  const wc = wb.addWorksheet("Compte rendu");
  wc.getColumn(1).width = 28;
  wc.getColumn(2).width = 100;
  addTitleBlock(wc, cr, "Compte rendu", 2);
  let r = 5;
  const put = (label, value, bold = false) => {
    const row = wc.getRow(r++);
    row.values = [label, value];
    row.getCell(1).font = { bold: true };
    if (bold) row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).alignment = { vertical: "top" };
  };
  const section = (label) => {
    r++;
    const row = wc.getRow(r++);
    row.values = [label];
    row.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1F3A5F" } };
  };

  put("Animateur", cr.animateur);
  put("Rédacteur", cr.redacteur);
  put(
    "Participants",
    (cr.participants || []).map((p) => (p.fonction ? `${p.nom} (${p.fonction})` : p.nom)).join("\n")
  );
  put("Absents / excusés", (cr.absents_excuses || []).join(", "));
  put("Objet", cr.objet);
  put("Synthèse", cr.synthese);

  section("Points abordés");
  (cr.points_abordes || []).forEach((p) => put(p.sujet, p.resume));

  section("Points ouverts");
  (cr.points_ouverts || []).forEach((p, i) => put(`${i + 1}`, p));

  section("Points à vérifier (transcription)");
  (cr.points_a_verifier || []).forEach((p) => put(p.passage, p.raison));

  section("Prochaine réunion");
  put("", cr.prochaine_reunion);

  return wb.xlsx.writeBuffer();
}
