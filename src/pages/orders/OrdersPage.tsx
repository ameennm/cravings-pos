import { useState, useMemo } from 'react'
import {
    Receipt,
    Search,
    Clock,
    CheckCircle2,
    XCircle,
    ChefHat,
    X,
    CloudOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLocalOrders, useUpdateOrderStatus, useSyncStatus } from '@/lib/offlineHooks'
import { db } from '@/lib/offlineDatabase'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn, formatCurrency, formatDateTime, formatOrderNumber } from '@/lib/utils'
import { OfflineStatusBar } from '@/components/OfflineStatusBar'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Button,
    Input,
    Tabs,
    TabsList,
    TabsTrigger,
    Separator,
} from '@/components/ui'

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

const statusFilters: { label: string; value: OrderStatus | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Preparing', value: 'preparing' },
    { label: 'Ready', value: 'ready' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
]

const statusConfig: Record<OrderStatus, { label: string; variant: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' }> = {
    pending: { label: 'Pending', variant: 'pending' },
    preparing: { label: 'Preparing', variant: 'preparing' },
    ready: { label: 'Ready', variant: 'ready' },
    completed: { label: 'Completed', variant: 'completed' },
    cancelled: { label: 'Cancelled', variant: 'cancelled' },
}

export function OrdersPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

    // Use LOCAL DB orders - works offline!
    const { data: orders, isLoading } = useLocalOrders(statusFilter === 'all' ? undefined : statusFilter)
    const updateStatus = useUpdateOrderStatus()
    const syncStatus = useSyncStatus()

    // Get selected order with items
    const selectedOrder = useLiveQuery(
        async () => {
            if (!selectedOrderId) return null

            const order = await db.orders.get(selectedOrderId)
            if (!order) return null

            const items = await db.orderItems
                .where('order_id')
                .equals(selectedOrderId)
                .toArray()

            // Get menu item names
            const itemsWithNames = await Promise.all(
                items.map(async (item) => {
                    const menuItem = await db.menuItems.get(item.menu_item_id)
                    return {
                        ...item,
                        menu_item_name: menuItem?.name || item.menu_item_name || 'Unknown',
                    }
                })
            )

            return { ...order, order_items: itemsWithNames }
        },
        [selectedOrderId]
    )

    // Filter orders
    const filteredOrders = useMemo(() => {
        if (!orders) return []
        if (!searchQuery) return orders

        const searchLower = searchQuery.toLowerCase()
        return orders.filter((order) =>
            order.order_number.toString().includes(searchLower) ||
            order.customer_name?.toLowerCase().includes(searchLower) ||
            order.table_number?.toLowerCase().includes(searchLower)
        )
    }, [orders, searchQuery])

    const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
        try {
            await updateStatus.mutateAsync({ orderId, status })
            toast.success('Order status updated')
        } catch (error) {
            toast.error('Failed to update order')
        }
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Receipt className="w-7 h-7" />
                        Orders
                    </h1>
                    <p className="text-muted-foreground">View and manage all orders</p>
                </div>
                <OfflineStatusBar />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by order #, customer, or table..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                    <TabsList>
                        {statusFilters.map((filter) => (
                            <TabsTrigger key={filter.value} value={filter.value}>
                                {filter.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Orders list */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardContent className="p-6">
                                <div className="h-6 bg-muted rounded w-1/2 mb-4" />
                                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                                <div className="h-4 bg-muted rounded w-1/2" />
                            </CardContent>
                        </Card>
                    ))
                ) : filteredOrders.length === 0 ? (
                    <Card className="col-span-full">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Receipt className="w-12 h-12 mb-2 opacity-50" />
                            <p>No orders found</p>
                            <p className="text-sm mt-1">Orders will appear here after creating them in POS</p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredOrders.map((order) => {
                        const config = statusConfig[order.status]
                        return (
                            <Card
                                key={order.id}
                                className={cn(
                                    'cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/50',
                                    selectedOrderId === order.id && 'border-primary',
                                    !order.synced && 'border-l-4 border-l-warning'
                                )}
                                onClick={() => setSelectedOrderId(order.id)}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            {formatOrderNumber(order.order_number)}
                                            {!order.synced && (
                                                <span title="Not yet synced">
                                                    <CloudOff className="w-4 h-4 text-warning" />
                                                </span>
                                            )}
                                        </CardTitle>
                                        <Badge variant={config.variant}>{config.label}</Badge>
                                    </div>
                                    <CardDescription className="flex items-center gap-2">
                                        <Clock className="w-3 h-3" />
                                        {formatDateTime(order.created_at)}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Items</span>
                                        {order.table_number && (
                                            <Badge variant="outline">Table {order.table_number}</Badge>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Badge variant={order.bill_type === 'tax_invoice' ? 'default' : 'secondary'}>
                                                {order.bill_type === 'tax_invoice' ? 'Tax Invoice' : 'Estimate'}
                                            </Badge>
                                        </div>
                                        <p className="text-xl font-bold text-primary">
                                            {formatCurrency(order.total_amount)}
                                        </p>
                                    </div>

                                    {order.customer_name && (
                                        <p className="text-sm text-muted-foreground truncate">
                                            Customer: {order.customer_name}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })
                )}
            </div>

            {/* Order Details Modal */}
            {selectedOrder && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setSelectedOrderId(null)}
                >
                    <Card className="w-full max-w-2xl m-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-2xl flex items-center gap-2">
                                        Order {formatOrderNumber(selectedOrder.order_number)}
                                        {!selectedOrder.synced && (
                                            <Badge variant="warning" className="text-xs">
                                                <CloudOff className="w-3 h-3 mr-1" />
                                                Pending Sync
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription>{formatDateTime(selectedOrder.created_at)}</CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedOrderId(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-120px)]">
                            <CardContent className="p-6 space-y-6">
                                {/* Status and type */}
                                <div className="flex items-center gap-4">
                                    <Badge variant={statusConfig[selectedOrder.status].variant} className="text-sm py-1 px-3">
                                        {statusConfig[selectedOrder.status].label}
                                    </Badge>
                                    <Badge variant={selectedOrder.bill_type === 'tax_invoice' ? 'default' : 'secondary'}>
                                        {selectedOrder.bill_type === 'tax_invoice' ? 'Tax Invoice' : 'Estimate'}
                                    </Badge>
                                </div>

                                {/* Customer info */}
                                {(selectedOrder.customer_name || selectedOrder.table_number) && (
                                    <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                                        {selectedOrder.customer_name && (
                                            <div>
                                                <p className="text-sm text-muted-foreground">Customer</p>
                                                <p className="font-medium">{selectedOrder.customer_name}</p>
                                            </div>
                                        )}
                                        {selectedOrder.table_number && (
                                            <div>
                                                <p className="text-sm text-muted-foreground">Table</p>
                                                <p className="font-medium">{selectedOrder.table_number}</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Order items */}
                                <div>
                                    <h3 className="font-semibold mb-3">Items</h3>
                                    <div className="space-y-2">
                                        {selectedOrder.order_items.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                                        {item.quantity}x
                                                    </span>
                                                    <div>
                                                        <p className="font-medium">{item.menu_item_name}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {formatCurrency(item.unit_price)} each
                                                            {item.gst_percentage > 0 && ` (+${item.gst_percentage}% GST)`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="font-semibold">{formatCurrency(item.total_price)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Separator />

                                {/* Totals */}
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>{formatCurrency(selectedOrder.subtotal)}</span>
                                    </div>
                                    {selectedOrder.bill_type === 'tax_invoice' && selectedOrder.tax_amount > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">GST</span>
                                            <span>{formatCurrency(selectedOrder.tax_amount)}</span>
                                        </div>
                                    )}
                                    {selectedOrder.discount_amount > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Discount</span>
                                            <span className="text-destructive">-{formatCurrency(selectedOrder.discount_amount)}</span>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex justify-between text-xl font-bold">
                                        <span>Total</span>
                                        <span className="text-primary">{formatCurrency(selectedOrder.total_amount)}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap gap-2">
                                    {selectedOrder.status === 'pending' && (
                                        <>
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleUpdateStatus(selectedOrder.id, 'preparing')}
                                            >
                                                <ChefHat className="w-4 h-4 mr-2" />
                                                Start Preparing
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                                            >
                                                <XCircle className="w-4 h-4 mr-2" />
                                                Cancel
                                            </Button>
                                        </>
                                    )}
                                    {selectedOrder.status === 'preparing' && (
                                        <Button
                                            variant="success"
                                            onClick={() => handleUpdateStatus(selectedOrder.id, 'ready')}
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Mark Ready
                                        </Button>
                                    )}
                                    {selectedOrder.status === 'ready' && (
                                        <Button
                                            onClick={() => handleUpdateStatus(selectedOrder.id, 'completed')}
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Complete Order
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
