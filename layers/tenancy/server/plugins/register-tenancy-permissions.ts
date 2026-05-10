import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import {
  ORG_PERMISSIONS,
  ORG_PERMISSION_META,
  ORG_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(ORG_PERMISSIONS, ORG_PERMISSION_META)
  registerDefaultGrants('tenancy', ORG_DEFAULT_GRANTS)
})
