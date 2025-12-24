import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ClipboardCheck,
    AlertTriangle,
    Save,
    CheckCircle2,
    Package,
    Edit,
    X,
    Calendar,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/offlineDatabase'
import { useLocalInventoryItems, useLocalDailyClosings, useSyncStatus, useLocalOrdersSummary } from '@/lib/offlineHooks'
import { performFullSync } from '@/lib/syncService'
import { useAuthStore } from '@/store'
import { cn, formatDate, formatCurrency, getTodayDate, getYesterdayDate, isPast10AM } from '@/lib/utils'
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
    Label,
    ScrollArea,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@/components/ui'


interface StockVerification {
    id?: string
    inventoryItemId: string
    itemName: string
    unit: string
    systemStock: number
    physicalStock: number
    wastage: number
    variance: number
    notes: string
}

export function DailyClosingPage() {
    const queryClient = useQueryClient()
    const { user } = useAuthStore()
    const [closingDate, setClosingDate] = useState(getYesterdayDate())
    const [stockVerifications, setStockVerifications] = useState<StockVerification[]>([])
    const [generalNotes, setGeneralNotes] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [activeTab, setActiveTab] = useState<'new' | 'history'>('new')

    const syncStatus = useSyncStatus()

    // Check if should show warning
    const showWarning = isPast10AM() && closingDate === getYesterdayDate()

    // Fetch inventory items from local DB
    const { data: inventoryItems = [], isLoading: isLoadingInventory } = useLocalInventoryItems()

    // Sort inventory items by name
    const sortedInventoryItems = [...inventoryItems].sort((a, b) => a.name.localeCompare(b.name))

    // Check if closing already exists for date (from local DB)
    const existingClosing = useLiveQuery(
        async () => {
            const closing = await db.dailyClosings.where('closing_date').equals(closingDate).first()
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
        [closingDate]
    )

    // Refetch closing function
    const refetchClosing = async () => {
        // Trigger a full sync to get latest data
        if (syncStatus.isOnline) {
            await performFullSync()
        }
    }

    // Fetch history of closings from local DB
    const { data: closingHistory = [] } = useLocalDailyClosings()

    // Get orders summary for the date from local DB
    const { data: ordersSummary } = useLocalOrdersSummary(closingDate)


    // Initialize stock verifications
    useEffect(() => {
        if (sortedInventoryItems.length > 0 && !existingClosing && !isEditing) {
            setStockVerifications(
                sortedInventoryItems.map((item) => ({
                    inventoryItemId: item.id,
                    itemName: item.name,
                    unit: item.unit,
                    systemStock: item.current_stock,
                    physicalStock: item.current_stock,
                    wastage: 0,
                    variance: 0,
                    notes: '',
                }))
            )
        }
    }, [sortedInventoryItems, existingClosing, isEditing])

    // Load existing closing data for editing
    const loadForEditing = () => {
        if (existingClosing && existingClosing.stock_verifications) {
            setStockVerifications(
                existingClosing.stock_verifications.map((v: any) => {
                    const item = sortedInventoryItems.find((i) => i.id === v.inventory_item_id)
                    return {
                        id: v.id,
                        inventoryItemId: v.inventory_item_id,
                        itemName: item?.name || 'Unknown',
                        unit: item?.unit || '',
                        systemStock: v.system_stock,
                        physicalStock: v.physical_stock,
                        wastage: v.wastage || 0,
                        variance: v.physical_stock - v.system_stock,
                        notes: v.notes || '',
                    }
                })
            )
            setGeneralNotes(existingClosing.notes || '')
            setIsEditing(true)
        }
    }

    // Update verification values
    const updateVerification = (
        index: number,
        field: 'physicalStock' | 'wastage' | 'notes',
        value: number | string
    ) => {
        setStockVerifications((prev) => {
            const updated = [...prev]
            if (field === 'notes') {
                updated[index] = { ...updated[index], notes: value as string }
            } else {
                updated[index] = { ...updated[index], [field]: value as number }
                updated[index].variance =
                    updated[index].physicalStock - updated[index].systemStock + updated[index].wastage
            }
            return updated
        })
    }

    // Submit or Update daily closing - Offline First
    const submitClosingMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error('Not authenticated')
            const now = new Date().toISOString()

            if (isEditing && existingClosing) {
                // UPDATE existing closing - save to local DB first
                await db.dailyClosings.update(existingClosing.id, {
                    notes: generalNotes,
                    total_orders: ordersSummary?.totalOrders || 0,
                    total_revenue: ordersSummary?.totalRevenue || 0,
                    synced: false,
                })

                // Update stock verifications in local DB
                for (const v of stockVerifications) {
                    if (v.id) {
                        await db.stockVerifications.update(v.id, {
                            physical_stock: v.physicalStock,
                            wastage: v.wastage,
                            notes: v.notes,
                            synced: false,
                        })
                    }
                }

                // Sync to Supabase if online
                if (syncStatus.isOnline) {
                    await supabase
                        .from('daily_closing_logs')
                        .update({
                            notes: generalNotes,
                            total_orders: ordersSummary?.totalOrders || 0,
                            total_revenue: ordersSummary?.totalRevenue || 0,
                            updated_at: now,
                        } as any)
                        .eq('id', existingClosing.id)

                    for (const v of stockVerifications) {
                        if (v.id) {
                            await supabase
                                .from('stock_verifications')
                                .update({
                                    physical_stock: v.physicalStock,
                                    wastage: v.wastage,
                                    notes: v.notes,
                                } as any)
                                .eq('id', v.id)
                        }
                    }

                    // Mark as synced
                    await db.dailyClosings.update(existingClosing.id, { synced: true })
                    for (const v of stockVerifications) {
                        if (v.id) {
                            await db.stockVerifications.update(v.id, { synced: true })
                        }
                    }
                }
            } else {
                // CREATE new closing - save to local DB first
                const closingId = `closing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

                await db.dailyClosings.add({
                    id: closingId,
                    closing_date: closingDate,
                    submitted_by: user.id,
                    notes: generalNotes,
                    total_orders: ordersSummary?.totalOrders || 0,
                    total_revenue: ordersSummary?.totalRevenue || 0,
                    created_at: now,
                    synced: false,
                })

                // Create stock verifications in local DB
                for (const v of stockVerifications) {
                    const verificationId = `sv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                    await db.stockVerifications.add({
                        id: verificationId,
                        daily_closing_id: closingId,
                        inventory_item_id: v.inventoryItemId,
                        system_stock: v.systemStock,
                        physical_stock: v.physicalStock,
                        wastage: v.wastage,
                        notes: v.notes,
                        synced: false,
                    })

                    // Update inventory with physical counts
                    if (v.physicalStock !== v.systemStock) {
                        await db.inventoryItems.update(v.inventoryItemId, {
                            current_stock: v.physicalStock,
                            synced: false,
                            updated_at: now,
                        })
                    }
                }

                // Sync to Supabase if online
                if (syncStatus.isOnline) {
                    const { data: closing, error: closingError } = await supabase
                        .from('daily_closing_logs')
                        .insert({
                            closing_date: closingDate,
                            submitted_by: user.id,
                            notes: generalNotes,
                            total_orders: ordersSummary?.totalOrders || 0,
                            total_revenue: ordersSummary?.totalRevenue || 0,
                        } as any)
                        .select()
                        .single()

                    if (!closingError && closing) {
                        // Update local with server ID
                        await db.dailyClosings.delete(closingId)
                        await db.dailyClosings.add({
                            id: (closing as any).id,
                            closing_date: closingDate,
                            submitted_by: user.id,
                            notes: generalNotes,
                            total_orders: ordersSummary?.totalOrders || 0,
                            total_revenue: ordersSummary?.totalRevenue || 0,
                            created_at: now,
                            synced: true,
                        })

                        // Create stock verifications on server
                        const verificationsToInsert = stockVerifications.map((v) => ({
                            daily_closing_id: (closing as any).id,
                            inventory_item_id: v.inventoryItemId,
                            system_stock: v.systemStock,
                            physical_stock: v.physicalStock,
                            wastage: v.wastage,
                            notes: v.notes,
                        }))

                        await supabase.from('stock_verifications').insert(verificationsToInsert as any)

                        // Update inventory on server
                        for (const v of stockVerifications) {
                            if (v.physicalStock !== v.systemStock) {
                                await supabase
                                    .from('inventory_items')
                                    .update({
                                        current_stock: v.physicalStock,
                                        updated_at: now,
                                    } as any)
                                    .eq('id', v.inventoryItemId)
                            }
                        }

                        // Clean up old local verifications and mark synced
                        const localVerifications = await db.stockVerifications
                            .where('daily_closing_id')
                            .equals(closingId)
                            .toArray()
                        for (const lv of localVerifications) {
                            await db.stockVerifications.delete(lv.id)
                        }
                    }
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['daily-closing'] })
            queryClient.invalidateQueries({ queryKey: ['closing-history'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
            setIsEditing(false)
            toast.success(isEditing ? 'Daily closing updated!' : 'Daily closing submitted!')
            refetchClosing()
        },
        onError: (error: any) => {
            if (error.code === '23505') {
                toast.error('Closing already exists for this date')
            } else {
                toast.error('Failed to save daily closing')
            }
            console.error(error)
        },
    })

    const cancelEditing = () => {
        setIsEditing(false)
        refetchClosing()
    }

    const hasVariances = stockVerifications.some((v) => v.variance !== 0)
    const isAlreadySubmitted = !!existingClosing && !isEditing

    return (
        <div className="p-6 space-y-6">
            {/* Warning Banner */}
            {showWarning && !existingClosing && (
                <div className="warning-banner flex items-start gap-4">
                    <AlertTriangle className="w-8 h-8 flex-shrink-0" />
                    <div>
                        <h2 className="text-lg font-bold">Daily Closing Pending!</h2>
                        <p className="text-sm opacity-90 mt-1">
                            It is past 10:00 AM and yesterday's daily closing has not been submitted.
                        </p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ClipboardCheck className="w-7 h-7" />
                        Daily Closing
                    </h1>
                    <p className="text-muted-foreground">Verify stock and submit end-of-day report</p>
                </div>
                <OfflineStatusBar />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'new' | 'history')}>
                <TabsList>
                    <TabsTrigger value="new">New / Edit Closing</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="new" className="space-y-6">
                    {/* Date selector */}
                    <div className="flex items-center gap-4">
                        <Label htmlFor="closing-date">Date:</Label>
                        <Input
                            id="closing-date"
                            type="date"
                            value={closingDate}
                            onChange={(e) => {
                                setClosingDate(e.target.value)
                                setIsEditing(false)
                            }}
                            max={getTodayDate()}
                            className="w-40"
                        />
                        {isEditing && (
                            <Badge variant="warning">Editing Mode</Badge>
                        )}
                    </div>

                    {/* Already submitted message with edit button */}
                    {isAlreadySubmitted && (
                        <Card className="border-success/50 bg-success/5">
                            <CardContent className="py-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-full bg-success/20">
                                        <CheckCircle2 className="w-8 h-8 text-success" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg">Closing Submitted</h3>
                                        <p className="text-muted-foreground">
                                            {formatDate(closingDate)} - {existingClosing.total_orders} orders, {formatCurrency(existingClosing.total_revenue)} revenue
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" onClick={loadForEditing}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit Closing
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Day Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-primary/10">
                                        <ClipboardCheck className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{ordersSummary?.totalOrders || 0}</p>
                                        <p className="text-sm text-muted-foreground">Total Orders</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-success/10">
                                        <Package className="w-6 h-6 text-success" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">
                                            {formatCurrency(ordersSummary?.totalRevenue || 0)}
                                        </p>
                                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-warning/10">
                                        <AlertTriangle className="w-6 h-6 text-warning" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">
                                            {stockVerifications.filter((v) => v.variance !== 0).length}
                                        </p>
                                        <p className="text-sm text-muted-foreground">Items with Variance</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Stock Verification Form */}
                    {(!isAlreadySubmitted || isEditing) && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Stock Verification</CardTitle>
                                <CardDescription>
                                    Compare system stock with physical count. Enter wastage if applicable.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[350px] pr-4">
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground pb-2 border-b sticky top-0 bg-card">
                                            <div className="col-span-3">Item</div>
                                            <div className="col-span-2 text-right">System Stock</div>
                                            <div className="col-span-2 text-center">Physical Count</div>
                                            <div className="col-span-2 text-center">Wastage</div>
                                            <div className="col-span-1 text-center">Variance</div>
                                            <div className="col-span-2">Notes</div>
                                        </div>

                                        {isLoadingInventory ? (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        ) : (
                                            stockVerifications.map((item, index) => (
                                                <div
                                                    key={item.inventoryItemId}
                                                    className={cn(
                                                        'grid grid-cols-12 gap-4 items-center py-2 rounded-lg',
                                                        item.variance !== 0 && 'bg-warning/5'
                                                    )}
                                                >
                                                    <div className="col-span-3">
                                                        <p className="font-medium text-sm">{item.itemName}</p>
                                                        <p className="text-xs text-muted-foreground">{item.unit}</p>
                                                    </div>
                                                    <div className="col-span-2 text-right font-mono text-sm">
                                                        {item.systemStock.toFixed(2)}
                                                    </div>
                                                    <div className="col-span-2">
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={item.physicalStock}
                                                            onChange={(e) =>
                                                                updateVerification(index, 'physicalStock', parseFloat(e.target.value) || 0)
                                                            }
                                                            className="text-center h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={item.wastage}
                                                            onChange={(e) =>
                                                                updateVerification(index, 'wastage', parseFloat(e.target.value) || 0)
                                                            }
                                                            className="text-center h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-1 text-center">
                                                        <Badge
                                                            variant={
                                                                item.variance === 0
                                                                    ? 'secondary'
                                                                    : item.variance > 0
                                                                        ? 'success'
                                                                        : 'destructive'
                                                            }
                                                            className="text-xs"
                                                        >
                                                            {item.variance > 0 ? '+' : ''}
                                                            {item.variance.toFixed(2)}
                                                        </Badge>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <Input
                                                            placeholder="Notes"
                                                            value={item.notes}
                                                            onChange={(e) => updateVerification(index, 'notes', e.target.value)}
                                                            className="h-8 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}

                    {/* General Notes */}
                    {(!isAlreadySubmitted || isEditing) && (
                        <Card>
                            <CardHeader>
                                <CardTitle>General Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Input
                                    placeholder="Any observations or notes for this closing..."
                                    value={generalNotes}
                                    onChange={(e) => setGeneralNotes(e.target.value)}
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Submit/Update Buttons */}
                    {(!isAlreadySubmitted || isEditing) && (
                        <div className="flex justify-end gap-4">
                            {hasVariances && (
                                <p className="flex items-center text-warning text-sm">
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    {stockVerifications.filter((v) => v.variance !== 0).length} items have variance
                                </p>
                            )}
                            {isEditing && (
                                <Button variant="outline" onClick={cancelEditing}>
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                            )}
                            <Button
                                size="lg"
                                onClick={() => submitClosingMutation.mutate()}
                                disabled={submitClosingMutation.isPending}
                            >
                                {submitClosingMutation.isPending ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                        {isEditing ? 'Updating...' : 'Submitting...'}
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5 mr-2" />
                                        {isEditing ? 'Update Closing' : 'Submit Daily Closing'}
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <CardTitle>Closing History</CardTitle>
                            <CardDescription>View and edit past daily closing reports</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[500px]">
                                <div className="space-y-2">
                                    {closingHistory.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-8">No closing history found</p>
                                    ) : (
                                        closingHistory.map((closing) => (
                                            <div
                                                key={closing.id}
                                                className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2 rounded-lg bg-primary/10">
                                                        <Calendar className="w-5 h-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{formatDate(closing.closing_date)}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {closing.total_orders} orders • {formatCurrency(closing.total_revenue)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setClosingDate(closing.closing_date)
                                                        setActiveTab('new')
                                                    }}
                                                >
                                                    <Edit className="w-4 h-4 mr-2" />
                                                    View/Edit
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
