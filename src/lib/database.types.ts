export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type UserRole = 'admin' | 'chef' | 'cashier'
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type BillType = 'tax_invoice' | 'estimate'
export type UnitType = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'dozen'

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string
                    role: UserRole
                    phone: string | null
                    is_active: boolean
                    avatar_url: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name: string
                    role?: UserRole
                    phone?: string | null
                    is_active?: boolean
                    avatar_url?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string
                    role?: UserRole
                    phone?: string | null
                    is_active?: boolean
                    avatar_url?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            inventory_items: {
                Row: {
                    id: string
                    name: string
                    description: string | null
                    unit: UnitType
                    current_stock: number
                    min_stock_level: number
                    cost_per_unit: number
                    category: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    description?: string | null
                    unit?: UnitType
                    current_stock?: number
                    min_stock_level?: number
                    cost_per_unit?: number
                    category?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string | null
                    unit?: UnitType
                    current_stock?: number
                    min_stock_level?: number
                    cost_per_unit?: number
                    category?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            menu_items: {
                Row: {
                    id: string
                    name: string
                    description: string | null
                    category: string
                    price: number
                    gst_percentage: number
                    image_url: string | null
                    is_available: boolean
                    is_veg: boolean
                    preparation_time_mins: number
                    display_order: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    description?: string | null
                    category: string
                    price: number
                    gst_percentage?: number
                    image_url?: string | null
                    is_available?: boolean
                    is_veg?: boolean
                    preparation_time_mins?: number
                    display_order?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string | null
                    category?: string
                    price?: number
                    gst_percentage?: number
                    image_url?: string | null
                    is_available?: boolean
                    is_veg?: boolean
                    preparation_time_mins?: number
                    display_order?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            recipes: {
                Row: {
                    id: string
                    menu_item_id: string
                    inventory_item_id: string
                    quantity_required: number
                    unit: UnitType
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    menu_item_id: string
                    inventory_item_id: string
                    quantity_required: number
                    unit: UnitType
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    menu_item_id?: string
                    inventory_item_id?: string
                    quantity_required?: number
                    unit?: UnitType
                    created_at?: string
                    updated_at?: string
                }
            }
            orders: {
                Row: {
                    id: string
                    order_number: number
                    customer_name: string | null
                    customer_phone: string | null
                    table_number: string | null
                    bill_type: BillType
                    subtotal: number
                    tax_amount: number
                    discount_amount: number
                    total_amount: number
                    status: OrderStatus
                    payment_method: string | null
                    notes: string | null
                    created_by: string | null
                    created_at: string
                    updated_at: string
                    completed_at: string | null
                }
                Insert: {
                    id?: string
                    order_number?: number
                    customer_name?: string | null
                    customer_phone?: string | null
                    table_number?: string | null
                    bill_type?: BillType
                    subtotal?: number
                    tax_amount?: number
                    discount_amount?: number
                    total_amount?: number
                    status?: OrderStatus
                    payment_method?: string | null
                    notes?: string | null
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                    completed_at?: string | null
                }
                Update: {
                    id?: string
                    order_number?: number
                    customer_name?: string | null
                    customer_phone?: string | null
                    table_number?: string | null
                    bill_type?: BillType
                    subtotal?: number
                    tax_amount?: number
                    discount_amount?: number
                    total_amount?: number
                    status?: OrderStatus
                    payment_method?: string | null
                    notes?: string | null
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                    completed_at?: string | null
                }
            }
            order_items: {
                Row: {
                    id: string
                    order_id: string
                    menu_item_id: string
                    quantity: number
                    unit_price: number
                    gst_percentage: number
                    gst_amount: number
                    total_price: number
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    order_id: string
                    menu_item_id: string
                    quantity?: number
                    unit_price: number
                    gst_percentage?: number
                    gst_amount?: number
                    total_price: number
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    order_id?: string
                    menu_item_id?: string
                    quantity?: number
                    unit_price?: number
                    gst_percentage?: number
                    gst_amount?: number
                    total_price?: number
                    notes?: string | null
                    created_at?: string
                }
            }
            daily_closing_logs: {
                Row: {
                    id: string
                    closing_date: string
                    submitted_by: string
                    submitted_at: string
                    notes: string | null
                    total_orders: number
                    total_revenue: number
                    is_verified: boolean
                    verified_by: string | null
                    verified_at: string | null
                }
                Insert: {
                    id?: string
                    closing_date: string
                    submitted_by: string
                    submitted_at?: string
                    notes?: string | null
                    total_orders?: number
                    total_revenue?: number
                    is_verified?: boolean
                    verified_by?: string | null
                    verified_at?: string | null
                }
                Update: {
                    id?: string
                    closing_date?: string
                    submitted_by?: string
                    submitted_at?: string
                    notes?: string | null
                    total_orders?: number
                    total_revenue?: number
                    is_verified?: boolean
                    verified_by?: string | null
                    verified_at?: string | null
                }
            }
            stock_verifications: {
                Row: {
                    id: string
                    daily_closing_id: string
                    inventory_item_id: string
                    system_stock: number
                    physical_stock: number
                    wastage: number
                    variance: number
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    daily_closing_id: string
                    inventory_item_id: string
                    system_stock: number
                    physical_stock: number
                    wastage?: number
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    daily_closing_id?: string
                    inventory_item_id?: string
                    system_stock?: number
                    physical_stock?: number
                    wastage?: number
                    notes?: string | null
                    created_at?: string
                }
            }
            inventory_transactions: {
                Row: {
                    id: string
                    inventory_item_id: string
                    transaction_type: string
                    quantity: number
                    previous_stock: number
                    new_stock: number
                    reference_id: string | null
                    notes: string | null
                    created_by: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    inventory_item_id: string
                    transaction_type: string
                    quantity: number
                    previous_stock: number
                    new_stock: number
                    reference_id?: string | null
                    notes?: string | null
                    created_by?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    inventory_item_id?: string
                    transaction_type?: string
                    quantity?: number
                    previous_stock?: number
                    new_stock?: number
                    reference_id?: string | null
                    notes?: string | null
                    created_by?: string | null
                    created_at?: string
                }
            }
        }
        Views: {
            daily_sales_summary: {
                Row: {
                    sale_date: string
                    total_orders: number
                    total_subtotal: number
                    total_tax: number
                    total_revenue: number
                    tax_invoice_count: number
                    estimate_count: number
                }
            }
            top_selling_items: {
                Row: {
                    id: string
                    name: string
                    category: string
                    total_sold: number
                    total_revenue: number
                }
            }
            low_stock_items: {
                Row: {
                    id: string
                    name: string
                    current_stock: number
                    min_stock_level: number
                    unit: UnitType
                    shortage: number
                }
            }
        }
        Functions: {}
        Enums: {
            user_role: UserRole
            order_status: OrderStatus
            bill_type: BillType
            unit_type: UnitType
        }
    }
}
