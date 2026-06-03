import { chromium } from 'playwright';

const defaultPdfOptions = {
  format: 'A4' as const,
  printBackground: true,
  margin: {
    top: '14mm',
    right: '12mm',
    bottom: '16mm',
    left: '12mm'
  }
};

export const renderHtmlToPdf = async (html: string) => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const pdfBytes = await page.pdf(defaultPdfOptions);
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
};
