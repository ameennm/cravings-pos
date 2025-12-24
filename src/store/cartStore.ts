import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Database, BillType } from '@/lib/database.types'

type MenuItem = Database['public']['Tables']['menu_items']['Row']

export interface CartItem {
    id: string
    menuItem: MenuItem
    quantity: number
    notes?: string
    unitPrice: number
    gstPercentage: number
    gstAmount: number
    totalPrice: number
}

interface CartState {
    items: CartItem[]
    billType: BillType
    customerName: string
    customerPhone: string
    tableNumber: string
    discount: number
    notes: string
    selectedPrinter: string

    // Actions
    addItem: (menuItem: MenuItem) => void
    removeItem: (itemId: string) => void
    updateQuantity: (itemId: string, quantity: number) => void
    updateItemNotes: (itemId: string, notes: string) => void
    setBillType: (billType: BillType) => void
    setCustomerName: (name: string) => void
    setCustomerPhone: (phone: string) => void
    setTableNumber: (table: string) => void
    setDiscount: (discount: number) => void
    setNotes: (notes: string) => void
    setSelectedPrinter: (printer: string) => void
    clearCart: () => void

    // Computed values
    getSubtotal: () => number
    getTaxAmount: () => number
    getTotal: () => number
    getItemCount: () => number
}

/**
 * Calculate item price with GST based on bill type
 */
const calculateItemPrice = (
    menuItem: MenuItem,
    quantity: number,
    billType: BillType
): Pick<CartItem, 'unitPrice' | 'gstPercentage' | 'gstAmount' | 'totalPrice'> => {
    const unitPrice = menuItem.price
    const gstPercentage = billType === 'tax_invoice' ? menuItem.gst_percentage : 0
    const subtotal = unitPrice * quantity
    const gstAmount = (subtotal * gstPercentage) / 100
    const totalPrice = subtotal + gstAmount

    return {
        unitPrice,
        gstPercentage,
        gstAmount,
        totalPrice,
    }
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            billType: 'tax_invoice',
            customerName: '',
            customerPhone: '',
            tableNumber: '',
            discount: 0,
            notes: '',
            selectedPrinter: '',

            addItem: (menuItem: MenuItem) => {
                const { items, billType } = get()
                const existingItem = items.find((item) => item.menuItem.id === menuItem.id)

                if (existingItem) {
                    // Increment quantity
                    const newQuantity = existingItem.quantity + 1
                    const priceInfo = calculateItemPrice(menuItem, newQuantity, billType)

                    set({
                        items: items.map((item) =>
                            item.id === existingItem.id
                                ? { ...item, quantity: newQuantity, ...priceInfo }
                                : item
                        ),
                    })
                } else {
                    // Add new item
                    const priceInfo = calculateItemPrice(menuItem, 1, billType)
                    const newItem: CartItem = {
                        id: `${menuItem.id}-${Date.now()}`,
                        menuItem,
                        quantity: 1,
                        ...priceInfo,
                    }

                    set({ items: [...items, newItem] })
                }
            },

            removeItem: (itemId: string) => {
                set((state) => ({
                    items: state.items.filter((item) => item.id !== itemId),
                }))
            },

            updateQuantity: (itemId: string, quantity: number) => {
                if (quantity <= 0) {
                    get().removeItem(itemId)
                    return
                }

                const { items, billType } = get()
                set({
                    items: items.map((item) => {
                        if (item.id === itemId) {
                            const priceInfo = calculateItemPrice(item.menuItem, quantity, billType)
                            return { ...item, quantity, ...priceInfo }
                        }
                        return item
                    }),
                })
            },

            updateItemNotes: (itemId: string, notes: string) => {
                set((state) => ({
                    items: state.items.map((item) =>
                        item.id === itemId ? { ...item, notes } : item
                    ),
                }))
            },

            setBillType: (billType: BillType) => {
                const { items } = get()
                // Recalculate all item prices when bill type changes
                const updatedItems = items.map((item) => {
                    const priceInfo = calculateItemPrice(item.menuItem, item.quantity, billType)
                    return { ...item, ...priceInfo }
                })

                set({ billType, items: updatedItems })
            },

            setCustomerName: (customerName: string) => set({ customerName }),
            setCustomerPhone: (customerPhone: string) => set({ customerPhone }),
            setTableNumber: (tableNumber: string) => set({ tableNumber }),
            setDiscount: (discount: number) => set({ discount: Math.max(0, discount) }),
            setNotes: (notes: string) => set({ notes }),
            setSelectedPrinter: (selectedPrinter: string) => set({ selectedPrinter }),

            clearCart: () =>
                set({
                    items: [],
                    customerName: '',
                    customerPhone: '',
                    tableNumber: '',
                    discount: 0,
                    notes: '',
                }),

            getSubtotal: () => {
                const { items } = get()
                return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
            },

            getTaxAmount: () => {
                const { items } = get()
                return items.reduce((sum, item) => sum + item.gstAmount, 0)
            },

            getTotal: () => {
                const { items, discount } = get()
                const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
                return Math.max(0, subtotal - discount)
            },

            getItemCount: () => {
                const { items } = get()
                return items.reduce((sum, item) => sum + item.quantity, 0)
            },
        }),
        {
            name: 'kitchen-pos-cart',
            // Don't persist cart data across sessions
            partialize: (state) => ({ selectedPrinter: state.selectedPrinter }),
        }
    )
)

// Selector hooks for computed values
export const useCartSubtotal = () => useCartStore((state) => state.getSubtotal())
export const useCartTaxAmount = () => useCartStore((state) => state.getTaxAmount())
export const useCartTotal = () => useCartStore((state) => state.getTotal())
export const useCartItemCount = () => useCartStore((state) => state.getItemCount())
export const useIsTaxInvoice = () => useCartStore((state) => state.billType === 'tax_invoice')
