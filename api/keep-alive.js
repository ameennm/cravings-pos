/**
 * Keep-Alive API Route
 * This runs every 6 days as a cron job to prevent Supabase free tier from pausing
 */

import { createClient } from '@supabase/supabase-js'

export const config = {
    runtime: 'edge',
}

export default async function handler(request) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
        return new Response(
            JSON.stringify({ error: 'Missing Supabase credentials' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Simple query to keep the database active
        const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })

        if (error) {
            throw error
        }

        const timestamp = new Date().toISOString()
        console.log(`[${timestamp}] Keep-alive ping successful. Profiles count: ${count}`)

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Supabase keep-alive ping successful',
                timestamp,
                profilesCount: count,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('Keep-alive error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
