'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { api, type Profile } from '@/lib/api'

interface ProfileContextType {
  profiles: Profile[]
  activeProfileId: string | undefined
  setActiveProfileId: (id: string) => void
  createProfile: (name: string) => Promise<Profile>
  deleteProfile: (id: string) => Promise<void>
  toggleEmail: (id: string) => Promise<void>
  loading: boolean
  error: string
}

const ProfileContext = createContext<ProfileContextType | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.profiles.list()
      .then(p => {
        setProfiles(p)
        if (p.length > 0) setActiveProfileId(p[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const createProfile = useCallback(async (name: string) => {
    setError('')
    const p = await api.profiles.create({ name })
    setProfiles(prev => [...prev, p])
    if (!activeProfileId) setActiveProfileId(p.id)
    return p
  }, [activeProfileId])

  const deleteProfile = useCallback(async (id: string) => {
    await api.profiles.delete(id)
    setProfiles(prev => {
      const next = prev.filter(p => p.id !== id)
      if (activeProfileId === id) {
        setActiveProfileId(next[0]?.id)
      }
      return next
    })
  }, [activeProfileId])

  const toggleEmail = useCallback(async (id: string) => {
    const res = await api.profiles.toggleEmail(id)
    setProfiles(prev => prev.map(p =>
      p.id === id ? { ...p, daily_email_enabled: res.daily_email_enabled } : p
    ))
  }, [])

  const value = useMemo(() => ({
    profiles,
    activeProfileId,
    setActiveProfileId,
    createProfile,
    deleteProfile,
    toggleEmail,
    loading,
    error,
  }), [profiles, activeProfileId, createProfile, deleteProfile, toggleEmail, loading, error])

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfiles() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles must be used within ProfileProvider')
  return ctx
}
