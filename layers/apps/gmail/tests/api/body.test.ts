// Bodies are fetched from Gmail on first open and cached: sanitised HTML,
// inline images rewritten to the proxy, attachment metadata, and the
// download proxy's content-type policy. Also local and Gmail search.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch, url } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb, cleanupGmailTestData, createGmailOrgWith, seedMailbox, deliver, connectAccount, syncAccount,
  listThreads, getThread, fakeAddress, findThreadBySubject
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => {
  await cleanupGmailTestData(sql)
})

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('message bodies', () => {
  it('fetches, sanitises and caches a body with attachments', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await deliver(email, {
      from: 'jane@sender.example',
      subject: 'Rich',
      text: 'plain fallback',
      html: '<div style="color:red">Hello <script>alert(1)</script><a href="https://example.com">link</a><img src="javascript:alert(1)"></div>',
      attachments: [
        { filename: 'pixel.png', contentType: 'image/png', content: PNG_1PX, encoding: 'base64' },
        { filename: 'evil.html', contentType: 'text/html', content: '<script>alert(1)</script>' }
      ]
    })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    const row = (await findThreadBySubject(opts, 'Rich'))!
    expect(row.hasAttachments).toBe(true)
    const msg = (await getThread(opts, row.id)).messages[0]!
    expect(msg.bodyFetched).toBe(false)

    const body = await $fetch<{ bodyHtml: string | null, bodyText: string | null, attachments: { index: number, filename: string | null, contentType: string }[] }>(`/api/gmail/messages/${msg.id}/body`, opts)
    expect(body.bodyHtml).toContain('Hello')
    expect(body.bodyHtml).not.toContain('<script')
    expect(body.bodyHtml).not.toContain('javascript:')
    expect(body.bodyHtml).toContain('target="_blank"')
    expect(body.bodyHtml).toContain('style="color:red"')
    expect(body.bodyText).toContain('plain fallback')
    expect(body.attachments.map(a => a.filename)).toEqual(['pixel.png', 'evil.html'])

    const again = (await getThread(opts, row.id)).messages[0]!
    expect(again.bodyFetched).toBe(true)
    expect(again.bodyHtml).toBe(body.bodyHtml)

    // Images keep their type; anything else is forced to a download.
    const png = await fetch(url(`/api/gmail/messages/${msg.id}/attachments/0`), { headers: opts.headers })
    expect(png.status).toBe(200)
    expect(png.headers.get('content-type')).toBe('image/png')
    expect(png.headers.get('content-disposition')).toContain('inline')
    const html = await fetch(url(`/api/gmail/messages/${msg.id}/attachments/1`), { headers: opts.headers })
    expect(html.status).toBe(200)
    expect(html.headers.get('content-type')).toBe('application/octet-stream')
    expect(html.headers.get('content-disposition')).toContain('attachment')
    expect(await html.text()).toBe('<script>alert(1)</script>')
    const missing = await fetch(url(`/api/gmail/messages/${msg.id}/attachments/9`), { headers: opts.headers })
    expect(missing.status).toBe(404)

    const other = await createGmailOrgWith(sql)
    await expect($fetch(`/api/gmail/messages/${msg.id}/body`, other.opts)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('searches locally as you type and through Gmail on submit', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await deliver(email, { from: 'Jane Doe <jane@sender.example>', subject: 'Invoice 42', text: 'Please pay the invoice' })
    await deliver(email, { from: 'Bob <bob@sender.example>', subject: 'Holiday photos', text: 'Beach', attachments: [{ filename: 'a.txt', contentType: 'text/plain', content: 'x' }] })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)

    expect((await listThreads(opts, { q: 'jane' })).items.map(t => t.subject)).toEqual(['Invoice 42'])
    expect((await listThreads(opts, { q: 'photos' })).items.map(t => t.subject)).toEqual(['Holiday photos'])
    expect((await listThreads(opts, { q: 'nothing-like-this' })).items).toHaveLength(0)

    expect((await listThreads(opts, { gq: 'has:attachment' })).items.map(t => t.subject)).toEqual(['Holiday photos'])
    expect((await listThreads(opts, { gq: 'from:jane invoice' })).items.map(t => t.subject)).toEqual(['Invoice 42'])
    expect((await listThreads(opts, { gq: 'subject:zzz' })).items).toHaveLength(0)
  })
})
