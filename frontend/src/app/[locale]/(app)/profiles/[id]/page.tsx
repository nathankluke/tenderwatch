'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { api, type Keyword, type ExtractedKeyword } from '@/lib/api'

const CATEGORIES = ['leistung', 'allgemein', 'firma'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_COLORS: Record<Category, string> = {
  leistung: 'bg-blue-50 text-blue-700 border-blue-100',
  allgemein: 'bg-gray-50 text-gray-700 border-gray-200',
  firma:     'bg-purple-50 text-purple-700 border-purple-100',
}

export default function ProfileDetailPage() {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const params = useParams()
  const profileId = params.id as string

  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [newKw, setNewKw] = useState('')
  const [newCat, setNewCat] = useState<Category>('leistung')
  const [extractedKws, setExtractedKws] = useState<ExtractedKeyword[]>([])
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [selectedKws, setSelectedKws] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.keywords.list(profileId).then(setKeywords)
  }, [profileId])

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKw.trim()) return
    const kw = await api.keywords.add(profileId, { keyword: newKw.trim(), category: newCat })
    setKeywords(prev => [...prev, kw])
    setNewKw('')
  }

  const removeKeyword = async (kwId: string) => {
    await api.keywords.delete(profileId, kwId)
    setKeywords(prev => prev.filter(k => k.id !== kwId))
  }

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      setUploadStatus(locale === 'de' ? 'Nur PDF-Dateien erlaubt' : 'Only PDF files allowed')
      return
    }
    setUploadStatus(locale === 'de' ? 'Verarbeite...' : 'Processing...')
    setExtractedKws([])
    setUploadId(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/profiles/${profileId}/upload-pdf`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setExtractedKws(data.extracted_keywords || [])
      setUploadId(data.upload_id)
      setSelectedKws(new Set(data.extracted_keywords.map((_: any, i: number) => i)))
      setUploadStatus(locale === 'de' ? `${data.extracted_keywords.length} Keywords gefunden` : `${data.extracted_keywords.length} keywords found`)
    } catch (e: any) {
      setUploadStatus(`Fehler: ${e.message}`)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const approveKeywords = async () => {
    if (!uploadId) return
    const approved = extractedKws.filter((_, i) => selectedKws.has(i))
    const result = await api.uploads.approve(profileId, uploadId, approved)
    // Refresh keywords
    const updated = await api.keywords.list(profileId)
    setKeywords(updated)
    setExtractedKws([])
    setUploadId(null)
    setUploadStatus(locale === 'de' ? `${result.saved} Keywords übernommen` : `${result.saved} keywords saved`)
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = keywords.filter(k => k.category === cat)
    return acc
  }, {} as Record<Category, Keyword[]>)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">{t('keywords')}</h1>

      {/* PDF Upload */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('uploadPDF')}</h2>
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer
                     hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
        >
          <p className="text-sm text-gray-500">{t('dragDrop')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]) }}
          />
        </div>

        {uploadStatus && (
          <p className="text-xs text-gray-500 mt-2">{uploadStatus}</p>
        )}

        {/* Extracted keywords with checkboxes */}
        {extractedKws.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {t('pendingApproval')} – {locale === 'de' ? 'Wähle die Keywords die du übernehmen möchtest:' : 'Select the keywords to save:'}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {extractedKws.map((kw, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border cursor-pointer
                    ${selectedKws.has(i) ? CATEGORY_COLORS[kw.category as Category] : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedKws.has(i)}
                    onChange={e => {
                      const next = new Set(selectedKws)
                      e.target.checked ? next.add(i) : next.delete(i)
                      setSelectedKws(next)
                    }}
                    className="w-3 h-3"
                  />
                  {kw.keyword}
                  <span className="opacity-60">({kw.category})</span>
                </label>
              ))}
            </div>
            <button
              onClick={approveKeywords}
              className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              {t('approveKeywords')} ({selectedKws.size})
            </button>
          </div>
        )}
      </div>

      {/* Add keyword manually */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('addKeyword')}</h2>
        <form onSubmit={addKeyword} className="flex gap-2">
          <input
            value={newKw}
            onChange={e => setNewKw(e.target.value)}
            placeholder={locale === 'de' ? 'z.B. Bauüberwachung' : 'e.g. Construction Monitoring'}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={newCat}
            onChange={e => setNewCat(e.target.value as Category)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{t(`categories.${c}` as any)}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: 'var(--navy)' }}
          >
            +
          </button>
        </form>
      </div>

      {/* Keywords by category */}
      {CATEGORIES.map(cat => (
        <div key={cat} className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {t(`categories.${cat}` as any)}
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({grouped[cat].length})
            </span>
          </h2>
          {grouped[cat].length === 0 ? (
            <p className="text-xs text-gray-400">–</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {grouped[cat].map(kw => (
                <div
                  key={kw.id}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${CATEGORY_COLORS[cat]}`}
                >
                  <span>{kw.keyword}</span>
                  {kw.source !== 'manual' && (
                    <span className="opacity-50 text-[9px]">
                      {kw.source === 'pdf_extracted' ? 'PDF' : 'EXT'}
                    </span>
                  )}
                  <button
                    onClick={() => removeKeyword(kw.id)}
                    className="opacity-40 hover:opacity-100 ml-0.5"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

async function getToken(): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
