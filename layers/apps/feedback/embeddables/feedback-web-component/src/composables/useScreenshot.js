/**
 * useScreenshot — captures the host page as a PNG Blob using html2canvas-pro.
 *
 * The widget itself lives in the host page's light DOM under
 * `.feedback-widget-slot` (the visible bubble + panel) plus a
 * `<feedback-web-component>` custom element host. Both are skipped via
 * `ignoreElements` so the screenshot does not include the feedback panel.
 */

export function useScreenshot() {
  async function capture() {
    const { default: html2canvas } = await import('html2canvas-pro')
    const canvas = await html2canvas(document.documentElement, {
      ignoreElements: el =>
        (el.classList && el.classList.contains('feedback-widget-slot')) ||
        el.tagName === 'FEEDBACK-WEB-COMPONENT',
      useCORS: true,
      logging: false,
      backgroundColor: null
    })
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  }
  return { capture }
}
