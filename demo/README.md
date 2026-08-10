# Demo page

Published at <https://netresearch.github.io/t3x-nr-browser-ai/>. English at the
site root, German at `/de/`.

```bash
npm run build && npm run build:css   # the distributable bundle the demo runs
npm run build:demo                   # assemble assets and render both pages
npm run verify:demo                  # gate the rendered artifact
node demo/serve.mjs                  # preview at http://localhost:8000
npm run build:og                     # social cards, after a headline change
```

## Where the facts come from

The page states no version of its own. It used to: `0.2.0` was typed into it
twice and stayed there while the extension moved to `0.4.0`.

| Fact | Source |
| --- | --- |
| `main_version` | `ext_emconf.php` on this branch |
| `latest_release`, `release_date` | the GitHub releases API |
| `typo3_versions`, `php_versions` | `composer.json` |
| maturity, owner, review date, AI capability card | `demo/project.json` |
| all copy | `demo/content/{en,de}.json` |

`render.mjs` merges these and writes `project-manifest.json` to the site root.
The portfolio site aggregates it into
<https://netresearch.github.io/projects.json>, so every Netresearch page that
shows a status for nr-browser-ai reads it from there rather than restating it.

## The capability check

`demo/capability-check.js` calls `LanguageModel.availability()` and stops. It
never calls `create()`: that would start a multi-gigabyte download, and a page
that begins downloading a model because someone scrolled onto it is not an
evaluation aid. The download stays behind the assistant's own setup button —
here and in production. `verify.mjs` fails the build if `create()` ever appears
in the rendered page.

Every field of the check has a server-rendered "not determined" value, so the
table is complete before the script runs and readable if it never does.

## Build gate

`demo/verify.mjs` fails on an unresolved content placeholder, a manifest that
disagrees with `ext_emconf.php`, a version rendered that the manifest does not
know, a missing canonical / description / `x-default` hreflang / `og:image` /
`twitter:card` / JSON-LD block, invalid JSON-LD, a contact link missing a UTM
parameter, a logo appearing other than once, a missing status block, a capability
card without limitations, a missing "not suited for" list, a `LanguageModel.create()`
call, or any asset loaded from a third-party origin.
