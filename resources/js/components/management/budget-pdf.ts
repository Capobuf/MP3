import html2pdf from 'html2pdf.js';
import type { jsPDF } from 'jspdf';
import type { BudgetReportOptions } from './budget-report';

export async function downloadBudgetPdf(
    element: HTMLElement,
    filename: string,
    {
        orientation,
        showPageNumbers,
        numberFirstPage,
    }: Pick<
        BudgetReportOptions,
        'orientation' | 'showPageNumbers' | 'numberFirstPage'
    >,
) {
    await document.fonts.ready;
    await Promise.all(
        Array.from(element.querySelectorAll('img')).map((img) => img.decode()),
    );
    const footer = element.querySelector<HTMLElement>('.budget-report-footer');
    if (!footer) throw new Error('Footer del report non disponibile.');
    const footerReport = element.cloneNode(false) as HTMLElement;
    footerReport.dataset.pdfFooter = 'true';
    footerReport.append(footer.cloneNode(true));
    const options = {
        filename,
        margin: [12, 12, 36, 12] as [number, number, number, number],
        image: { type: 'jpeg' as const, quality: 0.98 },
        enableLinks: false,
        html2canvas: { scale: 2, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation },
        pagebreak: { mode: ['css'], avoid: ['tr', 'svg', 'img'] },
    };
    const worker = html2pdf().set(options).from(element);
    const footerWorker = html2pdf().set(options).from(footerReport);
    try {
        await worker.toContainer();
        const container: HTMLElement = await worker.get('container');
        // shortcut: one canvas per report; use paged rendering if longer downloads are needed.
        if (
            container.scrollHeight * 2 > 32000 ||
            container.scrollWidth * container.scrollHeight * 4 > 64_000_000
        ) {
            throw new Error(
                'Report troppo lungo per il download. Riduci le righe con i filtri oppure usa Stampa.',
            );
        }
        await worker.toPdf();
        await footerWorker.toCanvas();
        const canvas: HTMLCanvasElement = await footerWorker.get('canvas');
        const footerImage = canvas.toDataURL('image/png');
        const pdf: jsPDF = await worker.get('pdf');
        const width = pdf.internal.pageSize.getWidth();
        const height = pdf.internal.pageSize.getHeight();
        for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
            pdf.setPage(page);
            pdf.addImage(footerImage, 'PNG', 12, height - 32, width - 24, 20);
            if (showPageNumbers && (numberFirstPage || page > 1)) {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor('#52647d');
                pdf.text(
                    String(numberFirstPage ? page : page - 1),
                    width - 12,
                    height - 22,
                    {
                        align: 'right',
                        baseline: 'middle',
                    },
                );
            }
        }
        await worker.save();
    } finally {
        const overlay: HTMLElement | null = await worker.get('overlay');
        overlay?.remove();
        const footerOverlay: HTMLElement | null =
            await footerWorker.get('overlay');
        footerOverlay?.remove();
    }
}
