'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { api, type Keyword, type ExtractedKeyword } from '@/lib/api'

const CATEGORIES = ['leistung', 'allgemein', 'firma'] as const
type Category = typeof CATEGORIES[number]

// 4 shades of blue for keyword importance (darkest = most important)
const BLUE_SHADES = [
  { bg: 'bg-blue-800', text: 'text-white', border: 'border-blue-900', label: 4 },       // Very high
  { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700', label: 3 },       // High
  { bg: 'bg-blue-400', text: 'text-white', border: 'border-blue-500', label: 2 },       // Medium
  { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-300', label: 1 },    // Low
] as const

// Assign importance shade based on category: leistung=highest, firma=medium, allgemein=lowest
function getShadeIndex(category: string): number {
  switch (category) {
    case 'leistung': return 0  // Darkest blue - most important
    case 'firma': return 1     // Dark blue
    case 'allgemein': return 2 // Medium blue
    default: return 3          // Light blue
  }
}

export default function RightPanel({
  profileId,
}: {
  profileId?: string
}) {
  const locale = useLocale()
  const t = useTranslations('profiles')

  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [newKw, setNewKw] = useState('')
  const [newCat, setNewCat] = useState<Category>('leistung')
  const [extractedKws, setExtractedKws] = useState<ExtractedKeyword[]>([])
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [selectedKws, setSelectedKws] = useState<Set<number>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profileId) return
    api.keywords.list(profileId).then(setKeywords).catch(() => {})
    setExtractedKws([])
    setUploadStatus('')
    setUploadId(null)
  }, [profileId])

  const handleFileUpload = async (file: File) => {
    if (!profileId) return
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
      setUploadStatus(
        locale === 'de'
          ? `${data.extracted_keywords.length} Keywords gefunden`
          : `${data.extracted_keywords.length} keywords found`
      )
    } catch (e: any) {
      setUploadStatus(`Fehler: ${e.message}`)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const approveKeywords = async () => {
    if (!uploadId || !profileId) return
    const approved = extractedKws.filter((_, i) => selectedKws.has(i))
    const result = await api.uploads.approve(profileId, uploadId, approved)
    const updated = await api.keywords.list(profileId)
    setKeywords(updated)
    setExtractedKws([])
    setUploadId(null)
    setUploadStatus(
      locale === 'de'
        ? `${result.saved} Keywords uebernommen`
        : `${result.saved} keywords saved`
    )
  }

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKw.trim() || !profileId) return
    const kw = await api.keywords.add(profileId, { keyword: newKw.trim(), category: newCat })
    setKeywords(prev => [...prev, kw])
    setNewKw('')
  }

  const removeKeyword = async (kwId: string) => {
    if (!profileId) return
    await api.keywords.delete(profileId, kwId)
    setKeywords(prev => prev.filter(k => k.id !== kwId))
  }

  // Get color shade for a keyword based on category
  const getKeywordShade = (kw: Keyword) => {
    const baseIndex = getShadeIndex(kw.category)
    return BLUE_SHADES[baseIndex]
  }

  if (!profileId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-gray-400">
          {locale === 'de' ? 'Profil auswaehlen' : 'Select a profile'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pl-1 space-y-3">
      {/* PDF Drop Zone */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">{t('uploadPDF')}</h3>
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
            }`}
        >
          <svg className="mx-auto mb-2 text-gray-300" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-xs text-gray-500">{t('dragDrop')}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            {locale === 'de' ? 'Fruehere Ausschreibungen fuer optimale Keywords' : 'Previous tenders for optimal keywords'}
          </p>
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

        {/* Extracted keywords approval */}
        {extractedKws.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-700 mb-1.5">
              {locale === 'de' ? 'Keywords auswaehlen:' : 'Select keywords:'}
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {extractedKws.map((kw, i) => {
                const shade = BLUE_SHADES[getShadeIndex(kw.category)]
                return (
                  <label
                    key={i}
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all
                      ${selectedKws.has(i)
                        ? `${shade.bg} ${shade.text} ${shade.border}`
                        : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKws.has(i)}
                      onChange={e => {
                        const next = new Set(selectedKws)
                        e.target.checked ? next.add(i) : next.delete(i)
                        setSelectedKws(next)
                      }}
                      className="w-2.5 h-2.5"
                    />
                    {kw.keyword}
                  </label>
                )
              })}
            </div>
            <button
              onClick={approveKeywords}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              {t('approveKeywords')} ({selectedKws.size})
            </button>
          </div>
        )}
      </div>

      {/* Add keyword manually */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">{t('addKeyword')}</h3>
        <form onSubmit={addKeyword} className="flex gap-1.5">
          <input
            value={newKw}
            onChange={e => setNewKw(e.target.value)}
            placeholder={locale === 'de' ? 'z.B. Bauueberwachung' : 'e.g. Construction'}
            className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={newCat}
            onChange={e => setNewCat(e.target.value as Category)}
            className="text-xs border border-gray-200 rounded-md px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{t(`categories.${c}` as any)}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-2.5 py-1.5 text-xs font-medium text-white rounded-md"
            style={{ background: 'var(--navy)' }}
          >
            +
          </button>
        </form>
      </div>

      {/* Keywords color-coded display */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-700">
            {locale === 'de' ? 'Suchbegriffe' : 'Search Keywords'}
            <span className="ml-1.5 font-normal text-gray-400">({keywords.length})</span>
          </h3>
        </div>

        {/* Color legend */}
        <div className="flex flex-wrap gap-2 mb-3 pb-2 border-b border-gray-100">
          {[
            { shade: BLUE_SHADES[0], label: locale === 'de' ? 'Leistung (+3)' : 'Service (+3)' },
            { shade: BLUE_SHADES[1], label: locale === 'de' ? 'Firma (+2)' : 'Company (+2)' },
            { shade: BLUE_SHADES[2], label: locale === 'de' ? 'Allgemein (+1)' : 'General (+1)' },
          ].map(({ shade, label }) => (
            <div key={label} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded ${shade.bg}`} />
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* All keywords as color-coded tags */}
        {keywords.length === 0 ? (
          <p className="text-[10px] text-gray-400 py-2">
            {locale === 'de'
              ? 'Noch keine Keywords. Lade eine PDF hoch oder fuege manuell hinzu.'
              : 'No keywords yet. Upload a PDF or add manually.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map(kw => {
              const shade = getKeywordShade(kw)
              return (
                <div
                  key={kw.id}
                  className={`group flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-medium
                    ${shade.bg} ${shade.text} ${shade.border}`}
                >
                  <span>{kw.keyword}</span>
                  <button
                    onClick={() => removeKeyword(kw.id)}
                    className="opacity-40 hover:opacity-100 ml-0.5 transition-opacity"
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

async function getToken(): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
