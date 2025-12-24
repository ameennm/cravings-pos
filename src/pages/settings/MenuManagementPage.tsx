import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Plus,
    Pencil,
    Trash2,
    Search,
    X,
    Save,
    UtensilsCrossed,
    Package,
    AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { db, LocalMenuItem } from '@/lib/offlineDatabase'
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

interface Recipe {
    inventory_item_id: string
    quantity_required: number
    inventory_item_name?: string
}

interface MenuItemForm {
    id?: string
    name: string
    description: string
    category: string
    price: number
    gst_percentage: number
    is_available: boolean
    is_veg: boolean
    display_order: number
    recipes: Recipe[]
}

const defaultForm: MenuItemForm = {
    name: '',
    description: '',
    category: '',
    price: 0,
    gst_percentage: 5,
    is_available: true,
    is_veg: true,
    display_order: 0,
    recipes: [],
}

const categories = ['Starters', 'Main Course', 'Biryani', 'Breads', 'Beverages', 'Desserts', 'Sides']

export function MenuManagementPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [form, setForm] = useState<MenuItemForm>(defaultForm)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    const syncStatus = useSyncStatus()

    // Get menu items from local DB
    const menuItems = useLiveQuery(() => db.menuItems.toArray(), [], [])

    // Get inventory items for recipe selection
    const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray(), [], [])

    // Get recipes from local DB
    const recipes = useLiveQuery(() => db.table('recipes')?.toArray() || [], [], [])

    const filteredItems = (menuItems || []).filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const openNewForm = () => {
        setForm(defaultForm)
        setIsEditing(false)
        setIsFormOpen(true)
    }

    const openEditForm = async (item: LocalMenuItem) => {
        // Get recipes for this item
        const itemRecipes = (recipes || []).filter((r: any) => r.menu_item_id === item.id)

        setForm({
            id: item.id,
            name: item.name,
            description: item.description || '',
            category: item.category,
            price: item.price,
            gst_percentage: item.gst_percentage,
            is_available: !!item.is_available,
            is_veg: !!item.is_veg,
            display_order: item.display_order,
            recipes: itemRecipes.map((r: any) => ({
                inventory_item_id: r.inventory_item_id,
                quantity_required: r.quantity_required,
            })),
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
            toast.error('Dish name is required')
            return
        }
        if (form.price <= 0) {
            toast.error('Price must be greater than 0')
            return
        }

        setIsSaving(true)
        try {
            const now = new Date().toISOString()
            const menuItemData = {
                name: form.name.trim(),
                description: form.description.trim(),
                category: form.category || 'Main Course',
                price: form.price,
                gst_percentage: form.gst_percentage,
                is_available: form.is_available,
                is_veg: form.is_veg,
                display_order: form.display_order,
                synced: false,
                updated_at: now,
            }

            let itemId = form.id

            if (isEditing && form.id) {
                // Update existing
                await db.menuItems.update(form.id, menuItemData)

                // Sync to Supabase if online
                if (syncStatus.isOnline) {
                    await supabase.from('menu_items').update({
                        ...menuItemData,
                        synced: undefined,
                    }).eq('id', form.id)
                    await db.menuItems.update(form.id, { synced: true })
                }

                toast.success('Dish updated successfully')
            } else {
                // Create new
                itemId = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

                await db.menuItems.add({
                    ...menuItemData,
                    id: itemId,
                } as LocalMenuItem)

                // Sync to Supabase if online
                if (syncStatus.isOnline) {
                    const { data, error } = await supabase.from('menu_items').insert({
                        name: menuItemData.name,
                        description: menuItemData.description,
                        category: menuItemData.category,
                        price: menuItemData.price,
                        gst_percentage: menuItemData.gst_percentage,
                        is_available: menuItemData.is_available,
                        is_veg: menuItemData.is_veg,
                        display_order: menuItemData.display_order,
                    }).select().single()

                    if (data && !error) {
                        await db.menuItems.delete(itemId)
                        await db.menuItems.add({
                            ...menuItemData,
                            id: data.id,
                            synced: true,
                        } as LocalMenuItem)
                        itemId = data.id
                    }
                }

                toast.success('Dish created successfully')
            }

            // Save recipes if any
            if (itemId && form.recipes.length > 0) {
                // Delete existing recipes
                if (syncStatus.isOnline) {
                    await supabase.from('recipes').delete().eq('menu_item_id', itemId)
                }

                // Insert new recipes
                for (const recipe of form.recipes) {
                    if (recipe.inventory_item_id && recipe.quantity_required > 0) {
                        if (syncStatus.isOnline) {
                            await supabase.from('recipes').insert({
                                menu_item_id: itemId,
                                inventory_item_id: recipe.inventory_item_id,
                                quantity_required: recipe.quantity_required,
                            })
                        }
                    }
                }
            }

            closeForm()
        } catch (error) {
            console.error('Save error:', error)
            toast.error('Failed to save dish')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await db.menuItems.delete(id)

            if (syncStatus.isOnline) {
                await supabase.from('menu_items').delete().eq('id', id)
                await supabase.from('recipes').delete().eq('menu_item_id', id)
            }

            toast.success('Dish deleted')
            setDeleteConfirm(null)
        } catch (error) {
            console.error('Delete error:', error)
            toast.error('Failed to delete dish')
        }
    }

    const addRecipeRow = () => {
        setForm(prev => ({
            ...prev,
            recipes: [...prev.recipes, { inventory_item_id: '', quantity_required: 0 }],
        }))
    }

    const updateRecipe = (index: number, field: keyof Recipe, value: any) => {
        setForm(prev => ({
            ...prev,
            recipes: prev.recipes.map((r, i) =>
                i === index ? { ...r, [field]: value } : r
            ),
        }))
    }

    const removeRecipe = (index: number) => {
        setForm(prev => ({
            ...prev,
            recipes: prev.recipes.filter((_, i) => i !== index),
        }))
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <UtensilsCrossed className="w-7 h-7" />
                        Menu Management
                    </h1>
                    <p className="text-muted-foreground">Add, edit, and manage dishes</p>
                </div>
                <div className="flex items-center gap-4">
                    <OfflineStatusBar />
                    <Button onClick={openNewForm}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Dish
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search dishes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item) => (
                    <Card key={item.id} className={cn(!item.is_available && 'opacity-60')}>
                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="text-lg">{item.name}</CardTitle>
                                    <p className="text-sm text-muted-foreground">{item.category}</p>
                                </div>
                                <div className="flex gap-1">
                                    <Badge variant={item.is_veg ? 'veg' : 'non-veg'}>
                                        {item.is_veg ? 'VEG' : 'NON-VEG'}
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-2xl font-bold text-primary">
                                {formatCurrency(item.price)}
                            </p>
                            {item.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                    {item.description}
                                </p>
                            )}
                            <div className="flex items-center justify-between pt-2">
                                <Badge variant={item.is_available ? 'success' : 'secondary'}>
                                    {item.is_available ? 'Available' : 'Unavailable'}
                                </Badge>
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
                ))}
            </div>

            {filteredItems.length === 0 && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <UtensilsCrossed className="w-12 h-12 mb-2 opacity-50" />
                        <p>No dishes found</p>
                        <Button variant="link" onClick={openNewForm}>
                            Add your first dish
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-2xl m-4 max-h-[90vh] overflow-hidden flex flex-col">
                        <CardHeader className="border-b">
                            <div className="flex items-center justify-between">
                                <CardTitle>{isEditing ? 'Edit Dish' : 'Add New Dish'}</CardTitle>
                                <Button variant="ghost" size="icon" onClick={closeForm}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>Dish Name *</Label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g., Butter Chicken"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label>Description</Label>
                                    <Input
                                        value={form.description}
                                        onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Brief description"
                                    />
                                </div>
                                <div>
                                    <Label>Category *</Label>
                                    <select
                                        value={form.category}
                                        onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                                    >
                                        <option value="">Select category</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>Price (₹) *</Label>
                                    <Input
                                        type="number"
                                        value={form.price}
                                        onChange={(e) => setForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                                        min={0}
                                    />
                                </div>
                                <div>
                                    <Label>GST %</Label>
                                    <Input
                                        type="number"
                                        value={form.gst_percentage}
                                        onChange={(e) => setForm(prev => ({ ...prev, gst_percentage: parseFloat(e.target.value) || 0 }))}
                                        min={0}
                                        max={28}
                                    />
                                </div>
                                <div>
                                    <Label>Display Order</Label>
                                    <Input
                                        type="number"
                                        value={form.display_order}
                                        onChange={(e) => setForm(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                                        min={0}
                                    />
                                </div>
                            </div>

                            {/* Toggles */}
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={form.is_available}
                                        onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_available: checked }))}
                                    />
                                    <Label>Available</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={form.is_veg}
                                        onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_veg: checked }))}
                                    />
                                    <Label>Vegetarian</Label>
                                </div>
                            </div>

                            <Separator />

                            {/* Recipe / Stock Ingredients */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <Package className="w-4 h-4" />
                                            Stock Ingredients
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Stock will be auto-deducted when order is completed
                                        </p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={addRecipeRow}>
                                        <Plus className="w-4 h-4 mr-1" />
                                        Add Ingredient
                                    </Button>
                                </div>

                                {form.recipes.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        No ingredients added. Click "Add Ingredient" to link stock items.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {form.recipes.map((recipe, index) => (
                                            <div key={index} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                                                <select
                                                    value={recipe.inventory_item_id}
                                                    onChange={(e) => updateRecipe(index, 'inventory_item_id', e.target.value)}
                                                    className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
                                                >
                                                    <option value="">Select stock item</option>
                                                    {(inventoryItems || []).map(item => (
                                                        <option key={item.id} value={item.id}>
                                                            {item.name} ({item.unit})
                                                        </option>
                                                    ))}
                                                </select>
                                                <Input
                                                    type="number"
                                                    value={recipe.quantity_required}
                                                    onChange={(e) => updateRecipe(index, 'quantity_required', parseFloat(e.target.value) || 0)}
                                                    placeholder="Qty"
                                                    className="w-24"
                                                    min={0}
                                                    step={0.1}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => removeRecipe(index)}
                                                >
                                                    <Trash2 className="w-4 h-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t p-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={closeForm}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Dish
                                    </>
                                )}
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
                                Delete Dish
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>Are you sure you want to delete this dish? This action cannot be undone.</p>
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
