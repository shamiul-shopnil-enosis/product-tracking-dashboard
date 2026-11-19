import { NextResponse, type NextRequest } from 'next/server';

// Fast redirect only. The api re-checks the token on every request.
export function middleware(req: NextRequest) {
  const hasToken = req.cookies.has('pt_token');
  if (!hasToken && req.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
