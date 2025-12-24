/**
 * Offline Status Bar Component
 * Shows online/offline status, pending sync count, and refresh button
 * Add this to all pages for consistent offline-first UX
 */

import { useState } from 'react'
import { RefreshCw, Wifi, WifiOff, CloudOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSyncStatus } from '@/lib/offlineHooks'
import { performFullSync } from '@/lib/syncService'
import { cn } from '@/lib/utils'
import { Button, Badge } from '@/components/ui'

interface OfflineStatusBarProps {
    className?: string
    showLastSync?: boolean
}

export function OfflineStatusBar({ className, showLastSync = false }: OfflineStatusBarProps) {
    const [isSyncing, setIsSyncing] = useState(false)
    const syncStatus = useSyncStatus()

    const handleSync = async () => {
        if (!syncStatus.isOnline) {
            toast.error('Cannot sync while offline')
            return
        }

        setIsSyncing(true)
        try {
            await performFullSync()
            toast.success('Synced successfully!')
        } catch (error) {
            console.error('Sync failed:', error)
            toast.error('Sync failed')
        } finally {
            setIsSyncing(false)
        }
    }

    return (
        <div className={cn('flex items-center gap-2', className)}>
            {/* Online/Offline Status */}
            {syncStatus.isOnline ? (
                <Badge variant="success" className="text-xs gap-1">
                    <Wifi className="w-3 h-3" />
                    Online
                </Badge>
            ) : (
                <Badge variant="destructive" className="text-xs gap-1">
                    <WifiOff className="w-3 h-3" />
                    Offline
                </Badge>
            )}

            {/* Pending Sync Count */}
            {syncStatus.pendingCount > 0 && (
                <Badge variant="warning" className="text-xs gap-1">
                    <CloudOff className="w-3 h-3" />
                    {syncStatus.pendingCount} pending
                </Badge>
            )}

            {/* Last Sync Time */}
            {showLastSync && syncStatus.lastSync && (
                <span className="text-xs text-muted-foreground">
                    Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}
                </span>
            )}

            {/* Sync Button */}
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleSync}
                disabled={isSyncing || !syncStatus.isOnline}
                title={syncStatus.isOnline ? 'Sync with cloud' : 'Cannot sync while offline'}
            >
                <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
            </Button>
        </div>
    )
}

/**
 * Page Header Component with built-in offline status
 * Use this for consistent headers across the app
 */
interface PageHeaderProps {
    title: string
    description?: string
    icon?: React.ReactNode
    actions?: React.ReactNode
    showOfflineStatus?: boolean
}

export function PageHeader({
    title,
    description,
    icon,
    actions,
    showOfflineStatus = true
}: PageHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    {icon}
                    {title}
                </h1>
                {description && (
                    <p className="text-muted-foreground">{description}</p>
                )}
            </div>
            <div className="flex items-center gap-4">
                {showOfflineStatus && <OfflineStatusBar />}
                {actions}
            </div>
        </div>
    )
}
