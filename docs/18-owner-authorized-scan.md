# Owner-authorized scan scope

An operator can POST an explicit `pages` list and `owner_authorized_robots: { "reason": "Owner requested this staging audit" }` to `/api/sites/:id/scans` with `kind: "full"`. Existing authentication, session token and idempotency requirements apply. The engine must advertise this capability before the app accepts the override.

The list must contain 1 to 50 unique same-origin URLs. This request overrides the previous scan's URL list and retains comparison references and existing history. The authorization is recorded on this scan, never on the site's settings, and is not inherited by later scans. Ordinary rescan behavior remains unchanged. There is currently no browser control for this operator workflow.

For DSU staging, the published Webflow inventory on November 15, 2026 contained 33 content pages: 17 static pages (including `/lib/components` and `/lib/style-guide`), five blog articles, six client pages and five jobs. Each returned HTTP 200. Draft content, the disabled team template and special error/password pages were excluded from this content inventory. The site has `Disallow: /` and no sitemap, so use this explicit list for the authorized audit without publishing changes to Webflow.
