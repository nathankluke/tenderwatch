'use client'

import { useEffect, useState, useRef } from 'react'
import { useLocale } from 'next-intl'
import { api, type EmailRecipient } from '@/lib/api'

export default function EmailRecipientsModal({
  profileId,
  isOpen,
  onClose,
}: {
  profileId: string
  isOpen: boolean
  onClose: () => void
}) {
  const locale = useLocale()
  const [recipients, setRecipients] = useState<EmailRecipient[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    api.emailRecipients.list(profileId)
      .then(data => {
        setRecipients(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [isOpen, profileId])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const addRecipient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    setError('')

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setError(locale === 'de' ? 'Ungültige E-Mail-Adresse' : 'Invalid email address')
      return
    }

    try {
      const r = await api.emailRecipients.add(profileId, {
        email: newEmail.trim(),
        name: newName.trim() || undefined,
      })
      setRecipients(prev => [...prev, r])
      setNewEmail('')
      setNewName('')
    } catch (e: any) {
      if (e.message.includes('409')) {
        setError(locale === 'de' ? 'E-Mail bereits vorhanden' : 'Email already exists')
      } else {
        setError(e.message)
      }
    }
  }

  const removeRecipient = async (recipientId: string) => {
    try {
      await api.emailRecipients.delete(profileId, recipientId)
      setRecipients(prev => prev.filter(r => r.id !== recipientId))
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {locale === 'de' ? 'E-Mail-Verteiler' : 'Email Recipients'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Add form */}
          <form onSubmit={addRecipient} className="space-y-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder={locale === 'de' ? 'E-Mail-Adresse' : 'Email address'}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white rounded-lg"
                style={{ background: 'var(--navy)' }}
              >
                +
              </button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={locale === 'de' ? 'Name (optional)' : 'Name (optional)'}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          {/* Recipients list */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">
              {locale === 'de'
                ? 'Noch keine Empfänger. Füge E-Mail-Adressen hinzu.'
                : 'No recipients yet. Add email addresses above.'}
            </p>
          ) : (
            <div className="space-y-1">
              {recipients.map(r => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-gray-900">{r.email}</p>
                    {r.name && (
                      <p className="text-xs text-gray-500">{r.name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeRecipient(r.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors px-2"
                  >
                    {locale === 'de' ? 'Entfernen' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400">
            {locale === 'de'
              ? 'Diese Adressen erhalten den täglichen E-Mail-Report wenn aktiviert.'
              : 'These addresses will receive the daily email digest when enabled.'}
          </p>
        </div>
      </div>
    </div>
  )
}
