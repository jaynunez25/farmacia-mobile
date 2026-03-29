/**
 * Geração de PDF vectorial (jsPDF + autoTable) para relatórios de issues de auditoria.
 * Não usa captura de ecrã, print da UI nem html2canvas — apenas dados → documento PDF.
 */
import { Platform } from 'react-native';
import {
  cacheDirectory,
  documentDirectory,
  EncodingType,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const AUDIT_ISSUES_PDF_REPORT_TITLE = 'Relatório de Issues Pendentes de Revisão';

export type AuditIssuesPdfStats = {
  totalCatalog: number;
  open: number;
  resolved: number;
  front: number;
  back: number;
  zeroOpen: number;
  rowsInReport: number;
};

const TABLE_COLUMNS = [
  'Produto',
  'SKU',
  'Motivo',
  'Tipo',
  'Stock',
  'Local',
  'Criado em',
  'Estado',
] as const;

/** Nome de ficheiro: issues-pendentes-revisao-YYYY-MM-DD-HH-mm.pdf */
export function buildAuditIssuesPdfFilename(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `issues-pendentes-revisao-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}-${p(date.getMinutes())}.pdf`;
}

export type BuildAuditIssuesPdfInput = {
  systemName: string;
  reportTitle: string;
  generatedAt: string;
  filterDescription: string;
  extraNotes?: string[];
  stats: AuditIssuesPdfStats;
  /** Uma linha = 8 células (strings), na ordem de TABLE_COLUMNS */
  tableBody: string[][];
};

/** Monta o jsPDF (A4 paisagem, cabeçalho, resumo, tabela ou mensagem vazia, rodapés com página). */
export function buildAuditIssuesPdfDocument(input: BuildAuditIssuesPdfInput): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(input.systemName, margin, y);
  y += 7;

  doc.setFontSize(11);
  doc.text(input.reportTitle, margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Gerado em: ${input.generatedAt}`, margin, y);
  y += 5;

  const filterParts = [input.filterDescription, ...(input.extraNotes ?? [])].filter((s) => s?.trim());
  const filterBlock = filterParts.join('\n');
  const filterLines = doc.splitTextToSize(`Filtros aplicados: ${filterBlock}`, pageW - 2 * margin);
  doc.text(filterLines, margin, y);
  y += filterLines.length * 4 + 4;

  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  const s = input.stats;
  const summaryLines = [
    `Total issues (catálogo): ${s.totalCatalog}`,
    `Abertos: ${s.open}  |  Resolvidos: ${s.resolved}`,
    `FRONT: ${s.front}  |  BACK: ${s.back}`,
    `Abertos com stock zero: ${s.zeroOpen}`,
    `Registos neste relatório: ${s.rowsInReport}`,
  ];
  summaryLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 4;
  });
  y += 3;

  if (input.tableBody.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    const msg = doc.splitTextToSize(
      'Nenhum issue encontrado para os filtros selecionados.',
      pageW - 2 * margin,
    );
    doc.text(msg, margin, y + 6);
  } else {
    autoTable(doc, {
      theme: 'grid',
      startY: y,
      head: [[...TABLE_COLUMNS]],
      body: input.tableBody,
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 1.4,
        overflow: 'linebreak',
        valign: 'top',
        textColor: 15,
        lineColor: [203, 213, 225],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [226, 232, 240],
        textColor: 15,
        fontStyle: 'bold',
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin, bottom: 14 },
      tableLineColor: [148, 163, 184],
      tableLineWidth: 0.12,
      columnStyles: {
        0: { cellWidth: 44 },
        1: { cellWidth: 24 },
        2: { cellWidth: 52 },
        3: { cellWidth: 30 },
        4: { cellWidth: 14 },
        5: { cellWidth: 16 },
        6: { cellWidth: 30 },
        7: { cellWidth: 26 },
      },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin - 26, pageH - 6);
  }

  return doc;
}

/** Grava / descarrega o PDF e partilha em nativo; em web usa descarga do browser. */
export async function saveAndShareAuditIssuesPdf(
  input: BuildAuditIssuesPdfInput,
  shareDialogTitle: string,
): Promise<{ filename: string; shared: boolean }> {
  const doc = buildAuditIssuesPdfDocument(input);
  const filename = buildAuditIssuesPdfFilename();

  if (Platform.OS === 'web') {
    await doc.save(filename);
    return { filename, shared: true };
  }

  const baseDir = cacheDirectory ?? documentDirectory;
  if (!baseDir) {
    throw new Error('Não foi possível determinar a pasta para guardar o PDF.');
  }
  const uri = `${baseDir}${filename}`;
  const dataUri = doc.output('datauristring');
  const i = dataUri.indexOf(',');
  const base64Payload = i >= 0 ? dataUri.slice(i + 1) : '';
  await writeAsStringAsync(uri, base64Payload, {
    encoding: EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: shareDialogTitle,
    });
    return { filename, shared: true };
  }

  return { filename, shared: false };
}
