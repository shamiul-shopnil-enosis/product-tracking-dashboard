/** Pages that work without a session. Sign-in, and the page an invite or reset link opens. */
export const PUBLIC_PATHS = ['/login', '/accept-invite'];

export const isPublicPath = (pathname: string) => PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
