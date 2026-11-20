# Cloudflare security operations

## Planning snapshot — 6 November 2026

**Cloudflare access was pending. This snapshot records no live changes for the zone rollout below.**

Source: `test-results/Cloudflare_CSVillain_SecurityInsights_20261106_1859.csv`.
The export contains ten findings: two missing-HSTS warnings, one legacy-TLS
warning, four dangling-A warnings, and three configuration suggestions.

### Historical baseline

Authenticated GitHub API checks on 6 November 2026 confirmed:

- Account: `CSVillain`; repository: `CSVillain/Jifsaw`.
- Pages status: built; publication source: `main`, repository root.
- Custom domain: `jifsaw.com`; HTTPS enforcement: enabled.
- GitHub's approved certificate covers `jifsaw.com` and `www.jifsaw.com` and
  expires on **6 January 2027**.
- Private vulnerability reporting: enabled.

Public response checks confirmed apex HTTPS returns 200 and www HTTPS returns
301 to `https://jifsaw.com/`. Neither response contains HSTS.
`/.well-known/security.txt` returned GitHub Pages' missing-file page at the time.
The planning-stage DNS checks found the four GitHub Pages apex addresses,
`www` pointing to `csvillain.github.io`, and the expected GitHub verification
TXT record. Account-level verified-domain status still needs checking; a TXT
record alone is insufficient evidence of that status.

Cloudflare's authenticated configuration, other proxied hostnames, and active
edge certificates have **not** been inspected. The dashboard remained on
"Loading dashboard" and no Cloudflare API credential was available to the
implementation session. The GitHub Pages health endpoint did not provide
usable domain details in the selected response fields. Legacy TLS acceptance
has not been independently reproduced.

## Approved configuration and execution order

Verify current DNS, certificates, and HTTP responses before applying any step.

1. Authenticate to the correct Cloudflare account and zone. Save a private
   before-change export of DNS and the TLS/security settings. Do not place
   credentials or a full zone export in the public repository.
2. Verify the custom domain is marked verified in the GitHub account. Keep its
   verification TXT record. Inspect the complete Cloudflare zone for other
   proxied hostnames before changing zone-wide TLS policy; pause if any have
   incompatible requirements.
3. Confirm active Cloudflare certificates cover apex and www, and directly
   verify GitHub origin certificates and their renewal requirements. Preserve
   valid origin HTTPS throughout the rollout and recovery.
4. Preserve apex A targets `185.199.108.153`, `185.199.109.153`,
   `185.199.110.153`, and `185.199.111.153`; preserve the www CNAME target
   `csvillain.github.io`. Enable proxying on these website records only.
   Preserve mail, verification, and unrelated records.
5. Use Full (strict) encryption and Always Use HTTPS. Verify apex serves the
   game through Cloudflare and www redirects to apex without loops or 52x
   errors before enabling HSTS.
6. Set minimum TLS to 1.2 and enable TLS 1.3. Enable HSTS with
   `max-age=2592000` (30 days), includeSubDomains off, and preload off.
   Preserve unrelated settings in any settings update.
7. Configure Cloudflare-managed security.txt as described below.
8. Complete the acceptance checks, record actual after-change settings and
   publication time here, and obtain fresh Cloudflare scan results.

No hosting migration, paid upgrade, Turnstile widget, AI Labyrinth activation,
analytics change, application API change, or Worker redesign is included.
The separate `workers.dev` Giphy endpoint is outside this zone policy.

## Private reporting and security.txt renewal

Configure the following fields in Cloudflare's security.txt settings:

```text
Contact: https://github.com/CSVillain/Jifsaw/security/advisories/new
Canonical: https://jifsaw.com/.well-known/security.txt
Preferred-Languages: en
Expires: <actual publication time plus 180 days, in UTC RFC 3339 format>
```

The expiry above is an instruction for configuration, not publishable file
content. **Publication time and expiry are pending; no expiry has been set.**
Verify the reporting form with a signed-in researcher account without
submitting a report. Do not use public issues for confidential vulnerability
reports.

At publication, record the exact UTC expiry here. The repository owner should
review the contact route 30 days before that expiry, confirm private reporting
still works, extend expiry by 180 days from renewal, and verify the public
response. No scheduled reminder has been created.

## Acceptance checks and evidence

All rollout acceptance checks below remain pending:

- Both HTTP hostnames reach canonical HTTPS. Apex HTTPS returns the game;
  www HTTPS redirects correctly. Certificates are valid and no redirect loops
  or Cloudflare 52x errors occur.
- TLS 1.0 and 1.1 handshakes fail on both hostnames when tested using a client
  capable of offering those protocols. TLS 1.2 and 1.3 succeed. A locally
  disabled legacy protocol is not evidence of server rejection.
- Both HTTPS hostnames send the intended HSTS header, including the www
  redirect and an HTTPS missing-page response.
- security.txt returns 200 with plain-text content, the intended reporting
  contact, canonical URL, and a future expiry.
- Desktop and mobile checks cover theme selection, real GIF loading through
  the existing Worker, puzzle start and reset. Confirm analytics loads.
- Record each of the four dangling-A warnings separately. Their addresses
  match GitHub's documented targets, but do not mark them false positives
  until account-level domain verification is confirmed. Retain all four
  records. If verification is absent, verify the domain before closure.
- Close transport findings only after successful checks and record fresh
  scanner status separately from manual evidence. Leave AI Labyrinth and
  Turnstile suggestions deferred as optional controls.

## Recovery and certificate continuity

Before HSTS activation, restore captured proxy flags and settings if proxying
fails; retain GitHub hosting and working HTTPS. Never weaken certificate
validation to make the rollout pass.

After HSTS activation, keep HTTPS working throughout recovery. To retire HSTS,
serve `Strict-Transport-Security: max-age=0` over HTTPS and verify it. Merely
turning the setting off does not clear browser policies. Clients that do not
revisit can retain the original policy for up to 30 days. Returning to direct
GitHub serving would also remove Cloudflare's TLS minimum and security.txt
delivery; record those regressions if recovery requires that route.

Before the origin certificate expires, confirm renewal succeeds while proxying
is enabled. If validation needs a temporary routing change, arrange it before
expiry and preserve valid HTTPS. Do not let HSTS outlive working HTTPS.

## References

- [GitHub Pages custom domains and takeover prevention](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Cloudflare HSTS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)
- [Cloudflare minimum TLS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/)
- [Cloudflare-managed security.txt](https://developers.cloudflare.com/security-center/infrastructure/security-file/)
