import { useState, useEffect } from 'react'
import {
    Settings,
    Printer,
    Store,
    Users,
    Database,
    Save,
    TestTube,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Input,
    Label,
    Separator,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Badge,
} from '@/components/ui'
import { useCartStore } from '@/store'

export function SettingsPage() {
    const { selectedPrinter, setSelectedPrinter } = useCartStore()
    const [printers, setPrinters] = useState<string[]>([])
    const [isLoadingPrinters, setIsLoadingPrinters] = useState(false)
    const [testingPrinter, setTestingPrinter] = useState<string | null>(null)

    // Business settings
    const [businessSettings, setBusinessSettings] = useState({
        name: 'Kitchen POS Restaurant',
        address: '123 Food Street, City',
        phone: '+91 98765 43210',
        gstNumber: '29AAACW1234F1Z5',
        footer: 'Thank you for dining with us!',
    })

    // Load printers
    useEffect(() => {
        const fetchPrinters = async () => {
            setIsLoadingPrinters(true)
            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.getPrinters()
                    if (result.success && result.printers) {
                        setPrinters(result.printers)
                    }
                }
            } catch (error) {
                console.error('Error fetching printers:', error)
            } finally {
                setIsLoadingPrinters(false)
            }
        }
        fetchPrinters()
    }, [])

    // Test printer
    const testPrinter = async (printerName: string) => {
        setTestingPrinter(printerName)
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.testPrinter(printerName)
                if (result.success) {
                    toast.success('Test page sent to printer')
                } else {
                    toast.error(result.error || 'Failed to print test page')
                }
            } else {
                toast.error('Printer API not available (running in browser)')
            }
        } catch (error) {
            toast.error('Failed to test printer')
        } finally {
            setTestingPrinter(null)
        }
    }

    // Save business settings
    const saveBusinessSettings = () => {
        localStorage.setItem('kitchen-pos-business', JSON.stringify(businessSettings))
        toast.success('Settings saved successfully')
    }

    // Load business settings on mount
    useEffect(() => {
        const saved = localStorage.getItem('kitchen-pos-business')
        if (saved) {
            try {
                setBusinessSettings(JSON.parse(saved))
            } catch {
                // Ignore parse errors
            }
        }
    }, [])

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Settings className="w-7 h-7" />
                    Settings
                </h1>
                <p className="text-muted-foreground">Configure your POS system</p>
            </div>

            <Tabs defaultValue="business" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="business">
                        <Store className="w-4 h-4 mr-2" />
                        Business
                    </TabsTrigger>
                    <TabsTrigger value="printer">
                        <Printer className="w-4 h-4 mr-2" />
                        Printer
                    </TabsTrigger>
                    <TabsTrigger value="database">
                        <Database className="w-4 h-4 mr-2" />
                        Database
                    </TabsTrigger>
                </TabsList>

                {/* Business Settings */}
                <TabsContent value="business">
                    <Card>
                        <CardHeader>
                            <CardTitle>Business Information</CardTitle>
                            <CardDescription>
                                This information will appear on receipts and invoices
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="business-name">Business Name</Label>
                                    <Input
                                        id="business-name"
                                        value={businessSettings.name}
                                        onChange={(e) =>
                                            setBusinessSettings({ ...businessSettings, name: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        value={businessSettings.phone}
                                        onChange={(e) =>
                                            setBusinessSettings({ ...businessSettings, phone: e.target.value })
                                        }
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Input
                                    id="address"
                                    value={businessSettings.address}
                                    onChange={(e) =>
                                        setBusinessSettings({ ...businessSettings, address: e.target.value })
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="gst">GSTIN Number</Label>
                                <Input
                                    id="gst"
                                    value={businessSettings.gstNumber}
                                    onChange={(e) =>
                                        setBusinessSettings({ ...businessSettings, gstNumber: e.target.value })
                                    }
                                    placeholder="Enter GST Number for Tax Invoices"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="footer">Receipt Footer Message</Label>
                                <Input
                                    id="footer"
                                    value={businessSettings.footer}
                                    onChange={(e) =>
                                        setBusinessSettings({ ...businessSettings, footer: e.target.value })
                                    }
                                />
                            </div>

                            <Button onClick={saveBusinessSettings}>
                                <Save className="w-4 h-4 mr-2" />
                                Save Settings
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Printer Settings */}
                <TabsContent value="printer">
                    <Card>
                        <CardHeader>
                            <CardTitle>Printer Configuration</CardTitle>
                            <CardDescription>
                                Configure thermal printer for receipts and kitchen tickets
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {!window.electronAPI && (
                                <div className="flex items-center gap-2 p-4 rounded-lg bg-warning/10 text-warning border border-warning/30">
                                    <AlertCircle className="w-5 h-5" />
                                    <p className="text-sm">
                                        Printer features are only available in the desktop app (Electron).
                                        Currently running in browser mode.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>Available Printers</Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                            setIsLoadingPrinters(true)
                                            if (window.electronAPI) {
                                                const result = await window.electronAPI.getPrinters()
                                                if (result.success && result.printers) {
                                                    setPrinters(result.printers)
                                                }
                                            }
                                            setIsLoadingPrinters(false)
                                        }}
                                        disabled={isLoadingPrinters}
                                    >
                                        Refresh
                                    </Button>
                                </div>

                                {isLoadingPrinters ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : printers.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Printer className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                        <p>No printers found</p>
                                        <p className="text-sm">Make sure your printer is connected and turned on</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {printers.map((printer) => (
                                            <div
                                                key={printer}
                                                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${selectedPrinter === printer
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-border hover:border-primary/50'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Printer className="w-5 h-5" />
                                                    <div>
                                                        <p className="font-medium">{printer}</p>
                                                        {selectedPrinter === printer && (
                                                            <Badge variant="success" className="mt-1">
                                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                Selected
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => testPrinter(printer)}
                                                        disabled={testingPrinter === printer}
                                                    >
                                                        {testingPrinter === printer ? (
                                                            <>
                                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                                                Testing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <TestTube className="w-4 h-4 mr-2" />
                                                                Test
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant={selectedPrinter === printer ? 'default' : 'secondary'}
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedPrinter(printer)
                                                            toast.success(`Selected ${printer}`)
                                                        }}
                                                    >
                                                        {selectedPrinter === printer ? 'Selected' : 'Select'}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Separator />

                            <div className="space-y-3">
                                <h3 className="font-medium">Printer Tips</h3>
                                <ul className="text-sm text-muted-foreground space-y-2">
                                    <li>• Use a 58mm or 80mm thermal receipt printer for best results</li>
                                    <li>• Connect your printer via USB for reliable printing</li>
                                    <li>• Make sure the printer driver is installed on Windows</li>
                                    <li>• The printer should support ESC/POS commands</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Database Settings */}
                <TabsContent value="database">
                    <Card>
                        <CardHeader>
                            <CardTitle>Database Connection</CardTitle>
                            <CardDescription>Supabase database configuration</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                    <span className="font-medium">Connected</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Your app is connected to Supabase. Database operations are working normally.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Supabase URL</Label>
                                <Input
                                    value={import.meta.env.VITE_SUPABASE_URL || 'Not configured'}
                                    disabled
                                    className="font-mono text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Anon Key</Label>
                                <Input
                                    value={
                                        import.meta.env.VITE_SUPABASE_ANON_KEY
                                            ? '••••••••••••••••••••••••••••••••'
                                            : 'Not configured'
                                    }
                                    disabled
                                    type="password"
                                    className="font-mono text-sm"
                                />
                            </div>

                            <div className="p-4 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                <p className="text-sm">
                                    <strong>Note:</strong> To change database settings, update the{' '}
                                    <code className="bg-black/20 px-1 rounded">.env</code> file and restart the app.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
