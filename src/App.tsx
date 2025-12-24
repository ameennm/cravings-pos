import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase, subscribeToNetworkStatus } from '@/lib/supabase'
import { useAuthStore } from '@/store'
import { useInitializeLocalDb, useSyncStatus } from '@/lib/offlineHooks'
import { setupAutoSync, performFullSync } from '@/lib/syncService'

// Layouts
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { DashboardLayout } from '@/components/layouts/DashboardLayout'

// Pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { POSPage } from '@/pages/pos/POSPage'
import { KitchenPage } from '@/pages/kitchen/KitchenPage'
import { InventoryPage } from '@/pages/kitchen/InventoryPage'
import { DailyClosingPage } from '@/pages/kitchen/DailyClosingPage'
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { MenuManagementPage } from '@/pages/settings/MenuManagementPage'
import { StockManagementPage } from '@/pages/settings/StockManagementPage'

// Loading component
function LoadingScreen() {
    return (
        <div className="h-screen w-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground animate-pulse">Loading Kitchen POS...</p>
            </div>
        </div>
    )
}

// Offline banner with sync info
function OfflineBanner({ pendingCount }: { pendingCount: number }) {
    return (
        <div className="fixed top-0 left-0 right-0 bg-warning text-warning-foreground text-center py-2 text-sm font-medium z-50">
            ⚠️ Offline Mode - {pendingCount > 0 ? `${pendingCount} items pending sync` : 'All data saved locally'}
        </div>
    )
}

function App() {
    const { user, isLoading, setUser, setLoading } = useAuthStore()
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const initialized = useRef(false)
    const syncInitialized = useRef(false)

    // Initialize local database and sync
    const { isInitialized: dbInitialized } = useInitializeLocalDb()
    const syncStatus = useSyncStatus()

    // Initialize auth ONCE on mount
    useEffect(() => {
        if (initialized.current) return
        initialized.current = true

        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()

                if (session?.user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single()

                    if (profile) {
                        setUser(profile)
                    } else {
                        setUser(null)
                    }
                } else {
                    setUser(null)
                }
            } catch (error) {
                console.error('Auth init error:', error)
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        initAuth()

        // Set up auth listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event)

                if (event === 'SIGNED_IN' && session?.user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single()

                    if (profile) {
                        setUser(profile)
                    }
                } else if (event === 'SIGNED_OUT') {
                    setUser(null)
                }
            }
        )

        return () => {
            subscription.unsubscribe()
        }
    }, []) // Empty dependency array - run only once

    // Setup auto-sync when user is logged in
    useEffect(() => {
        if (user && dbInitialized && !syncInitialized.current) {
            syncInitialized.current = true
            const cleanup = setupAutoSync()
            return cleanup
        }
    }, [user, dbInitialized])

    // Network status listener
    useEffect(() => {
        const unsubscribe = subscribeToNetworkStatus(
            () => setIsOnline(true),
            () => setIsOnline(false)
        )
        return unsubscribe
    }, [])

    if (isLoading) {
        return <LoadingScreen />
    }

    return (
        <>
            {!isOnline && <OfflineBanner pendingCount={syncStatus.pendingCount} />}
            <Toaster
                position="top-right"
                toastOptions={{
                    className: 'bg-card text-card-foreground border border-border',
                    duration: 4000,
                    style: {
                        background: 'hsl(var(--card))',
                        color: 'hsl(var(--card-foreground))',
                        border: '1px solid hsl(var(--border))',
                    },
                }}
            />
            <Routes>
                {/* Auth routes */}
                <Route element={<AuthLayout />}>
                    <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
                </Route>

                {/* Protected routes */}
                <Route element={user ? <DashboardLayout /> : <Navigate to="/login" replace />}>
                    <Route path="/" element={user?.role === 'chef' ? <Navigate to="/kitchen" replace /> : <Navigate to="/pos" replace />} />
                    <Route path="/pos" element={user?.role === 'chef' ? <Navigate to="/kitchen" replace /> : <POSPage />} />
                    <Route path="/orders" element={user?.role === 'chef' ? <Navigate to="/kitchen" replace /> : <OrdersPage />} />
                    <Route path="/kitchen" element={<KitchenPage />} />
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/stock" element={<StockManagementPage />} />
                    <Route path="/daily-closing" element={<DailyClosingPage />} />
                    <Route path="/analytics" element={user?.role === 'chef' ? <Navigate to="/kitchen" replace /> : <AnalyticsPage />} />
                    <Route path="/menu-management" element={user?.role === 'chef' ? <Navigate to="/kitchen" replace /> : <MenuManagementPage />} />
                    <Route path="/settings" element={user?.role === 'chef' ? <Navigate to="/kitchen" replace /> : <SettingsPage />} />
                </Route>

                {/* Catch all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    )
}

export default App
