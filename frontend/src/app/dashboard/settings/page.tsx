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
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader } from '@/components/ui/skeleton'

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
      <div className="space-y-6">
        <SkeletonPageHeader />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account and application preferences."
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto p-1 bg-slate-100">
          <TabsTrigger value="profile" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            <Settings2 className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
          {(userRole === 'admin') && (
            <TabsTrigger value="models" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Bot className="h-4 w-4 mr-2" />
              LLM Models
            </TabsTrigger>
          )}
          {(userRole === 'admin') && (
            <TabsTrigger value="users" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-slate-100">
                  <User className="h-4 w-4 text-slate-600" />
                </div>
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information and profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  value={profile.email}
                  disabled
                  className="bg-slate-50 border-slate-200"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Email address is managed by your authentication provider
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="fullName"
                  value={profile.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatarUrl" className="text-sm font-medium">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  value={profile.avatar_url || ''}
                  onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  Provide a URL to your profile picture
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-slate-200">
                    <Shield className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Current Role</p>
                    <p className="text-sm font-semibold capitalize text-indigo-600">
                      {userRole}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleSaveProfile}
                  disabled={saving}
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
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-slate-100">
                  <Settings2 className="h-4 w-4 text-slate-600" />
                </div>
                Application Preferences
              </CardTitle>
              <CardDescription>
                Customize your application experience and behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-medium">Default LLM Model</Label>
                      <p className="text-sm text-slate-500">
                        Choose the default AI model for processing resumes and tests
                      </p>
                    </div>
                    <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white" defaultValue="Mistral 7B">
                      <option>Mistral 7B</option>
                      <option>Llama 2 7B</option>
                      <option>CodeLlama 7B</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-medium">Results Per Page</Label>
                      <p className="text-sm text-slate-500">
                        Number of candidates or results to display per page
                      </p>
                    </div>
                    <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white" defaultValue="50">
                      <option>10</option>
                      <option>25</option>
                      <option>50</option>
                      <option>100</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-medium">Email Notifications</Label>
                      <p className="text-sm text-slate-500">
                        Receive email updates about evaluations and new candidates
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button>
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
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-slate-100">
                    <Bot className="h-4 w-4 text-slate-600" />
                  </div>
                  LLM Model Configuration
                </CardTitle>
                <CardDescription>
                  Manage and configure AI models for resume matching and test evaluation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Available Models</Label>
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
                            <div className="p-1.5 rounded-md bg-slate-100">
                              <Bot className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{model.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Size: {model.size || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            Set as Default
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-sm font-medium text-slate-900 mb-1">No models found</p>
                      <p className="text-sm text-slate-400">Make sure Ollama is running with models pulled.</p>
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
                    <Button>
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
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-slate-100">
                    <Users className="h-4 w-4 text-slate-600" />
                  </div>
                  User Management
                </CardTitle>
                <CardDescription>
                  Manage users, roles, and permissions across the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">Advanced User Management</p>
                  <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
                    User management interface coming soon. For now, manage users and roles directly through the Supabase dashboard.
                  </p>
                  <Button variant="outline">
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
