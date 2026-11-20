import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PosDraft } from './types'

type Props = {
  drafts: PosDraft[]
  activeDraftId: number | null
  onSelect: (draftId: number) => void
  onCreate: () => void
}

export function InvoiceTabs({ drafts, activeDraftId, onSelect, onCreate }: Props) {
  const { t } = useTranslation()

  return (
    <div className="pos-invoice-tabs" role="tablist" aria-label={t('openInvoices')}>
      {drafts.map((draft) => (
        <button
          className={draft.id === activeDraftId ? 'pos-invoice-tab is-active' : 'pos-invoice-tab'}
          type="button"
          role="tab"
          aria-selected={draft.id === activeDraftId}
          key={draft.id}
          onClick={() => onSelect(draft.id)}
        >
          <strong>{t('invoiceTabNumber', { number: draft.id })}</strong>
          <small>{draft.createdAt.split('T')[1]?.slice(0, 5) ?? '—'}</small>
        </button>
      ))}
      <button className="pos-invoice-new" type="button" onClick={onCreate} aria-label={t('newInvoice')}>
        <Plus size={18} />
      </button>
    </div>
  )
}
