# Kitchen POS - Restaurant & Kitchen Management System

A production-ready Windows Desktop Application for Restaurant & Kitchen Management built with Electron.js, React, TypeScript, and Supabase.

## Features

### 🍽️ POS / Billing (Cashier View)
- High-density grid view of menu items (Petpooja style)
- Fast cart management with add/remove functionality
- **GST Toggle**: Switch between "Tax Invoice" (with GST) and "Estimate" (no GST)
- Thermal receipt printing via USB printer
- Keyboard shortcuts: F1 (Search), F10 (Print & Save)

### 👨‍🍳 Kitchen Management (Chef View)
- Real-time order display with status updates
- Low stock alerts
- Order status workflow: Pending → Preparing → Ready → Completed

### 📦 Inventory Management
- Stock level tracking with visual indicators
- Low stock alerts
- Stock adjustment with transaction logging
- Stock value calculation

### 📊 Daily Closing (THE 10 AM RULE)
- Chef must submit daily closing report
- Stock verification: System vs Physical count
- Wastage entry
- **Warning banner if closed after 10 AM**

### 📈 Analytics
- Revenue trends (7/30/90 days)
- Top selling items
- Bill type distribution (Tax Invoice vs Estimate)
- Category revenue breakdown
- Low stock alerts

### 🔐 Role-Based Access
- **Admin**: Full access
- **Chef**: Kitchen, Inventory, Daily Closing
- **Cashier**: POS, Orders

## Tech Stack

- **Framework**: Electron.js + React (Vite)
- **Language**: TypeScript
- **UI**: Tailwind CSS + Shadcn/UI components
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **State**: TanStack Query + Zustand
- **Printing**: ESC/POS commands for thermal printers

## Setup Instructions

### Step 1: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to the **SQL Editor** tab in your dashboard
3. Copy the contents of `supabase-schema.sql` and run it
4. Copy your project URL and anon key from **Settings → API**

### Step 2: Configure Environment

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Run Development Server

```bash
# Run React + Electron in development mode
npm run electron:dev
```

### Step 5: Build for Production

```bash
# Build Windows installer
npm run electron:build
```

The installer will be created in the `release` folder.

## Project Structure

```
kitchen-pos/
├── electron/               # Electron main process
│   ├── main.ts            # Main process entry
│   ├── preload.ts         # Preload script for IPC
│   └── services/
│       └── printer.ts     # Thermal printer service
├── src/
│   ├── components/
│   │   ├── layouts/       # Auth and Dashboard layouts
│   │   └── ui/            # Shadcn/UI components
│   ├── lib/
│   │   ├── supabase.ts    # Supabase client
│   │   ├── database.types.ts # TypeScript types
│   │   └── utils.ts       # Utility functions
│   ├── pages/
│   │   ├── auth/          # Login page
│   │   ├── pos/           # POS/Billing page
│   │   ├── kitchen/       # Kitchen, Inventory, Daily Closing
│   │   ├── orders/        # Orders management
│   │   ├── analytics/     # Analytics dashboard
│   │   └── settings/      # App settings
│   ├── store/             # Zustand stores
│   │   ├── authStore.ts   # Auth state
│   │   └── cartStore.ts   # Cart with GST toggle logic
│   ├── App.tsx            # Main app with routing
│   └── main.tsx           # React entry point
├── supabase-schema.sql    # Database schema
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Key Features Explained

### GST Toggle Logic
The cart store (`src/store/cartStore.ts`) manages the bill type:
- **Tax Invoice**: Applies GST based on item's gst_percentage
- **Estimate**: Sets GST to 0% for all items

When the toggle changes, all cart item prices are recalculated.

### 10 AM Daily Closing Rule
The dashboard layout checks if:
1. Current time is past 10 AM
2. Yesterday's daily closing has not been submitted

If both conditions are true, a warning banner is displayed.

### Automatic Inventory Deduction
When an order is placed, the Supabase trigger (`deduct_inventory_on_order`) automatically:
1. Looks up recipes for each ordered item
2. Deducts the required quantities from inventory
3. Logs the transaction

## Printer Setup

1. Connect a USB thermal receipt printer (58mm or 80mm)
2. Install the manufacturer's Windows driver
3. Go to Settings → Printer in the app
4. Select your printer and click "Test" to verify

## Creating Users

Use the Supabase dashboard or SQL to create users with specific roles:

```sql
-- After a user signs up, update their role
UPDATE profiles
SET role = 'chef'
WHERE email = 'chef@kitchen.com';
```

## License

MIT
