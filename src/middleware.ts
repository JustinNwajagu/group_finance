import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";
const DEV_SESSION_COOKIE = "klef_dev_session";
const LAST_ACTIVE_COOKIE = "klef_last_active";
const DEFAULT_IDLE_MINUTES = 30;

const IDLE_MESSAGE = "Signed out after inactivity. Sign in again to continue.";

function idleMs(): number {
  const raw = Number(process.env.SESSION_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const minutes =
    Number.isFinite(raw) && raw >= 1
      ? Math.min(24 * 60, Math.floor(raw))
      : DEFAULT_IDLE_MINUTES;
  return minutes * 60 * 1000;
}

function hasSession(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get(SESSION_COOKIE)?.value ||
      request.cookies.get(DEV_SESSION_COOKIE)?.value,
  );
}

function clearSession(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(DEV_SESSION_COOKIE);
  response.cookies.delete(LAST_ACTIVE_COOKIE);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/tab-") ||
    pathname.startsWith("/apple-") ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  if (!hasSession(request)) {
    return NextResponse.next();
  }

  const raw = request.cookies.get(LAST_ACTIVE_COOKIE)?.value;
  const last = Number(raw);
  const now = Date.now();
  const expired =
    !Number.isFinite(last) || last <= 0 || now - last > idleMs();

  if (!expired) {
    return NextResponse.next();
  }

  // On /login, just clear the stale session so the form can be used.
  if (pathname === "/login") {
    const response = NextResponse.next();
    clearSession(response);
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", IDLE_MESSAGE);
  const response = NextResponse.redirect(url);
  clearSession(response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
