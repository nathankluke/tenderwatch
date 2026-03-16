'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useProfiles } from '@/context/ProfileContext'
import LeftPanel from '@/components/dashboard/LeftPanel'
import CenterPanel from '@/components/dashboard/CenterPanel'
import RightPanel from '@/components/dashboard/RightPanel'
import EmailRecipientsModal from '@/components/email/EmailRecipientsModal'
import { api, type DashboardData, type Tender } from '@/lib/api'

export default function DashboardPage() {
  const locale = useLocale()
  const t = useTranslations('dashboard')
  const {
    profiles,
    activeProfileId,
    toggleEmail,
    loading: profilesLoading,
  } = useProfiles()

  const [dashData, setDashData] = useState<DashboardData | null>(null)
  const [dashLoading, setDashLoading] = useState(true)
  const [showEmailModal, setShowEmailModal] = useState(false)

  const activeProfile = profiles.find(p => p.id === activeProfileId)

  // Load dashboard data when profile changes
  useEffect(() => {
    setDashLoading(true)
    api.dashboard.get(activeProfileId)
      .then(d => {
        setDashData(d)
        setDashLoading(false)
      })
      .catch(() => setDashLoading(false))
  }, [activeProfileId])

  const handleStatusChange = (id: string, status: string | null) => {
    if (!dashData) return
    // Move tender between sections based on new status
    setDashData(prev => {
      if (!prev) return prev
      const allTenders = [
        ...prev.working_on,
        ...prev.interested,
        ...(prev.completed || []),
        ...prev.recent_tenders,
      ]
      const tender = allTenders.find(t => t.id === id)
      if (!tender) return prev

      const updated = { ...tender, status: status as Tender['status'] }
      const removeFrom = (arr: Tender[]) => arr.filter(t => t.id !== id)

      return {
        ...prev,
        working_on: status === 'working_on'
          ? [...removeFrom(prev.working_on), updated]
          : removeFrom(prev.working_on),
        interested: status === 'interested'
          ? [...removeFrom(prev.interested), updated]
          : removeFrom(prev.interested),
        completed: (status === 'bid' || status === 'no_bid')
          ? [...removeFrom(prev.completed || []), updated]
          : removeFrom(prev.completed || []),
        recent_tenders: prev.recent_tenders.map(t => t.id === id ? updated : t),
      }
    })
  }

  const lastScan = dashData?.last_scrape_at
    ? new Date(dashData.last_scrape_at).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB')
    : null

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">{locale === 'de' ? 'Laden...' : 'Loading...'}</p>
      </div>
    )
  }

  if (profiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-1">
            {locale === 'de'
              ? 'Erstelle dein erstes Profil in der Seitenleiste'
              : 'Create your first profile in the sidebar'}
          </p>
          <p className="text-gray-400 text-xs">
            {locale === 'de'
              ? 'Klicke auf + neben "Profile"'
              : 'Click + next to "Profiles"'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* Header bar: profile info + email controls */}
      {activeProfile && (
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900">{activeProfile.name}</h1>
          {lastScan && (
            <span className="text-xs text-gray-400 ml-2">
              {t('lastScan')}: {lastScan}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => toggleEmail(activeProfile.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium
                ${activeProfile.daily_email_enabled
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
            >
              {locale === 'de' ? 'E-Mail-Report' : 'Email Digest'}
              {activeProfile.daily_email_enabled && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              )}
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium"
            >
              {locale === 'de' ? 'Verteiler' : 'Recipients'}
            </button>
          </div>
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Working On + Interested + Completed */}
        <div className="w-1/4 min-w-56 hidden lg:flex flex-col">
          <LeftPanel
            workingOn={dashData?.working_on ?? []}
            interested={dashData?.interested ?? []}
            completed={dashData?.completed ?? []}
            profileId={activeProfileId}
            loading={dashLoading}
            onStatusChange={handleStatusChange}
          />
        </div>

        {/* Center: Search results */}
        <div className="flex-1 min-w-0 flex flex-col">
          <CenterPanel profileId={activeProfileId} />
        </div>

        {/* Right: PDF upload + Keywords */}
        <div className="w-1/4 min-w-56 hidden lg:flex flex-col">
          <RightPanel profileId={activeProfileId} />
        </div>
      </div>

      {/* Mobile: show panels stacked */}
      <div className="lg:hidden mt-4 space-y-4 overflow-y-auto">
        <RightPanel profileId={activeProfileId} />
        <LeftPanel
          workingOn={dashData?.working_on ?? []}
          interested={dashData?.interested ?? []}
          completed={dashData?.completed ?? []}
          profileId={activeProfileId}
          loading={dashLoading}
          onStatusChange={handleStatusChange}
        />
      </div>

      {/* Email Recipients Modal */}
      {activeProfileId && (
        <EmailRecipientsModal
          profileId={activeProfileId}
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  )
}
