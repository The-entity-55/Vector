import pptxgen from "pptxgenjs";

/** A single categorical data point used by the report charts/tables. */
export interface ReportDatum {
  label: string;
  value: number;
  /** Hex color WITHOUT the leading "#", e.g. "10b981". */
  color: string;
}

export interface ReportData {
  /** Human-readable timeline label, e.g. "This Week". */
  periodLabel: string;
  /** Report generation time (ms since epoch). */
  generatedMs: number;
  total: number;
  totalCompleted: number;
  totalOpen: number;
  overdue: number;
  completionRate: number;
  /** Status distribution (drives the pie/doughnut). */
  statusData: ReportDatum[];
  /** Priority breakdown (drives the bar chart). */
  priorityData: ReportDatum[];
}

const BRAND = "4f46e5"; // indigo-600
const INK = "0f172a"; // slate-900
const MUTED = "64748b"; // slate-500
const LINE = "e2e8f0"; // slate-200

/** Normalize a hex color to the bare 6-digit form pptxgenjs expects. */
function hex(c: string): string {
  return c.replace(/^#/, "").toLowerCase();
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Build a multi-slide .pptx report from the reporting-panel data and trigger a
 * browser download. Mirrors the on-screen report: a title slide, a KPI summary,
 * and one chart slide each for status distribution and priority breakdown —
 * all reflecting the selected timeline and the live Convex-backed numbers.
 */
export async function downloadReportPptx(data: ReportData): Promise<void> {
  const pptx = new pptxgen();
  pptx.author = "Vector";
  pptx.company = "Vector";
  pptx.subject = `Reporting Summary — ${data.periodLabel}`;
  pptx.title = `Vector Report — ${data.periodLabel}`;
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

  // ── Slide 1: Title ─────────────────────────────────────────────────────
  const cover = pptx.addSlide();
  cover.background = { color: "ffffff" };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 2.4,
    fill: { color: BRAND },
  });
  cover.addText("Vector Reporting Summary", {
    x: 0.6,
    y: 0.7,
    w: 12,
    h: 0.9,
    fontSize: 40,
    bold: true,
    color: "ffffff",
  });
  cover.addText(
    [
      { text: "Timeline: ", options: { bold: true } },
      { text: data.periodLabel },
    ],
    { x: 0.6, y: 1.6, w: 12, h: 0.5, fontSize: 18, color: "e0e7ff" },
  );
  cover.addText(`Generated ${formatDate(data.generatedMs)}`, {
    x: 0.6,
    y: 3.0,
    w: 12,
    h: 0.4,
    fontSize: 14,
    color: MUTED,
  });
  cover.addText(
    `${data.total} total tasks · ${data.completionRate}% completion rate`,
    {
      x: 0.6,
      y: 3.5,
      w: 12,
      h: 0.4,
      fontSize: 16,
      color: INK,
    },
  );

  // ── Slide 2: KPI summary ───────────────────────────────────────────────
  const kpi = pptx.addSlide();
  kpi.background = { color: "ffffff" };
  kpi.addText(`Key Metrics — ${data.periodLabel}`, {
    x: 0.6,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: INK,
  });

  const cards: { label: string; value: string; color: string }[] = [
    { label: "Total Tasks", value: String(data.total), color: INK },
    { label: "Completed", value: String(data.totalCompleted), color: "10b981" },
    { label: "Open", value: String(data.totalOpen), color: "3b82f6" },
    { label: "Overdue", value: String(data.overdue), color: "ef4444" },
  ];
  const cardW = 2.9;
  const cardGap = 0.3;
  const startX = 0.6;
  cards.forEach((c, i) => {
    const x = startX + i * (cardW + cardGap);
    kpi.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.4,
      w: cardW,
      h: 2.0,
      fill: { color: "f8fafc" },
      line: { color: LINE, width: 1 },
      rectRadius: 0.1,
    });
    kpi.addText(c.value, {
      x,
      y: 1.7,
      w: cardW,
      h: 0.9,
      fontSize: 40,
      bold: true,
      align: "center",
      color: c.color,
    });
    kpi.addText(c.label, {
      x,
      y: 2.7,
      w: cardW,
      h: 0.4,
      fontSize: 14,
      align: "center",
      color: MUTED,
    });
  });

  kpi.addText(
    [
      { text: "Overall progress: ", options: { bold: true, color: INK } },
      {
        text: `${data.totalCompleted} of ${data.total} tasks completed (${data.completionRate}%)`,
        options: { color: MUTED },
      },
    ],
    { x: 0.6, y: 3.9, w: 12, h: 0.5, fontSize: 16 },
  );

  // ── Slide 3: Status distribution (doughnut + table) ────────────────────
  const statusSlide = pptx.addSlide();
  statusSlide.background = { color: "ffffff" };
  statusSlide.addText("Status Distribution", {
    x: 0.6,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: INK,
  });
  addChartSlideBody(pptx, statusSlide, data.statusData, "doughnut", data.total);

  // ── Slide 4: Priority breakdown (bar + table) ──────────────────────────
  const prioritySlide = pptx.addSlide();
  prioritySlide.background = { color: "ffffff" };
  prioritySlide.addText("Priority Breakdown", {
    x: 0.6,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: INK,
  });
  addChartSlideBody(pptx, prioritySlide, data.priorityData, "bar", data.total);

  const periodSlug = data.periodLabel.toLowerCase().replace(/\s+/g, "-");
  const stamp = new Date(data.generatedMs).toISOString().slice(0, 10);
  await pptx.writeFile({ fileName: `Vector-Report-${periodSlug}-${stamp}.pptx` });
}

/** Render a native PPTX chart on the left and a data table on the right. */
function addChartSlideBody(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  data: ReportDatum[],
  kind: "doughnut" | "bar",
  total: number,
): void {
  const nonEmpty = data.filter((d) => d.value > 0);

  if (nonEmpty.length === 0) {
    slide.addText("No tasks in the selected timeline.", {
      x: 0.6,
      y: 3.2,
      w: 12,
      h: 0.6,
      fontSize: 18,
      align: "center",
      color: MUTED,
    });
    return;
  }

  const chartColors = nonEmpty.map((d) => hex(d.color));

  if (kind === "doughnut") {
    slide.addChart(
      pptx.ChartType.doughnut,
      [
        {
          name: "Status",
          labels: nonEmpty.map((d) => d.label),
          values: nonEmpty.map((d) => d.value),
        },
      ],
      {
        x: 0.6,
        y: 1.3,
        w: 6.2,
        h: 5.2,
        chartColors,
        showLegend: true,
        legendPos: "b",
        showValue: true,
        holeSize: 55,
        dataLabelColor: "ffffff",
        dataLabelFontSize: 11,
      },
    );
  } else {
    slide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "Count",
          labels: nonEmpty.map((d) => d.label),
          values: nonEmpty.map((d) => d.value),
        },
      ],
      {
        x: 0.6,
        y: 1.3,
        w: 6.2,
        h: 5.2,
        chartColors,
        barDir: "col",
        showValue: true,
        showLegend: false,
        catAxisLabelColor: MUTED,
        valAxisHidden: false,
      },
    );
  }

  // ── Detail table on the right ──────────────────────────────────────────
  const headerRow: pptxgen.TableRow = [
    { text: "Category", options: { bold: true, color: "ffffff", fill: { color: BRAND } } },
    { text: "Count", options: { bold: true, color: "ffffff", fill: { color: BRAND }, align: "right" } },
    { text: "Share", options: { bold: true, color: "ffffff", fill: { color: BRAND }, align: "right" } },
  ];
  const rows: pptxgen.TableRow[] = nonEmpty.map((d) => [
    { text: d.label, options: { color: INK } },
    { text: String(d.value), options: { color: INK, align: "right" } },
    {
      text: total > 0 ? `${Math.round((d.value / total) * 100)}%` : "0%",
      options: { color: MUTED, align: "right" },
    },
  ]);

  slide.addTable([headerRow, ...rows], {
    x: 7.2,
    y: 1.4,
    w: 5.5,
    colW: [3.1, 1.2, 1.2],
    border: { type: "solid", color: LINE, pt: 1 },
    fontSize: 13,
    rowH: 0.4,
    valign: "middle",
  });
}
