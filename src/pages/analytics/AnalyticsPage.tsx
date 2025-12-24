import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    Package,
    Calendar,
} from 'lucide-react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
} from 'recharts'
import { db } from '@/lib/offlineDatabase'
import { formatCurrency } from '@/lib/utils'
import { OfflineStatusBar } from '@/components/OfflineStatusBar'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    ScrollArea,
} from '@/components/ui'

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export function AnalyticsPage() {
    const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('7d')

    const getDaysAgo = (days: number) => {
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date
    }

    const startDate = getDaysAgo(dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90)

    // Fetch orders from LOCAL IndexedDB
    const orders = useLiveQuery(
        async () => {
            const allOrders = await db.orders.toArray()
            return allOrders.filter(order => {
                const orderDate = new Date(order.created_at)
                return order.status === 'completed' && orderDate >= startDate
            })
        },
        [startDate],
        []
    )

    // Fetch order items
    const orderItemsMap = useLiveQuery(
        async () => {
            const allItems = await db.orderItems.toArray()
            const map: Record<string, typeof allItems> = {}
            for (const item of allItems) {
                if (!map[item.order_id]) map[item.order_id] = []
                map[item.order_id].push(item)
            }
            return map
        },
        [],
        {} as Record<string, typeof db.orderItems extends { toArray(): Promise<infer T> } ? T : never>
    )

    // Fetch menu items for names
    const menuItems = useLiveQuery(() => db.menuItems.toArray(), [], [])

    // Fetch low stock items from local DB
    const lowStockItems = useLiveQuery(
        async () => {
            const items = await db.inventoryItems.toArray()
            return items
                .filter(item => item.current_stock <= item.minimum_stock && item.is_active)
                .map(item => ({
                    ...item,
                    shortage: item.minimum_stock - item.current_stock,
                    min_stock_level: item.minimum_stock,
                }))
        },
        [],
        []
    )

    // Calculate daily sales data
    const salesData = useMemo(() => {
        if (!orders || orders.length === 0) return []

        const dailyData: Record<string, {
            sale_date: string
            total_orders: number
            total_revenue: number
            total_tax: number
            tax_invoice_count: number
            estimate_count: number
        }> = {}

        for (const order of orders) {
            const date = order.created_at.split('T')[0]
            if (!dailyData[date]) {
                dailyData[date] = {
                    sale_date: date,
                    total_orders: 0,
                    total_revenue: 0,
                    total_tax: 0,
                    tax_invoice_count: 0,
                    estimate_count: 0,
                }
            }
            dailyData[date].total_orders++
            dailyData[date].total_revenue += order.total_amount
            dailyData[date].total_tax += order.tax_amount
            if (order.bill_type === 'tax_invoice') {
                dailyData[date].tax_invoice_count++
            } else {
                dailyData[date].estimate_count++
            }
        }

        return Object.values(dailyData).sort((a, b) => a.sale_date.localeCompare(b.sale_date))
    }, [orders])

    // Calculate top selling items
    const topItems = useMemo(() => {
        if (!orders || !menuItems) return []

        const itemSales: Record<string, { name: string; category: string; total_sold: number; total_revenue: number }> = {}

        for (const order of orders) {
            const items = (orderItemsMap && order.id in orderItemsMap)
                ? (orderItemsMap as Record<string, any>)[order.id]
                : []
            for (const item of items) {
                const menuItem = menuItems.find(m => m.id === item.menu_item_id)
                const key = item.menu_item_id
                if (!itemSales[key]) {
                    itemSales[key] = {
                        name: menuItem?.name || item.menu_item_name || 'Unknown',
                        category: menuItem?.category || 'Other',
                        total_sold: 0,
                        total_revenue: 0,
                    }
                }
                itemSales[key].total_sold += item.quantity
                itemSales[key].total_revenue += item.total_price
            }
        }

        return Object.values(itemSales)
            .sort((a, b) => b.total_sold - a.total_sold)
            .slice(0, 10)
    }, [orders, orderItemsMap, menuItems])

    // Calculate totals
    const totals = useMemo(() => {
        return salesData.reduce(
            (acc, day) => ({
                orders: acc.orders + day.total_orders,
                revenue: acc.revenue + day.total_revenue,
                tax: acc.tax + day.total_tax,
                taxInvoices: acc.taxInvoices + day.tax_invoice_count,
                estimates: acc.estimates + day.estimate_count,
            }),
            { orders: 0, revenue: 0, tax: 0, taxInvoices: 0, estimates: 0 }
        )
    }, [salesData])

    // Format chart data
    const chartData = salesData.map((day) => ({
        date: new Date(day.sale_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        revenue: day.total_revenue,
        orders: day.total_orders,
        tax: day.total_tax,
    }))

    // Format pie chart data for bill types
    const billTypeData = [
        { name: 'Tax Invoice', value: totals.taxInvoices },
        { name: 'Estimate', value: totals.estimates },
    ]

    // Category breakdown from top items
    const categoryData = topItems.reduce(
        (acc, item) => {
            const existing = acc.find((c) => c.name === item.category)
            if (existing) {
                existing.value += item.total_revenue
            } else {
                acc.push({ name: item.category, value: item.total_revenue })
            }
            return acc
        },
        [] as { name: string; value: number }[]
    )

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BarChart3 className="w-7 h-7" />
                        Analytics
                    </h1>
                    <p className="text-muted-foreground">Business insights from local data</p>
                </div>
                <div className="flex items-center gap-4">
                    <OfflineStatusBar />
                    <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
                        <TabsList>
                            <TabsTrigger value="7d">7 Days</TabsTrigger>
                            <TabsTrigger value="30d">30 Days</TabsTrigger>
                            <TabsTrigger value="90d">90 Days</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-primary/10">
                                <DollarSign className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{formatCurrency(totals.revenue)}</p>
                                <p className="text-sm text-muted-foreground">Total Revenue</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10">
                                <ShoppingCart className="w-6 h-6 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{totals.orders}</p>
                                <p className="text-sm text-muted-foreground">Total Orders</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-warning/10">
                                <TrendingUp className="w-6 h-6 text-warning" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{formatCurrency(totals.tax)}</p>
                                <p className="text-sm text-muted-foreground">GST Collected</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-success/10">
                                <Calendar className="w-6 h-6 text-success" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {formatCurrency(totals.revenue / Math.max(1, salesData.length))}
                                </p>
                                <p className="text-sm text-muted-foreground">Avg Daily Revenue</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue Trend</CardTitle>
                        <CardDescription>Daily revenue over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            {chartData.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available for this period
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="hsl(var(--primary))"
                                            strokeWidth={2}
                                            dot={{ fill: 'hsl(var(--primary))' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Orders Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Orders by Day</CardTitle>
                        <CardDescription>Number of orders per day</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            {chartData.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available for this period
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                        />
                                        <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Selling Items */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Top Selling Items</CardTitle>
                        <CardDescription>Best performing menu items by quantity sold</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            {topItems.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No sales data available
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topItems.slice(0, 8)} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={12}
                                            width={120}
                                            tickFormatter={(value) => (value.length > 15 ? value.slice(0, 15) + '...' : value)}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                        />
                                        <Bar dataKey="total_sold" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Bill Type Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Bill Types</CardTitle>
                        <CardDescription>Tax Invoice vs Estimate</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            {totals.orders === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={billTypeData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}
                                        >
                                            {billTypeData.map((entry, index) => (
                                                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Low Stock & Category Revenue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Low Stock Items */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingDown className="w-5 h-5 text-destructive" />
                            Low Stock Items
                        </CardTitle>
                        <CardDescription>Items that need restocking</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[250px]">
                            {(lowStockItems || []).length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <Package className="w-8 h-8 mr-2 opacity-50" />
                                    All items are well stocked
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(lowStockItems || []).map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Min: {item.min_stock_level} {item.unit}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <Badge variant="destructive">
                                                    {item.current_stock} {item.unit}
                                                </Badge>
                                                <p className="text-xs text-destructive mt-1">
                                                    Short by {item.shortage.toFixed(2)} {item.unit}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Category Revenue */}
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue by Category</CardTitle>
                        <CardDescription>Sales distribution across menu categories</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px]">
                            {categoryData.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No category data available
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={categoryData}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={80}
                                            dataKey="value"
                                            label={({ name }) => name}
                                        >
                                            {categoryData.map((entry, index) => (
                                                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value: number) => formatCurrency(value)}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
