/**
 * Authentication utility functions
 */
import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'hr' | 'interviewer'

/**
 * Get the current user's role from the database
 * @returns The user's role (admin, hr, or interviewer)
 * @throws Error if user is not found or has no role assigned
 */
export async function getUserRole(): Promise<UserRole> {
  const supabase = createClient()

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  // Get user record
  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (userError || !userRecord) {
    throw new Error('User record not found')
  }

  // Get user role
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', userRecord.id)
    .single()

  if (roleError || !roleData) {
    // No role assigned - this shouldn't happen with the trigger
    // But if it does, assign HR role as fallback
    console.warn('User has no role assigned, assigning HR role')

    // Get HR role ID
    const { data: hrRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'hr')
      .single()

    if (hrRole) {
      // Assign HR role
      await supabase
        .from('user_roles')
        .insert({
          user_id: userRecord.id,
          role_id: hrRole.id
        })
    }

    return 'hr'
  }

  const roleName = (roleData as any)?.roles?.name

  // Validate role
  if (!['admin', 'hr', 'interviewer'].includes(roleName)) {
    console.error('Invalid role:', roleName)
    return 'hr' // Fallback to HR
  }

  return roleName as UserRole
}

/**
 * Check if user has a specific role
 */
export async function hasRole(role: UserRole): Promise<boolean> {
  try {
    const userRole = await getUserRole()
    return userRole === role
  } catch {
    return false
  }
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  return hasRole('admin')
}

/**
 * Get current user ID
 */
export async function getCurrentUserId(): Promise<string> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: userRecord } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userRecord) throw new Error('User record not found')

  return userRecord.id
}
