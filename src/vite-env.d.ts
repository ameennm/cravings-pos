/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

// Electron API exposed from preload script
interface ElectronAPI {
    getPrinters: () => Promise<{ success: boolean; printers?: string[]; error?: string }>
    printReceipt: (data: {
        printerName: string
        receipt: {
            header: {
                businessName: string
                address?: string
                phone?: string
                gstNumber?: string
            }
            billType: 'tax_invoice' | 'estimate'
            orderNumber: number
            date: string
            customerName?: string
            tableNumber?: string
            items: Array<{
                name: string
                quantity: number
                price: number
                total: number
            }>
            subtotal: number
            taxAmount: number
            discount?: number
            total: number
            paymentMethod?: string
            footer?: string
        }
    }) => Promise<{ success: boolean; error?: string }>
    printKitchenTicket: (data: {
        printerName: string
        ticket: {
            orderNumber: number
            tableNumber?: string
            items: Array<{
                name: string
                quantity: number
                notes?: string
            }>
            notes?: string
            time: string
        }
    }) => Promise<{ success: boolean; error?: string }>
    openCashDrawer: (printerName: string) => Promise<{ success: boolean; error?: string }>
    testPrinter: (printerName: string) => Promise<{ success: boolean; error?: string }>
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    isMaximized: () => Promise<boolean>
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
}

export { }
