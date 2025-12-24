import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Check your .env file.')
}

// Create Supabase client - simple configuration for free tier
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
