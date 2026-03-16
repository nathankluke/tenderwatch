'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const locale = useLocale()
  const de = locale === 'de'
  const [email, setEmail] = useState('')
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
    })

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then(r => r.json())
      .then(d => setLastScan(d.last_scrape))
      .catch(() => {})
  }, [])

  const triggerScan = async () => {
    setScanning(true)
    setScanMsg('')
    try {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (res.ok) {
        setScanMsg(de ? 'Scan gestartet! Ergebnisse erscheinen in ~5 Minuten.' : 'Scan started! Results appear in ~5 minutes.')
      } else {
        const err = await res.text()
        setScanMsg(de ? `Fehler beim Starten des Scans: ${err}` : `Failed to start scan: ${err}`)
      }
    } catch {
      setScanMsg(de ? 'Verbindung zum Server fehlgeschlagen.' : 'Could not reach server.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">
        {de ? 'Einstellungen' : 'Settings'}
      </h1>

      {/* Account */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          {de ? 'Konto' : 'Account'}
        </h2>
        <p className="text-sm text-gray-600">
          {de ? 'Angemeldet als' : 'Signed in as'}: <strong>{email}</strong>
        </p>
      </div>

      {/* Manual scan */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {de ? 'Manueller Scan' : 'Manual Scan'}
        </h2>
        <p className="text-xs text-gray-500">
          {de
            ? 'Startet sofort einen Scan aller Plattformen. Normalerweise läuft dies täglich automatisch um 05:30 Uhr.'
            : 'Immediately scans all platforms. This normally runs automatically every day at 05:30.'}
        </p>
        {lastScan && (
          <p className="text-xs text-gray-400">
            {de ? 'Letzter Scan' : 'Last scan'}: {new Date(lastScan).toLocaleString()}
          </p>
        )}
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--navy)' }}
        >
          {scanning ? (de ? 'Scan läuft...' : 'Scanning...') : `▶ ${de ? 'Scan jetzt starten' : 'Start Scan Now'}`}
        </button>
        {scanMsg && <p className="text-sm">{scanMsg}</p>}
      </div>

      {/* Platform info */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          {de ? 'Aktive Plattformen' : 'Active Platforms'}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {['TED Europa', 'Mercell', 'evergabe-online', 'service.bund.de', 'DTVP', 'Subreport ELVIS', 'vergabe24'].map(p => (
            <div key={p} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Cost info */}
      <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
        <h2 className="text-sm font-semibold text-blue-800 mb-2">
          {de ? 'Laufende Kosten' : 'Running Costs'}
        </h2>
        <div className="text-xs text-blue-700 space-y-1">
          <p>Hetzner VPS (CX22): ~4 €/Monat</p>
          <p>Claude API (Haiku): ~2–5 €/Monat</p>
          <p>Supabase Free Tier: 0 €/Monat</p>
          <p>Vercel Hobby: 0 €/Monat</p>
          <p className="font-semibold pt-1">{de ? 'Gesamt' : 'Total'}: ~6–9 €/Monat</p>
        </div>
      </div>
    </div>
  )
}
