/**
 * Offline Database using Dexie (IndexedDB wrapper)
 * This provides full offline functionality for the entire app
 */

import Dexie, { Table } from 'dexie'

// ============================================
// Types for local database
// ============================================

export interface LocalMenuItem {
    id: string
    name: string
    description?: string
    price: number
    category: string
    gst_percentage: number
    is_available: boolean
    is_veg: boolean
    display_order: number
    image_url?: string
    synced: boolean
    updated_at: string
}

export interface LocalInventoryItem {
    id: string
    name: string
    unit: string
    current_stock: number
    minimum_stock: number
    cost_per_unit: number
    is_active: boolean
    synced: boolean
    updated_at: string
}

export interface LocalOrder {
    id: string
    order_number: number
    customer_name?: string
    table_number?: string
    bill_type: 'tax_invoice' | 'estimate'
    subtotal: number
    tax_amount: number
    discount_amount: number
    total_amount: number
    status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
    payment_method?: string
    created_by?: string
    created_at: string
    updated_at: string
    synced: boolean
    sync_error?: string
}

export interface LocalOrderItem {
    id: string
    order_id: string
    menu_item_id: string
    menu_item_name: string
    quantity: number
    unit_price: number
    gst_percentage: number
    gst_amount: number
    total_price: number
    notes?: string
    synced: boolean
}

export interface LocalDailyClosing {
    id: string
    closing_date: string
    submitted_by: string
    total_orders: number
    total_revenue: number
    notes?: string
    created_at: string
    synced: boolean
}

export interface LocalStockVerification {
    id: string
    daily_closing_id: string
    inventory_item_id: string
    system_stock: number
    physical_stock: number
    wastage: number
    notes?: string
    synced: boolean
}

export interface LocalInventoryTransaction {
    id: string
    inventory_item_id: string
    transaction_type: string
    quantity: number
    previous_stock: number
    new_stock: number
    reference_id?: string
    notes?: string
    created_at: string
    synced: boolean
}

export interface LocalRecipe {
    id: string
    menu_item_id: string
    inventory_item_id: string
    quantity_required: number
    unit: string
    synced: boolean
}

export interface SyncQueue {
    id?: number
    table: string
    operation: 'insert' | 'update' | 'delete'
    data: any
    created_at: string
    retries: number
    last_error?: string
}

export interface AppSettings {
    key: string
    value: string
}

// ============================================
// Dexie Database Class
// ============================================

class KitchenPOSDatabase extends Dexie {
    // Declare tables
    menuItems!: Table<LocalMenuItem, string>
    inventoryItems!: Table<LocalInventoryItem, string>
    orders!: Table<LocalOrder, string>
    orderItems!: Table<LocalOrderItem, string>
    dailyClosings!: Table<LocalDailyClosing, string>
    stockVerifications!: Table<LocalStockVerification, string>
    inventoryTransactions!: Table<LocalInventoryTransaction, string>
    recipes!: Table<LocalRecipe, string>
    syncQueue!: Table<SyncQueue, number>
    settings!: Table<AppSettings, string>

    constructor() {
        super('KitchenPOSDB')

        this.version(2).stores({
            menuItems: 'id, category, is_available, synced',
            inventoryItems: 'id, name, is_active, synced',
            orders: 'id, order_number, status, created_at, synced',
            orderItems: 'id, order_id, menu_item_id, synced',
            dailyClosings: 'id, closing_date, synced',
            stockVerifications: 'id, daily_closing_id, synced',
            inventoryTransactions: 'id, inventory_item_id, created_at, synced',
            recipes: 'id, menu_item_id, inventory_item_id, synced',
            syncQueue: '++id, table, operation, created_at',
            settings: 'key',
        })
    }
}

// Create singleton instance
export const db = new KitchenPOSDatabase()

// ============================================
// Helper Functions
// ============================================

// Generate unique ID (for offline-created records)
export function generateId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Generate order number (for offline orders)
export async function generateOrderNumber(): Promise<number> {
    const lastOrder = await db.orders.orderBy('order_number').last()
    const lastNumber = lastOrder?.order_number || 0

    // Use timestamp-based number for offline orders to avoid conflicts
    const offlinePrefix = 9000000 // Offline orders start from 9M
    const baseNumber = Math.max(lastNumber + 1, offlinePrefix)

    return baseNumber
}

// Get unsynced count
export async function getUnsyncedCount(): Promise<number> {
    const orders = await db.orders.where('synced').equals(0).count()
    const orderItems = await db.orderItems.where('synced').equals(0).count()
    const inventory = await db.inventoryItems.where('synced').equals(0).count()
    return orders + orderItems + inventory
}

// Get sync queue count
export async function getSyncQueueCount(): Promise<number> {
    return await db.syncQueue.count()
}

// Add to sync queue
export async function addToSyncQueue(
    table: string,
    operation: 'insert' | 'update' | 'delete',
    data: any
): Promise<void> {
    await db.syncQueue.add({
        table,
        operation,
        data,
        created_at: new Date().toISOString(),
        retries: 0,
    })
}

// Clear all local data (for logout)
export async function clearLocalDatabase(): Promise<void> {
    await db.orders.clear()
    await db.orderItems.clear()
    await db.dailyClosings.clear()
    await db.stockVerifications.clear()
    await db.inventoryTransactions.clear()
    await db.syncQueue.clear()
    // Keep menu items and inventory for faster reload
}

// Get last sync time
export async function getLastSyncTime(): Promise<string | null> {
    const setting = await db.settings.get('lastSyncTime')
    return setting?.value || null
}

// Set last sync time
export async function setLastSyncTime(time: string): Promise<void> {
    await db.settings.put({ key: 'lastSyncTime', value: time })
}

// ============================================
// Initialize database with data from Supabase
// ============================================

export async function initializeFromSupabase(supabase: any): Promise<void> {
    try {
        console.log('Initializing local database from Supabase...')

        // Fetch menu items
        const { data: menuData, error: menuError } = await supabase
            .from('menu_items')
            .select('*')
            .eq('is_available', true)

        if (!menuError && menuData) {
            await db.menuItems.clear()
            await db.menuItems.bulkPut(
                menuData.map((item: any) => ({
                    ...item,
                    synced: true,
                    updated_at: new Date().toISOString(),
                }))
            )
            console.log(`Loaded ${menuData.length} menu items`)
        }

        // Fetch inventory items
        const { data: inventoryData, error: inventoryError } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('is_active', true)

        if (!inventoryError && inventoryData) {
            await db.inventoryItems.clear()
            await db.inventoryItems.bulkPut(
                inventoryData.map((item: any) => ({
                    ...item,
                    synced: true,
                    updated_at: new Date().toISOString(),
                }))
            )
            console.log(`Loaded ${inventoryData.length} inventory items`)
        }

        // Fetch recent orders (last 7 days)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)

        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select(`
        *,
        order_items (*)
      `)
            .gte('created_at', weekAgo.toISOString())
            .order('created_at', { ascending: false })

        if (!ordersError && ordersData) {
            // Clear only synced orders (keep unsynced)
            const unsyncedOrders = await db.orders.where('synced').equals(0).toArray()
            await db.orders.clear()
            await db.orderItems.clear()

            // Add unsynced orders back
            if (unsyncedOrders.length > 0) {
                await db.orders.bulkPut(unsyncedOrders)
            }

            // Add synced orders
            for (const order of ordersData) {
                const { order_items, ...orderData } = order
                await db.orders.put({
                    ...orderData,
                    synced: true,
                })

                if (order_items) {
                    for (const item of order_items) {
                        await db.orderItems.put({
                            ...item,
                            menu_item_name: '', // Will be populated from menu items
                            synced: true,
                        })
                    }
                }
            }
            console.log(`Loaded ${ordersData.length} orders`)
        }

        // Fetch daily closings with stock verifications
        const { data: closingsData, error: closingsError } = await supabase
            .from('daily_closing_logs')
            .select('*')
            .order('closing_date', { ascending: false })
            .limit(30)

        if (!closingsError && closingsData) {
            await db.dailyClosings.clear()
            await db.stockVerifications.clear()

            await db.dailyClosings.bulkPut(
                closingsData.map((item: any) => ({
                    ...item,
                    synced: true,
                }))
            )
            console.log(`Loaded ${closingsData.length} daily closings`)

            // Fetch stock verifications for each closing
            const closingIds = closingsData.map((c: any) => c.id)
            if (closingIds.length > 0) {
                const { data: verificationsData, error: verificationsError } = await supabase
                    .from('stock_verifications')
                    .select('*')
                    .in('daily_closing_id', closingIds)

                if (!verificationsError && verificationsData) {
                    await db.stockVerifications.bulkPut(
                        verificationsData.map((item: any) => ({
                            ...item,
                            synced: true,
                        }))
                    )
                    console.log(`Loaded ${verificationsData.length} stock verifications`)
                }
            }
        }

        await setLastSyncTime(new Date().toISOString())
        console.log('Local database initialized successfully')
    } catch (error) {
        console.error('Failed to initialize local database:', error)
        throw error
    }
}
