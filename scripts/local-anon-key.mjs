// Prints the anon key for the LOCAL preview backend (signed with the local-only secret).
import { createHmac } from "node:crypto";

export function localAnonKey() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" });
  const body = b({ iss: "supabase-demo", role: "anon", exp: 1983812996 });
  const sig = createHmac("sha256", "super-secret-jwt-token-with-at-least-32-characters-long").update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(localAnonKey());
