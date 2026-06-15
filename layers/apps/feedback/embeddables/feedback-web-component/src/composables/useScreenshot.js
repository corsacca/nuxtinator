/**
 * useScreenshot — captures the currently visible viewport of the host page as a
 * PNG Blob using html2canvas-pro.
 *
 * The capture is cropped to the visible viewport (x/y/width/height below) rather
 * than the full scrollable page, so the result matches what the user can see.
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
      // Crop to the visible viewport: offset into the page by the current
      // scroll position, sized to the inner window box.
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
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
