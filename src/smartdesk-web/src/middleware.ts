import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { evaluateRouteAccess, getRequestAuth } from "@/lib/auth/route-guard";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const auth = getRequestAuth(
    (name) => request.cookies.get(name)?.value,
    request.headers.get("authorization")
  );

  const decision = evaluateRouteAccess(pathname, auth);

  if (decision === "login") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (decision === "forbidden") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "forbidden");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
