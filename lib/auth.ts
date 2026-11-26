export const SESSION_COOKIE = "redacteur_session";

export function passwordEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/** Jeton de session dérivé du mot de passe : changer le mot de passe déconnecte tout le monde. */
export async function sessionToken(): Promise<string> {
  const data = new TextEncoder().encode(`le-redacteur:${process.env.APP_PASSWORD ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAuthorized(cookieValue: string | undefined): Promise<boolean> {
  if (!passwordEnabled()) return true;
  return Boolean(cookieValue) && cookieValue === (await sessionToken());
}

/** À appeler en tête de chaque route d'API. Renvoie une réponse 401 si besoin. */
export async function guard(req: Request & { cookies?: { get(name: string): { value: string } | undefined } }) {
  const value = req.cookies?.get(SESSION_COOKIE)?.value;
  if (await isAuthorized(value)) return null;
  return Response.json({ error: "Non autorisé" }, { status: 401 });
}
