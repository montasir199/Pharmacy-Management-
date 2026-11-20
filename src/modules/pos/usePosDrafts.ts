import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { PosDraft } from './types'

export function usePosDrafts() {
  const [drafts, setDrafts] = useState<PosDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? null
  const activeDraftRef = useRef<PosDraft | null>(null)

  useEffect(() => {
    activeDraftRef.current = activeDraft
  }, [activeDraft])

  useEffect(() => {
    let cancelled = false
    async function loadDrafts() {
      try {
        let loadedDrafts = await invoke<PosDraft[]>('list_pos_drafts')
        if (loadedDrafts.length === 0) {
          loadedDrafts = [await invoke<PosDraft>('create_pos_draft')]
        }
        if (cancelled) return
        setDrafts(loadedDrafts)
        setActiveDraftId(loadedDrafts.at(-1)?.id ?? null)
        loadedRef.current = true
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadDrafts()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loadedRef.current || !activeDraft) return
    void saveDraft(activeDraft).catch(() => {})
  }, [activeDraft])

  function saveDraft(draft: PosDraft) {
    const request = saveQueueRef.current.then(() => invoke('save_pos_draft', { draft }))
    saveQueueRef.current = request
      .then(() => setError(''))
      .catch((saveError: unknown) => {
        setError(saveError instanceof Error ? saveError.message : String(saveError))
      })
    return request
  }

  async function flushActiveDraft() {
    if (!activeDraftRef.current || !loadedRef.current) {
      throw new Error('POS draft is not ready to save')
    }
    await saveDraft(activeDraftRef.current)
  }

  function updateActiveDraft(update: (draft: PosDraft) => PosDraft) {
    if (activeDraftId === null) return
    setDrafts((current) => current.map((draft) => draft.id === activeDraftId
      ? { ...update(draft), updatedAt: new Date().toISOString() }
      : draft))
  }

  async function createDraft(currencyCode?: string) {
    try {
      const created = await invoke<PosDraft>('create_pos_draft')
      const draft = currencyCode ? { ...created, currencyCode } : created
      setDrafts((current) => [...current, draft])
      setActiveDraftId(draft.id)
      setError('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    }
  }

  async function finishDraft(draftId: number, currencyCode?: string) {
    const remaining = drafts.filter((draft) => draft.id !== draftId)
    setDrafts(remaining)
    if (activeDraftId !== draftId && activeDraftId !== null) return
    if (remaining.length > 0) {
      setActiveDraftId(remaining.at(-1)?.id ?? null)
      return
    }
    setActiveDraftId(null)
    await createDraft(currencyCode)
  }

  return {
    drafts,
    activeDraft,
    activeDraftId,
    loading,
    error,
    clearError: () => setError(''),
    flushActiveDraft,
    selectDraft: setActiveDraftId,
    createDraft,
    updateActiveDraft,
    finishDraft,
  }
}
