'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { User, Settings2, Users, Bot, Save, Shield } from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
}

interface LLMModel {
  name: string
  size: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userRole, setUserRole] = useState<string>('user')
  const [profile, setProfile] = useState<UserProfile>({
    id: '',
    email: '',
    full_name: '',
    avatar_url: null
  })
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get user record
      const { data: userRecord } = await supabase
        .from('users')
        .select('id, email, full_name, avatar_url')
        .eq('auth_user_id', user.id)
        .single()

      if (!userRecord) {
        toast.error('User not found')
        return
      }

      setProfile(userRecord)

      // Get user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userRecord.id)
        .single()

      const role = (roleData as any)?.roles?.name || 'hr'
      setUserRole(role)

      // Load LLM models if admin
      if (role === 'admin') {
        try {
          console.log('Fetching available models...')
          const response = await apiClient.getAvailableModels()
          console.log('Models response:', response)

          if (response && response.models && Array.isArray(response.models)) {
            setAvailableModels(response.models)
            console.log('Loaded models:', response.models)
            if (response.models.length === 0) {
              toast.info('No models found. Pull models using Ollama CLI.')
            }
          } else {
            console.warn('Invalid models response:', response)
            setAvailableModels([])
          }
        } catch (error: any) {
          console.error('Error loading models:', error)
          console.error('Error details:', error.response?.data || error.message)

          const errorMessage = error.response?.data?.detail || error.message
          if (errorMessage.includes('ollama')) {
            toast.error('Ollama is not installed or not running. Please start Ollama.')
          } else if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
            toast.error('Backend server is not running. Please start the FastAPI server.')
          } else {
            toast.error(`Failed to load models: ${errorMessage}`)
          }
          setAvailableModels([])
        }
      }

    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('users')
        .update({
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error

      toast.success('Profile updated successfully')
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-500/90 to-slate-600 p-8 text-white shadow-xl">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-6 w-6" />
            <span className="text-sm font-medium opacity-90">Configuration</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">Settings</h1>
          <p className="text-lg opacity-90">
            Manage your account and application preferences
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto p-1 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900">
          <TabsTrigger value="profile" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white">
            <Settings2 className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
          {(userRole === 'admin') && (
            <TabsTrigger value="models" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white">
              <Bot className="h-4 w-4 mr-2" />
              LLM Models
            </TabsTrigger>
          )}
          {(userRole === 'admin') && (
            <TabsTrigger value="users" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="border-0 shadow-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                  <User className="h-5 w-5 text-white" />
                </div>
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information and profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 relative">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
                <Input
                  id="email"
                  value={profile.email}
                  disabled
                  className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Email address is managed by your authentication provider
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold">Full Name</Label>
                <Input
                  id="fullName"
                  value={profile.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Enter your full name"
                  className="border-slate-200 focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatarUrl" className="text-sm font-semibold">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  value={profile.avatar_url || ''}
                  onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  className="border-slate-200 focus:border-blue-500 transition-colors"
                />
                <p className="text-xs text-muted-foreground">
                  Provide a URL to your profile picture
                </p>
              </div>

              <div className="p-4 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Current Role</p>
                    <p className="text-lg font-bold capitalize bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                      {userRole}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                >
                  {saving ? (
                    <Save className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card className="border-0 shadow-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                  <Settings2 className="h-5 w-5 text-white" />
                </div>
                Application Preferences
              </CardTitle>
              <CardDescription>
                Customize your application experience and behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 relative">
              <div className="space-y-6">
                <div className="p-4 rounded-lg border border-slate-200 bg-white hover:border-purple-300 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-semibold">Default LLM Model</Label>
                      <p className="text-sm text-muted-foreground">
                        Choose the default AI model for processing resumes and tests
                      </p>
                    </div>
                    <select className="border border-slate-200 rounded-lg px-4 py-2 bg-white hover:border-purple-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all" defaultValue="Mistral 7B">
                      <option>Mistral 7B</option>
                      <option>Llama 2 7B</option>
                      <option>CodeLlama 7B</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white hover:border-purple-300 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-semibold">Results Per Page</Label>
                      <p className="text-sm text-muted-foreground">
                        Number of candidates or results to display per page
                      </p>
                    </div>
                    <select className="border border-slate-200 rounded-lg px-4 py-2 bg-white hover:border-purple-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all" defaultValue="50">
                      <option>10</option>
                      <option>25</option>
                      <option>50</option>
                      <option>100</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white hover:border-purple-300 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-semibold">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive email updates about evaluations and new candidates
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white">
                  <Save className="mr-2 h-4 w-4" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LLM Models Tab (Admin Only) */}
        {userRole === 'admin' && (
          <TabsContent value="models">
            <Card className="border-0 shadow-lg overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  LLM Model Configuration
                </CardTitle>
                <CardDescription>
                  Manage and configure AI models for resume matching and test evaluation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 relative">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Available Models</Label>
                    <span className="text-sm text-muted-foreground">
                      {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} installed
                    </span>
                  </div>
                  {availableModels.length > 0 ? (
                    <div className="space-y-3">
                      {availableModels.map((model, index) => (
                        <div
                          key={index}
                          className="group flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white hover:border-orange-300 hover:shadow-md transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-100 to-red-100 group-hover:from-orange-200 group-hover:to-red-200 transition-colors">
                              <Bot className="h-5 w-5 text-orange-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{model.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Size: {model.size || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-orange-200 hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 hover:text-white hover:border-transparent transition-all"
                          >
                            Set as Default
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg bg-slate-50">
                      <div className="inline-flex p-3 rounded-full bg-gradient-to-br from-orange-100 to-red-100 mb-3">
                        <Bot className="h-8 w-8 text-orange-600" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No models found. Make sure Ollama is running with models pulled.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-orange-500 inline-block"></span>
                    Pull New Model
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., llama2:7b, mistral:7b, codellama:7b"
                      className="flex-1 border-slate-200 focus:border-orange-500 transition-colors"
                    />
                    <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white">
                      Pull Model
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-slate-400 inline-block"></span>
                    This will download the specified model from the Ollama registry
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* User Management Tab (Admin Only) */}
        {userRole === 'admin' && (
          <TabsContent value="users">
            <Card className="border-0 shadow-lg overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent"></div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  User Management
                </CardTitle>
                <CardDescription>
                  Manage users, roles, and permissions across the platform
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-center py-12 space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-gradient-to-br from-green-100 to-emerald-100">
                    <Users className="h-12 w-12 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Advanced User Management</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      User management interface coming soon. For now, manage users and roles directly through the Supabase dashboard.
                    </p>
                  </div>
                  <Button className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white">
                    <Shield className="mr-2 h-4 w-4" />
                    Open Supabase Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
