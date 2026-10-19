# Hafnia Control

Control panel: https://hafnia-control-auth.sylvestweb.workers.dev/admin
The existing hafnia.tattoo/admin.html redirects to this same-origin panel.

Only deploy this directory's hafnia-control-auth Worker. Existing SETTINGS and MEDIA KV IDs are preserved. AUTH is a dedicated SQLite Durable Object for serialized initialization, password state, session revocation and rate limiting. No other Cloudflare project is required.

SESSION_KEY and SETUP_KEY are Cloudflare secrets, generated independently with 48 random bytes. Never put values into Git, command arguments or logs. Initial setup accepts the setup key once, then refuses reinitialization. The private local setup shortcut is excluded by .gitignore. A password is never shipped in the source. Minimum password length is 12 characters; passwords are stored with HMAC-peppered, salted PBKDF2-SHA256 (100,000 iterations, within the production Workers per-call cap). The password pepper is domain-separated from SESSION_KEY using HMAC and is never stored alongside the password hash. Rotating SESSION_KEY also requires a deliberate password recovery plan.

Sessions last eight hours with a __Host- cookie, HttpOnly, Secure, SameSite=Strict. Password changes and logout revoke all previous sessions for the single administrator. POSTs require the exact control origin and JSON. Authentication attempts are limited to 10 per IP and 100 globally per 15-minute window; IPs are HMACed before storage. A sustained distributed attack can temporarily deny login. CSP blocks framing and external scripts. Image uploads accept JPEG/PNG/WebP with signature and size checks (8 MB), excluding SVG. Removal removes the gallery reference; it does not erase the stored media object.

Public site appearance and original image files remain unchanged. Public prices/gallery are read from this Worker's public API, with the original markup as network-error fallback. KV propagation and public caching can delay public changes by about a minute. The public website only needs a read-only API.

Deploy from secure-login using npx.cmd wrangler deploy. GitHub Pages publishes the root static site from main. Do not deploy repository contents as a different Cloudflare project.

security-test.cjs exercises isolated local Wrangler bindings only. It requires a fresh local persistence directory and test secrets in the ignored .hafnia-private/local-test.json and secure-login/.dev.vars files. Run from repository root with TEST_BASE pointing to the local Wrangler URL. The test covers setup, login, cookie flags, price edits, image upload/read/removal, rejected invalid values, password rotation and session revocation, CSRF, logout, security headers and rate limiting. Test credentials are randomly generated and never printed.

The secret-protected /api/setup-check operation tests the exact deployed password derivation without creating or changing an administrator password. Local Wrangler tests alone do not verify production cryptographic limits.
