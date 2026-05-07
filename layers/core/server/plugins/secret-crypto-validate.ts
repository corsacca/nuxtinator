import { encryptSecret, decryptSecret } from '../utils/secret-crypto'

// Boot-time sanity check. We don't hard-fail when the key is missing
// (so the app still boots without the mail layer configured), but we
// do hard-fail when it's set and malformed — that's a configuration
// error that would silently break encrypt/decrypt at first use.
export default defineNitroPlugin(() => {
  const hex = useRuntimeConfig().secretEncryptionKey
  if (!hex) {
    console.warn('[secret-crypto] NUXT_SECRET_ENCRYPTION_KEY is not set. Features that store encrypted secrets (Mail accounts, future IMAP credentials) will fail until you set one. Generate with: openssl rand -hex 32')
    return
  }
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) {
    throw new Error(`NUXT_SECRET_ENCRYPTION_KEY must be 32 bytes (64 hex chars); got ${buf.length} bytes`)
  }
  const probe = decryptSecret(encryptSecret('probe'))
  if (probe !== 'probe') throw new Error('secret-crypto round-trip failed')
})
