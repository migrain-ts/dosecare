# 0001. Server-side sessions implemented in the API

Status: accepted

Context: web today, mobile later. Needs revocation, no third-party service, small attack surface.

Decision: opaque random 32-byte tokens, only the SHA-256 hash stored in `sessions`, argon2id password hashes, `httpOnly` `SameSite=Lax` cookie, `Authorization: Bearer` accepted for mobile. Next.js proxies `/api/*` so web and API share an origin.

Consequences: logout and expiry are enforced in the database, and a leaked database does not leak usable tokens. We own security-sensitive code, so it is small and covered by tests (expiry, revocation, timing-equal login errors, rate limiting). No email verification or password reset in v1.
