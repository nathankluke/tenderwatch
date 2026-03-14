'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import ScoreBadge from '@/components/ui/ScoreBadge'
import { api, type TenderDetail, type ExtractedKeyword } from '@/lib/api'

export default function TenderDetailPage() {
  const t = useTranslations('tenders')
  const locale = useLocale()
  const params = useParams()
  const tenderId = params.id as string
  const [tender, setTender] = useState<TenderDetail | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedKeyword[]>([])
  const [profileId, setProfileId] = useState<string | undefined>()

  useEffect(() => {
    api.tenders.get(tenderId).then(setTender)
    api.profiles.list().then(p => { if (p.length > 0) setProfileId(p[0].id) })
  }, [tenderId])

  const handleExtract = async () => {
    if (!profileId) return
    setExtracting(true)
    try {
      const result = await api.tenders.extractKeywords(tenderId, profileId)
      setExtracted(result.extracted_keywords)
    } catch (e) {
      console.error(e)
    } finally {
      setExtracting(false)
    }
  }

  const handleApproveKeywords = async () => {
    if (!profileId) return
    await api.keywords.approve(profileId, extracted)
    setExtracted([])
    alert(locale === 'de' ? 'Keywords gespeichert!' : 'Keywords saved!')
  }

  if (!tender) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-4">
          {[1,2,3,4].map(i => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}
        </div>
      </div>
    )
  }

  const deadline = tender.deadline
    ? new Date(tender.deadline).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB')
    : null

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Back */}
      <Link
        href={`/${locale}/tenders`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← {locale === 'de' ? 'Zurück' : 'Back'}
      </Link>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        {/* Score + platform */}
        <div className="flex items-start gap-4">
          {tender.score !== undefined && tender.score !== null && (
            <ScoreBadge score={tender.score} />
          )}
          <div className="flex-1">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mb-2 inline-block">
              {tender.platform}
            </span>
            <h1 className="text-xl font-bold text-gray-900">{tender.title}</h1>
          </div>
        </div>

        {/* Meta */}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {tender.client && (
            <>
              <dt className="text-gray-500">{t('client')}</dt>
              <dd className="text-gray-900 font-medium">{tender.client}</dd>
            </>
          )}
          {deadline && (
            <>
              <dt className="text-gray-500">{t('deadline')}</dt>
              <dd className="text-gray-900 font-medium">{deadline}</dd>
            </>
          )}
          {tender.publication_date && (
            <>
              <dt className="text-gray-500">{locale === 'de' ? 'Veröffentlicht' : 'Published'}</dt>
              <dd className="text-gray-900">{new Date(tender.publication_date).toLocaleDateString()}</dd>
            </>
          )}
        </dl>

        {/* Summary */}
        {tender.summary && (
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-sm text-blue-800 italic">{tender.summary}</p>
          </div>
        )}

        {/* Description */}
        {tender.description && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {locale === 'de' ? 'Beschreibung' : 'Description'}
            </h3>
            <p className="text-sm text-gray-600 whitespace-pre-line">{tender.description}</p>
          </div>
        )}

        {/* Matched keywords */}
        {tender.matched_keywords && tender.matched_keywords.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('matchedKeywords')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {tender.matched_keywords.map(kw => (
                <span key={kw} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        <div className="flex gap-3 flex-wrap pt-2 border-t border-gray-50">
          {tender.url && (
            <a href={tender.url} target="_blank" rel="noopener noreferrer"
               className="text-sm text-blue-600 hover:underline">
              🔗 {t('openDetails')}
            </a>
          )}
          {tender.pdf_url && (
            <a href={tender.pdf_url} target="_blank" rel="noopener noreferrer"
               className="text-sm text-blue-600 hover:underline">
              📄 {t('openPDF')}
            </a>
          )}
        </div>
      </div>

      {/* Extract Keywords card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">
          🔍 {t('sendBekanntmachung')}
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          {locale === 'de'
            ? 'Extrahiert Keywords aus dieser Ausschreibung für dein aktives Profil.'
            : 'Extracts keywords from this tender for your active profile.'}
        </p>
        <button
          onClick={handleExtract}
          disabled={extracting || !profileId}
          className="text-sm px-4 py-2 rounded-lg text-white font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--navy)' }}
        >
          {extracting ? '...' : t('sendBekanntmachung')}
        </button>

        {extracted.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-700 mb-2">
              {locale === 'de' ? 'Extrahierte Keywords' : 'Extracted Keywords'}:
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {extracted.map(kw => (
                <span key={kw.keyword}
                  className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded">
                  {kw.keyword} <span className="opacity-60">({kw.category})</span>
                </span>
              ))}
            </div>
            <button
              onClick={handleApproveKeywords}
              className="text-sm px-4 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              ✔ {locale === 'de' ? 'Keywords übernehmen' : 'Save Keywords'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
