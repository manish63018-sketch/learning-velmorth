import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/home',
  '/path',
  '/script',
  '/speak',
  '/jlpt',
  '/review',
  '/profile',
  '/admin',
  '/billing',
];

// Routes accessible only when NOT authenticated (redirect to /home if already logged in)
const AUTH_ONLY_ROUTES = [
  '/auth',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/public') ||
    pathname.includes('.') // files with extensions (images, fonts, etc.)
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Create Supabase server client (reads cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session (keeps it alive)
  const { data: { user } } = await supabase.auth.getUser();

  // ── Guard: Protected routes → redirect to /auth/login if not authenticated ──
  // (Commented out as UI pages are removed in backend-only preservation mode)
  /*
  const isProtected = PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
  if (isProtected && !user) {
    const loginUrl = new URL('/auth', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Guard: Auth-only routes → redirect to /home if already authenticated ──
  const isAuthOnly = AUTH_ONLY_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
  if (isAuthOnly && user) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // ── Guard: Root / redirect ──
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/home', request.url));
    } else {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
  }
  */

  // ── Guard: Admin routes → require admin role ──
  if (pathname.startsWith('/admin') && user) {
    const { data: adminRole } = await supabase
      .from('admin_roles')
      .select('user_id')
      .eq('user_id', user.id)
      .single();
    
    if (!adminRole) {
      // Not an admin — redirect to /home
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public directory files
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)',
  ],
};
