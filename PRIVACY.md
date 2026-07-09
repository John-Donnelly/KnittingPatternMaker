# Privacy Policy

**Last updated: 2026-07-09**

> **Before publishing:** the bracketed placeholders below — `[CONTACT EMAIL]`,
> `[HOSTING PROVIDER / REGION]`, and `[GOVERNING JURISDICTION]` — must be filled in with your
> real operational and legal details. This document describes how the software actually handles
> data (verified against the source), but it is not legal advice; have counsel review it before
> relying on it.

Knitting Pattern Maker ("the Service") is a product of JAD Apps ("we", "us"). This policy explains
what data the Service handles and why. The short version: **your uploaded images are never
stored, we run no analytics or third-party trackers, and you can use the Service without an
account.**

## The image you upload

When you convert an image, it is decoded and processed **entirely in memory** on the server to
produce your pattern, and then discarded. The image is **not written to disk, not saved to any
database, and not sent to any third party.** We keep no copy of it after your request finishes.

The browser also downscales large images **on your device** before upload, so the full-resolution
original is not transmitted.

## Patterns you save

If sign-in is enabled and you choose to **save** a pattern, we store, associated with your account:

- a compact **pattern token** (the same self-contained encoding used by share links) that
  describes the finished chart — colors and stitch grid. It does **not** contain your original
  image.
- lightweight display metadata: the name you give it, the technique, and the stitch/row
  dimensions, plus a creation timestamp.

Saved patterns are visible only to your account. You can delete any of them at any time, which
removes them from our storage.

## Account information

The Service supports optional single sign-on (SSO) through a standard OpenID Connect identity
provider (for example Google, Microsoft, Okta, or your organization's provider). If — and only if —
sign-in is enabled and you sign in, we store:

- your provider **subject identifier** (an opaque account ID),
- your **email address** and **display name**, as supplied by your identity provider.

We do **not** receive or store your password; authentication is handled entirely by your identity
provider. If sign-in is not enabled, the Service stores no personal data at all and can be used
anonymously.

## Share links

A share link encodes the whole pattern in the part of the URL after the `#` (the fragment). By
web design, the fragment is **never sent to our server** — it stays in your browser and travels
only to whomever you send the link. We do not log or store share-link contents.

## Cookies

The only cookie the Service sets is a **signed session cookie**, and only when SSO is enabled and
you sign in. It keeps you logged in and is not used for advertising or cross-site tracking. Its
value is cryptographically signed and is redacted from our server logs.

## What we do not do

- **No analytics, tracking pixels, ad networks, or third-party marketing scripts.** The
  application makes no requests to external analytics or advertising services.
- **We do not sell, rent, or share your personal data** with third parties for their own purposes.
- **We do not use your images or patterns to train models** or for any purpose other than
  producing the output you requested.

## Third parties we rely on

- **Your identity provider** (only if you sign in via SSO) authenticates you and supplies your
  email and name.
- **Our hosting/infrastructure provider**, `[HOSTING PROVIDER / REGION]`, runs the servers that
  process requests and store saved patterns.

The Service is built to support subscription billing in the future, but **no payment processing is
currently integrated**, and we do not collect or store payment card details.

## Server logs

We keep operational logs to run and secure the Service (for example, request method, path, and
timing). Sensitive headers — cookies and authorization tokens — are **redacted** before logging.

## Data retention and deletion

Saved patterns and account records are retained until you delete them or ask us to delete your
account. Deleting your account removes your saved patterns as well. To request deletion or a copy
of the data associated with your account, contact us at `[CONTACT EMAIL]`.

## Children

The Service is not directed to children under 13 (or the equivalent minimum age in your
jurisdiction), and we do not knowingly collect personal data from them.

## Changes to this policy

We may update this policy as the Service evolves. Material changes will be reflected by the "Last
updated" date above.

## Contact

Questions about this policy or your data: `[CONTACT EMAIL]`. This policy is governed by the laws of
`[GOVERNING JURISDICTION]`.
