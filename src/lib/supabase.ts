import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug logging
console.log('Supabase Config Check:', {
    hasUrl: !!supabaseUrl,
    urlLength: supabaseUrl?.length || 0,
    hasKey: !!supabaseAnonKey,
    mode: import.meta.env.MODE,
    allKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
})

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Check your .env file or Vercel settings.')
}

// Create Supabase client - simple configuration for free tier
// Fallback to placeholder to prevent crash on load (requests will fail gracefully)
// TEMPORARY FIX: Hardcoded credentials to bypass Vercel Env Var issues
const validUrl = 'https://ihztawjrucezsnribabh.supabase.co'
const validKey = 'sb_publishable_iDcLvNOdEuW6358KidZyZA_mY5wI51T'

export const supabase = createClient<Database>(validUrl, validKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
})

// Helper to check if we're online
export const isOnline = () => navigator.onLine

// Subscribe to online/offline events
export const subscribeToNetworkStatus = (
    onOnline: () => void,
    onOffline: () => void
) => {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
    }
}
