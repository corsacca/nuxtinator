// Org offboarding: when the host deletes an org, its inbox rows cascade away
// — but the S3 objects they reference (raw inbound MIME, attachment blobs)
// would orphan forever, unfindable once the rows are gone. The `org.deleted`
// hook fires before the row delete, so the collector can still read the
// org's rows through RLS. Cleanup is best-effort per the hook contract: a
// failure here logs and never blocks the org delete.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('org.deleted', async ({ orgId }) => {
    const keys = await inboxWithScopeTx(orgId, tx => inboxCollectOrgS3Keys(tx))
    if (keys.length === 0) return
    const { deleted, failed } = await inboxDeleteS3Keys(keys)
    console.log(`[inbox] org ${orgId} offboarded — S3 cleanup: ${deleted} deleted, ${failed} failed`)
  })
})
