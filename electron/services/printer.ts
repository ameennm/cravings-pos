/**
 * Printer Service for Thermal Receipt Printing
 * Uses raw ESC/POS commands for maximum compatibility
 */

// ESC/POS Command Constants
const ESC = '\x1B'
const GS = '\x1D'
const FS = '\x1C'

const COMMANDS = {
    // Initialize
    INIT: ESC + '@',

    // Line spacing
    LINE_SPACING_DEFAULT: ESC + '2',
    LINE_SPACING_NONE: ESC + '3\x00',

    // Text alignment
    ALIGN_LEFT: ESC + 'a\x00',
    ALIGN_CENTER: ESC + 'a\x01',
    ALIGN_RIGHT: ESC + 'a\x02',

    // Text style
    BOLD_ON: ESC + 'E\x01',
    BOLD_OFF: ESC + 'E\x00',
    DOUBLE_HEIGHT_ON: ESC + '!\x10',
    DOUBLE_WIDTH_ON: ESC + '!\x20',
    DOUBLE_ON: ESC + '!\x30',
    NORMAL: ESC + '!\x00',
    UNDERLINE_ON: ESC + '-\x01',
    UNDERLINE_OFF: ESC + '-\x00',

    // Character size
    SIZE_NORMAL: GS + '!\x00',
    SIZE_DOUBLE_HEIGHT: GS + '!\x01',
    SIZE_DOUBLE_WIDTH: GS + '!\x10',
    SIZE_DOUBLE: GS + '!\x11',

    // Paper
    CUT_PARTIAL: GS + 'V\x01',
    CUT_FULL: GS + 'V\x00',
    FEED_LINES: (n: number) => ESC + 'd' + String.fromCharCode(n),

    // Cash drawer
    OPEN_DRAWER: ESC + 'p\x00\x19\xfa',
    OPEN_DRAWER_ALT: ESC + 'p\x00\x32\xff',

    // Horizontal line
    HORIZONTAL_LINE: '--------------------------------',
    HORIZONTAL_LINE_DOUBLE: '================================',
}

interface ReceiptData {
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

interface KitchenTicket {
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

export class PrinterService {
    private paperWidth = 32 // Characters for 58mm printer (48 for 80mm)

    /**
     * Get list of available printers from the system
     */
    async getPrinters(): Promise<string[]> {
        try {
            // In Electron, we can use the webContents.getPrinters() method
            // This is a placeholder - actual implementation depends on printer library
            const { exec } = await import('child_process')

            return new Promise((resolve, reject) => {
                if (process.platform === 'win32') {
                    exec('wmic printer get name', (error, stdout) => {
                        if (error) {
                            reject(error)
                            return
                        }
                        const printers = stdout
                            .split('\n')
                            .slice(1)
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                        resolve(printers)
                    })
                } else {
                    exec('lpstat -p', (error, stdout) => {
                        if (error) {
                            reject(error)
                            return
                        }
                        const printers = stdout
                            .split('\n')
                            .map(line => {
                                const match = line.match(/printer (\S+)/)
                                return match ? match[1] : null
                            })
                            .filter((name): name is string => name !== null)
                        resolve(printers)
                    })
                }
            })
        } catch (error) {
            console.error('Error getting printers:', error)
            return []
        }
    }

    /**
     * Format text to fit within paper width
     */
    private formatLine(left: string, right: string, fillChar = ' '): string {
        const maxLeft = this.paperWidth - right.length - 1
        const truncatedLeft = left.length > maxLeft ? left.substring(0, maxLeft) : left
        const padding = fillChar.repeat(this.paperWidth - truncatedLeft.length - right.length)
        return truncatedLeft + padding + right
    }

    /**
     * Center text
     */
    private centerText(text: string): string {
        const padding = Math.max(0, Math.floor((this.paperWidth - text.length) / 2))
        return ' '.repeat(padding) + text
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return `₹${amount.toFixed(2)}`
    }

    /**
     * Build ESC/POS receipt buffer
     */
    buildReceiptBuffer(receipt: ReceiptData): string {
        let buffer = ''

        // Initialize printer
        buffer += COMMANDS.INIT

        // Header - Business Name (large, centered)
        buffer += COMMANDS.ALIGN_CENTER
        buffer += COMMANDS.SIZE_DOUBLE
        buffer += receipt.header.businessName + '\n'
        buffer += COMMANDS.SIZE_NORMAL

        // Address and contact
        if (receipt.header.address) {
            buffer += receipt.header.address + '\n'
        }
        if (receipt.header.phone) {
            buffer += 'Ph: ' + receipt.header.phone + '\n'
        }
        if (receipt.header.gstNumber && receipt.billType === 'tax_invoice') {
            buffer += 'GSTIN: ' + receipt.header.gstNumber + '\n'
        }

        buffer += '\n'

        // Bill Type Header
        buffer += COMMANDS.SIZE_DOUBLE_HEIGHT
        buffer += COMMANDS.BOLD_ON
        if (receipt.billType === 'tax_invoice') {
            buffer += '*** TAX INVOICE ***\n'
        } else {
            buffer += '*** ESTIMATE ***\n'
        }
        buffer += COMMANDS.BOLD_OFF
        buffer += COMMANDS.SIZE_NORMAL

        buffer += COMMANDS.HORIZONTAL_LINE + '\n'

        // Order details
        buffer += COMMANDS.ALIGN_LEFT
        buffer += this.formatLine('Bill No:', `#${receipt.orderNumber}`) + '\n'
        buffer += this.formatLine('Date:', receipt.date) + '\n'
        if (receipt.tableNumber) {
            buffer += this.formatLine('Table:', receipt.tableNumber) + '\n'
        }
        if (receipt.customerName) {
            buffer += this.formatLine('Customer:', receipt.customerName) + '\n'
        }

        buffer += COMMANDS.HORIZONTAL_LINE + '\n'

        // Column headers
        buffer += COMMANDS.BOLD_ON
        buffer += this.formatLine('Item', 'Amount') + '\n'
        buffer += COMMANDS.BOLD_OFF
        buffer += COMMANDS.HORIZONTAL_LINE + '\n'

        // Items
        for (const item of receipt.items) {
            // Item name with quantity
            const itemLine = `${item.quantity}x ${item.name}`
            const totalStr = this.formatCurrency(item.total)
            buffer += this.formatLine(itemLine, totalStr) + '\n'

            // Unit price if quantity > 1
            if (item.quantity > 1) {
                buffer += `   @ ${this.formatCurrency(item.price)} each\n`
            }
        }

        buffer += COMMANDS.HORIZONTAL_LINE + '\n'

        // Totals
        buffer += this.formatLine('Subtotal:', this.formatCurrency(receipt.subtotal)) + '\n'

        if (receipt.billType === 'tax_invoice' && receipt.taxAmount > 0) {
            buffer += this.formatLine('GST:', this.formatCurrency(receipt.taxAmount)) + '\n'
        }

        if (receipt.discount && receipt.discount > 0) {
            buffer += this.formatLine('Discount:', `-${this.formatCurrency(receipt.discount)}`) + '\n'
        }

        buffer += COMMANDS.HORIZONTAL_LINE_DOUBLE + '\n'

        // Grand Total
        buffer += COMMANDS.SIZE_DOUBLE
        buffer += COMMANDS.BOLD_ON
        buffer += this.formatLine('TOTAL:', this.formatCurrency(receipt.total)) + '\n'
        buffer += COMMANDS.BOLD_OFF
        buffer += COMMANDS.SIZE_NORMAL

        buffer += COMMANDS.HORIZONTAL_LINE_DOUBLE + '\n'

        // Payment method
        if (receipt.paymentMethod) {
            buffer += this.formatLine('Paid via:', receipt.paymentMethod.toUpperCase()) + '\n'
        }

        buffer += '\n'

        // Footer
        buffer += COMMANDS.ALIGN_CENTER
        buffer += receipt.footer || 'Thank you for visiting!\n'
        buffer += 'Please visit again\n'

        buffer += '\n\n'

        // Cut paper
        buffer += COMMANDS.FEED_LINES(3)
        buffer += COMMANDS.CUT_PARTIAL

        return buffer
    }

    /**
     * Build kitchen ticket buffer
     */
    buildKitchenTicketBuffer(ticket: KitchenTicket): string {
        let buffer = ''

        // Initialize printer
        buffer += COMMANDS.INIT

        // Header
        buffer += COMMANDS.ALIGN_CENTER
        buffer += COMMANDS.SIZE_DOUBLE
        buffer += '** KITCHEN ORDER **\n'
        buffer += COMMANDS.SIZE_NORMAL

        buffer += COMMANDS.HORIZONTAL_LINE_DOUBLE + '\n'

        // Order info
        buffer += COMMANDS.ALIGN_LEFT
        buffer += COMMANDS.SIZE_DOUBLE_HEIGHT
        buffer += `Order #${ticket.orderNumber}\n`
        if (ticket.tableNumber) {
            buffer += `Table: ${ticket.tableNumber}\n`
        }
        buffer += COMMANDS.SIZE_NORMAL
        buffer += `Time: ${ticket.time}\n`

        buffer += COMMANDS.HORIZONTAL_LINE + '\n'

        // Items
        buffer += COMMANDS.SIZE_DOUBLE_HEIGHT
        for (const item of ticket.items) {
            buffer += `${item.quantity}x ${item.name}\n`
            if (item.notes) {
                buffer += COMMANDS.SIZE_NORMAL
                buffer += `   >> ${item.notes}\n`
                buffer += COMMANDS.SIZE_DOUBLE_HEIGHT
            }
        }
        buffer += COMMANDS.SIZE_NORMAL

        // Special instructions
        if (ticket.notes) {
            buffer += COMMANDS.HORIZONTAL_LINE + '\n'
            buffer += COMMANDS.BOLD_ON
            buffer += 'NOTES:\n'
            buffer += COMMANDS.BOLD_OFF
            buffer += ticket.notes + '\n'
        }

        buffer += COMMANDS.HORIZONTAL_LINE_DOUBLE + '\n'
        buffer += '\n\n'

        // Cut paper
        buffer += COMMANDS.FEED_LINES(2)
        buffer += COMMANDS.CUT_PARTIAL

        return buffer
    }

    /**
     * Send raw data to printer (Windows)
     */
    private async sendToPrinter(printerName: string, data: string): Promise<void> {
        const { exec } = await import('child_process')
        const { writeFileSync, unlinkSync } = await import('fs')
        const { tmpdir } = await import('os')
        const { join } = await import('path')

        // Write data to temp file
        const tempFile = join(tmpdir(), `receipt_${Date.now()}.txt`)
        writeFileSync(tempFile, data, { encoding: 'binary' })

        return new Promise((resolve, reject) => {
            if (process.platform === 'win32') {
                // Windows: Use raw print command
                const cmd = `print /D:"${printerName}" "${tempFile}"`
                exec(cmd, (error) => {
                    try {
                        unlinkSync(tempFile)
                    } catch {
                        // Ignore cleanup errors
                    }
                    if (error) {
                        reject(error)
                    } else {
                        resolve()
                    }
                })
            } else {
                // Linux/Mac: Use lp command
                const cmd = `lp -d "${printerName}" -o raw "${tempFile}"`
                exec(cmd, (error) => {
                    try {
                        unlinkSync(tempFile)
                    } catch {
                        // Ignore cleanup errors
                    }
                    if (error) {
                        reject(error)
                    } else {
                        resolve()
                    }
                })
            }
        })
    }

    /**
     * Print a receipt
     */
    async printReceipt(printerName: string, receipt: ReceiptData): Promise<void> {
        const buffer = this.buildReceiptBuffer(receipt)
        await this.sendToPrinter(printerName, buffer)
    }

    /**
     * Print a kitchen ticket
     */
    async printKitchenTicket(printerName: string, ticket: KitchenTicket): Promise<void> {
        const buffer = this.buildKitchenTicketBuffer(ticket)
        await this.sendToPrinter(printerName, buffer)
    }

    /**
     * Open cash drawer connected to printer
     */
    async openCashDrawer(printerName: string): Promise<void> {
        const buffer = COMMANDS.INIT + COMMANDS.OPEN_DRAWER
        await this.sendToPrinter(printerName, buffer)
    }

    /**
     * Test printer connection with a simple test print
     */
    async testPrinter(printerName: string): Promise<void> {
        let buffer = COMMANDS.INIT
        buffer += COMMANDS.ALIGN_CENTER
        buffer += COMMANDS.SIZE_DOUBLE
        buffer += 'PRINTER TEST\n'
        buffer += COMMANDS.SIZE_NORMAL
        buffer += COMMANDS.HORIZONTAL_LINE + '\n'
        buffer += 'If you can read this,\n'
        buffer += 'your printer is working!\n'
        buffer += COMMANDS.HORIZONTAL_LINE + '\n'
        buffer += new Date().toLocaleString() + '\n'
        buffer += '\n\n'
        buffer += COMMANDS.FEED_LINES(2)
        buffer += COMMANDS.CUT_PARTIAL

        await this.sendToPrinter(printerName, buffer)
    }
}
