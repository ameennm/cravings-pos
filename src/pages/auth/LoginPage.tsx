import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChefHat, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'

// Validation schema
const loginSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .email('Please enter a valid email address'),
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
    const navigate = useNavigate()
    const { setUser } = useAuthStore()
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    })

    const onSubmit = async (data: LoginFormValues) => {
        if (isLoading) return

        setIsLoading(true)

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: data.email.toLowerCase().trim(),
                password: data.password,
            })

            if (authError) {
                // Generic error message for security
                toast.error('Invalid email or password')
                return
            }

            if (authData.user) {
                // Fetch user profile
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authData.user.id)
                    .single()

                if (profileError) {
                    // Try to create profile if it doesn't exist
                    if (profileError.code === 'PGRST116') {
                        const { data: newProfile, error: createError } = await supabase
                            .from('profiles')
                            .insert({
                                id: authData.user.id,
                                email: authData.user.email!,
                                full_name: authData.user.email!.split('@')[0],
                                role: 'cashier' as const
                            })
                            .select()
                            .single()

                        if (createError) {
                            console.error('Create profile error:', createError)
                            toast.error('Failed to create user profile')
                            return
                        }

                        setUser(newProfile)
                        toast.success(`Welcome, ${newProfile.full_name}!`)
                        navigate('/')
                        return
                    }

                    console.error('Profile error:', profileError)
                    toast.error('Failed to load user profile')
                    return
                }

                // Check if user is active
                if (!profile.is_active) {
                    await supabase.auth.signOut()
                    toast.error('Your account has been deactivated.')
                    return
                }

                setUser(profile)
                toast.success(`Welcome back, ${profile.full_name}!`)
                navigate('/')
            }
        } catch (error) {
            console.error('Login error:', error)
            toast.error('An error occurred. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="w-full max-w-md glass-card animate-fade-in">
            <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-lg shadow-primary/30">
                    <ChefHat className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
                <CardDescription>Sign in to your Kitchen POS account</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@restaurant.com"
                            autoComplete="email"
                            disabled={isLoading}
                            {...register('email')}
                            className={errors.email ? 'border-destructive' : ''}
                        />
                        {errors.email && (
                            <p className="text-sm text-destructive">{errors.email.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                disabled={isLoading}
                                {...register('password')}
                                className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-sm text-destructive">{errors.password.message}</p>
                        )}
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                </form>

                <div className="mt-6 text-center text-sm text-muted-foreground">
                    <p>Demo Credentials:</p>
                    <p className="mt-1 font-mono text-xs">admin@kitchen.com / admin123</p>
                </div>
            </CardContent>
        </Card>
    )
}
