import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Format currency in Indian Rupees
 */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
    }).format(amount)
}

/**
 * Format date to locale string
 */
export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

/**
 * Format time to locale string
 */
export function formatTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * Format date and time
 */
export function formatDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return `${formatDate(d)} ${formatTime(d)}`
}

/**
 * Calculate GST amount
 */
export function calculateGST(amount: number, gstPercentage: number): number {
    return (amount * gstPercentage) / 100
}

/**
 * Calculate total with GST
 */
export function calculateTotalWithGST(
    amount: number,
    gstPercentage: number
): { subtotal: number; gst: number; total: number } {
    const gst = calculateGST(amount, gstPercentage)
    return {
        subtotal: amount,
        gst,
        total: amount + gst,
    }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
    }
}

/**
 * Check if current time is past 10 AM
 */
export function isPast10AM(date: Date = new Date()): boolean {
    return date.getHours() >= 10
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
    return new Date().toISOString().split('T')[0]
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayDate(): string {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().split('T')[0]
}

/**
 * Generate order number display
 */
export function formatOrderNumber(orderNumber: number): string {
    return `#${String(orderNumber).padStart(4, '0')}`
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 3) + '...'
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce(
        (result, item) => {
            const groupKey = String(item[key])
            if (!result[groupKey]) {
                result[groupKey] = []
            }
            result[groupKey].push(item)
            return result
        },
        {} as Record<string, T[]>
    )
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
