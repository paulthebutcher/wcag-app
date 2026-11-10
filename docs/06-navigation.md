# 06 Navigation

## Sidebar
1. Site switcher: dropdown at the top. Lists sites; "Add site +" is the last item.
2. Overview
3. Components & Global
4. Templates
5. Pages
6. Errors
7. Scans: shows a running indicator while any scan is queued or running, and a dot while any completed scan is unread.

## Routes
Every route carries the site. List state lives in the query string.

```
/sites/new
/sites/:siteId                                   -> Overview
/sites/:siteId/components                        ?status=&criterion=&reviewed=&scope=&page=
/sites/:siteId/components/:componentId           ?tab=&page=&from=
/sites/:siteId/templates                         ?status=&criterion=&reviewed=&sampled=&page=
/sites/:siteId/templates/:templateId             ?tab=&page=&from=
/sites/:siteId/pages                             ?status=&criterion=&reviewed=&page=
/sites/:siteId/pages/:pageId                     ?tab=&page=&from=
/sites/:siteId/errors                            ?status=&criterion=&reviewed=&grouped=&notes=&page=
/sites/:siteId/errors/:errorId                   ?tab=&page=&from=
/sites/:siteId/scans                             ?kind=&scope=&outcome=&from_date=&to_date=&reviewed=&page=
/sites/:siteId/scans/:scanId                     ?tab=&page=&from=
```

- Omit `page` when it is 1. Omit `tab` when it is the Overview tab.
- Multi-value filters are comma separated: `status=has_error,in_progress`.
- `from` is the URL-encoded list or tab the user came from, used for back and previous / next.

## Link rule
Entity names in lists and references are real `<a href>` links so open-in-new-tab works. Rows are not clickable. Explicit actions, navigation, linked summary counts and external URLs are allowed. A detail heading does not need to link to itself; a scan date acts as its identifying link.

## Back, previous, next
- Top left of every entity page: a back link naming where the user came from ("Back to Pages", "Back to /about, Errors tab"). Without `from`, it goes to the entity's top-level list.
- Top right, vertically aligned with the back link: Previous, a position label ("14 of 400"), Next.
  - They step through the list or tab in `from`, across pagination.
  - Hidden when there is no `from`.
- Switching tabs uses `history.replaceState`, so browser back skips tab changes.
- Returning to a list restores filters, sort and page from the URL, and moves focus to the row the user opened.

## Highlighting
The sidebar highlights by entity type. An error opened from a page highlights Errors; the back link says where you came from.

## Site switcher
- Changing site goes to that site's Overview.
- The current site name is always visible in the sidebar.

## Add site
`/sites/new`: name and URL. Saving creates the site and offers "Run first scan" (full scan, local-only checks, 50 page cap). An expandable scan-options form shows model mode, tiers and platform; settings and limits are in `14`.

## Context and state defaults
- Validate `from` as an internal relative URL for the same site. Ignore unsafe, recursive or cross-site values.
- Previous/next use the current server ordering of the source list with its filters. If a status change removes the current item from that list, keep the detail open, show "No longer in this filtered list", and hide position/previous/next until back or a new source selection.
- On back, focus the originating name link; if absent, focus the table heading and announce that the item no longer matches. Clamp a now-empty pagination page to the last available page.
- Tab changes reset that tab's page to 1. Filter changes reset list page to 1. Invalid query values fall back to valid defaults with a normalized URL.
- v1 has fixed documented ordering, no user-selectable sort. Restore that ordering along with URL filters/page.
- Site overflow actions include scan settings and Export feedback. No client-facing account/profile controls.
