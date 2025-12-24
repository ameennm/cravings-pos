import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Plus,
    Pencil,
    Trash2,
    Search,
    X,
    Package,
    AlertTriangle,
    TrendingDown,
    TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { db, LocalInventoryItem } from '@/lib/offlineDatabase'
import { supabase } from '@/lib/supabase'
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
    Switch,
} from '@/components/ui'

interface InventoryForm {
    id?: string
    name: string
    unit: string
    current_stock: number
    minimum_stock: number
    cost_per_unit: number
    is_active: boolean
}

const defaultForm: InventoryForm = {
    name: '',
    unit: 'kg',
    current_stock: 0,
    minimum_stock: 5,
    cost_per_unit: 0,
    is_active: true,
}

const units = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'packet', 'bottle', 'box']

export function StockManagementPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [form, setForm] = useState<InventoryForm>(defaultForm)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const [adjustStock, setAdjustStock] = useState<{ id: string; name: string; current: number } | null>(null)
    const [adjustAmount, setAdjustAmount] = useState(0)
    const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add')

    const syncStatus = useSyncStatus()

    // Get inventory items from local DB
    const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray(), [], [])

    const filteredItems = (inventoryItems || []).filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const lowStockItems = filteredItems.filter(item => item.current_stock <= item.minimum_stock)

    const openNewForm = () => {
        setForm(defaultForm)
        setIsEditing(false)
        setIsFormOpen(true)
    }

    const openEditForm = (item: LocalInventoryItem) => {
        setForm({
            id: item.id,
            name: item.name,
            unit: item.unit,
            current_stock: item.current_stock,
            minimum_stock: item.minimum_stock,
            cost_per_unit: item.cost_per_unit,
            is_active: !!item.is_active,
        })
        setIsEditing(true)
        setIsFormOpen(true)
    }

    const closeForm = () => {
        setForm(defaultForm)
        setIsFormOpen(false)
        setIsEditing(false)
    }

    const handleSave = async () => {
        if (!form.name.trim()) {
            toast.error('Stock item name is required')
            return
        }

        setIsSaving(true)
        try {
            const now = new Date().toISOString()
            const itemData = {
                name: form.name.trim(),
                unit: form.unit,
                current_stock: form.current_stock,
                minimum_stock: form.minimum_stock,
                cost_per_unit: form.cost_per_unit,
                is_active: form.is_active,
                synced: false,
                updated_at: now,
            }

            if (isEditing && form.id) {
                // Update existing
                await db.inventoryItems.update(form.id, itemData)

                if (syncStatus.isOnline) {
                    await supabase.from('inventory_items').update({
                        ...itemData,
                        synced: undefined,
                    }).eq('id', form.id)
                    await db.inventoryItems.update(form.id, { synced: true })
                }

                toast.success('Stock item updated')
            } else {
                // Create new
                const itemId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

                await db.inventoryItems.add({
                    ...itemData,
                    id: itemId,
                } as LocalInventoryItem)

                if (syncStatus.isOnline) {
                    const { data, error } = await supabase.from('inventory_items').insert({
                        name: itemData.name,
                        unit: itemData.unit,
                        current_stock: itemData.current_stock,
                        minimum_stock: itemData.minimum_stock,
                        cost_per_unit: itemData.cost_per_unit,
                        is_active: itemData.is_active,
                    }).select().single()

                    if (data && !error) {
                        await db.inventoryItems.delete(itemId)
                        await db.inventoryItems.add({
                            ...itemData,
                            id: data.id,
                            synced: true,
                        } as LocalInventoryItem)
                    }
                }

                toast.success('Stock item created')
            }

            closeForm()
        } catch (error) {
            console.error('Save error:', error)
            toast.error('Failed to save stock item')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await db.inventoryItems.delete(id)

            if (syncStatus.isOnline) {
                await supabase.from('inventory_items').delete().eq('id', id)
            }

            toast.success('Stock item deleted')
            setDeleteConfirm(null)
        } catch (error) {
            console.error('Delete error:', error)
            toast.error('Failed to delete stock item')
        }
    }

    const handleAdjustStock = async () => {
        if (!adjustStock || adjustAmount <= 0) return

        try {
            const newStock = adjustType === 'add'
                ? adjustStock.current + adjustAmount
                : Math.max(0, adjustStock.current - adjustAmount)

            await db.inventoryItems.update(adjustStock.id, {
                current_stock: newStock,
                synced: false,
                updated_at: new Date().toISOString(),
            })

            // Add transaction record
            await db.inventoryTransactions.add({
                id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                inventory_item_id: adjustStock.id,
                transaction_type: adjustType === 'add' ? 'restock' : 'manual_deduction',
                quantity: adjustType === 'add' ? adjustAmount : -adjustAmount,
                previous_stock: adjustStock.current,
                new_stock: newStock,
                notes: `Manual ${adjustType === 'add' ? 'addition' : 'removal'}`,
                created_at: new Date().toISOString(),
                synced: false,
            })

            if (syncStatus.isOnline) {
                await supabase.from('inventory_items').update({
                    current_stock: newStock,
                }).eq('id', adjustStock.id)
            }

            toast.success(`Stock ${adjustType === 'add' ? 'added' : 'removed'} successfully`)
            setAdjustStock(null)
            setAdjustAmount(0)
        } catch (error) {
            console.error('Adjust stock error:', error)
            toast.error('Failed to adjust stock')
        }
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="w-7 h-7" />
                        Stock Management
                    </h1>
                    <p className="text-muted-foreground">Manage inventory and stock levels</p>
                </div>
                <div className="flex items-center gap-4">
                    <OfflineStatusBar />
                    <Button onClick={openNewForm}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Stock Item
                    </Button>
                </div>
            </div>

            {/* Low Stock Warning */}
            {lowStockItems.length > 0 && (
                <Card className="border-warning bg-warning/10">
                    <CardContent className="py-3">
                        <div className="flex items-center gap-2 text-warning">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-medium">
                                {lowStockItems.length} item(s) running low on stock
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search stock items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Stock Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item) => {
                    const isLowStock = item.current_stock <= item.minimum_stock
                    return (
                        <Card key={item.id} className={cn(
                            !item.is_active && 'opacity-60',
                            isLowStock && 'border-warning'
                        )}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">{item.name}</CardTitle>
                                        <p className="text-sm text-muted-foreground">Unit: {item.unit}</p>
                                    </div>
                                    {isLowStock && (
                                        <Badge variant="warning">Low Stock</Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Current Stock</span>
                                    <span className={cn(
                                        "text-2xl font-bold",
                                        isLowStock ? "text-warning" : "text-primary"
                                    )}>
                                        {item.current_stock} {item.unit}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Min. Stock</span>
                                    <span>{item.minimum_stock} {item.unit}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Cost/Unit</span>
                                    <span>{formatCurrency(item.cost_per_unit)}</span>
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setAdjustStock({ id: item.id, name: item.name, current: item.current_stock })
                                                setAdjustType('add')
                                                setAdjustAmount(0)
                                            }}
                                        >
                                            <TrendingUp className="w-4 h-4 mr-1" />
                                            Add
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setAdjustStock({ id: item.id, name: item.name, current: item.current_stock })
                                                setAdjustType('remove')
                                                setAdjustAmount(0)
                                            }}
                                        >
                                            <TrendingDown className="w-4 h-4 mr-1" />
                                            Remove
                                        </Button>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => openEditForm(item)}
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => setDeleteConfirm(item.id)}
                                        >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {filteredItems.length === 0 && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Package className="w-12 h-12 mb-2 opacity-50" />
                        <p>No stock items found</p>
                        <Button variant="link" onClick={openNewForm}>
                            Add your first stock item
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-lg m-4">
                        <CardHeader className="border-b">
                            <div className="flex items-center justify-between">
                                <CardTitle>{isEditing ? 'Edit Stock Item' : 'Add New Stock Item'}</CardTitle>
                                <Button variant="ghost" size="icon" onClick={closeForm}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div>
                                <Label>Item Name *</Label>
                                <Input
                                    value={form.name}
                                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Chicken Breast"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Unit *</Label>
                                    <select
                                        value={form.unit}
                                        onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                                    >
                                        {units.map(unit => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>Cost per Unit (₹)</Label>
                                    <Input
                                        type="number"
                                        value={form.cost_per_unit}
                                        onChange={(e) => setForm(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                                        min={0}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Current Stock</Label>
                                    <Input
                                        type="number"
                                        value={form.current_stock}
                                        onChange={(e) => setForm(prev => ({ ...prev, current_stock: parseFloat(e.target.value) || 0 }))}
                                        min={0}
                                        step={0.1}
                                    />
                                </div>
                                <div>
                                    <Label>Minimum Stock (Alert)</Label>
                                    <Input
                                        type="number"
                                        value={form.minimum_stock}
                                        onChange={(e) => setForm(prev => ({ ...prev, minimum_stock: parseFloat(e.target.value) || 0 }))}
                                        min={0}
                                        step={0.1}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={form.is_active}
                                    onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_active: checked }))}
                                />
                                <Label>Active</Label>
                            </div>
                        </CardContent>
                        <div className="border-t p-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={closeForm}>Cancel</Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Adjust Stock Modal */}
            {adjustStock && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-sm m-4">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {adjustType === 'add' ? (
                                    <TrendingUp className="w-5 h-5 text-success" />
                                ) : (
                                    <TrendingDown className="w-5 h-5 text-warning" />
                                )}
                                {adjustType === 'add' ? 'Add Stock' : 'Remove Stock'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p><strong>{adjustStock.name}</strong></p>
                            <p className="text-sm text-muted-foreground">
                                Current stock: {adjustStock.current}
                            </p>
                            <div>
                                <Label>Quantity to {adjustType}</Label>
                                <Input
                                    type="number"
                                    value={adjustAmount}
                                    onChange={(e) => setAdjustAmount(parseFloat(e.target.value) || 0)}
                                    min={0}
                                    step={0.1}
                                    autoFocus
                                />
                            </div>
                            <p className="text-sm">
                                New stock will be:{' '}
                                <strong>
                                    {adjustType === 'add'
                                        ? adjustStock.current + adjustAmount
                                        : Math.max(0, adjustStock.current - adjustAmount)}
                                </strong>
                            </p>
                        </CardContent>
                        <div className="border-t p-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setAdjustStock(null)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAdjustStock}
                                disabled={adjustAmount <= 0}
                                variant={adjustType === 'add' ? 'default' : 'warning'}
                            >
                                {adjustType === 'add' ? 'Add Stock' : 'Remove Stock'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-md m-4">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="w-5 h-5" />
                                Delete Stock Item
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>Are you sure you want to delete this stock item?</p>
                        </CardContent>
                        <div className="p-4 pt-0 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" onClick={() => handleDelete(deleteConfirm)}>
                                Delete
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
