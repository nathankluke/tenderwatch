'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { api, type Keyword, type ExtractedKeyword, type PdfUpload } from '@/lib/api'

const CATEGORIES = ['leistung', 'allgemein', 'firma'] as const
type Category = typeof CATEGORIES[number]

// 4 shades of blue for keyword importance (darkest = most important)
const BLUE_SHADES = [
  { bg: 'bg-blue-800', text: 'text-white', border: 'border-blue-900', label: 4 },
  { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700', label: 3 },
  { bg: 'bg-blue-400', text: 'text-white', border: 'border-blue-500', label: 2 },
  { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-300', label: 1 },
] as const

function getShadeIndex(category: string): number {
  switch (category) {
    case 'leistung': return 0
    case 'firma': return 1
    case 'allgemein': return 2
    default: return 3
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
  const [uploads, setUploads] = useState<PdfUpload[]>([])
  const [projectName, setProjectName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load keywords and uploads when profile changes
  useEffect(() => {
    if (!profileId) return
    api.keywords.list(profileId).then(setKeywords).catch(() => {})
    api.uploads.list(profileId).then(setUploads).catch(() => {})
    setExtractedKws([])
    setUploadStatus('')
    setUploadId(null)
    setProjectName('')
  }, [profileId])

  const refreshKeywords = async () => {
    if (!profileId) return
    const updated = await api.keywords.list(profileId)
    setKeywords(updated)
  }

  const refreshUploads = async () => {
    if (!profileId) return
    const updated = await api.uploads.list(profileId)
    setUploads(updated)
  }

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
    if (projectName.trim()) {
      formData.append('project_name', projectName.trim())
    }

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
      setProjectName('')
      await refreshUploads()
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
    await refreshKeywords()
    setExtractedKws([])
    setUploadId(null)
    setUploadStatus(
      locale === 'de'
        ? `${result.saved} Keywords uebernommen`
        : `${result.saved} keywords saved`
    )
  }

  const deleteUpload = async (uploadId: string) => {
    if (!profileId) return
    try {
      await api.uploads.delete(profileId, uploadId)
      await refreshUploads()
      await refreshKeywords()
      setUploadStatus(locale === 'de' ? 'PDF geloescht' : 'PDF deleted')
    } catch (e: any) {
      setUploadStatus(`Fehler: ${e.message}`)
    }
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

        {/* Optional project name */}
        <input
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder={locale === 'de' ? 'Projektname (optional)' : 'Project name (optional)'}
          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

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

      {/* Uploaded PDFs list with project names */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 flex-shrink-0">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">
            {locale === 'de' ? 'Hochgeladene PDFs' : 'Uploaded PDFs'}
            <span className="ml-1.5 font-normal text-gray-400">({uploads.length})</span>
          </h3>
          <div className="space-y-1.5">
            {uploads.map(u => (
              <div key={u.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
                  </svg>
                  <div className="min-w-0">
                    {u.project_name && (
                      <span className="text-gray-900 font-medium truncate block">{u.project_name}</span>
                    )}
                    {u.storage_path ? (
                      <a
                        href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pdf-uploads/${u.storage_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 underline truncate block text-[10px]"
                      >
                        {u.filename}
                      </a>
                    ) : (
                      <span className="text-gray-500 truncate block text-[10px]">{u.filename}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded
                    ${u.status === 'approved' ? 'bg-green-100 text-green-700'
                      : u.status === 'pending_approval' ? 'bg-amber-100 text-amber-700'
                      : u.status === 'processing' ? 'bg-blue-100 text-blue-700'
                      : 'bg-red-100 text-red-700'}`}
                  >
                    {u.status === 'approved' ? (locale === 'de' ? 'OK' : 'OK')
                      : u.status === 'pending_approval' ? (locale === 'de' ? 'Offen' : 'Pending')
                      : u.status === 'processing' ? (locale === 'de' ? '...' : '...')
                      : (locale === 'de' ? 'Fehler' : 'Error')}
                  </span>
                  <button
                    onClick={() => deleteUpload(u.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                    title={locale === 'de' ? 'Loeschen' : 'Delete'}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
