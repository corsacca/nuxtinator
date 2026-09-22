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
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const canvas = await html2canvas(document.documentElement, {
      // Crop to the visible viewport: offset into the page by the current
      // scroll position, sized to the inner window box.
      x: scrollX,
      y: scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      onclone: clonedDoc => {
        // html2canvas derives element positions from clientRect + this scroll offset,
        // so the clone has to really sit there. A host page's `scroll-behavior: smooth`
        // is inherited by the clone and would animate the jump instead of applying it.
        const style = clonedDoc.createElement('style')
        style.textContent = '*{scroll-behavior:auto !important}'
        clonedDoc.head.appendChild(style)
        clonedDoc.defaultView?.scrollTo(scrollX, scrollY)
      },
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
