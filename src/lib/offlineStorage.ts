/**
 * Offline Storage Service
 * Provides local caching for data to reduce Supabase API calls
 */

const CACHE_PREFIX = 'kitchen-pos-cache-'
const CACHE_EXPIRY_PREFIX = 'kitchen-pos-expiry-'

// Cache durations in milliseconds
const CACHE_DURATIONS = {
    menuItems: 60 * 60 * 1000,        // 1 hour - menu rarely changes
    inventoryItems: 15 * 60 * 1000,   // 15 minutes
    orders: 5 * 60 * 1000,            // 5 minutes
    profiles: 30 * 60 * 1000,         // 30 minutes
    closingLogs: 60 * 60 * 1000,      // 1 hour
    default: 10 * 60 * 1000,          // 10 minutes default
}

type CacheKey = keyof typeof CACHE_DURATIONS | string

/**
 * Set data in cache with expiry
 */
export function setCache<T>(key: CacheKey, data: T): void {
    try {
        const cacheKey = CACHE_PREFIX + key
        const expiryKey = CACHE_EXPIRY_PREFIX + key
        const duration = CACHE_DURATIONS[key as keyof typeof CACHE_DURATIONS] || CACHE_DURATIONS.default
        const expiry = Date.now() + duration

        localStorage.setItem(cacheKey, JSON.stringify(data))
        localStorage.setItem(expiryKey, expiry.toString())
    } catch (error) {
        console.warn('Failed to cache data:', error)
        // Storage might be full, try to clear old data
        clearExpiredCache()
    }
}

/**
 * Get data from cache if not expired
 */
export function getCache<T>(key: CacheKey): T | null {
    try {
        const cacheKey = CACHE_PREFIX + key
        const expiryKey = CACHE_EXPIRY_PREFIX + key

        const expiryStr = localStorage.getItem(expiryKey)
        if (!expiryStr) return null

        const expiry = parseInt(expiryStr, 10)
        if (Date.now() > expiry) {
            // Cache expired, remove it
            localStorage.removeItem(cacheKey)
            localStorage.removeItem(expiryKey)
            return null
        }

        const dataStr = localStorage.getItem(cacheKey)
        if (!dataStr) return null

        return JSON.parse(dataStr) as T
    } catch (error) {
        console.warn('Failed to get cached data:', error)
        return null
    }
}

/**
 * Check if cache is still valid
 */
export function isCacheValid(key: CacheKey): boolean {
    try {
        const expiryKey = CACHE_EXPIRY_PREFIX + key
        const expiryStr = localStorage.getItem(expiryKey)
        if (!expiryStr) return false

        const expiry = parseInt(expiryStr, 10)
        return Date.now() < expiry
    } catch {
        return false
    }
}

/**
 * Invalidate specific cache
 */
export function invalidateCache(key: CacheKey): void {
    try {
        localStorage.removeItem(CACHE_PREFIX + key)
        localStorage.removeItem(CACHE_EXPIRY_PREFIX + key)
    } catch (error) {
        console.warn('Failed to invalidate cache:', error)
    }
}

/**
 * Clear all expired caches
 */
export function clearExpiredCache(): void {
    try {
        const keysToRemove: string[] = []

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(CACHE_EXPIRY_PREFIX)) {
                const expiry = parseInt(localStorage.getItem(key) || '0', 10)
                if (Date.now() > expiry) {
                    const cacheKey = key.replace(CACHE_EXPIRY_PREFIX, CACHE_PREFIX)
                    keysToRemove.push(key, cacheKey)
                }
            }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key))
    } catch (error) {
        console.warn('Failed to clear expired cache:', error)
    }
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
    try {
        const keysToRemove: string[] = []

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(CACHE_PREFIX) || key?.startsWith(CACHE_EXPIRY_PREFIX)) {
                keysToRemove.push(key)
            }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key))
    } catch (error) {
        console.warn('Failed to clear all cache:', error)
    }
}

/**
 * Get cache age in seconds
 */
export function getCacheAge(key: CacheKey): number | null {
    try {
        const expiryKey = CACHE_EXPIRY_PREFIX + key
        const expiryStr = localStorage.getItem(expiryKey)
        if (!expiryStr) return null

        const expiry = parseInt(expiryStr, 10)
        const duration = CACHE_DURATIONS[key as keyof typeof CACHE_DURATIONS] || CACHE_DURATIONS.default
        const createdAt = expiry - duration

        return Math.floor((Date.now() - createdAt) / 1000)
    } catch {
        return null
    }
}

/**
 * Force refresh cache with new data
 */
export function refreshCache<T>(key: CacheKey, data: T): void {
    invalidateCache(key)
    setCache(key, data)
}

// Queue for offline operations
interface PendingOperation {
    id: string
    type: 'insert' | 'update' | 'delete'
    table: string
    data: any
    timestamp: number
}

const PENDING_QUEUE_KEY = 'kitchen-pos-pending-operations'

/**
 * Add operation to pending queue (for offline mode)
 */
export function addPendingOperation(operation: Omit<PendingOperation, 'id' | 'timestamp'>): void {
    try {
        const queue = getPendingOperations()
        const newOp: PendingOperation = {
            ...operation,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
        }
        queue.push(newOp)
        localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue))
    } catch (error) {
        console.error('Failed to add pending operation:', error)
    }
}

/**
 * Get all pending operations
 */
export function getPendingOperations(): PendingOperation[] {
    try {
        const data = localStorage.getItem(PENDING_QUEUE_KEY)
        return data ? JSON.parse(data) : []
    } catch {
        return []
    }
}

/**
 * Remove operation from pending queue
 */
export function removePendingOperation(id: string): void {
    try {
        const queue = getPendingOperations()
        const filtered = queue.filter((op) => op.id !== id)
        localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(filtered))
    } catch (error) {
        console.error('Failed to remove pending operation:', error)
    }
}

/**
 * Clear all pending operations
 */
export function clearPendingOperations(): void {
    try {
        localStorage.removeItem(PENDING_QUEUE_KEY)
    } catch (error) {
        console.error('Failed to clear pending operations:', error)
    }
}

/**
 * Get count of pending operations
 */
export function getPendingCount(): number {
    return getPendingOperations().length
}
