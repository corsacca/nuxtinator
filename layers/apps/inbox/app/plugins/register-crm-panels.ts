// Inject the inbox conversations panel onto CRM contact record pages. CRM's
// record detail page reads `getCrmDetailPanels(type)` from the `#crm` alias; we
// register at app-plugin time so the registry is populated before the page
// renders. The panel self-gates on inbox.access, so registering it
// unconditionally is safe (a viewer without the permission sees nothing).
import { registerCrmDetailPanel } from '#crm'
import InboxCrmConversationsPanel from '../components/inbox/CrmConversationsPanel.vue'

export default defineNuxtPlugin(() => {
  registerCrmDetailPanel({
    id: 'inbox-conversations',
    recordTypes: ['contacts'],
    component: InboxCrmConversationsPanel,
    order: 50
  })
})
