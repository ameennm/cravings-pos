import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Printer APIs
    getPrinters: () => ipcRenderer.invoke('get-printers'),
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
    }) => ipcRenderer.invoke('print-receipt', data),
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
    }) => ipcRenderer.invoke('print-kitchen-ticket', data),
    openCashDrawer: (printerName: string) => ipcRenderer.invoke('open-cash-drawer', printerName),
    testPrinter: (printerName: string) => ipcRenderer.invoke('test-printer', printerName),

    // Window APIs
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    isMaximized: () => ipcRenderer.invoke('is-maximized'),

    // Event listeners
    onMainProcessMessage: (callback: (message: string) => void) => {
        ipcRenderer.on('main-process-message', (_, message) => callback(message))
    },
})

// Type definitions for the renderer process
declare global {
    interface Window {
        electronAPI: {
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
            minimizeWindow: () => Promise<void>
            maximizeWindow: () => Promise<void>
            closeWindow: () => Promise<void>
            isMaximized: () => Promise<boolean>
            onMainProcessMessage: (callback: (message: string) => void) => void
        }
    }
}
