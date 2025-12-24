-- ============================================
-- KITCHEN MANAGEMENT POS - SUPABASE SCHEMA
-- ============================================
-- Run this entire script in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'chef', 'cashier');
CREATE TYPE order_status AS ENUM ('pending', 'preparing', 'ready', 'completed', 'cancelled');
CREATE TYPE bill_type AS ENUM ('tax_invoice', 'estimate');
CREATE TYPE unit_type AS ENUM ('kg', 'g', 'l', 'ml', 'pcs', 'dozen');

-- ============================================
-- PROFILES TABLE (Users with Roles)
-- ============================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'cashier',
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- INVENTORY ITEMS TABLE (Raw Materials)
-- ============================================

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    unit unit_type NOT NULL DEFAULT 'kg',
    current_stock DECIMAL(10, 3) NOT NULL DEFAULT 0,
    min_stock_level DECIMAL(10, 3) DEFAULT 0,
    cost_per_unit DECIMAL(10, 2) DEFAULT 0,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Inventory policies
CREATE POLICY "Authenticated users can view inventory" ON inventory_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and chefs can manage inventory" ON inventory_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef'))
    );

-- ============================================
-- MENU ITEMS TABLE (Sellable Dishes)
-- ============================================

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    gst_percentage DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    is_veg BOOLEAN DEFAULT false,
    preparation_time_mins INTEGER DEFAULT 15,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Menu policies
CREATE POLICY "Everyone can view menu items" ON menu_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage menu items" ON menu_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- RECIPES TABLE (Menu Item to Inventory Link)
-- ============================================

CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required DECIMAL(10, 3) NOT NULL,
    unit unit_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(menu_item_id, inventory_item_id)
);

-- Enable RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Recipes policies
CREATE POLICY "Authenticated users can view recipes" ON recipes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage recipes" ON recipes
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- ORDERS TABLE (Order Headers)
-- ============================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number SERIAL,
    customer_name TEXT,
    customer_phone TEXT,
    table_number TEXT,
    bill_type bill_type NOT NULL DEFAULT 'tax_invoice',
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status order_status NOT NULL DEFAULT 'pending',
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Orders policies
CREATE POLICY "Authenticated users can view orders" ON orders
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers and admins can create orders" ON orders
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'cashier'))
    );

CREATE POLICY "Authenticated users can update orders" ON orders
    FOR UPDATE TO authenticated USING (true);

-- ============================================
-- ORDER ITEMS TABLE (Line Items)
-- ============================================

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    gst_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_price DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Order items policies
CREATE POLICY "Authenticated users can view order items" ON order_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage order items" ON order_items
    FOR ALL TO authenticated USING (true);

-- ============================================
-- DAILY CLOSING LOGS TABLE (Chef's Daily Report)
-- ============================================

CREATE TABLE daily_closing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_date DATE NOT NULL UNIQUE,
    submitted_by UUID NOT NULL REFERENCES profiles(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(10, 2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES profiles(id),
    verified_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE daily_closing_logs ENABLE ROW LEVEL SECURITY;

-- Daily closing logs policies
CREATE POLICY "Authenticated users can view daily logs" ON daily_closing_logs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Chefs and admins can manage daily logs" ON daily_closing_logs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef'))
    );

-- ============================================
-- STOCK VERIFICATION TABLE (Part of Daily Closing)
-- ============================================

CREATE TABLE stock_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    daily_closing_id UUID NOT NULL REFERENCES daily_closing_logs(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    system_stock DECIMAL(10, 3) NOT NULL,
    physical_stock DECIMAL(10, 3) NOT NULL,
    wastage DECIMAL(10, 3) DEFAULT 0,
    variance DECIMAL(10, 3) GENERATED ALWAYS AS (physical_stock - system_stock + wastage) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE stock_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stock verifications" ON stock_verifications
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Chefs and admins can manage stock verifications" ON stock_verifications
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef'))
    );

-- ============================================
-- INVENTORY TRANSACTIONS TABLE (Stock Movement Log)
-- ============================================

CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    transaction_type TEXT NOT NULL, -- 'purchase', 'consumption', 'wastage', 'adjustment'
    quantity DECIMAL(10, 3) NOT NULL,
    previous_stock DECIMAL(10, 3) NOT NULL,
    new_stock DECIMAL(10, 3) NOT NULL,
    reference_id UUID, -- order_id or daily_closing_id
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transactions" ON inventory_transactions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create transactions" ON inventory_transactions
    FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to automatically deduct inventory when order is placed
CREATE OR REPLACE FUNCTION deduct_inventory_on_order()
RETURNS TRIGGER AS $$
DECLARE
    recipe_record RECORD;
    current_stock DECIMAL(10, 3);
BEGIN
    -- Loop through all recipes for the ordered menu item
    FOR recipe_record IN 
        SELECT r.inventory_item_id, r.quantity_required, i.current_stock
        FROM recipes r
        JOIN inventory_items i ON i.id = r.inventory_item_id
        WHERE r.menu_item_id = NEW.menu_item_id
    LOOP
        current_stock := recipe_record.current_stock;
        
        -- Deduct stock
        UPDATE inventory_items
        SET current_stock = current_stock - (recipe_record.quantity_required * NEW.quantity),
            updated_at = NOW()
        WHERE id = recipe_record.inventory_item_id;
        
        -- Log the transaction
        INSERT INTO inventory_transactions (
            inventory_item_id,
            transaction_type,
            quantity,
            previous_stock,
            new_stock,
            reference_id,
            notes
        ) VALUES (
            recipe_record.inventory_item_id,
            'consumption',
            recipe_record.quantity_required * NEW.quantity,
            current_stock,
            current_stock - (recipe_record.quantity_required * NEW.quantity),
            NEW.order_id,
            'Auto-deducted from order'
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute inventory deduction
CREATE TRIGGER trigger_deduct_inventory
AFTER INSERT ON order_items
FOR EACH ROW
EXECUTE FUNCTION deduct_inventory_on_order();

-- Function to update order totals
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET 
        subtotal = (
            SELECT COALESCE(SUM(unit_price * quantity), 0)
            FROM order_items WHERE order_id = NEW.order_id
        ),
        tax_amount = (
            SELECT COALESCE(SUM(gst_amount), 0)
            FROM order_items WHERE order_id = NEW.order_id
        ),
        total_amount = (
            SELECT COALESCE(SUM(total_price), 0)
            FROM order_items WHERE order_id = NEW.order_id
        ),
        updated_at = NOW()
    WHERE id = NEW.order_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for order totals
CREATE TRIGGER trigger_update_order_totals
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_order_totals();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cashier')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Daily sales summary view
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT 
    DATE(created_at) as sale_date,
    COUNT(*) as total_orders,
    SUM(subtotal) as total_subtotal,
    SUM(tax_amount) as total_tax,
    SUM(total_amount) as total_revenue,
    COUNT(CASE WHEN bill_type = 'tax_invoice' THEN 1 END) as tax_invoice_count,
    COUNT(CASE WHEN bill_type = 'estimate' THEN 1 END) as estimate_count
FROM orders
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY sale_date DESC;

-- Top selling items view
CREATE OR REPLACE VIEW top_selling_items AS
SELECT 
    mi.id,
    mi.name,
    mi.category,
    SUM(oi.quantity) as total_sold,
    SUM(oi.total_price) as total_revenue
FROM order_items oi
JOIN menu_items mi ON mi.id = oi.menu_item_id
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
GROUP BY mi.id, mi.name, mi.category
ORDER BY total_sold DESC;

-- Low stock items view
CREATE OR REPLACE VIEW low_stock_items AS
SELECT 
    id,
    name,
    current_stock,
    min_stock_level,
    unit,
    (min_stock_level - current_stock) as shortage
FROM inventory_items
WHERE current_stock <= min_stock_level AND is_active = true
ORDER BY shortage DESC;

-- ============================================
-- SAMPLE DATA (Optional - Remove in Production)
-- ============================================

-- Sample Menu Categories and Items
INSERT INTO menu_items (name, description, category, price, gst_percentage, is_veg, display_order) VALUES
-- Biryani
('Chicken Biryani', 'Aromatic basmati rice with tender chicken', 'Biryani', 280.00, 5.00, false, 1),
('Mutton Biryani', 'Slow-cooked mutton with fragrant rice', 'Biryani', 350.00, 5.00, false, 2),
('Veg Biryani', 'Mixed vegetables with aromatic rice', 'Biryani', 180.00, 5.00, true, 3),
-- Starters
('Chicken 65', 'Spicy deep-fried chicken', 'Starters', 220.00, 5.00, false, 4),
('Paneer Tikka', 'Grilled cottage cheese with spices', 'Starters', 200.00, 5.00, true, 5),
('Gobi Manchurian', 'Indo-Chinese cauliflower preparation', 'Starters', 160.00, 5.00, true, 6),
-- Main Course
('Butter Chicken', 'Creamy tomato-based chicken curry', 'Main Course', 300.00, 5.00, false, 7),
('Dal Makhani', 'Creamy black lentils', 'Main Course', 180.00, 5.00, true, 8),
('Kadai Paneer', 'Paneer in spiced tomato gravy', 'Main Course', 220.00, 5.00, true, 9),
-- Breads
('Butter Naan', 'Soft bread with butter', 'Breads', 50.00, 5.00, true, 10),
('Garlic Naan', 'Naan with garlic topping', 'Breads', 60.00, 5.00, true, 11),
('Roti', 'Whole wheat flatbread', 'Breads', 25.00, 5.00, true, 12),
-- Beverages
('Masala Chai', 'Spiced Indian tea', 'Beverages', 30.00, 5.00, true, 13),
('Fresh Lime Soda', 'Refreshing lime drink', 'Beverages', 50.00, 5.00, true, 14),
('Lassi', 'Sweet yogurt drink', 'Beverages', 60.00, 5.00, true, 15);

-- Sample Inventory Items
INSERT INTO inventory_items (name, unit, current_stock, min_stock_level, cost_per_unit, category) VALUES
('Basmati Rice', 'kg', 50.000, 10.000, 120.00, 'Grains'),
('Chicken', 'kg', 20.000, 5.000, 220.00, 'Meat'),
('Mutton', 'kg', 10.000, 3.000, 600.00, 'Meat'),
('Paneer', 'kg', 8.000, 2.000, 350.00, 'Dairy'),
('Cooking Oil', 'l', 25.000, 5.000, 150.00, 'Oils'),
('Onions', 'kg', 30.000, 10.000, 40.00, 'Vegetables'),
('Tomatoes', 'kg', 20.000, 8.000, 50.00, 'Vegetables'),
('Ginger-Garlic Paste', 'kg', 5.000, 1.000, 180.00, 'Spices'),
('Garam Masala', 'kg', 2.000, 0.500, 400.00, 'Spices'),
('Cream', 'l', 5.000, 2.000, 280.00, 'Dairy'),
('Butter', 'kg', 4.000, 1.000, 450.00, 'Dairy'),
('Black Lentils (Urad Dal)', 'kg', 10.000, 3.000, 180.00, 'Lentils'),
('Cauliflower', 'kg', 8.000, 3.000, 60.00, 'Vegetables'),
('Wheat Flour', 'kg', 25.000, 8.000, 50.00, 'Grains'),
('Tea Leaves', 'kg', 2.000, 0.500, 600.00, 'Beverages'),
('Sugar', 'kg', 10.000, 3.000, 45.00, 'Essentials'),
('Yogurt', 'l', 10.000, 3.000, 80.00, 'Dairy'),
('Lemons', 'kg', 5.000, 2.000, 100.00, 'Fruits');

-- Sample Recipes (Linking Menu Items to Inventory)
-- Chicken Biryani Recipe
INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required, unit)
SELECT 
    (SELECT id FROM menu_items WHERE name = 'Chicken Biryani'),
    id,
    CASE name
        WHEN 'Basmati Rice' THEN 0.200
        WHEN 'Chicken' THEN 0.150
        WHEN 'Cooking Oil' THEN 0.050
        WHEN 'Onions' THEN 0.100
        WHEN 'Tomatoes' THEN 0.050
        WHEN 'Ginger-Garlic Paste' THEN 0.020
        WHEN 'Garam Masala' THEN 0.010
    END,
    unit
FROM inventory_items
WHERE name IN ('Basmati Rice', 'Chicken', 'Cooking Oil', 'Onions', 'Tomatoes', 'Ginger-Garlic Paste', 'Garam Masala');

-- Butter Chicken Recipe
INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required, unit)
SELECT 
    (SELECT id FROM menu_items WHERE name = 'Butter Chicken'),
    id,
    CASE name
        WHEN 'Chicken' THEN 0.200
        WHEN 'Butter' THEN 0.030
        WHEN 'Cream' THEN 0.050
        WHEN 'Tomatoes' THEN 0.100
        WHEN 'Ginger-Garlic Paste' THEN 0.020
        WHEN 'Garam Masala' THEN 0.010
    END,
    unit
FROM inventory_items
WHERE name IN ('Chicken', 'Butter', 'Cream', 'Tomatoes', 'Ginger-Garlic Paste', 'Garam Masala');

-- Paneer Tikka Recipe
INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required, unit)
SELECT 
    (SELECT id FROM menu_items WHERE name = 'Paneer Tikka'),
    id,
    CASE name
        WHEN 'Paneer' THEN 0.150
        WHEN 'Cooking Oil' THEN 0.030
        WHEN 'Ginger-Garlic Paste' THEN 0.015
        WHEN 'Garam Masala' THEN 0.005
    END,
    unit
FROM inventory_items
WHERE name IN ('Paneer', 'Cooking Oil', 'Ginger-Garlic Paste', 'Garam Masala');

-- Dal Makhani Recipe
INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required, unit)
SELECT 
    (SELECT id FROM menu_items WHERE name = 'Dal Makhani'),
    id,
    CASE name
        WHEN 'Black Lentils (Urad Dal)' THEN 0.100
        WHEN 'Butter' THEN 0.030
        WHEN 'Cream' THEN 0.030
        WHEN 'Tomatoes' THEN 0.050
        WHEN 'Ginger-Garlic Paste' THEN 0.010
    END,
    unit
FROM inventory_items
WHERE name IN ('Black Lentils (Urad Dal)', 'Butter', 'Cream', 'Tomatoes', 'Ginger-Garlic Paste');

-- Butter Naan Recipe
INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required, unit)
SELECT 
    (SELECT id FROM menu_items WHERE name = 'Butter Naan'),
    id,
    CASE name
        WHEN 'Wheat Flour' THEN 0.080
        WHEN 'Butter' THEN 0.015
        WHEN 'Yogurt' THEN 0.020
    END,
    unit
FROM inventory_items
WHERE name IN ('Wheat Flour', 'Butter', 'Yogurt');

-- Masala Chai Recipe
INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required, unit)
SELECT 
    (SELECT id FROM menu_items WHERE name = 'Masala Chai'),
    id,
    CASE name
        WHEN 'Tea Leaves' THEN 0.005
        WHEN 'Sugar' THEN 0.015
    END,
    unit
FROM inventory_items
WHERE name IN ('Tea Leaves', 'Sugar');

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
