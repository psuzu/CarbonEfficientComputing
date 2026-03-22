import { createClient } from '@supabase/supabase-js'

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseServerKey =
  getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY') ??
  getRequiredEnv('SUPABASE_SERVICE_KEY') ??
  getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
  getRequiredEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY')

if (!supabaseUrl || !supabaseServerKey) {
  throw new Error('Missing Supabase server environment variables')
}

export const supabaseServer = createClient(supabaseUrl, supabaseServerKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export function formatSupabaseError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }
    const parts = [
      typeof maybeError.message === 'string' ? maybeError.message : null,
      typeof maybeError.details === 'string' ? maybeError.details : null,
      typeof maybeError.hint === 'string' ? maybeError.hint : null,
      typeof maybeError.code === 'string' ? `code=${maybeError.code}` : null,
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return 'Unknown error'
}
