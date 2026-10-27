import { NextResponse, type NextRequest } from 'next/server';

import { isValidSession, SESSION_COOKIE } from './lib/session';

/** Every page and API route needs an admin session, except the sign-in page itself. */
export function proxy(request: NextRequest) {
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ status: 401, title: 'Sign in required' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico).*)'],
};
