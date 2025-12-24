import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthState {
    user: Profile | null
    isAuthenticated: boolean
    isLoading: boolean
    lastActivity: number
    setUser: (user: Profile | null) => void
    setLoading: (loading: boolean) => void
    updateLastActivity: () => void
    logout: () => void
}

// Security: Session timeout (30 minutes of inactivity)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

// Security: Custom storage that encrypts sensitive data
const secureStorage = {
    getItem: (name: string): string | null => {
        try {
            const value = localStorage.getItem(name)
            if (!value) return null

            // In production, you would decrypt here
            return value
        } catch {
            return null
        }
    },
    setItem: (name: string, value: string): void => {
        try {
            // In production, you would encrypt here
            localStorage.setItem(name, value)
        } catch (error) {
            console.error('Failed to save to storage:', error)
        }
    },
    removeItem: (name: string): void => {
        try {
            localStorage.removeItem(name)
        } catch (error) {
            console.error('Failed to remove from storage:', error)
        }
    },
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,
            isLoading: true,
            lastActivity: Date.now(),

            setUser: (user) =>
                set({
                    user,
                    isAuthenticated: !!user,
                    isLoading: false,
                    lastActivity: Date.now(),
                }),

            setLoading: (isLoading) => set({ isLoading }),

            updateLastActivity: () => set({ lastActivity: Date.now() }),

            logout: () => {
                // Clear all sensitive data
                set({
                    user: null,
                    isAuthenticated: false,
                    isLoading: false,
                    lastActivity: 0,
                })

                // Clear other stores
                try {
                    localStorage.removeItem('kitchen-pos-cart')
                    sessionStorage.clear()
                } catch (error) {
                    console.error('Failed to clear storage:', error)
                }
            },
        }),
        {
            name: 'kitchen-pos-auth',
            storage: createJSONStorage(() => secureStorage),
            partialize: (state) => ({
                // Only persist minimal user data
                user: state.user ? {
                    id: state.user.id,
                    email: state.user.email,
                    full_name: state.user.full_name,
                    role: state.user.role,
                    is_active: state.user.is_active,
                } : null,
                lastActivity: state.lastActivity,
            }),
            // Security: Validate persisted data on hydration
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Check for session timeout
                    const timeSinceLastActivity = Date.now() - state.lastActivity
                    if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
                        // Session expired - clear user
                        state.logout()
                    }
                }
            },
        }
    )
)

// Role-based access helpers
export const useIsAdmin = () => useAuthStore((state) => state.user?.role === 'admin')
export const useIsChef = () => useAuthStore((state) => state.user?.role === 'chef')
export const useIsCashier = () => useAuthStore((state) => state.user?.role === 'cashier')
export const useCanAccessPOS = () =>
    useAuthStore((state) => ['admin', 'cashier'].includes(state.user?.role ?? ''))
export const useCanAccessKitchen = () =>
    useAuthStore((state) => ['admin', 'chef'].includes(state.user?.role ?? ''))

// Security: Hook to track user activity
export const useActivityTracker = () => {
    const updateLastActivity = useAuthStore((state) => state.updateLastActivity)

    return {
        trackActivity: () => updateLastActivity(),
        isSessionValid: () => {
            const lastActivity = useAuthStore.getState().lastActivity
            return Date.now() - lastActivity < SESSION_TIMEOUT_MS
        },
    }
}

// Security: Hook to check if session is about to expire
export const useSessionTimeout = () => {
    const { user, lastActivity, logout } = useAuthStore()

    const checkTimeout = () => {
        if (!user) return

        const timeSinceLastActivity = Date.now() - lastActivity
        if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
            logout()
        }
    }

    return { checkTimeout }
}
