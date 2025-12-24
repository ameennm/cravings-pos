import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
    Menu,
    ShoppingCart,
    ChefHat,
    Package,
    ClipboardCheck,
    BarChart3,
    Settings,
    LogOut,
    Receipt,
    AlertTriangle,
    User,
    UtensilsCrossed,
    Warehouse,
    X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'
import { cn, isPast10AM, getYesterdayDate } from '@/lib/utils'
import { Button, ScrollArea, Badge } from '@/components/ui'
import { useRealtimeSync } from '@/lib/realtimeHooks'


// Navigation items by role
const allNavItems = [
    // Cashier items
    { path: '/pos', label: 'POS / Billing', icon: ShoppingCart, roles: ['admin', 'cashier'] },
    { path: '/orders', label: 'Orders', icon: Receipt, roles: ['admin', 'cashier'] },

    // Chef items
    { path: '/kitchen', label: 'Kitchen Display', icon: ChefHat, roles: ['admin', 'chef'] },
    { path: '/inventory', label: 'Inventory Check', icon: Package, roles: ['admin', 'chef'] },
    { path: '/stock', label: 'Stock Management', icon: Warehouse, roles: ['admin', 'chef'] },
    { path: '/daily-closing', label: 'Daily Closing', icon: ClipboardCheck, roles: ['admin', 'chef'] },

    // Admin only
    { path: '/menu-management', label: 'Menu Management', icon: UtensilsCrossed, roles: ['admin'] },
    { path: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin'] },
    { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
]

export function DashboardLayout() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, setUser } = useAuthStore()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const [showClosingWarning, setShowClosingWarning] = useState(false)

    // Enable realtime sync for all users - Kitchen and Billing collaborate live!
    useRealtimeSync(!!user)


    // Track screen size for responsive behavior
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
            // On desktop, keep sidebar open by default
            if (window.innerWidth >= 768) {
                setSidebarOpen(true)
            }
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Close sidebar on route change (mobile only)
    useEffect(() => {
        if (isMobile) {
            setSidebarOpen(false)
        }
    }, [location.pathname, isMobile])

    // Filter navigation items based on user role
    const navItems = allNavItems.filter(
        (item) => user?.role && item.roles.includes(user.role)
    )



    // Check for daily closing warning (for chefs) - uses local DB
    useEffect(() => {
        const checkClosingStatus = async () => {
            if (user?.role !== 'chef' && user?.role !== 'admin') return
            if (!isPast10AM()) return

            try {
                // Use dynamic import to avoid circular deps
                const { db } = await import('@/lib/offlineDatabase')
                const yesterday = getYesterdayDate()
                const existingClosing = await db.dailyClosings
                    .where('closing_date')
                    .equals(yesterday)
                    .first()

                setShowClosingWarning(!existingClosing)
            } catch (error) {
                console.error('Error checking daily closing:', error)
            }
        }

        checkClosingStatus()
    }, [user])


    const handleLogout = async () => {
        try {
            await supabase.auth.signOut()
        } catch (error) {
            console.error('Logout error:', error)
        } finally {
            // Always clear local state and navigate, even if network fails
            setUser(null)
            localStorage.clear() // Clear any persisted state
            navigate('/login')
        }
    }

    // Get role display name
    const getRoleDisplayName = (role: string) => {
        switch (role) {
            case 'admin': return 'Administrator'
            case 'chef': return 'Kitchen Staff'
            case 'cashier': return 'Billing Staff'
            default: return role
        }
    }

    // Get role color
    const getRoleBadgeVariant = (role: string) => {
        switch (role) {
            case 'admin': return 'default'
            case 'chef': return 'warning'
            case 'cashier': return 'secondary'
            default: return 'outline'
        }
    }

    return (
        <div className="flex h-screen bg-background">
            {/* Mobile overlay */}
            {isMobile && sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    'flex flex-col border-r border-border bg-card transition-all duration-300 z-50',
                    // Mobile: fixed position, slide in from left
                    isMobile ? 'fixed h-full' : 'relative',
                    isMobile && !sidebarOpen && '-translate-x-full',
                    isMobile && sidebarOpen && 'translate-x-0',
                    // Desktop: always visible, can be collapsed
                    !isMobile && (sidebarOpen ? 'w-64' : 'w-16'),
                    // Mobile: full width when open
                    isMobile && 'w-72'
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    {(sidebarOpen || isMobile) && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center">
                                <ChefHat className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-bold text-lg">Kitchen POS</span>
                        </div>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="flex-shrink-0"
                    >
                        {isMobile && sidebarOpen ? (
                            <X className="w-5 h-5" />
                        ) : (
                            <Menu className="w-5 h-5" />
                        )}
                    </Button>
                </div>

                {/* User info */}
                {(sidebarOpen || isMobile) && user && (
                    <div className="p-4 border-b border-border">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <User className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{user.full_name}</p>
                                <Badge variant={getRoleBadgeVariant(user.role) as any} className="text-xs mt-1">
                                    {getRoleDisplayName(user.role)}
                                </Badge>
                            </div>
                        </div>
                    </div>
                )}

                {/* Daily Closing Warning */}
                {showClosingWarning && (sidebarOpen || isMobile) && (
                    <div className="m-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                        <div className="flex items-start gap-2 text-destructive">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <p className="font-semibold">Daily Closing Pending!</p>
                                <p className="opacity-80 mt-0.5">
                                    Yesterday's closing is not submitted.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <ScrollArea className="flex-1 py-2">
                    <nav className="space-y-1 px-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    cn(
                                        'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200',
                                        'hover:bg-muted active:scale-[0.98]',
                                        isActive
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-muted-foreground',
                                        !sidebarOpen && !isMobile && 'justify-center'
                                    )
                                }
                            >
                                <item.icon className="w-5 h-5 flex-shrink-0" />
                                {(sidebarOpen || isMobile) && <span>{item.label}</span>}
                            </NavLink>
                        ))}
                    </nav>
                </ScrollArea>

                {/* Logout */}
                <div className="p-2 border-t border-border">
                    <Button
                        variant="ghost"
                        className={cn(
                            'w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 py-3',
                            (sidebarOpen || isMobile) ? 'justify-start' : 'justify-center'
                        )}
                        onClick={handleLogout}
                    >
                        <LogOut className="w-5 h-5" />
                        {(sidebarOpen || isMobile) && <span className="ml-3">Logout</span>}
                    </Button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Mobile header */}
                {isMobile && (
                    <header className="flex items-center justify-between p-4 border-b border-border bg-card">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <Menu className="w-5 h-5" />
                        </Button>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center">
                                <ChefHat className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-bold">Kitchen POS</span>
                        </div>
                        <div className="w-10" /> {/* Spacer for centering */}
                    </header>
                )}

                <div className="flex-1 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
