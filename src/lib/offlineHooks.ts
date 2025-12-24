/**
 * Offline-First React Hooks
 * All data operations go through local IndexedDB first
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    db,
    LocalMenuItem,
    LocalInventoryItem,
    LocalOrder,
    LocalOrderItem,
    LocalDailyClosing,
    LocalStockVerification,
    getUnsyncedCount,
} from './offlineDatabase'
import { createOrderOffline, performFullSync } from './syncService'
import { supabase } from './supabase'
import { useEffect, useState } from 'react'

// ============================================
// MENU ITEMS - From Local DB
// ============================================

export function useLocalMenuItems() {
    const menuItems = useLiveQuery(
        async () => {
            // Get all menu items and filter in JS (boolean indexing issues)
            const items = await db.menuItems.toArray()
            return items.filter(item => !!item.is_available)
        },
        [],
        []
    )

    return {
        data: menuItems || [],
        isLoading: menuItems === undefined,
    }
}

// ============================================
// INVENTORY ITEMS - From Local DB
// ============================================

export function useLocalInventoryItems() {
    const inventoryItems = useLiveQuery(
        async () => {
            const items = await db.inventoryItems.toArray()
            return items.filter(item => !!item.is_active)
        },
        [],
        []
    )

    return {
        data: inventoryItems || [],
        isLoading: inventoryItems === undefined,
    }
}

// Update inventory stock locally
export function useUpdateInventoryStock() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            itemId,
            newStock,
            transactionType,
            notes,
        }: {
            itemId: string
            newStock: number
            transactionType: string
            notes?: string
        }) => {
            // Get current item
            const item = await db.inventoryItems.get(itemId)
            if (!item) throw new Error('Item not found')

            // Update stock
            await db.inventoryItems.update(itemId, {
                current_stock: newStock,
                synced: false,
                updated_at: new Date().toISOString(),
            })

            // Add transaction log
            await db.inventoryTransactions.add({
                id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                inventory_item_id: itemId,
                transaction_type: transactionType,
                quantity: newStock - item.current_stock,
                previous_stock: item.current_stock,
                new_stock: newStock,
                notes,
                created_at: new Date().toISOString(),
                synced: false,
            })

            return { itemId, newStock }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
            // Sync if online
            if (navigator.onLine) {
                performFullSync()
            }
        },
    })
}

// ============================================
// ORDERS - From Local DB
// ============================================

export function useLocalOrders(status?: string) {
    const orders = useLiveQuery(
        async () => {
            let query = db.orders.orderBy('created_at').reverse()

            if (status && status !== 'all') {
                return db.orders
                    .where('status')
                    .equals(status)
                    .reverse()
                    .sortBy('created_at')
            }

            return query.toArray()
        },
        [status],
        []
    )

    return {
        data: orders || [],
        isLoading: orders === undefined,
    }
}

// Get single order with items
export function useLocalOrder(orderId: string) {
    const order = useLiveQuery(
        () => db.orders.get(orderId),
        [orderId]
    )

    const items = useLiveQuery(
        () => db.orderItems.where('order_id').equals(orderId).toArray(),
        [orderId],
        []
    )

    return {
        order,
        items: items || [],
        isLoading: order === undefined,
    }
}

// Kitchen orders (pending + preparing)
export function useLocalKitchenOrders() {
    const orders = useLiveQuery(
        async () => {
            const pendingOrders = await db.orders
                .where('status')
                .equals('pending')
                .toArray()

            const preparingOrders = await db.orders
                .where('status')
                .equals('preparing')
                .toArray()

            const allOrders = [...pendingOrders, ...preparingOrders]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            // Get items for each order
            const ordersWithItems = await Promise.all(
                allOrders.map(async (order) => {
                    const items = await db.orderItems
                        .where('order_id')
                        .equals(order.id)
                        .toArray()

                    // Get menu item names
                    const itemsWithNames = await Promise.all(
                        items.map(async (item) => {
                            const menuItem = await db.menuItems.get(item.menu_item_id)
                            return {
                                ...item,
                                menu_item_name: menuItem?.name || 'Unknown Item',
                                is_veg: menuItem?.is_veg || false,
                            }
                        })
                    )

                    return {
                        ...order,
                        order_items: itemsWithNames,
                    }
                })
            )

            return ordersWithItems
        },
        [],
        []
    )

    return {
        data: orders || [],
        isLoading: orders === undefined,
    }
}

// ============================================
// CREATE ORDER - Offline First
// ============================================

export function useCreateLocalOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            order,
            items,
        }: {
            order: {
                customer_name?: string
                table_number?: string
                bill_type: 'tax_invoice' | 'estimate'
                subtotal: number
                tax_amount: number
                discount_amount: number
                total_amount: number
                payment_method?: string
                created_by?: string
            }
            items: {
                menu_item_id: string
                menu_item_name: string
                quantity: number
                unit_price: number
                gst_percentage: number
                gst_amount: number
                total_price: number
                notes?: string
            }[]
        }) => {
            // Create order in local DB (works offline!)
            const newOrder = await createOrderOffline(
                {
                    ...order,
                    status: 'pending',
                },
                items
            )

            return newOrder
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
        },
    })
}

// ============================================
// UPDATE ORDER STATUS - Offline First
// ============================================

export function useUpdateOrderStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
            // Update local DB
            await db.orders.update(orderId, {
                status: status as LocalOrder['status'],
                synced: false,
                updated_at: new Date().toISOString(),
            })

            // Only sync to Supabase if:
            // 1. We're online
            // 2. The order ID is NOT an offline-generated ID (starts with "offline_")
            const isOfflineId = orderId.startsWith('offline_')

            if (navigator.onLine && !isOfflineId) {
                try {
                    await supabase
                        .from('orders')
                        .update({ status, updated_at: new Date().toISOString() } as any)
                        .eq('id', orderId)

                    await db.orders.update(orderId, { synced: true })
                } catch (error) {
                    console.error('Failed to sync order status:', error)
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
        },
    })
}

// ============================================
// DAILY CLOSINGS - From Local DB
// ============================================

export function useLocalDailyClosings() {
    const closings = useLiveQuery(
        () => db.dailyClosings.orderBy('closing_date').reverse().limit(30).toArray(),
        [],
        []
    )

    return {
        data: closings || [],
        isLoading: closings === undefined,
    }
}

export function useLocalDailyClosing(date: string) {
    const closing = useLiveQuery(
        () => db.dailyClosings.where('closing_date').equals(date).first(),
        [date]
    )

    return {
        data: closing,
        isLoading: closing === undefined,
    }
}

// Get daily closing with stock verifications
export function useLocalDailyClosingWithVerifications(date: string) {
    const result = useLiveQuery(
        async () => {
            const closing = await db.dailyClosings.where('closing_date').equals(date).first()
            if (!closing) return null

            const verifications = await db.stockVerifications
                .where('daily_closing_id')
                .equals(closing.id)
                .toArray()

            return {
                ...closing,
                stock_verifications: verifications,
            }
        },
        [date]
    )

    return {
        data: result,
        isLoading: result === undefined,
    }
}

// Get stock verifications for a closing
export function useLocalStockVerifications(closingId: string) {
    const verifications = useLiveQuery(
        () => closingId ? db.stockVerifications.where('daily_closing_id').equals(closingId).toArray() : [],
        [closingId],
        []
    )

    return {
        data: verifications || [],
        isLoading: verifications === undefined,
    }
}

// Get orders summary for a specific date from local DB
export function useLocalOrdersSummary(date: string) {
    const summary = useLiveQuery(
        async () => {
            // Create date range for the selected date in LOCAL timezone
            const dateStart = new Date(date + 'T00:00:00')
            const dateEnd = new Date(date + 'T23:59:59.999')

            // Get all orders and filter by date and status
            const allOrders = await db.orders.toArray()
            const orders = allOrders.filter(order => {
                // Parse the order's created_at (which might be UTC ISO string)
                const orderDate = new Date(order.created_at)
                return (
                    orderDate >= dateStart &&
                    orderDate <= dateEnd &&
                    order.status === 'completed'
                )
            })

            console.log(`Orders for ${date}:`, orders.length, 'out of', allOrders.length, 'total')

            return {
                totalOrders: orders.length,
                totalRevenue: orders.reduce((sum, order) => sum + order.total_amount, 0),
            }
        },
        [date],
        { totalOrders: 0, totalRevenue: 0 }
    )

    return {
        data: summary,
        isLoading: summary === undefined,
    }
}

// ============================================
// ANALYTICS - From Local DB
// ============================================

export function useLocalAnalytics(days: number = 30) {
    const [analytics, setAnalytics] = useState<{
        totalOrders: number
        totalRevenue: number
        avgOrderValue: number
        taxCollected: number
        ordersByStatus: Record<string, number>
        revenueByDay: { date: string; revenue: number; orders: number }[]
        topItems: { name: string; quantity: number; revenue: number }[]
    } | null>(null)

    useEffect(() => {
        const calculateAnalytics = async () => {
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - days)

            // Get orders in date range
            const orders = await db.orders
                .where('created_at')
                .above(startDate.toISOString())
                .toArray()

            // Calculate totals
            const completedOrders = orders.filter(o => o.status === 'completed')
            const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total_amount, 0)
            const taxCollected = completedOrders.reduce((sum, o) => sum + o.tax_amount, 0)

            // Orders by status
            const ordersByStatus: Record<string, number> = {}
            orders.forEach(o => {
                ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1
            })

            // Revenue by day
            const revenueByDay: Record<string, { revenue: number; orders: number }> = {}
            completedOrders.forEach(o => {
                const date = o.created_at.split('T')[0]
                if (!revenueByDay[date]) {
                    revenueByDay[date] = { revenue: 0, orders: 0 }
                }
                revenueByDay[date].revenue += o.total_amount
                revenueByDay[date].orders += 1
            })

            // Top items
            const allOrderItems = await db.orderItems.toArray()
            const itemStats: Record<string, { quantity: number; revenue: number; name: string }> = {}

            for (const item of allOrderItems) {
                const order = orders.find(o => o.id === item.order_id)
                if (order && order.status === 'completed') {
                    if (!itemStats[item.menu_item_id]) {
                        const menuItem = await db.menuItems.get(item.menu_item_id)
                        itemStats[item.menu_item_id] = {
                            name: menuItem?.name || item.menu_item_name || 'Unknown',
                            quantity: 0,
                            revenue: 0,
                        }
                    }
                    itemStats[item.menu_item_id].quantity += item.quantity
                    itemStats[item.menu_item_id].revenue += item.total_price
                }
            }

            const topItems = Object.values(itemStats)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10)

            setAnalytics({
                totalOrders: completedOrders.length,
                totalRevenue,
                avgOrderValue: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
                taxCollected,
                ordersByStatus,
                revenueByDay: Object.entries(revenueByDay)
                    .map(([date, data]) => ({ date, ...data }))
                    .sort((a, b) => a.date.localeCompare(b.date)),
                topItems,
            })
        }

        calculateAnalytics()
    }, [days])

    return analytics
}

// ============================================
// SYNC STATUS HOOK
// ============================================

export function useSyncStatus() {
    const [status, setStatus] = useState({
        isOnline: navigator.onLine,
        pendingCount: 0,
        lastSync: null as string | null,
    })

    useEffect(() => {
        const updateStatus = async () => {
            const count = await getUnsyncedCount()
            setStatus(prev => ({ ...prev, pendingCount: count }))
        }

        const handleOnline = () => {
            setStatus(prev => ({ ...prev, isOnline: true }))
            updateStatus()
        }

        const handleOffline = () => {
            setStatus(prev => ({ ...prev, isOnline: false }))
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Initial check
        updateStatus()

        // Periodic check
        const interval = setInterval(updateStatus, 5000)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            clearInterval(interval)
        }
    }, [])

    return status
}

// ============================================
// INITIALIZE LOCAL DB
// ============================================

export function useInitializeLocalDb() {
    const [isInitialized, setIsInitialized] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const initialize = async () => {
            try {
                // Check if we have data
                const menuCount = await db.menuItems.count()

                if (menuCount === 0 && navigator.onLine) {
                    // First time - load from Supabase
                    console.log('First time load - fetching from Supabase...')

                    const { data: menuData, error: menuError } = await supabase
                        .from('menu_items')
                        .select('*')

                    console.log('Menu items from Supabase:', menuData?.length || 0, menuError?.message || 'OK')

                    if (menuData && menuData.length > 0) {
                        await db.menuItems.bulkPut(
                            menuData.map((item: any) => ({
                                ...item,
                                synced: true,
                                updated_at: new Date().toISOString(),
                            }))
                        )
                        console.log('Saved', menuData.length, 'menu items to local DB')
                    }

                    const { data: inventoryData } = await supabase
                        .from('inventory_items')
                        .select('*')

                    if (inventoryData && inventoryData.length > 0) {
                        await db.inventoryItems.bulkPut(
                            inventoryData.map((item: any) => ({
                                ...item,
                                synced: true,
                                updated_at: new Date().toISOString(),
                            }))
                        )
                        console.log('Saved', inventoryData.length, 'inventory items to local DB')
                    }
                }

                setIsInitialized(true)
            } catch (err) {
                console.error('Failed to initialize local DB:', err)
                setError((err as Error).message)
            } finally {
                setIsLoading(false)
            }
        }

        initialize()
    }, [])

    return { isInitialized, isLoading, error }
}

