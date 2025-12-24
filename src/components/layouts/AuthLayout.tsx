import { Outlet } from 'react-router-dom'

export function AuthLayout() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
            {/* Gradient orbs - decorative background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-500/20 rounded-full blur-[100px]" />
            </div>
            {/* Content */}
            <div className="relative z-10">
                <Outlet />
            </div>
        </div>
    )
}
