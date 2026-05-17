/**
 * exportStudyPlannerPdf.js – Compact single‑page export
 */

import { jsPDF } from 'jspdf';

const COLORS = {
  emerald:     [5,  150, 105],
  teal:        [13, 148, 136],
  emeraldLight:[209, 250, 229],
  core:        [219, 234, 254],
  coreText:    [30,  64, 175],
  major:       [243, 232, 255],
  majorText:   [107, 33, 168],
  elective:    [209, 250, 229],
  electiveText:[6,  95,  70],
  wil:         [252, 231, 243],
  wilText:     [157, 23, 77],
  mpu:         [254, 243, 199],
  mpuText:     [146, 64,  14],
  white:       [255, 255, 255],
  gray50:      [249, 250, 251],
  gray100:     [243, 244, 246],
  gray200:     [229, 231, 235],
  gray400:     [156, 163, 175],
  gray500:     [107, 114, 128],
  gray700:     [55,  65,  81],
  gray800:     [31,  41,  55],
  gray900:     [17,  24,  39],  // <-- added missing color
};

const CATEGORY_COLORS = {
  core:     { bg: COLORS.core,     text: COLORS.coreText     },
  major:    { bg: COLORS.major,    text: COLORS.majorText    },
  elective: { bg: COLORS.elective, text: COLORS.electiveText },
  wil:      { bg: COLORS.wil,      text: COLORS.wilText      },
  mpu:      { bg: COLORS.mpu,      text: COLORS.mpuText      },
};

const CATEGORY_LABEL = {
  core: 'Core', major: 'Major', elective: 'Elective',
  wil: 'WIL', mpu: 'MPU',
};

// Helpers with defensive checks
function setFill(doc, rgb) {
  if (!rgb) rgb = [0,0,0];
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc, rgb) {
  if (!rgb) rgb = [0,0,0];
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}
function setTxt(doc, rgb) {
  if (!rgb) rgb = [0,0,0];
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function roundRect(doc, x, y, w, h, r = 2, style = 'F') {
  doc.roundedRect(x, y, w, h, r, r, style);
}
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function getUnitCategory(unit) {
  const typeId = unit.unitTypeId ?? unit.unit_type_id ?? unit.unitType?.ID ?? unit.unitType?.id ?? null;
  switch (typeId) {
    case 2:  return 'core';
    case 1:  return 'elective';
    case 3:  return 'major';
    case 4:  return 'mpu';
    case 17: return 'wil';
    default: return 'elective';
  }
}
function extractUnitCode(str) {
  if (!str) return '';
  const m = str.match(/[A-Z]{3}\d{5}/i);
  return m ? m[0].toUpperCase() : str.split(' ')[0].toUpperCase();
}

// Geometry – compact
const PAGE_W    = 210;
const PAGE_H    = 297;
const MARGIN    = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;

function drawHeader(doc, recommendations, studentInfo) {
  setFill(doc, COLORS.emerald);
  doc.rect(0, 0, PAGE_W / 2, 35, 'F');
  setFill(doc, COLORS.teal);
  doc.rect(PAGE_W / 2, 0, PAGE_W / 2, 35, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTxt(doc, COLORS.white);
  doc.text('Study Planner', MARGIN, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setTxt(doc, [167, 243, 208]);
  if (recommendations?.plannerName) {
    doc.text(truncate(recommendations.plannerName, 70), MARGIN, 18);
  }

  const stats = [
    studentInfo?.studentId  ? `ID: ${studentInfo.studentId}` : null,
    recommendations ? `Units: ${recommendations.totalCompleted ?? 0}/24` : null,
    recommendations ? `Credits: ${recommendations.totalCredits ?? 0}/300` : null,
  ].filter(Boolean);
  doc.setFontSize(7);
  setTxt(doc, COLORS.white);
  stats.forEach((s, i) => doc.text(s, PAGE_W - MARGIN, 10 + i * 6, { align: 'right' }));

  doc.setFontSize(6);
  setTxt(doc, [167, 243, 208]);
  doc.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, PAGE_W - MARGIN, 30, { align: 'right' });
  return 35 + 4;
}

function drawProgressSection(doc, recommendations, y) {
  if (!recommendations) return y;
  const cr = recommendations.categoryRequirements;
  if (!cr) return y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setTxt(doc, COLORS.gray700);
  doc.text('GRADUATION PROGRESS', MARGIN, y);
  y += 4;

  const barW = (CONTENT_W - 6) / 3;
  const cats = ['core', 'major', 'elective'];
  cats.forEach((cat, i) => {
    const req = cr[cat];
    if (!req) return;
    const x = MARGIN + i * (barW + 3);
    const pct = Math.min(1, (req.completed || 0) / (req.required || 1));
    const cc = CATEGORY_COLORS[cat] || CATEGORY_COLORS.elective;

    setFill(doc, COLORS.gray50);
    setDraw(doc, COLORS.gray200);
    roundRect(doc, x, y, barW, 14, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    setTxt(doc, cc.text);
    doc.text(CATEGORY_LABEL[cat], x + 2, y + 4.5);

    doc.setFont('helvetica', 'normal');
    setTxt(doc, COLORS.gray800);
    doc.text(`${req.completed}/${req.required}`, x + barW - 2, y + 4.5, { align: 'right' });

    setFill(doc, COLORS.gray200);
    roundRect(doc, x + 2, y + 7, barW - 4, 2.5, 1, 'F');
    setFill(doc, COLORS.emerald);
    if (pct > 0) roundRect(doc, x + 2, y + 7, (barW - 4) * pct, 2.5, 1, 'F');
  });
  y += 17;

  const overall = Math.min(1, (recommendations.completedPercent || 0) / 100);
  doc.setFontSize(6);
  setTxt(doc, COLORS.gray500);
  doc.text('Overall progress', MARGIN, y);
  doc.text(`${(recommendations.completedPercent || 0).toFixed(1)}%`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 2;
  setFill(doc, COLORS.gray200);
  roundRect(doc, MARGIN, y, CONTENT_W, 2.5, 1, 'F');
  setFill(doc, COLORS.emerald);
  if (overall > 0) roundRect(doc, MARGIN, y, CONTENT_W * overall, 2.5, 1, 'F');
  return y + 6;
}

function drawUnitRow(doc, unit, x, y, rowW) {
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  const cat = getUnitCategory(unit);
  const cc = CATEGORY_COLORS[cat] || CATEGORY_COLORS.elective;
  const cp = unit.CreditPoints ?? 12.5;

  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.gray200);
  doc.setLineWidth(0.2);
  roundRect(doc, x, y, rowW, 8.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  setTxt(doc, COLORS.gray900);
  doc.text(code, x + 2, y + 5.5);

  const codeW = doc.getTextWidth(code) + 2;
  const badgeX = x + 2 + codeW + 2;
  const catLabel = CATEGORY_LABEL[cat] || cat;
  const badgeW = (() => {
    const w = doc.getTextWidth(catLabel) + 3;
    setFill(doc, cc.bg);
    roundRect(doc, badgeX, y + 1.5, w, 5, 1, 'F');
    setTxt(doc, cc.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(catLabel, badgeX + 1.5, y + 5);
    return w;
  })();

  const nameX = badgeX + badgeW + 2;
  const cpW = doc.getTextWidth(`${cp} CP`) + 2;
  const maxNameW = rowW - (nameX - x) - cpW - 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setTxt(doc, COLORS.gray500);
  if (unit.Name) {
    doc.text(truncate(unit.Name, Math.floor(maxNameW / 1.5)), nameX, y + 5.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setTxt(doc, COLORS.emerald);
  doc.text(`${cp} CP`, x + rowW - 2, y + 5.5, { align: 'right' });
  return y + 9.5;
}

function drawSemesterCard(doc, sem, x, y, cardW) {
  const HEADER_H = 8;
  const ROW_H = 9.5;
  const PADDING = 3;
  const cardH = HEADER_H + (sem.units?.length ?? 0) * ROW_H + PADDING;

  if (y + cardH + 3 > PAGE_H - MARGIN) return null;

  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.gray200);
  doc.setLineWidth(0.3);
  roundRect(doc, x, y, cardW, cardH, 2, 'FD');

  setFill(doc, COLORS.gray100);
  doc.rect(x, y, cardW, HEADER_H, 'F');
  setFill(doc, COLORS.gray100);
  roundRect(doc, x, y, cardW, HEADER_H, 2, 'F');
  setFill(doc, COLORS.gray100);
  doc.rect(x, y + HEADER_H / 2, cardW, HEADER_H / 2, 'F');

  setDraw(doc, COLORS.gray200);
  doc.setLineWidth(0.2);
  doc.line(x, y + HEADER_H, x + cardW, y + HEADER_H);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setTxt(doc, COLORS.gray800);
  doc.text(`Year ${sem.year} · Semester ${sem.semester}`, x + 3, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setTxt(doc, COLORS.gray500);
  doc.text(`${sem.unitCount} unit${sem.unitCount !== 1 ? 's' : ''} · ${sem.totalCredits} CP`,
    x + cardW - 3, y + 5.5, { align: 'right' });

  let rowY = y + HEADER_H + 1.5;
  for (const unit of sem.units) {
    rowY = drawUnitRow(doc, unit, x + 2, rowY, cardW - 4);
  }
  return y + cardH + 3;
}

function drawFooter(doc) {
  const y = PAGE_H - 6;
  doc.setFontSize(6);
  setTxt(doc, COLORS.gray400);
  doc.text('Study Planner Export', MARGIN, y);
}

export async function generateStudyPlannerPdf({
  editableSchedule = [],
  recommendations  = null,
  studentInfo      = null,
  filename         = 'study-planner.pdf',
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  let y = drawHeader(doc, recommendations, studentInfo);
  y = drawProgressSection(doc, recommendations, y);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setTxt(doc, COLORS.gray700);
  doc.text('PERSONALISED STUDY SCHEDULE', MARGIN, y);
  y += 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setTxt(doc, COLORS.gray500);
  doc.text(`${editableSchedule.length} semester${editableSchedule.length !== 1 ? 's' : ''} remaining · Drag-and-drop units are saved in the order shown below`,
    MARGIN, y);
  y += 5;

  for (const sem of editableSchedule) {
    const newY = drawSemesterCard(doc, sem, MARGIN, y, CONTENT_W);
    if (newY === null) {
      // Add a new page if the card doesn't fit
      doc.addPage();
      y = MARGIN + 5;
      drawSemesterCard(doc, sem, MARGIN, y, CONTENT_W);
      y = newY; // but newY is null, so we need to set y properly
      // Actually, after new page we should continue; but for simplicity we recalc.
      // Better: after adding page, we set y to the new card's bottom.
      const nextY = drawSemesterCard(doc, sem, MARGIN, MARGIN + 5, CONTENT_W);
      y = nextY !== null ? nextY : MARGIN + 5 + (sem.units?.length * 9.5 + 11);
    } else {
      y = newY;
    }
  }

  drawFooter(doc);
  doc.save(filename);
}