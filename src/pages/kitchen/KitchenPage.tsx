import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChefHat, Clock, AlertTriangle, TrendingDown, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { db } from '@/lib/offlineDatabase'
import { cn } from '@/lib/utils'
import { OfflineStatusBar } from '@/components/OfflineStatusBar'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    ScrollArea,
    Button,
} from '@/components/ui'

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
    pending: {
        label: 'Pending',
        color: 'badge-pending',
        icon: <Clock className="w-4 h-4" />,
    },
    preparing: {
        label: 'Preparing',
        color: 'badge-preparing',
        icon: <ChefHat className="w-4 h-4" />,
    },
    ready: {
        label: 'Ready',
        color: 'badge-ready',
        icon: <CheckCircle2 className="w-4 h-4" />,
    },
    completed: {
        label: 'Completed',
        color: 'badge-completed',
        icon: <CheckCircle2 className="w-4 h-4" />,
    },
    cancelled: {
        label: 'Cancelled',
        color: 'bg-destructive/20 text-destructive',
        icon: <AlertTriangle className="w-4 h-4" />,
    },
}

export function KitchenPage() {
    // Fetch orders from LOCAL IndexedDB - works offline!
    const orders = useLiveQuery(
        async () => {
            const allOrders = await db.orders
                .where('status')
                .anyOf(['pending', 'preparing'])
                .toArray()

            // Sort by created_at ascending (oldest first)
            return allOrders.sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        },
        [],
        []
    )

    // Fetch order items for each order
    const ordersWithItems = useLiveQuery(
        async () => {
            if (!orders || orders.length === 0) return []

            const result = []
            for (const order of orders) {
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
                            menu_item_name: menuItem?.name || item.menu_item_name || 'Unknown',
                            is_veg: menuItem?.is_veg ?? true,
                        }
                    })
                )

                result.push({
                    ...order,
                    order_items: itemsWithNames,
                })
            }
            return result
        },
        [orders],
        []
    )

    // Fetch low stock items from local DB
    const lowStockItems = useLiveQuery(
        async () => {
            const items = await db.inventoryItems.toArray()
            return items.filter(item =>
                item.current_stock <= item.minimum_stock && item.is_active
            ).slice(0, 5)
        },
        [],
        []
    )

    // Update order status in local DB AND sync to Supabase for realtime updates
    const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
        try {
            const now = new Date().toISOString()
            const updateData: any = {
                status: newStatus,
                updated_at: now,
                synced: false,
            }

            // Update local DB first
            await db.orders.update(orderId, updateData)
            toast.success(`Order marked as ${newStatus}`)

            // Sync to Supabase for realtime broadcast to other users
            // Only sync if it's not an offline-created order
            const isOfflineOrder = orderId.startsWith('offline_')
            if (!isOfflineOrder && navigator.onLine) {
                const { supabase } = await import('@/lib/supabase')
                await supabase
                    .from('orders')
                    .update({
                        status: newStatus,
                        updated_at: now,
                    } as any)
                    .eq('id', orderId)

                // Mark as synced
                await db.orders.update(orderId, { synced: true })
            }
        } catch (error) {
            console.error('Failed to update order:', error)
            toast.error('Failed to update order status')
        }
    }


    const pendingOrders = useMemo(() =>
        (ordersWithItems || []).filter((o) => o.status === 'pending'),
        [ordersWithItems]
    )

    const preparingOrders = useMemo(() =>
        (ordersWithItems || []).filter((o) => o.status === 'preparing'),
        [ordersWithItems]
    )

    const isLoading = orders === undefined

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ChefHat className="w-7 h-7" />
                        Kitchen Display
                    </h1>
                    <p className="text-muted-foreground">Manage incoming orders (Auto-updates)</p>
                </div>
                <OfflineStatusBar />
            </div>

            {/* Low stock warning */}
            {(lowStockItems || []).length > 0 && (
                <Card className="border-warning/50 bg-warning/5">
                    <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center gap-2 text-warning">
                            <AlertTriangle className="w-5 h-5" />
                            Low Stock Alert
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3">
                        <div className="flex flex-wrap gap-2">
                            {(lowStockItems || []).map((item) => (
                                <Badge key={item.id} variant="warning" className="py-1">
                                    <TrendingDown className="w-3 h-3 mr-1" />
                                    {item.name}: {item.current_stock} {item.unit} left
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Order columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pending Orders */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
                        <h2 className="text-lg font-semibold">
                            Pending Orders ({pendingOrders.length})
                        </h2>
                    </div>
                    <ScrollArea className="h-[calc(100vh-300px)]">
                        <div className="space-y-4 pr-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : pendingOrders.length === 0 ? (
                                <Card className="border-dashed">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <CheckCircle2 className="w-12 h-12 mb-2 opacity-50" />
                                        <p>No pending orders</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                pendingOrders.map((order) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onStatusChange={(status) => updateOrderStatus(order.id, status)}
                                    />
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Preparing Orders */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                        <h2 className="text-lg font-semibold">
                            Preparing ({preparingOrders.length})
                        </h2>
                    </div>
                    <ScrollArea className="h-[calc(100vh-300px)]">
                        <div className="space-y-4 pr-4">
                            {preparingOrders.length === 0 ? (
                                <Card className="border-dashed">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <ChefHat className="w-12 h-12 mb-2 opacity-50" />
                                        <p>No orders being prepared</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                preparingOrders.map((order) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onStatusChange={(status) => updateOrderStatus(order.id, status)}
                                    />
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    )
}

// Order Card Component
interface OrderWithItems {
    id: string
    order_number: number
    status: OrderStatus
    created_at: string
    customer_name?: string
    table_number?: string
    notes?: string
    synced?: boolean
    order_items: {
        id: string
        quantity: number
        menu_item_name: string
        is_veg?: boolean
    }[]
}

function OrderCard({
    order,
    onStatusChange,
}: {
    order: OrderWithItems
    onStatusChange: (status: OrderStatus) => void
}) {
    const config = statusConfig[order.status]
    const timeSinceOrder = Math.round(
        (Date.now() - new Date(order.created_at).getTime()) / 60000
    )

    return (
        <Card className={cn('transition-all duration-200 hover:shadow-lg', 'animate-fade-in')}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold">#{order.order_number}</span>
                        {order.table_number && (
                            <Badge variant="outline">Table {order.table_number}</Badge>
                        )}
                        {!order.synced && (
                            <Badge variant="warning" className="text-xs">Offline</Badge>
                        )}
                    </div>
                    <Badge className={config.color}>
                        {config.icon}
                        <span className="ml-1">{config.label}</span>
                    </Badge>
                </div>
                <CardDescription className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    {timeSinceOrder} min ago
                    {order.customer_name && <span>• {order.customer_name}</span>}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Order items */}
                <div className="space-y-2">
                    {order.order_items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                {item.quantity}x
                            </span>
                            <span className="flex-1 font-medium">{item.menu_item_name}</span>
                            <Badge variant={item.is_veg ? 'veg' : 'non-veg'} className="text-[10px]">
                                {item.is_veg ? 'V' : 'NV'}
                            </Badge>
                        </div>
                    ))}
                </div>

                {/* Notes */}
                {order.notes && (
                    <div className="p-2 rounded-lg bg-muted text-sm">
                        <span className="font-medium">Note:</span> {order.notes}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    {order.status === 'pending' && (
                        <Button
                            className="flex-1"
                            variant="secondary"
                            onClick={() => onStatusChange('preparing')}
                        >
                            <ChefHat className="w-4 h-4 mr-2" />
                            Start Preparing
                        </Button>
                    )}
                    {order.status === 'preparing' && (
                        <Button
                            className="flex-1"
                            variant="success"
                            onClick={() => onStatusChange('ready')}
                        >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Mark Ready
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
