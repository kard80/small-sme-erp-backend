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

export interface RenderHtmlToPdfOptions {
  headerTemplate?: string;
  footerTemplate?: string;
}

export const renderHtmlToPdf = async (html: string, options: RenderHtmlToPdfOptions = {}) => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const { headerTemplate, footerTemplate } = options;
    const pdfOptions = headerTemplate || footerTemplate
      ? {
          ...defaultPdfOptions,
          displayHeaderFooter: true,
          headerTemplate: headerTemplate ?? '<div></div>',
          footerTemplate: footerTemplate ?? '<div></div>',
          margin: {
            ...defaultPdfOptions.margin,
            top: headerTemplate ? '20mm' : defaultPdfOptions.margin.top
          }
        }
      : defaultPdfOptions;

    const pdfBytes = await page.pdf(pdfOptions);
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
};
