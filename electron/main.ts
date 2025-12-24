import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { PrinterService } from './services/printer'

// The built directory structure
const DIST_ELECTRON = join(__dirname)
const DIST = join(DIST_ELECTRON, '../dist')
const PUBLIC = join(DIST_ELECTRON, '../public')

// Disable GPU Acceleration for Windows 7
if (process.platform === 'win32') {
    app.disableHardwareAcceleration()
}

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') {
    app.setAppUserModelId(app.getName())
}

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

let mainWindow: BrowserWindow | null = null

// Initialize printer service
const printerService = new PrinterService()

const preload = join(__dirname, 'preload.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(DIST, 'index.html')

async function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    mainWindow = new BrowserWindow({
        title: 'Kitchen POS',
        icon: join(PUBLIC, 'icon.ico'),
        width: Math.min(1600, width),
        height: Math.min(900, height),
        minWidth: 1200,
        minHeight: 700,
        frame: true,
        titleBarStyle: 'default',
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    })

    if (url) {
        // Development mode
        mainWindow.loadURL(url)
        mainWindow.webContents.openDevTools()
    } else {
        // Production mode
        mainWindow.loadFile(indexHtml)
    }

    // Log window events
    mainWindow.on('closed', () => {
        mainWindow = null
    })

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow?.webContents.send('main-process-message', new Date().toLocaleString())
    })
}

// App lifecycle
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    mainWindow = null
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
    }
})

app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length) {
        allWindows[0].focus()
    } else {
        createWindow()
    }
})

// ============================================
// IPC HANDLERS - Printer Communication
// ============================================

// Get list of available printers
ipcMain.handle('get-printers', async () => {
    try {
        const printers = await printerService.getPrinters()
        return { success: true, printers }
    } catch (error) {
        console.error('Error getting printers:', error)
        return { success: false, error: (error as Error).message }
    }
})

// Print receipt
ipcMain.handle('print-receipt', async (_, data: {
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
}) => {
    try {
        await printerService.printReceipt(data.printerName, data.receipt)
        return { success: true }
    } catch (error) {
        console.error('Error printing receipt:', error)
        return { success: false, error: (error as Error).message }
    }
})

// Print kitchen ticket
ipcMain.handle('print-kitchen-ticket', async (_, data: {
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
}) => {
    try {
        await printerService.printKitchenTicket(data.printerName, data.ticket)
        return { success: true }
    } catch (error) {
        console.error('Error printing kitchen ticket:', error)
        return { success: false, error: (error as Error).message }
    }
})

// Open cash drawer
ipcMain.handle('open-cash-drawer', async (_, printerName: string) => {
    try {
        await printerService.openCashDrawer(printerName)
        return { success: true }
    } catch (error) {
        console.error('Error opening cash drawer:', error)
        return { success: false, error: (error as Error).message }
    }
})

// Test printer connection
ipcMain.handle('test-printer', async (_, printerName: string) => {
    try {
        await printerService.testPrinter(printerName)
        return { success: true }
    } catch (error) {
        console.error('Error testing printer:', error)
        return { success: false, error: (error as Error).message }
    }
})

// ============================================
// IPC HANDLERS - App Controls
// ============================================

ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize()
})

ipcMain.handle('maximize-window', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})

ipcMain.handle('close-window', () => {
    mainWindow?.close()
})

ipcMain.handle('is-maximized', () => {
    return mainWindow?.isMaximized() ?? false
})
