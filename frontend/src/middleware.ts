import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'

const locales = ['de', 'en']
const defaultLocale = 'de'

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPage = pathname.includes('/login')
  const isPublicPath = isLoginPage || pathname === '/'

  // Run intl middleware first
  const intlResponse = intlMiddleware(request)

  // Auth check for protected routes
  if (!isPublicPath) {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Detect locale from path and redirect to login
      const locale = locales.find(l => pathname.startsWith(`/${l}/`)) ?? defaultLocale
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
    }
  }

  return intlResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
