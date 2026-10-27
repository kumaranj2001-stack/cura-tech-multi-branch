import logoUrl from "../assets/logo.png";

export const fmtCurrency = (n: number) => "₹" + (n || 0).toFixed(2);

/* Compress an image file to a JPEG data URL (keeps QR codes crisp & small) */
export function compressImageFile(file: File, maxSide = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas unsupported")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}
export const fmtDate = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateTime = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const today = () => new Date().toISOString().slice(0, 10);
export const isExpired = (d: string) => new Date(d) < new Date(new Date().toDateString());
export const daysToExpiry = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

/* ── download helpers ──────────────────────────────────────────────────────
   Robust across Chrome / Edge / Firefox / Safari:
   • anchor is attached to the DOM before click (Firefox requirement)
   • object URL is revoked only after the browser has picked up the file
   • CSV gets a UTF-8 BOM so Excel renders ₹ and accents correctly        */

export function flashToast(message: string, tone: "ok" | "warn" = "ok") {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:9999",
    "padding:10px 16px", "border-radius:12px", "font-size:13px", "font-weight:600",
    "font-family:system-ui,sans-serif", "pointer-events:none",
    "box-shadow:0 12px 32px rgba(2,6,23,.35)",
    "opacity:0", "transform:translateY(10px)", "transition:opacity .25s ease, transform .25s ease",
    tone === "ok"
      ? "background:#0f172a;color:#ecfeff;border:1px solid rgba(52,211,153,.5)"
      : "background:#0f172a;color:#fef2f2;border:1px solid rgba(248,113,113,.5)",
  ].join(";");
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    window.setTimeout(() => el.remove(), 300);
  }, 2400);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  if (!rows || rows.length <= 1) {
    flashToast("⚠ No data to export", "warn");
    return;
  }
  const csv = "\uFEFF" + rows
    .map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
  flashToast(`📥 ${filename.replace(/\.csv$/i, "")} exported`);
}

export function downloadJSON(filename: string, obj: unknown) {
  triggerDownload(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
  flashToast(`📥 ${filename.replace(/\.json$/i, "")} exported`);
}

/* ── PDF export ────────────────────────────────────────────────────────────
   Branded Guru report: header band, autotable body, totals footer and
   page numbers. ₹ is rendered as "Rs." because jsPDF's built-in fonts use
   WinAnsi encoding which has no rupee glyph.                              */
export function downloadPDF(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  footer?: { label: string; value: string }[];
}) {
  // dynamic import keeps the login bundle light; jsPDF is only loaded on export
  void import("jspdf").then(({ jsPDF }) =>
    import("jspdf-autotable").then((atMod) => {
      const autoTable = (atMod as { default?: typeof import("jspdf-autotable").default } & typeof import("jspdf-autotable")).default || (atMod as unknown as typeof import("jspdf-autotable").default);
      const landscape = opts.columns.length > 6;
      const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt" });
      const W = doc.internal.pageSize.getWidth();

      const cell = (v: string | number) => String(v ?? "").replace(/₹/g, "Rs. ");

      // header band
      doc.setFillColor(2, 132, 199);
      doc.rect(0, 0, W, 66, "F");
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 66, W, 3, "F");
      // logo chip
      try {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(34, 9, 48, 48, 8, 8, "F");
        doc.addImage(logoUrl, "PNG", 38, 13, 40, 40);
      } catch { /* logo optional */ }
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("GURU", 92, 32);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Pharmacy Management System", 92, 47);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(opts.title, W - 40, 32, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(new Date().toLocaleString("en-IN"), W - 40, 47, { align: "right" });

      let startY = 86;
      if (opts.subtitle) {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(9);
        doc.text(opts.subtitle, 40, startY);
        startY += 14;
      }

      (autoTable as unknown as (d: typeof doc, o: Record<string, unknown>) => void)(doc, {
        startY,
        head: [opts.columns],
        body: opts.rows.map((r) => r.map(cell)),
        styles: { fontSize: 8, cellPadding: 5, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.5 },
        headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40, bottom: 56 },
        didDrawPage: () => {
          const H = doc.internal.pageSize.getHeight();
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text("Guru · Pharmacy ERP", 40, H - 24);
          doc.text(`Page ${doc.getNumberOfPages()}`, W - 40, H - 24, { align: "right" });
        },
      });

      if (opts.footer && opts.footer.length) {
        const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
        let fy = (table?.finalY ?? startY) + 22;
        const H = doc.internal.pageSize.getHeight();
        if (fy > H - 70) { doc.addPage(); fy = 60; }
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(W - 300, fy - 14, 260, opts.footer.length * 16 + 12, 6, 6, "F");
        doc.setFontSize(9);
        opts.footer.forEach((f, i) => {
          doc.setTextColor(71, 85, 105);
          doc.setFont("helvetica", "normal");
          doc.text(f.label, W - 288, fy + i * 16);
          doc.setTextColor(2, 132, 199);
          doc.setFont("helvetica", "bold");
          doc.text(cell(f.value), W - 52, fy + i * 16, { align: "right" });
        });
      }

      const name = opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`;
      doc.save(name);
      flashToast(`📄 ${name.replace(/\.pdf$/i, "")} downloaded`);
    })
  );
}

/* Captures the live on-screen invoice node and paginates it into a PDF Blob,
   so the downloaded / shared document is pixel-identical to the app preview. */
export async function htmlToPdfBlob(el: HTMLElement): Promise<Blob> {
  const { toJpeg } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");
  const dataUrl = await toJpeg(el, {
    quality: 0.95,
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: true,
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not rasterize invoice"));
    img.src = dataUrl;
  });
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const imgW = pageW - margin * 2;
  const imgH = (img.height * imgW) / img.width;
  const usable = pageH - margin * 2;

  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(dataUrl, "JPEG", margin, position, imgW, imgH);
  heightLeft -= usable;
  while (heightLeft > 0) {
    pdf.addPage();
    position = margin - (imgH - heightLeft);
    pdf.addImage(dataUrl, "JPEG", margin, position, imgW, imgH);
    heightLeft -= usable;
  }
  return pdf.output("blob");
}

/* Builds a branded single-invoice PDF and returns it as a Blob (for sharing) */
export function invoicePdfBlob(inv: {
  number: string; date: string; patientName: string; patientPhone?: string;
  items: { name: string; batch?: string; expiry?: string; gst?: number; qty: number; price: number }[];
  subtotal: number; discount: number; taxAmount: number; total: number;
  paymentMethod?: string; createdBy?: string;
}): Promise<Blob> {
  return import("jspdf").then(({ jsPDF }) =>
    import("jspdf-autotable").then((atMod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoTable = ((atMod as any).default || atMod) as any;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();

      doc.setFillColor(2, 132, 199);
      doc.rect(0, 0, W, 66, "F");
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 66, W, 3, "F");
      try {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(34, 9, 48, 48, 8, 8, "F");
        doc.addImage(logoUrl, "PNG", 38, 13, 40, 40);
      } catch { /* logo optional */ }
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(17);
      doc.text("GURU", 92, 32);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("Pharmacy Management System", 92, 47);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("TAX INVOICE", W - 40, 32, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(inv.number, W - 40, 47, { align: "right" });

      doc.setTextColor(30, 41, 59); doc.setFontSize(9);
      doc.text(`Bill To: ${inv.patientName}${inv.patientPhone ? "  ·  " + inv.patientPhone : ""}`, 40, 92);
      doc.text(`Date: ${new Date(inv.date).toLocaleString("en-IN")}   ·   Payment: ${(inv.paymentMethod || "cash").toUpperCase()}`, 40, 106);

      autoTable(doc, {
        startY: 120,
        head: [["#", "Medicine", "Batch", "Expiry Date", "GST %", "Qty", "Rate", "Amount"]],
        body: inv.items.map((it, i) => [
          String(i + 1),
          it.name,
          it.batch || "—",
          it.expiry || "—",
          it.gst != null ? `${it.gst}%` : "—",
          String(it.qty),
          `Rs. ${it.price.toFixed(2)}`,
          `Rs. ${(it.qty * it.price).toFixed(2)}`
        ]),
        styles: { fontSize: 8.5, cellPadding: 5, textColor: [30, 41, 59] },
        headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });

      const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      let y = (table?.finalY ?? 140) + 24;
      const row = (label: string, value: string, color?: [number, number, number]) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(label, W - 220, y);
        doc.setFont("helvetica", "bold");
        if (color) doc.setTextColor(...color); else doc.setTextColor(30, 41, 59);
        doc.text(value, W - 40, y, { align: "right" });
        y += 16;
      };
      row("Subtotal", `Rs. ${inv.subtotal.toFixed(2)}`);
      if (inv.discount > 0) row("Discount", `- Rs. ${inv.discount.toFixed(2)}`, [225, 29, 47]);
      if (inv.taxAmount > 0) row("GST", `Rs. ${inv.taxAmount.toFixed(2)}`);
      doc.setDrawColor(2, 132, 199); doc.setLineWidth(1);
      doc.line(W - 220, y - 10, W - 40, y - 10);
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105); doc.setFont("helvetica", "bold");
      doc.text("Grand Total", W - 220, y + 4);
      doc.setTextColor(2, 132, 199);
      doc.text(`Rs. ${inv.total.toFixed(2)}`, W - 40, y + 4, { align: "right" });

      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Thank you for choosing Guru. Get well soon!", W / 2, doc.internal.pageSize.getHeight() - 30, { align: "center" });

      return doc.output("blob");
    })
  );
}
