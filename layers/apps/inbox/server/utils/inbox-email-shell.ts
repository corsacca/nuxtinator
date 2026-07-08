// HTML shell for contact-facing inbox mail (replies, auto-ack, held-sender
// notice). Deliberately LIGHT and personal: just the font stack, text color,
// and a width cap — no logo banner, colored bar, or "automated" footer,
// because those would make a person's reply look impersonal and false. Staff
// alerts don't render here — they ride core's notification emails.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Force a size cap onto every <img> in outbound HTML. Email clients ignore
// <style>/external CSS, so the constraint has to live inline on each tag. Runs
// over the fully assembled body + quoted history, so it also caps images the
// contact sent that we quote back to them. The cap is appended LAST inside any
// existing style attribute so it wins over a sender-supplied width/height.
export function inboxConstrainImages(html: string): string {
  const cap = 'max-width:100%;max-height:480px;height:auto;'
  return html.replace(/<img\b([^>]*)>/gi, (_tag, rawAttrs: string) => {
    const selfClose = /\/\s*$/.test(rawAttrs)
    // Drop a trailing self-close slash and any surrounding whitespace so the
    // injected style joins with a single space.
    const attrs = rawAttrs.replace(/\s*\/?\s*$/, '')
    const styled = /\bstyle\s*=\s*("|')/i.test(attrs)
      ? attrs.replace(/(\bstyle\s*=\s*)("|')([\s\S]*?)\2/i, (_m, pre, quote, val) => `${pre}${quote}${val};${cap}${quote}`)
      : `${attrs} style="${cap}"`
    return `<img${styled}${selfClose ? ' /' : ''}>`
  })
}

export function inboxRenderMessageEmail(opts: {
  bodyHtml: string
  subject?: string
}): string {
  const title = opts.subject ? escapeHtml(opts.subject) : ''
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; font-size: 16px;">
      ${opts.bodyHtml}
    </body>
    </html>
  `
}
