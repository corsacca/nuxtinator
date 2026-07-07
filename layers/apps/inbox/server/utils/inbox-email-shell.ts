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
