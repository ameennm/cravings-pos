/**
 * Supabase Realtime Hooks
 * Provides real-time synchronization between Kitchen and Billing
 */

import { useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { db } from './offlineDatabase'
import toast from 'react-hot-toast'

// Types for realtime events
interface RealtimePayload<T> {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    new: T
    old: T | null
}

/**
 * Subscribe to real-time order updates
 * When any order is created or updated, sync it to local DB
 */
export function useRealtimeOrders(enabled: boolean = true) {
    const handleOrderChange = useCallback(async (payload: RealtimePayload<any>) => {
        console.log('Realtime order update:', payload.eventType, payload.new?.order_number)

        try {
            if (payload.eventType === 'INSERT') {
                // New order created - add to local DB
                const order = payload.new
                const existingOrder = await db.orders.get(order.id)

                if (!existingOrder) {
                    await db.orders.add({
                        id: order.id,
                        order_number: order.order_number,
                        status: order.status,
                        customer_name: order.customer_name,
                        table_number: order.table_number,
                        bill_type: order.bill_type,
                        subtotal: order.subtotal,
                        tax_amount: order.tax_amount,
                        discount_amount: order.discount_amount || 0,
                        total_amount: order.total_amount,
                        payment_method: order.payment_method,
                        created_by: order.created_by,
                        created_at: order.created_at,
                        updated_at: order.updated_at,
                        synced: true,
                    })

                    // Show notification for new orders (for Kitchen)
                    toast.success(`🔔 New Order #${order.order_number}`, {
                        icon: '🍳',
                        duration: 5000,
                    })
                }
            } else if (payload.eventType === 'UPDATE') {
                // Order updated - update local DB
                const order = payload.new
                await db.orders.update(order.id, {
                    status: order.status,
                    updated_at: order.updated_at,
                    synced: true,
                })

                // Show notification for status changes
                if (payload.old?.status !== order.status) {
                    const statusMessages: Record<string, string> = {
                        preparing: `🍳 Order #${order.order_number} is being prepared`,
                        ready: `✅ Order #${order.order_number} is ready!`,
                        completed: `🎉 Order #${order.order_number} completed`,
                    }

                    if (statusMessages[order.status]) {
                        toast.success(statusMessages[order.status], { duration: 4000 })
                    }
                }
            } else if (payload.eventType === 'DELETE') {
                // Order deleted - remove from local DB
                await db.orders.delete(payload.old?.id)
            }
        } catch (error) {
            console.error('Error handling realtime order update:', error)
        }
    }, [])

    useEffect(() => {
        if (!enabled) return

        console.log('📡 Subscribing to realtime orders...')

        const channel = supabase
            .channel('orders-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                },
                (payload) => handleOrderChange(payload as unknown as RealtimePayload<any>)
            )
            .subscribe((status) => {
                console.log('Realtime subscription status:', status)
            })

        return () => {
            console.log('📡 Unsubscribing from realtime orders...')
            supabase.removeChannel(channel)
        }
    }, [enabled, handleOrderChange])
}

/**
 * Subscribe to real-time order items updates
 * When order items are added, sync them to local DB
 */
export function useRealtimeOrderItems(enabled: boolean = true) {
    const handleOrderItemChange = useCallback(async (payload: RealtimePayload<any>) => {
        try {
            if (payload.eventType === 'INSERT') {
                const item = payload.new
                const existingItem = await db.orderItems.get(item.id)

                if (!existingItem) {
                    await db.orderItems.add({
                        id: item.id,
                        order_id: item.order_id,
                        menu_item_id: item.menu_item_id,
                        menu_item_name: item.menu_item_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        gst_percentage: item.gst_percentage || 0,
                        gst_amount: item.gst_amount || 0,
                        total_price: item.total_price,
                        notes: item.notes,
                        synced: true,
                    })
                }
            }
        } catch (error) {
            console.error('Error handling realtime order item update:', error)
        }
    }, [])

    useEffect(() => {
        if (!enabled) return

        const channel = supabase
            .channel('order-items-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'order_items',
                },
                (payload) => handleOrderItemChange(payload as unknown as RealtimePayload<any>)
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [enabled, handleOrderItemChange])
}

/**
 * Subscribe to real-time inventory updates
 * When inventory is updated, sync to local DB
 */
export function useRealtimeInventory(enabled: boolean = true) {
    const handleInventoryChange = useCallback(async (payload: RealtimePayload<any>) => {
        try {
            if (payload.eventType === 'UPDATE') {
                const item = payload.new
                await db.inventoryItems.update(item.id, {
                    current_stock: item.current_stock,
                    updated_at: item.updated_at,
                    synced: true,
                })
            }
        } catch (error) {
            console.error('Error handling realtime inventory update:', error)
        }
    }, [])

    useEffect(() => {
        if (!enabled) return

        const channel = supabase
            .channel('inventory-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'inventory_items',
                },
                (payload) => handleInventoryChange(payload as unknown as RealtimePayload<any>)
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [enabled, handleInventoryChange])
}

/**
 * Combined hook for all realtime subscriptions
 * Use this in the main App or layout component
 */
export function useRealtimeSync(enabled: boolean = true) {
    useRealtimeOrders(enabled)
    useRealtimeOrderItems(enabled)
    useRealtimeInventory(enabled)
}
