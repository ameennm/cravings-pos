import { useState, useEffect, useMemo } from 'react'
import { Search, ShoppingCart, Trash2, Plus, Minus, Receipt, X, FileText, WifiOff, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLocalMenuItems, useCreateLocalOrder, useSyncStatus } from '@/lib/offlineHooks'
import { useCartStore, useAuthStore } from '@/store'
import { cn, formatCurrency, formatDateTime, groupBy } from '@/lib/utils'
import { OfflineStatusBar } from '@/components/OfflineStatusBar'
import {
    Button,
    Input,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
    ScrollArea,
    Tabs,
    TabsList,
    TabsTrigger,
    Switch,
    Label,
    Separator,
} from '@/components/ui'

export function POSPage() {
    const { user } = useAuthStore()
    const {
        items: cartItems,
        billType,
        customerName,
        tableNumber,
        discount,
        selectedPrinter,
        addItem,
        updateQuantity,
        setBillType,
        setCustomerName,
        setTableNumber,
        setSelectedPrinter,
        clearCart,
        getSubtotal,
        getTaxAmount,
        getTotal,
        getItemCount,
    } = useCartStore()

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [printers, setPrinters] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const [showMobileCart, setShowMobileCart] = useState(false)

    // Track screen size
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Use LOCAL DB menu items - works offline and persists through shutdowns!
    const { data: menuItems, isLoading: isLoadingMenu } = useLocalMenuItems()
    const syncStatus = useSyncStatus()
    const createOrder = useCreateLocalOrder()

    // Get unique categories
    const categories = useMemo(() => {
        const cats = [...new Set((menuItems || []).map((item) => item.category))]
        return ['all', ...cats]
    }, [menuItems])

    // Filter menu items
    const filteredItems = useMemo(() => {
        return (menuItems || []).filter((item) => {
            const matchesSearch =
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
            return matchesSearch && matchesCategory
        })
    }, [menuItems, searchQuery, selectedCategory])

    // Group filtered items by category
    const groupedItems = useMemo(() => {
        if (selectedCategory !== 'all') {
            return { [selectedCategory]: filteredItems }
        }
        return groupBy(filteredItems, 'category')
    }, [filteredItems, selectedCategory])

    // Get printers from Electron
    useEffect(() => {
        const fetchPrinters = async () => {
            if (window.electronAPI) {
                const result = await window.electronAPI.getPrinters()
                if (result.success && result.printers) {
                    setPrinters(result.printers)
                    if (!selectedPrinter && result.printers.length > 0) {
                        setSelectedPrinter(result.printers[0])
                    }
                }
            }
        }
        fetchPrinters()
    }, [selectedPrinter, setSelectedPrinter])

    // Keyboard shortcuts (desktop only)
    useEffect(() => {
        if (isMobile) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F1') {
                e.preventDefault()
                document.getElementById('menu-search')?.focus()
            }
            if (e.key === 'F10') {
                e.preventDefault()
                if (cartItems.length > 0) {
                    handleCheckout()
                }
            }
            if (e.key === 'Escape') {
                setSearchQuery('')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [cartItems, isMobile])

    // Handle checkout - WORKS OFFLINE!
    const handleCheckout = async () => {
        if (cartItems.length === 0) {
            toast.error('Cart is empty')
            return
        }

        setIsSubmitting(true)
        try {
            // Create order LOCALLY - works even offline!
            const orderItems = cartItems.map((item) => ({
                menu_item_id: item.menuItem.id,
                menu_item_name: item.menuItem.name,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                gst_percentage: item.gstPercentage,
                gst_amount: item.gstAmount,
                total_price: item.totalPrice,
                notes: item.notes || undefined,
            }))

            const newOrder = await createOrder.mutateAsync({
                order: {
                    customer_name: customerName || undefined,
                    table_number: tableNumber || undefined,
                    bill_type: billType,
                    subtotal: getSubtotal(),
                    tax_amount: getTaxAmount(),
                    discount_amount: discount,
                    total_amount: getTotal(),
                    payment_method: 'cash',
                    created_by: user?.id,
                },
                items: orderItems,
            })

            // Print receipt if printer available
            if (window.electronAPI && selectedPrinter) {
                const printResult = await window.electronAPI.printReceipt({
                    printerName: selectedPrinter,
                    receipt: {
                        header: {
                            businessName: 'Kitchen POS Restaurant',
                            address: '123 Food Street, City',
                            phone: '+91 98765 43210',
                            gstNumber: billType === 'tax_invoice' ? '29AAACW1234F1Z5' : undefined,
                        },
                        billType,
                        orderNumber: newOrder.order_number,
                        date: formatDateTime(new Date()),
                        customerName: customerName || undefined,
                        tableNumber: tableNumber || undefined,
                        items: cartItems.map((item) => ({
                            name: item.menuItem.name,
                            quantity: item.quantity,
                            price: item.unitPrice,
                            total: item.totalPrice,
                        })),
                        subtotal: getSubtotal(),
                        taxAmount: getTaxAmount(),
                        discount: discount > 0 ? discount : undefined,
                        total: getTotal(),
                        paymentMethod: 'Cash',
                        footer: 'Thank you for dining with us!',
                    },
                })

                if (!printResult.success) {
                    console.error('Print failed:', printResult.error)
                }
            }

            const syncMessage = !syncStatus.isOnline ? ' (Will sync when online)' : ''
            toast.success(`Order #${newOrder.order_number} created!${syncMessage}`)
            clearCart()
            setShowMobileCart(false)
        } catch (error) {
            console.error('Checkout error:', error)
            toast.error('Failed to create order')
        } finally {
            setIsSubmitting(false)
        }
    }

    const subtotal = getSubtotal()
    const taxAmount = getTaxAmount()
    const total = getTotal()
    const itemCount = getItemCount()

    // Cart content component (shared between mobile and desktop)
    const CartContent = () => (
        <>
            {/* GST Toggle */}
            <div className="p-4 bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <Label htmlFor="bill-type" className="font-semibold">Bill Type</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {billType === 'tax_invoice' ? 'Tax Invoice with GST' : 'Estimate without GST'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn('text-sm', billType === 'estimate' && 'text-muted-foreground')}>
                            Est
                        </span>
                        <Switch
                            id="bill-type"
                            checked={billType === 'tax_invoice'}
                            onCheckedChange={(checked) => setBillType(checked ? 'tax_invoice' : 'estimate')}
                        />
                        <span className={cn('text-sm', billType === 'tax_invoice' && 'text-primary font-semibold')}>
                            Tax
                        </span>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Customer info */}
            <div className="p-4 space-y-3">
                <Input
                    placeholder="Customer Name (optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                />
                <Input
                    placeholder="Table Number (optional)"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                />
            </div>

            <Separator />

            {/* Cart items */}
            <div className="flex-1 overflow-auto">
                {cartItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <ShoppingCart className="w-10 h-10 mb-2 opacity-50" />
                        <p className="text-sm">Cart is empty</p>
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {cartItems.map((item) => (
                            <div key={item.id} className="cart-item">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{item.menuItem.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatCurrency(item.unitPrice)} each
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                        className="h-8 w-8"
                                    >
                                        <Minus className="w-3 h-3" />
                                    </Button>
                                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                                    <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                        className="h-8 w-8"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </Button>
                                </div>
                                <div className="w-16 text-right">
                                    <p className="font-semibold text-sm">{formatCurrency(item.totalPrice)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Totals */}
            <div className="border-t border-border p-4 space-y-2 bg-muted/30">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                </div>
                {billType === 'tax_invoice' && taxAmount > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">GST</span>
                        <span>{formatCurrency(taxAmount)}</span>
                    </div>
                )}
                {discount > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="text-destructive">-{formatCurrency(discount)}</span>
                    </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="p-4 pt-0 space-y-2">
                <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={handleCheckout}
                    disabled={cartItems.length === 0 || isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <Receipt className="w-5 h-5" />
                            {isMobile ? 'Checkout' : 'Print & Save (F10)'}
                        </>
                    )}
                </Button>

                {billType === 'estimate' && (
                    <div className="flex items-center justify-center gap-2 text-xs text-warning">
                        <FileText className="w-4 h-4" />
                        Estimate (No GST)
                    </div>
                )}

                {!syncStatus.isOnline && (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <WifiOff className="w-4 h-4" />
                        Offline mode
                    </div>
                )}
            </div>
        </>
    )

    return (
        <div className="h-full flex flex-col lg:flex-row relative">
            {/* Left side - Menu */}
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                {/* Search and filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            id="menu-search"
                            placeholder="Search menu..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isMobile && (
                            <>
                                <kbd className="kbd">F1</kbd>
                                <span className="text-xs text-muted-foreground">Search</span>
                                <kbd className="kbd ml-2">F10</kbd>
                                <span className="text-xs text-muted-foreground">Print</span>
                            </>
                        )}
                        <div className="ml-auto">
                            <OfflineStatusBar />
                        </div>
                    </div>
                </div>

                {/* Category tabs */}
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-4">
                    <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0 justify-start">
                        {categories.map((category) => (
                            <TabsTrigger
                                key={category}
                                value={category}
                                className="capitalize text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                {category}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {/* Menu grid */}
                <ScrollArea className="flex-1">
                    {isLoadingMenu ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (menuItems || []).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                            <p className="text-lg font-semibold">No menu items found</p>
                            <p className="text-sm mt-2">
                                {syncStatus.isOnline
                                    ? 'Add menu items in Supabase and sync'
                                    : 'Connect to internet to load menu items'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6 pr-4 pb-20 lg:pb-4">
                            {Object.entries(groupedItems).map(([category, items]) => (
                                <div key={category}>
                                    {selectedCategory === 'all' && (
                                        <h3 className="text-lg font-semibold mb-3 capitalize">{category}</h3>
                                    )}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                        {(items as typeof menuItems).map((item) => {
                                            const inCart = cartItems.find((ci) => ci.menuItem.id === item.id)
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => addItem({
                                                        ...item,
                                                        description: item.description || null,
                                                        image_url: item.image_url || null,
                                                        preparation_time_mins: 0,
                                                        created_at: item.updated_at,
                                                    })}
                                                    className={cn(
                                                        'menu-item-card text-left p-3 active:scale-[0.98] transition-transform',
                                                        inCart && 'selected'
                                                    )}
                                                >
                                                    <div className="flex items-start justify-between mb-2">
                                                        <Badge variant={item.is_veg ? 'veg' : 'non-veg'} className="text-[10px]">
                                                            {item.is_veg ? 'VEG' : 'NON-VEG'}
                                                        </Badge>
                                                        {inCart && (
                                                            <Badge variant="default" className="text-xs">
                                                                {inCart.quantity}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <h4 className="font-medium text-sm mb-1 line-clamp-2">{item.name}</h4>
                                                    <p className="text-base sm:text-lg font-bold text-primary">
                                                        {formatCurrency(item.price)}
                                                    </p>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Desktop Cart - Right side */}
            {!isMobile && (
                <Card className="w-80 xl:w-96 flex flex-col m-4 ml-0">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <ShoppingCart className="w-5 h-5" />
                                Cart
                                {itemCount > 0 && (
                                    <Badge variant="secondary" className="ml-2">
                                        {itemCount}
                                    </Badge>
                                )}
                            </CardTitle>
                            {cartItems.length > 0 && (
                                <Button variant="ghost" size="sm" onClick={clearCart}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <Separator />
                    <CartContent />
                </Card>
            )}

            {/* Mobile Cart - Floating button */}
            {isMobile && (
                <>
                    <button
                        onClick={() => setShowMobileCart(true)}
                        className={cn(
                            'fixed bottom-4 right-4 z-30 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all',
                            'bg-primary text-primary-foreground',
                            cartItems.length > 0 ? 'animate-bounce-subtle' : ''
                        )}
                    >
                        <ShoppingCart className="w-5 h-5" />
                        <span className="font-semibold">{formatCurrency(total)}</span>
                        {itemCount > 0 && (
                            <Badge variant="secondary" className="bg-white text-primary">
                                {itemCount}
                            </Badge>
                        )}
                    </button>

                    {/* Mobile Cart Drawer */}
                    {showMobileCart && (
                        <>
                            <div
                                className="fixed inset-0 bg-black/50 z-40"
                                onClick={() => setShowMobileCart(false)}
                            />
                            <div className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up">
                                <div className="flex items-center justify-between p-4 border-b">
                                    <div className="flex items-center gap-2">
                                        <ShoppingCart className="w-5 h-5" />
                                        <span className="font-semibold">Cart</span>
                                        {itemCount > 0 && (
                                            <Badge variant="secondary">{itemCount} items</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {cartItems.length > 0 && (
                                            <Button variant="ghost" size="sm" onClick={clearCart}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => setShowMobileCart(false)}>
                                            <X className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </div>
                                <CartContent />
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
