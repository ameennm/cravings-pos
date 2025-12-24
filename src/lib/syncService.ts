/**
 * Sync Service - Handles bidirectional sync between local DB and Supabase
 */

import { supabase } from './supabase'
import {
    db,
    setLastSyncTime,
    getLastSyncTime,
    LocalOrder,
    LocalOrderItem,
} from './offlineDatabase'
import toast from 'react-hot-toast'

// Sync status
let isSyncing = false
let syncListeners: ((status: SyncStatus) => void)[] = []

export interface SyncStatus {
    isSyncing: boolean
    lastSync: string | null
    pendingCount: number
    error?: string
}

// Subscribe to sync status
export function subscribeSyncStatus(listener: (status: SyncStatus) => void) {
    syncListeners.push(listener)
    return () => {
        syncListeners = syncListeners.filter(l => l !== listener)
    }
}

// Notify listeners
async function notifySyncStatus(error?: string) {
    const pendingOrders = await db.orders.where('synced').equals(0).count()
    const pendingItems = await db.orderItems.where('synced').equals(0).count()
    const queueCount = await db.syncQueue.count()

    const status: SyncStatus = {
        isSyncing,
        lastSync: await getLastSyncTime(),
        pendingCount: pendingOrders + pendingItems + queueCount,
        error,
    }

    syncListeners.forEach(l => l(status))
}

// ============================================
// SYNC ORDERS TO SUPABASE
// ============================================

export async function syncOrdersToSupabase(): Promise<{ success: number; failed: number }> {
    const results = { success: 0, failed: 0 }

    try {
        // Get unsynced orders
        const unsyncedOrders = await db.orders
            .where('synced')
            .equals(0)
            .toArray()

        for (const localOrder of unsyncedOrders) {
            try {
                // Get order items
                const orderItems = await db.orderItems
                    .where('order_id')
                    .equals(localOrder.id)
                    .toArray()

                // Create order in Supabase
                const { data: newOrder, error: orderError } = await supabase
                    .from('orders')
                    .insert({
                        customer_name: localOrder.customer_name,
                        table_number: localOrder.table_number,
                        bill_type: localOrder.bill_type,
                        subtotal: localOrder.subtotal,
                        tax_amount: localOrder.tax_amount,
                        discount_amount: localOrder.discount_amount,
                        total_amount: localOrder.total_amount,
                        status: localOrder.status,
                        payment_method: localOrder.payment_method,
                        created_by: localOrder.created_by,
                        created_at: localOrder.created_at,
                    })
                    .select()
                    .single()

                if (orderError) throw orderError

                // Create order items in Supabase
                const itemsToInsert = orderItems.map(item => ({
                    order_id: newOrder.id,
                    menu_item_id: item.menu_item_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    gst_percentage: item.gst_percentage,
                    gst_amount: item.gst_amount,
                    total_price: item.total_price,
                    notes: item.notes,
                }))

                if (itemsToInsert.length > 0) {
                    const { error: itemsError } = await supabase
                        .from('order_items')
                        .insert(itemsToInsert)

                    if (itemsError) throw itemsError
                }

                // Update local order with server ID and mark as synced
                await db.orders.delete(localOrder.id)
                await db.orders.put({
                    ...localOrder,
                    id: newOrder.id,
                    order_number: newOrder.order_number,
                    synced: true,
                    sync_error: undefined,
                })

                // Update local order items
                for (const item of orderItems) {
                    await db.orderItems.delete(item.id)
                }

                results.success++
            } catch (error) {
                console.error('Failed to sync order:', localOrder.id, error)

                // Mark order with sync error
                await db.orders.update(localOrder.id, {
                    sync_error: (error as Error).message,
                })

                results.failed++
            }
        }

        return results
    } catch (error) {
        console.error('Sync orders error:', error)
        return results
    }
}

// ============================================
// SYNC INVENTORY CHANGES TO SUPABASE
// ============================================

export async function syncInventoryToSupabase(): Promise<{ success: number; failed: number }> {
    const results = { success: 0, failed: 0 }

    try {
        const unsyncedItems = await db.inventoryItems
            .where('synced')
            .equals(0)
            .toArray()

        for (const item of unsyncedItems) {
            try {
                const { error } = await supabase
                    .from('inventory_items')
                    .update({
                        current_stock: item.current_stock,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', item.id)

                if (error) throw error

                await db.inventoryItems.update(item.id, { synced: true })
                results.success++
            } catch (error) {
                console.error('Failed to sync inventory item:', item.id, error)
                results.failed++
            }
        }

        return results
    } catch (error) {
        console.error('Sync inventory error:', error)
        return results
    }
}

// ============================================
// FULL SYNC (BOTH DIRECTIONS)
// ============================================

export async function performFullSync(): Promise<void> {
    if (isSyncing) {
        console.log('Sync already in progress')
        return
    }

    if (!navigator.onLine) {
        console.log('Offline - skipping sync')
        return
    }

    isSyncing = true
    notifySyncStatus()

    try {
        console.log('Starting full sync...')

        // 1. Push local changes to Supabase
        const orderResults = await syncOrdersToSupabase()
        const inventoryResults = await syncInventoryToSupabase()

        console.log('Push results:', { orders: orderResults, inventory: inventoryResults })

        // 2. Pull latest data from Supabase
        await pullLatestFromSupabase()

        // 3. Update last sync time
        await setLastSyncTime(new Date().toISOString())

        // Show toast if there were synced items
        const totalSynced = orderResults.success + inventoryResults.success
        if (totalSynced > 0) {
            toast.success(`Synced ${totalSynced} items to cloud`)
        }

        console.log('Full sync completed')
        notifySyncStatus()
    } catch (error) {
        console.error('Full sync error:', error)
        notifySyncStatus((error as Error).message)
    } finally {
        isSyncing = false
        notifySyncStatus()
    }
}

// ============================================
// PULL LATEST DATA FROM SUPABASE
// ============================================

export async function pullLatestFromSupabase(): Promise<void> {
    try {
        // Pull menu items
        const { data: menuData } = await supabase
            .from('menu_items')
            .select('*')
            .eq('is_available', true)

        if (menuData) {
            await db.menuItems.clear()
            await db.menuItems.bulkPut(
                menuData.map((item: any) => ({
                    ...item,
                    synced: true,
                    updated_at: new Date().toISOString(),
                }))
            )
        }

        // Pull inventory items
        const { data: inventoryData } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('is_active', true)

        if (inventoryData) {
            // Keep unsynced local changes
            const unsyncedItems = await db.inventoryItems.where('synced').equals(0).toArray()
            await db.inventoryItems.clear()

            // Re-add server data
            await db.inventoryItems.bulkPut(
                inventoryData.map((item: any) => {
                    // Check if there's a local unsynced version
                    const localItem = unsyncedItems.find(i => i.id === item.id)
                    return {
                        ...item,
                        current_stock: localItem ? localItem.current_stock : item.current_stock,
                        synced: localItem ? false : true,
                        updated_at: new Date().toISOString(),
                    }
                })
            )
        }

        // Pull recent orders (merge with local)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)

        const { data: ordersData } = await supabase
            .from('orders')
            .select(`*, order_items (*)`)
            .gte('created_at', weekAgo.toISOString())
            .order('created_at', { ascending: false })

        if (ordersData) {
            // Keep unsynced local orders
            const unsyncedOrders = await db.orders.where('synced').equals(0).toArray()
            const unsyncedOrderIds = new Set(unsyncedOrders.map(o => o.id))

            // Add/update synced orders from server
            for (const order of ordersData) {
                if (!unsyncedOrderIds.has(order.id)) {
                    const { order_items, ...orderData } = order
                    await db.orders.put({
                        ...orderData,
                        synced: true,
                    })

                    if (order_items) {
                        for (const item of order_items) {
                            await db.orderItems.put({
                                ...item,
                                menu_item_name: '',
                                synced: true,
                            })
                        }
                    }
                }
            }
        }

        // Pull daily closings with stock verifications
        const { data: closingsData } = await supabase
            .from('daily_closing_logs')
            .select('*')
            .order('closing_date', { ascending: false })
            .limit(30)

        if (closingsData) {
            // Keep unsynced local closings
            const unsyncedClosings = await db.dailyClosings.where('synced').equals(0).toArray()
            const unsyncedClosingIds = new Set(unsyncedClosings.map(c => c.id))

            for (const closing of closingsData) {
                if (!unsyncedClosingIds.has(closing.id)) {
                    await db.dailyClosings.put({
                        ...closing,
                        synced: true,
                    })
                }
            }

            // Fetch stock verifications
            const closingIds = closingsData.map(c => c.id)
            if (closingIds.length > 0) {
                const { data: verificationsData } = await supabase
                    .from('stock_verifications')
                    .select('*')
                    .in('daily_closing_id', closingIds)

                if (verificationsData) {
                    for (const verification of verificationsData) {
                        await db.stockVerifications.put({
                            ...verification,
                            synced: true,
                        })
                    }
                }
            }
        }

        console.log('Pulled latest data from Supabase')
    } catch (error) {
        console.error('Pull from Supabase error:', error)
        throw error
    }
}

// ============================================
// AUTO SYNC ON RECONNECT
// ============================================

let syncTimeout: ReturnType<typeof setTimeout> | null = null

export function setupAutoSync(): () => void {
    const handleOnline = () => {
        console.log('Online - scheduling sync')

        // Debounce to avoid multiple rapid syncs
        if (syncTimeout) clearTimeout(syncTimeout)
        syncTimeout = setTimeout(() => {
            performFullSync()
        }, 2000)
    }

    const handleOffline = () => {
        console.log('Offline - sync paused')
        if (syncTimeout) clearTimeout(syncTimeout)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial sync if online
    if (navigator.onLine) {
        setTimeout(performFullSync, 3000)
    }

    // Periodic sync every 5 minutes when online
    const intervalId = setInterval(() => {
        if (navigator.onLine) {
            performFullSync()
        }
    }, 5 * 60 * 1000)

    return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        if (syncTimeout) clearTimeout(syncTimeout)
        clearInterval(intervalId)
    }
}

// ============================================
// OFFLINE ORDER CREATION
// ============================================

export async function createOrderOffline(
    order: Omit<LocalOrder, 'id' | 'order_number' | 'synced' | 'created_at' | 'updated_at'>,
    items: Omit<LocalOrderItem, 'id' | 'order_id' | 'synced'>[]
): Promise<LocalOrder> {
    const now = new Date().toISOString()
    const orderId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const orderNumber = await generateOrderNumber()

    // 1. Create Local Order Immediately (Optimistic UI)
    const newOrder: LocalOrder = {
        ...order,
        id: orderId,
        order_number: orderNumber,
        synced: false,
        created_at: now,
        updated_at: now,
    }

    // Save order locally
    await db.orders.add(newOrder)

    // Save order items locally
    for (const item of items) {
        await db.orderItems.add({
            ...item,
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            order_id: orderId,
            synced: false,
        })
    }

    console.log('⚡ Optimistic Order Created Locally:', orderNumber)

    // 2. Trigger Background Sync if Online (Don't await this!)
    if (navigator.onLine) {
        // Run sync in background without blocking UI return
        syncOrdersToSupabase().then(result => {
            if (result.success > 0) {
                console.log('✅ Background sync successful')
                toast.success('Order sync complete')
            }
        }).catch(err => {
            console.error('Background sync failed:', err)
        })
    }

    // 3. Return immediately so UI feels instant
    return newOrder
}

// Helper to generate order number
async function generateOrderNumber(): Promise<number> {
    const lastOrder = await db.orders.orderBy('order_number').last()
    return (lastOrder?.order_number || 0) + 1
}

