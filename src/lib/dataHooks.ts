/**
 * Data Hooks with Offline Support
 * These hooks cache data locally and only fetch from Supabase when needed
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
    getCache,
    setCache,
    invalidateCache,
    addPendingOperation,
    getPendingOperations,
    removePendingOperation,
    isCacheValid,
} from './offlineStorage'
import type { Database } from './database.types'

type MenuItem = Database['public']['Tables']['menu_items']['Row']
type InventoryItem = Database['public']['Tables']['inventory_items']['Row']
type Order = Database['public']['Tables']['orders']['Row']

// ============================================
// MENU ITEMS - Rarely change, cache for 1 hour
// ============================================

export function useMenuItems() {
    return useQuery({
        queryKey: ['menu-items'],
        queryFn: async () => {
            // Check cache first
            const cached = getCache<MenuItem[]>('menuItems')
            if (cached) {
                console.log('Menu items loaded from cache')
                return cached
            }

            // Fetch from Supabase
            const { data, error } = await supabase
                .from('menu_items')
                .select('*')
                .eq('is_available', true)
                .order('category')
                .order('display_order')

            if (error) throw error

            // Cache the result
            setCache('menuItems', data)
            console.log('Menu items loaded from Supabase and cached')

            return data as MenuItem[]
        },
        staleTime: 60 * 60 * 1000, // 1 hour
        gcTime: 2 * 60 * 60 * 1000, // 2 hours
        refetchOnWindowFocus: false,
    })
}

// Force refresh menu items
export function useRefreshMenuItems() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async () => {
            invalidateCache('menuItems')

            const { data, error } = await supabase
                .from('menu_items')
                .select('*')
                .eq('is_available', true)
                .order('category')
                .order('display_order')

            if (error) throw error

            setCache('menuItems', data)
            return data
        },
        onSuccess: (data) => {
            queryClient.setQueryData(['menu-items'], data)
        },
    })
}

// ============================================
// INVENTORY ITEMS - Cache for 15 minutes
// ============================================

export function useInventoryItems() {
    return useQuery({
        queryKey: ['inventory-items'],
        queryFn: async () => {
            // Check cache first
            const cached = getCache<InventoryItem[]>('inventoryItems')
            if (cached) {
                console.log('Inventory loaded from cache')
                return cached
            }

            const { data, error } = await supabase
                .from('inventory_items')
                .select('*')
                .eq('is_active', true)
                .order('name')

            if (error) throw error

            setCache('inventoryItems', data)
            console.log('Inventory loaded from Supabase and cached')

            return data as InventoryItem[]
        },
        staleTime: 15 * 60 * 1000, // 15 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    })
}

// ============================================
// ORDERS - Cache for 5 minutes
// ============================================

export function useOrders(status?: string) {
    const cacheKey = `orders-${status || 'all'}`

    return useQuery({
        queryKey: ['orders', status],
        queryFn: async () => {
            // Check cache
            const cached = getCache<Order[]>(cacheKey)
            if (cached) {
                return cached
            }

            let query = supabase
                .from('orders')
                .select(`
          *,
          order_items (
            id,
            menu_item_id,
            quantity,
            unit_price,
            total_price,
            menu_items (name)
          )
        `)
                .order('created_at', { ascending: false })
                .limit(100)

            if (status && status !== 'all') {
                query = query.eq('status', status)
            }

            const { data, error } = await query
            if (error) throw error

            setCache(cacheKey, data)
            return data
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    })
}

// ============================================
// KITCHEN ORDERS - With real-time updates
// ============================================

export function useKitchenOrders() {
    return useQuery({
        queryKey: ['kitchen-orders'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select(`
          *,
          order_items (
            id,
            menu_item_id,
            quantity,
            notes,
            menu_items (name, is_veg)
          )
        `)
                .in('status', ['pending', 'preparing'])
                .order('created_at', { ascending: true })

            if (error) throw error
            return data
        },
        staleTime: 30 * 1000, // 30 seconds for kitchen (needs fresher data)
        refetchInterval: 30 * 1000, // Auto refresh every 30 seconds
        refetchOnWindowFocus: true,
    })
}

// ============================================
// CREATE ORDER - With offline support
// ============================================

export function useCreateOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (orderData: {
            order: Omit<Database['public']['Tables']['orders']['Insert'], 'order_number'>
            items: Omit<Database['public']['Tables']['order_items']['Insert'], 'order_id'>[]
        }) => {
            // Check if online
            if (!navigator.onLine) {
                // Store for later sync
                addPendingOperation({
                    type: 'insert',
                    table: 'orders',
                    data: orderData,
                })
                throw new Error('Offline: Order saved locally for sync')
            }

            // Create order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert(orderData.order)
                .select()
                .single()

            if (orderError) throw orderError

            // Create order items
            const itemsWithOrderId = orderData.items.map((item) => ({
                ...item,
                order_id: order.id,
            }))

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(itemsWithOrderId)

            if (itemsError) throw itemsError

            return order
        },
        onSuccess: () => {
            // Invalidate relevant caches
            invalidateCache('orders-all')
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
        },
    })
}

// ============================================
// SYNC PENDING OPERATIONS
// ============================================

export function useSyncPending() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async () => {
            const pending = getPendingOperations()
            const results = { success: 0, failed: 0 }

            for (const op of pending) {
                try {
                    if (op.table === 'orders' && op.type === 'insert') {
                        // Sync order
                        const { data: order, error: orderError } = await supabase
                            .from('orders')
                            .insert(op.data.order)
                            .select()
                            .single()

                        if (orderError) throw orderError

                        const itemsWithOrderId = op.data.items.map((item: any) => ({
                            ...item,
                            order_id: order.id,
                        }))

                        await supabase.from('order_items').insert(itemsWithOrderId)
                    }

                    removePendingOperation(op.id)
                    results.success++
                } catch (error) {
                    console.error('Failed to sync operation:', op, error)
                    results.failed++
                }
            }

            return results
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
        },
    })
}

// ============================================
// CHECK IF DATA NEEDS REFRESH
// ============================================

export function useDataStatus() {
    return {
        menuItemsCached: isCacheValid('menuItems'),
        inventoryCached: isCacheValid('inventoryItems'),
        ordersCached: isCacheValid('orders-all'),
        pendingOperations: getPendingOperations().length,
    }
}
