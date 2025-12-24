import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Package,
    Plus,
    Minus,
    Search,
    AlertTriangle,
    ArrowUpDown,
    Save,
    TrendingUp,
    TrendingDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { db, LocalInventoryItem } from '@/lib/offlineDatabase'
import { useSyncStatus } from '@/lib/offlineHooks'
import { cn, formatCurrency } from '@/lib/utils'
import { OfflineStatusBar } from '@/components/OfflineStatusBar'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
    Button,
    Input,
    Label,
    Separator,
} from '@/components/ui'

export function InventoryPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const [showLowStock, setShowLowStock] = useState(false)
    const [adjustmentItem, setAdjustmentItem] = useState<{
        item: LocalInventoryItem
        quantity: number
        type: 'add' | 'remove'
        notes: string
    } | null>(null)
    const [isUpdating, setIsUpdating] = useState(false)

    const syncStatus = useSyncStatus()

    // Fetch inventory items from LOCAL IndexedDB - works offline!
    const inventoryItems = useLiveQuery(
        async () => {
            const items = await db.inventoryItems.toArray()
            return items.filter(item => item.is_active).sort((a, b) => a.name.localeCompare(b.name))
        },
        [],
        []
    )

    const isLoading = inventoryItems === undefined

    // Filter items
    const filteredItems = useMemo(() => {
        if (!inventoryItems) return []
        return inventoryItems.filter((item) => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesLowStock = showLowStock ? item.current_stock <= item.minimum_stock : true
            return matchesSearch && matchesLowStock
        })
    }, [inventoryItems, searchQuery, showLowStock])

    // Group by category
    const categories = useMemo(() => {
        return [...new Set((inventoryItems || []).map((item) => item.unit || 'Other'))]
    }, [inventoryItems])

    const handleStockAdjustment = async () => {
        if (!adjustmentItem || adjustmentItem.quantity <= 0) return

        setIsUpdating(true)
        try {
            const { item, quantity, type, notes } = adjustmentItem
            const newStock =
                type === 'add' ? item.current_stock + quantity : Math.max(0, item.current_stock - quantity)

            // Update local database
            await db.inventoryItems.update(item.id, {
                current_stock: newStock,
                updated_at: new Date().toISOString(),
                synced: false,
            })

            // Add transaction record
            await db.inventoryTransactions.add({
                id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                inventory_item_id: item.id,
                transaction_type: type === 'add' ? 'purchase' : 'adjustment',
                quantity: type === 'add' ? quantity : -quantity,
                previous_stock: item.current_stock,
                new_stock: newStock,
                notes: notes || `Manual ${type} adjustment`,
                created_at: new Date().toISOString(),
                synced: false,
            })

            toast.success('Stock updated successfully')
            setAdjustmentItem(null)
        } catch (error) {
            console.error('Stock update error:', error)
            toast.error('Failed to update stock')
        } finally {
            setIsUpdating(false)
        }
    }

    const lowStockCount = useMemo(() => {
        return (inventoryItems || []).filter((item) => item.current_stock <= item.minimum_stock).length
    }, [inventoryItems])

    const totalStockValue = useMemo(() => {
        return (inventoryItems || []).reduce((sum, item) => sum + item.current_stock * item.cost_per_unit, 0)
    }, [inventoryItems])

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="w-7 h-7" />
                        Inventory Check
                    </h1>
                    <p className="text-muted-foreground">View and adjust stock levels</p>
                </div>
                <div className="flex items-center gap-2">
                    <OfflineStatusBar />
                    <Button variant={showLowStock ? 'destructive' : 'outline'} onClick={() => setShowLowStock(!showLowStock)}>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Low Stock ({lowStockCount})
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-primary/10">
                                <Package className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{(inventoryItems || []).length}</p>
                                <p className="text-sm text-muted-foreground">Total Items</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-destructive/10">
                                <TrendingDown className="w-6 h-6 text-destructive" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{lowStockCount}</p>
                                <p className="text-sm text-muted-foreground">Low Stock</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-success/10">
                                <TrendingUp className="w-6 h-6 text-success" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{categories.length}</p>
                                <p className="text-sm text-muted-foreground">Unit Types</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10">
                                <ArrowUpDown className="w-6 h-6 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{formatCurrency(totalStockValue)}</p>
                                <p className="text-sm text-muted-foreground">Stock Value</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search inventory..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>

            {/* Inventory grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="animate-pulse">
                            <CardContent className="p-6">
                                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                                <div className="h-4 bg-muted rounded w-1/2" />
                            </CardContent>
                        </Card>
                    ))
                ) : filteredItems.length === 0 ? (
                    <Card className="col-span-full">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Package className="w-12 h-12 mb-2 opacity-50" />
                            <p>No items found</p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredItems.map((item) => {
                        const isLowStock = item.current_stock <= item.minimum_stock
                        return (
                            <Card
                                key={item.id}
                                className={cn(
                                    'transition-all duration-200 hover:shadow-lg',
                                    isLowStock && 'border-destructive/50 bg-destructive/5'
                                )}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle className="text-lg">{item.name}</CardTitle>
                                            <p className="text-sm text-muted-foreground capitalize">{item.unit}</p>
                                        </div>
                                        <div className="flex gap-1">
                                            {isLowStock && (
                                                <Badge variant="destructive" className="animate-pulse">
                                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                                    Low Stock
                                                </Badge>
                                            )}
                                            {!item.synced && (
                                                <Badge variant="warning">Offline</Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <p className="text-3xl font-bold">
                                                {item.current_stock.toFixed(2)}
                                            </p>
                                            <p className="text-sm text-muted-foreground">{item.unit}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-muted-foreground">Min: {item.minimum_stock} {item.unit}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {formatCurrency(item.cost_per_unit)}/{item.unit}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Stock level bar */}
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className={cn(
                                                'h-full rounded-full transition-all',
                                                isLowStock ? 'bg-destructive' : 'bg-primary'
                                            )}
                                            style={{
                                                width: `${Math.min(100, (item.current_stock / (item.minimum_stock * 3)) * 100)}%`,
                                            }}
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() =>
                                                setAdjustmentItem({
                                                    item,
                                                    quantity: 1,
                                                    type: 'add',
                                                    notes: '',
                                                })
                                            }
                                        >
                                            <Plus className="w-4 h-4 mr-1" />
                                            Add
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() =>
                                                setAdjustmentItem({
                                                    item,
                                                    quantity: 1,
                                                    type: 'remove',
                                                    notes: '',
                                                })
                                            }
                                        >
                                            <Minus className="w-4 h-4 mr-1" />
                                            Remove
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })
                )}
            </div>

            {/* Stock Adjustment Modal */}
            {adjustmentItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAdjustmentItem(null)}>
                    <Card className="w-full max-w-md m-4" onClick={(e) => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {adjustmentItem.type === 'add' ? (
                                    <Plus className="w-5 h-5 text-success" />
                                ) : (
                                    <Minus className="w-5 h-5 text-destructive" />
                                )}
                                {adjustmentItem.type === 'add' ? 'Add Stock' : 'Remove Stock'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded-lg bg-muted">
                                <p className="font-medium">{adjustmentItem.item.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    Current: {adjustmentItem.item.current_stock} {adjustmentItem.item.unit}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Quantity ({adjustmentItem.item.unit})</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={adjustmentItem.quantity}
                                    onChange={(e) =>
                                        setAdjustmentItem({
                                            ...adjustmentItem,
                                            quantity: parseFloat(e.target.value) || 0,
                                        })
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Input
                                    placeholder="Reason for adjustment..."
                                    value={adjustmentItem.notes}
                                    onChange={(e) =>
                                        setAdjustmentItem({ ...adjustmentItem, notes: e.target.value })
                                    }
                                />
                            </div>

                            <Separator />

                            <div className="p-3 rounded-lg bg-muted">
                                <p className="text-sm text-muted-foreground">New Stock Level</p>
                                <p className="text-2xl font-bold">
                                    {adjustmentItem.type === 'add'
                                        ? (adjustmentItem.item.current_stock + adjustmentItem.quantity).toFixed(3)
                                        : Math.max(0, adjustmentItem.item.current_stock - adjustmentItem.quantity).toFixed(3)}{' '}
                                    {adjustmentItem.item.unit}
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setAdjustmentItem(null)}>
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1"
                                    variant={adjustmentItem.type === 'add' ? 'success' : 'destructive'}
                                    onClick={handleStockAdjustment}
                                    disabled={isUpdating || adjustmentItem.quantity <= 0}
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {adjustmentItem.type === 'add' ? 'Add Stock' : 'Remove Stock'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
