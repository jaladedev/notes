import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { edgeEnv } from "@/lib/env.edge";
import { logger } from "@/lib/logger";

// Adapted from school_app's proxy.ts (SHA 466c538). Re-adds
// handlePasswordChange (must_change_password gate) and a deactivation
// check, now that accounts are admin-provisioned with a temp password
// instead of self-signed-up -- both were dropped in the first pass of
// this scaffold and need to come back for that flow to be enforceable.

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    edgeEnv.NEXT_PUBLIC_SUPABASE_URL,
    edgeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let getUserError: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"] = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    getUserError = result.error;
    if (!getUserError || !isAuthRetryableFetchError(getUserError)) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const authCheckFailedTransiently = getUserError ? isAuthRetryableFetchError(getUserError) : false;

  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isChangePasswordRoute = request.nextUrl.pathname.startsWith("/change-password");

  if ((isDashboardRoute || isChangePasswordRoute) && !user && !authCheckFailedTransiently) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authCheckFailedTransiently) {
    logger.warn("middleware: auth check failed transiently, continuing without a verified user", {
      path: request.nextUrl.pathname,
      error: getUserError,
    });
    return response;
  }

  let mustChangePassword = false;
  let isActive = true;

  if (user && (isDashboardRoute || isLoginRoute || isChangePasswordRoute)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password, is_active")
      .eq("id", user.id)
      .maybeSingle();

    isActive = profile?.is_active ?? true;
    mustChangePassword = profile?.must_change_password ?? false;

    // A deactivated account is signed out immediately, everywhere -- see
    // setAccountActive in accountAdmin.ts, which also force-ends the
    // Supabase session server-side. This is the client-facing half: any
    // cookie that survives that gets rejected here too.
    if (!isActive && isDashboardRoute) {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("deactivated", "1");
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isDashboardRoute && mustChangePassword) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  if (isChangePasswordRoute && !mustChangePassword && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isLoginRoute && user && isActive) {
    return NextResponse.redirect(
      new URL(mustChangePassword ? "/change-password" : "/dashboard", request.url)
    );
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/change-password"],
};
