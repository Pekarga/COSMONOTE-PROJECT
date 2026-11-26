import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthorized } from "./lib/auth";

// Protège les pages par mot de passe quand APP_PASSWORD est défini.
// Les routes d'API vérifient elles-mêmes la session (voir lib/auth.ts).
export async function proxy(req: NextRequest) {
  if (await isAuthorized(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|connexion|_next|manifest.webmanifest|sw.js|icon|favicon).*)"],
};
