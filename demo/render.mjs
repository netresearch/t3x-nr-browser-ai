// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: Netresearch DTT GmbH
/**
 * Renders the demo page from content files and the project manifest.
 *
 * The page used to be one hand-written HTML file with the version typed into it
 * twice. It said 0.2.0 while the extension was at 0.4.0 — a number nobody
 * remembers to update on release. Everything mechanical is now derived:
 *
 *   main_version                  ext_emconf.php on this branch
 *   latest_release, release_date  the GitHub releases API
 *   TYPO3 / PHP support           composer.json
 *
 * The editorial half — maturity, owner, review date, the AI capability card —
 * lives in demo/project.json. The merged result is published at
 * project-manifest.json so the portfolio site can read this project's status
 * instead of restating it.
 *
 * Copy lives in demo/content/<lang>.json. English is served from the site root,
 * German from /de/.
 */

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderSiteHeader, renderPageNavigation} from './site-shell/render-site-shell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = resolve(root, 'public');
const themeBootstrap = await readFile(resolve(here, 'site-shell/theme-bootstrap.js'), 'utf8');

// configure-pages supplies base_path without a trailing slash. Normalize once
// before deriving locale, metadata, sitemap or documentation URLs.
const baseSegments = (process.env.PAGES_BASE_PATH ?? '/').split('/').filter(Boolean).join('/');
const basePath = baseSegments ? `${baseSegments}/` : '/';
const SITE_URL = process.env.PAGES_ORIGIN
    ? new URL(basePath, `${new URL(process.env.PAGES_ORIGIN).origin}/`).href
    : 'https://netresearch.github.io/t3x-nr-browser-ai/';

const CONTACT_BASE = {en: 'https://www.netresearch.de/en/contact/', de: 'https://www.netresearch.de/kontakt/'};
const LANGS = ['en', 'de'];
const PATHS = {en: '', de: 'de/'};

/** Business CTA target, tagged so the campaign report can tell positions apart. */
function contactUrl(position, lang) {
    const params = new URLSearchParams({
        utm_source: 'github-pages',
        utm_medium: 'referral',
        utm_campaign: 'nr-browser-ai',
        utm_content: position,
    });
    return `${CONTACT_BASE[lang]}?${params}`;
}

/**
 * A release tag from the API is network data. It ends up in the manifest, in the
 * page and in a file path, so it is validated rather than trusted: anything that
 * is not a plain semantic-version tag is treated as no release at all.
 */
const TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

/** Escape for text and attribute contexts. */
function e(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Content marked as trusted rich text. Only the content files feed this, and
 * they carry a deliberate handful of <strong>, <em> and <code>.
 */
function rich(value) {
    return String(value ?? '');
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function buildManifest() {
    const editorial = await readJson(resolve(here, 'project.json'));
    delete editorial._comment;

    const emconf = await readFile(resolve(root, 'ext_emconf.php'), 'utf8');
    const mainVersion = emconf.match(/'version'\s*=>\s*'([^']+)'/)?.[1];
    if (!mainVersion) throw new Error('render: no version in ext_emconf.php');

    const composer = await readJson(resolve(root, 'composer.json'));
    const versions = (constraint) => [...String(constraint || '').matchAll(/(\d+\.\d+)/g)].map((m) => m[1]);

    let latestRelease = null;
    let releaseDate = null;
    try {
        const headers = {Accept: 'application/vnd.github+json'};
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        const response = await fetch(
            'https://api.github.com/repos/netresearch/t3x-nr-browser-ai/releases/latest',
            {headers, signal: AbortSignal.timeout(15000)},
        );
        if (response.ok) {
            const payload = await response.json();
            const tag = String(payload.tag_name ?? '');
            const published = String(payload.published_at ?? '').slice(0, 10);
            latestRelease = TAG_PATTERN.test(tag) ? tag : null;
            releaseDate = latestRelease && DATE_PATTERN.test(published) ? published : null;
            if (tag && !latestRelease) {
                process.stderr.write(`render: ignoring release tag that is not a version: ${JSON.stringify(tag)}\n`);
            }
        }
    } catch (error) {
        // A build without network access still produces a manifest — it says the
        // release is unknown rather than guessing that main is released.
        process.stderr.write(`render: latest release unavailable (${error.message})\n`);
    }

    return {
        manifest_version: 1,
        name: 'nr-browser-ai',
        slug: new URL(SITE_URL).pathname,
        main_version: mainVersion,
        latest_release: latestRelease,
        release_date: releaseDate,
        docs_version: mainVersion,
        typo3_versions: versions(composer.require?.['typo3/cms-core']),
        php_versions: versions(composer.require?.php),
        ...editorial,
    };
}

function fillPlaceholders(value, replacements) {
    if (typeof value === 'string') {
        return Object.entries(replacements).reduce(
            (text, [key, replacement]) => text.split(`{${key}}`).join(replacement),
            value,
        );
    }
    if (Array.isArray(value)) return value.map((item) => fillPlaceholders(item, replacements));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, fillPlaceholders(item, replacements)]),
        );
    }
    return value;
}



/**
 * The real extension widget, with its labels taken from the content file.
 *
 * Exported so Tests/JavaScript/TemplateContract.test.ts can compare the hooks,
 * labels and configuration attributes this page renders against the Fluid
 * template the extension ships — without building the site first. A demo that
 * drifts from the template advertises a component the extension no longer
 * renders, which is exactly what that test exists to catch.
 */
export function assistantMarkup(c) {
    const a = c.assistant;
    return `<section
        id="nr-browser-ai-demo"
        class="nr-browser-ai"
        aria-label="${e(a.ariaLabel)}"
        data-nr-browser-ai-root
        data-context-selector="main"
        data-context-usage-limit="0.8"
        data-system-prompt="${e(a.systemPrompt)}"
        data-supplemental-instruction="${e(a.supplemental)}"
        data-label-checking="${e(a.labels.checking)}"
        data-label-downloadable="${e(a.labels.downloadable)}"
        data-label-downloading="${e(a.labels.downloading)}"
        data-label-ready="${e(a.labels.ready)}"
        data-label-streaming="${e(a.labels.streaming)}"
        data-label-reset-required="${e(a.labels.resetRequired)}"
        data-label-error-retryable="${e(a.labels.errorRetryable)}"
        data-label-unavailable="${e(a.labels.unavailable)}"
        data-not-found-marker="NOT_IN_SOURCE"
        data-label-new-tab="${e(a.labels.newTab)}">
        <div data-nr-browser-ai-fallback>
          <div class="fallback-note">
            <h3>${e(a.fallback.heading)}</h3>
            <p>${e(a.fallback.body1)}</p>
            <p>${e(a.fallback.body2)}</p>
          </div>
        </div>
        <details class="nr-browser-ai__configuration" data-nr-browser-ai-configuration>
          <summary class="nr-browser-ai__configuration-summary">${e(a.configuration.summary)}</summary>
          <p class="nr-browser-ai__configuration-lead">${e(a.configuration.lead)}</p>
          <dl class="nr-browser-ai__configuration-list">
            <dt>${e(a.configuration.systemPromptLabel)}</dt>
            <dd>${e(a.systemPrompt)}</dd>
            <dt>${e(a.configuration.selectorLabel)}</dt>
            <dd><code>main</code></dd>
            <dt>${e(a.configuration.limitLabel)}</dt>
            <dd>0.8</dd>
          </dl>
          <p class="nr-browser-ai__configuration-note">${e(a.configuration.note)}</p>
        </details>
        <div class="nr-browser-ai__not-found" data-nr-browser-ai-not-found hidden>
          <div class="fallback-note">
            <h3>${e(a.notFound.heading)}</h3>
            <p>${e(a.notFound.body)}</p>
          </div>
        </div>
        <div data-nr-browser-ai-assistant hidden>
          <header class="nr-browser-ai__header">
            <h2 id="nr-browser-ai-demo-title" class="nr-browser-ai__title">${e(a.title)}</h2>
          </header>
          <p id="nr-browser-ai-demo-status" class="nr-browser-ai__status" data-nr-browser-ai-status role="status" aria-atomic="true" tabindex="-1"></p>
          <button class="nr-browser-ai__button nr-browser-ai__button--primary" type="button" data-nr-browser-ai-setup>${e(a.setup)}</button>
          <progress class="nr-browser-ai__progress" data-nr-browser-ai-progress max="1" value="0" aria-label="${e(a.progressLabel)}"></progress>
          <div class="nr-browser-ai__log" data-nr-browser-ai-log></div>
          <p class="nr-browser-ai__visually-hidden" data-nr-browser-ai-announcement aria-live="polite" aria-atomic="true"></p>
          <form class="nr-browser-ai__form" data-nr-browser-ai-form>
            <label class="nr-browser-ai__label" for="nr-browser-ai-demo-question">${e(a.questionLabel)}</label>
            <div class="nr-browser-ai__input-row">
              <input class="nr-browser-ai__input" id="nr-browser-ai-demo-question" type="text" data-nr-browser-ai-question autocomplete="off" required aria-describedby="nr-browser-ai-demo-status">
              <button class="nr-browser-ai__button nr-browser-ai__button--primary" type="submit" data-nr-browser-ai-submit>${e(a.ask)}</button>
            </div>
          </form>
          <div class="nr-browser-ai__actions">
            <button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-abort>${e(a.stop)}</button>
            <button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-reset>${e(a.reset)}</button>
            <button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-retry>${e(a.retry)}</button>
          </div>
        </div>
      </section>`;
}

function capabilityCard(c, manifest) {
    const card = c.capabilityCard;
    const ai = {...manifest.ai, ...card.values};
    if (c.lang === 'de') {
        for (const field of Object.keys(manifest.ai).filter((field) => field !== 'processing_location')) {
            if (!card.values?.[field]) throw new Error(`render: missing German capability translation: ${field}`);
        }
    }
    const list = (items) => `<ul>${items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
    const rows = [
        [card.labels.intended_purpose, e(ai.intended_purpose)],
        [card.labels.excluded_uses, list(ai.excluded_uses)],
        [card.labels.stage, e(c.status.stages[manifest.stage] ?? manifest.stage)],
        [card.labels.models, list(ai.models)],
        [card.labels.data, list(ai.data)],
        [card.labels.processing_location, e(ai.processing_location.map((l) => card.locations[l] ?? l).join(', '))],
        [card.labels.human_oversight, e(ai.human_oversight)],
        [card.labels.permissions, e(ai.permissions)],
        [card.labels.logging, e(ai.logging)],
        [card.labels.retention, e(ai.retention)],
        [card.labels.cost_control, e(ai.cost_control)],
        [card.labels.security_controls, list(ai.security_controls)],
    ];
    return `<dl class="capability-card">
      ${rows.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${value}</dd></div>`).join('\n      ')}
      <div class="capability-card__limits"><dt>${e(card.labels.known_limitations)}</dt><dd>${list(ai.known_limitations)}</dd></div>
      <div><dt>${e(card.labels.last_verified)}</dt><dd><time datetime="${e(manifest.last_verified)}">${e(manifest.last_verified)}</time> · ${e(manifest.owner)}</dd></div>
    </dl>`;
}

function jsonLd(c, manifest, canonical) {
    const graph = [
        {
            '@type': 'Organization',
            '@id': `${SITE_URL}#organization`,
            name: 'Netresearch DTT GmbH',
            url: 'https://www.netresearch.de/',
        },
        {
            '@type': 'SoftwareApplication',
            '@id': `${SITE_URL}#software`,
            name: 'nr-browser-ai',
            url: canonical,
            applicationCategory: 'DeveloperApplication',
            applicationSubCategory: 'TYPO3 CMS Extension',
            description: c.meta.description,
            softwareVersion: manifest.main_version,
            operatingSystem: `TYPO3 ${manifest.typo3_versions.join(' / ')}, PHP ${manifest.php_versions.join(' / ')}+`,
            license: 'https://spdx.org/licenses/GPL-2.0-or-later.html',
            codeRepository: manifest.repository,
            publisher: {'@id': `${SITE_URL}#organization`},
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'EUR'},
        },
        {
            '@type': 'BreadcrumbList',
            itemListElement: [
                {'@type': 'ListItem', position: 1, name: c.meta.title, item: canonical},
            ],
        },
    ];
    // A literal "<" would let a value close the script element early.
    return JSON.stringify({'@context': 'https://schema.org', '@graph': graph}).replaceAll('<', '\\u003c');
}

/** Render one localized landing page from its copy and derived project metadata. */
function page(c, manifest, lang) {
    const base = lang === 'en' ? '' : '../';
    const canonical = `${SITE_URL}${PATHS[lang]}`;
    const stage = c.status.stages[manifest.stage] ?? manifest.stage;

    const cards = (items) => items
        .map((item) => `<article class="card"><h3>${e(item.title)}</h3><p>${rich(item.body)}</p></article>`)
        .join('\n        ');

    const bullets = (items) => items.map((item) => `<li>${rich(item)}</li>`).join('\n          ');

    return `<!doctype html>
<html lang="${e(c.htmlLang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<script>${themeBootstrap}</script>

<title>${e(c.meta.title)}</title>
<meta name="description" content="${e(c.meta.description)}">
<link rel="canonical" href="${e(canonical)}">
<link rel="alternate" hreflang="en" href="${e(SITE_URL)}">
<link rel="alternate" hreflang="de" href="${e(SITE_URL)}de/">
<link rel="alternate" hreflang="x-default" href="${e(SITE_URL)}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Netresearch DTT GmbH">
<meta property="og:locale" content="${e(c.ogLocale)}">
<meta property="og:title" content="${e(c.meta.title)}">
<meta property="og:description" content="${e(c.meta.description)}">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:image" content="${e(SITE_URL)}assets/og-browser-ai-${e(c.lang)}.png">
<meta property="og:image:alt" content="${e(c.meta.ogImageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(c.meta.title)}">
<meta name="twitter:description" content="${e(c.meta.description)}">
<meta name="twitter:image" content="${e(SITE_URL)}assets/og-browser-ai-${e(c.lang)}.png">

<link rel="icon" href="${base}assets/icon.svg" type="image/svg+xml">
<link rel="sitemap" href="${e(SITE_URL)}sitemap.xml">
<link rel="stylesheet" href="${base}assets/demo.css">
<link rel="stylesheet" href="${base}assets/Assistant.css">
<link rel="stylesheet" href="${base}assets/site-shell/site-shell.css">
<script defer src="${base}assets/site-shell/site-shell.js"></script>

<script type="application/ld+json">${jsonLd(c, manifest, canonical)}</script>
</head>
<body>

<a class="skip-link" href="#main">${e(c.skipToContent)}</a>

${renderSiteHeader({lang, assetBase: `${base}assets/site-shell`,
    languageUrls: {en: SITE_URL, de: `${SITE_URL}de/`}, active: null,
    contactHref: contactUrl('header', lang)})}
${renderPageNavigation({lang, title: 'Browser AI', titleHref: canonical,
    links: [...c.nav.items, {href: manifest.repository, label: c.nav.repo}]})}

<main id="main" class="nr-hero-page">

  <section class="nr-hero" data-nr-hero data-nr-hero-layout="split">
    <div class="nr-hero-inner">
      <div class="nr-hero-content">
      <p class="nr-hero-eyebrow">${e(c.hero.eyebrow)}</p>
      <h1 class="nr-hero-title">${e(c.hero.title)}</h1>
      <p class="nr-hero-lead">${e(c.hero.lead)}</p>
      <p class="nr-hero-actions">
        <a class="btn btn--primary" href="${e(contactUrl('hero', lang))}" data-cta="business" data-cta-position="hero">${e(c.hero.ctaBusiness)}</a>
        <a class="btn btn--secondary" href="${e(c.hero.ctaTechnicalHref)}">${e(c.hero.ctaTechnical)}</a>
      </p>
      </div>
      <aside class="nr-hero-aside" aria-labelledby="product-status-heading">
      <h2 id="product-status-heading">${e(c.status.heading)}</h2>
      <dl class="status-facts nr-hero-facts" aria-label="${e(c.status.heading)}">
        <div><dt>${e(c.status.stageLabel)}</dt><dd><span class="status-pill status-pill--${e(manifest.stage)}">${e(stage)}</span></dd></div>
        ${manifest.latest_release ? `<div><dt>${e(c.status.releaseLabel)}</dt><dd><a href="${e(manifest.repository)}/releases/tag/${e(manifest.latest_release)}">${e(manifest.latest_release)}</a></dd></div>` : ''}
        <div><dt>${e(c.status.mainLabel)}</dt><dd>${e(manifest.main_version)}</dd></div>
        <div><dt>${e(c.status.verifiedLabel)}</dt><dd><time datetime="${e(manifest.last_verified)}">${e(manifest.last_verified)}</time></dd></div>
        <div><dt>${e(c.status.requirementsLabel)}</dt><dd>TYPO3 ${e(manifest.typo3_versions.join(' / '))} · PHP ${e(manifest.php_versions.join(' / '))}+</dd></div>
      </dl>
      <p class="status-facts__note">${e(c.status.note)}</p>
      </aside>
    </div>
  </section>

  <section id="capability" class="section section--alt">
    <div class="wrap">
      <h2>${e(c.capability.heading)}</h2>
      <p class="section__lead">${e(c.capability.lead)}</p>

      <dl class="capability-check" data-capability-check
          data-value-unknown="${e(c.capability.values.unknown)}"
          data-value-available="${e(c.capability.values.available)}"
          data-value-unavailable="${e(c.capability.values.unavailable)}"
          data-value-downloadable="${e(c.capability.values.downloadable)}"
          data-value-desktop="${e(c.capability.values.desktop)}"
          data-value-mobile="${e(c.capability.values.mobile)}"
          data-value-yes="${e(c.capability.values.yes)}"
          data-value-no="${e(c.capability.values.no)}">
        <div><dt>${e(c.capability.labels.browser)}</dt><dd data-capability="browser">${e(c.capability.values.unknown)}</dd></div>
        <div><dt>${e(c.capability.labels.api)}</dt><dd data-capability="api">${e(c.capability.values.unknown)}</dd></div>
        <div><dt>${e(c.capability.labels.device)}</dt><dd data-capability="device">${e(c.capability.values.unknown)}</dd></div>
        <div><dt>${e(c.capability.labels.model)}</dt><dd data-capability="model">${e(c.capability.values.unknown)}</dd></div>
        <div><dt>${e(c.capability.labels.download)}</dt><dd data-capability="download">${e(c.capability.values.unknown)}</dd></div>
        <div><dt>${e(c.capability.labels.language)}</dt><dd data-capability="language">${e(c.capability.values.unknown)}</dd></div>
      </dl>
      <noscript><p class="note">${e(c.capability.noscript)}</p></noscript>

      <h3>${e(c.capability.requirements.heading)}</h3>
      <p>${e(c.capability.requirements.lead)}</p>
      <ul class="req-list">
          ${bullets(c.capability.requirements.items)}
      </ul>
      <p>${e(c.capability.requirements.note)}</p>
    </div>
  </section>

  <section id="demo" class="section">
    <div class="wrap">
      <h2>${e(c.demo.heading)}</h2>
      <p class="section__lead">${e(c.demo.lead)}</p>

      <h3>${e(c.demo.questionsHeading)}</h3>
      <p>${e(c.demo.questionsLead)}</p>
      <ul class="question-list" data-demo-questions>
          ${c.demo.questions.map((q) => `<li><button type="button" class="question-chip" data-question="${e(q)}">${e(q)}</button></li>`).join('\n          ')}
      </ul>
      <p class="note">${e(c.demo.questionsNote)}</p>

      ${assistantMarkup(c)}
    </div>
  </section>

  <section id="form-assistant" class="section section--alt" aria-labelledby="form-assistant-heading">
    <div class="wrap">
      <h2 id="form-assistant-heading">${e(c.formDemo.heading)}</h2>
      <p class="section__lead">${e(c.formDemo.lead)}</p>
      <p><strong>${e(c.formDemo.exampleLabel)}:</strong> <q>${e(c.formDemo.example)}</q></p>
      <ol>
          ${bullets(c.formDemo.steps)}
      </ol>
      <p>${e(c.formDemo.privacy)}</p>
      <p class="note">${e(c.formDemo.fallback)}</p>
      <p class="cta-band__actions">
        <a class="btn btn--primary" href="${e(c.formDemo.href)}" hreflang="en">${e(c.formDemo.label)}</a>
        <a class="btn" href="${e(c.formDemo.docsHref)}" hreflang="en">${e(c.formDemo.docsLabel)}</a>
      </p>
    </div>
  </section>

  <section id="fit" class="section section--alt">
    <div class="wrap">
      <h2>${e(c.fit.heading)}</h2>
      <div class="two-col">
        <div>
          <h3>${e(c.fit.suitedHeading)}</h3>
          <ul class="bullets bullets--yes">
          ${bullets(c.fit.suited)}
          </ul>
        </div>
        <div>
          <h3>${e(c.fit.notSuitedHeading)}</h3>
          <ul class="bullets bullets--no">
          ${bullets(c.fit.notSuited)}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section id="fallback" class="section">
    <div class="wrap">
      <h2 id="fallback-heading">${e(c.fallback.heading)}</h2>
      <p class="section__lead">${e(c.fallback.lead)}</p>
      <div class="table-scroll" tabindex="0" role="region" aria-labelledby="fallback-heading">
        <table class="data-table" aria-labelledby="fallback-heading">
          <thead><tr><th scope="col">${e(c.fallback.columns.situation)}</th><th scope="col">${e(c.fallback.columns.behaviour)}</th></tr></thead>
          <tbody>
          ${c.fallback.rows.map((row) => `<tr><th scope="row">${e(row.situation)}</th><td>${e(row.behaviour)}</td></tr>`).join('\n          ')}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section id="privacy" class="section section--alt">
    <div class="wrap">
      <h2>${e(c.privacy.heading)}</h2>
      <p class="section__lead">${e(c.privacy.scope)}</p>

      <h3>${e(c.privacy.flowHeading)}</h3>
      <ol class="flow-list">
          ${c.privacy.flow.map((step) => `<li><strong>${e(step.title)}</strong><span>${e(step.body)}</span></li>`).join('\n          ')}
      </ol>

      <h3>${e(c.privacy.threatsHeading)}</h3>
      <div class="cards">
        ${cards(c.privacy.threats)}
      </div>

      <p><a class="link-strong" href="${e(c.privacy.docsHref)}">${e(c.privacy.docsLink)}</a></p>
    </div>
  </section>

  <section id="business" class="section">
    <div class="wrap">
      <h2>${e(c.business.heading)}</h2>
      <div class="two-col">
        <div>
          <h3>${e(c.business.gainsHeading)}</h3>
          <ul class="bullets bullets--yes">
          ${bullets(c.business.gains)}
          </ul>
        </div>
        <div>
          <h3>${e(c.business.costsHeading)}</h3>
          <ul class="bullets bullets--no">
          ${bullets(c.business.costs)}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section id="features" class="section section--alt">
    <div class="wrap">
      <h2>${e(c.features.heading)}</h2>
      <div class="cards">
        ${cards(c.features.items)}
      </div>
    </div>
  </section>

  <section id="capability-card" class="section">
    <div class="wrap">
      <h2>${e(c.capabilityCard.heading)}</h2>
      <p class="section__lead">${e(c.capabilityCard.intro)}</p>
      ${capabilityCard(c, manifest)}
    </div>
  </section>

  <section id="integration" class="section section--alt">
    <div class="wrap">
      <h2>${e(c.integration.heading)}</h2>

      <h3>${e(c.integration.installHeading)}</h3>
      <p>${e(c.integration.installLead)}</p>
      <pre tabindex="0" role="region" aria-label="${lang === 'de' ? 'Codebeispiel' : 'Code example'}"><code>${e(c.integration.installCode)}</code></pre>

      <h3>${e(c.integration.placeHeading)}</h3>
      <p>${rich(c.integration.placeBody)}</p>

      <h3>${e(c.integration.defaultsHeading)}</h3>
      <p>${e(c.integration.defaultsLead)}</p>
      <pre tabindex="0" role="region" aria-label="${lang === 'de' ? 'Codebeispiel' : 'Code example'}"><code>${e(c.integration.defaultsCode)}</code></pre>

      <h3>${e(c.integration.cspHeading)}</h3>
      <p>${rich(c.integration.cspBody)}</p>
    </div>
  </section>

  <section id="related" class="section">
    <div class="wrap">
      <h2>${e(c.related.heading)}</h2>
      <div class="cards">
        ${c.related.items.map((item) => `<a class="card card--link" href="${e(item.href)}"><h3>${e(item.title)}</h3><p>${e(item.body)}</p><span class="card__meta">${e(item.label)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section id="contact" class="section section--alt cta-band">
    <div class="wrap cta-band__inner">
      <div>
        <h2>${e(c.cta.heading)}</h2>
        <p>${e(c.cta.body)}</p>
      </div>
      <div class="cta-band__actions">
        <a class="btn btn--primary" href="${e(contactUrl('cta-band', lang))}" data-cta="business" data-cta-position="cta-band">${e(c.cta.business)}</a>
        <a class="btn btn--secondary" href="${e(c.cta.technicalHref)}">${e(c.cta.technical)}</a>
      </div>
    </div>
  </section>

</main>

<footer class="site-footer">
  <div class="wrap site-footer__inner">
    <p>
      <a href="https://netresearch.github.io/${lang === 'de' ? 'de/' : ''}">Portfolio</a> &middot;
      <a href="https://netresearch.github.io/modularer-ki-stack-page/${lang === 'en' ? 'en/' : ''}">${lang === 'de' ? 'KI-Stack' : 'AI stack'}</a> &middot;
      <a href="https://www.netresearch.de/">${e(c.footer.company)}</a> &middot;
      <a href="${e(contactUrl('footer', lang))}" data-cta="business" data-cta-position="footer">${e(c.footer.contact)}</a> &middot;
      <a href="${lang === 'de' ? 'https://www.netresearch.de/impressum/' : 'https://www.netresearch.de/en/imprint/'}" lang="${lang}">${e(c.footer.imprint)}</a> &middot;
      <a href="${lang === 'de' ? 'https://www.netresearch.de/datenschutz/' : 'https://www.netresearch.de/en/privacy-policy/'}" lang="${lang}">${e(c.footer.privacy)}</a> &middot;
      <a href="${e(manifest.repository)}">${e(c.footer.source)}</a>
    </p>
    <p class="site-footer__meta">
      ${e(c.footer.licence)}
      ${e(c.footer.reviewed)}: <time datetime="${e(manifest.last_verified)}">${e(manifest.last_verified)}</time>.
    </p>
  </div>
</footer>

<script src="${base}assets/capability-check.js" defer></script>
<script type="module" src="${base}assets/Assistant.js"></script>
</body>
</html>
`;
}

function notFoundPage() {
    const assets = new URL('assets/', SITE_URL).pathname;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<meta name="color-scheme" content="light dark">
<title>Page not found · Seite nicht gefunden | Browser AI</title>
<script>${themeBootstrap}</script>
<link rel="icon" href="${e(assets)}icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${e(assets)}demo.css">
<link rel="stylesheet" href="${e(assets)}site-shell/site-shell.css">
<script defer src="${e(assets)}site-shell/site-shell.js"></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content / Zum Inhalt</a>
${renderSiteHeader({lang: 'en', assetBase: `${assets}site-shell`,
    languageUrls: {en: SITE_URL, de: `${SITE_URL}de/`}, active: null,
    contactHref: contactUrl('header', 'en')})}
${renderPageNavigation({lang: 'en', title: 'Browser AI', titleHref: SITE_URL,
    links: [{href: SITE_URL, label: 'English'}, {href: `${SITE_URL}de/`, label: 'Deutsch'}]})}
<main id="main" tabindex="-1">
  <section class="section"><div class="wrap">
    <p class="hero__eyebrow">404 · Browser AI</p>
    <h1>Page not found</h1>
    <p>This address does not lead to a Browser AI page. Return to the project overview to continue.</p>
    <p class="hero__cta"><a class="btn btn--primary" href="${e(SITE_URL)}" lang="en" hreflang="en">Browser AI in English</a></p>
    <div lang="de">
      <h2>Seite nicht gefunden</h2>
      <p>Unter dieser Adresse gibt es keine Browser-AI-Seite. Die Projektübersicht hilft Ihnen weiter.</p>
      <p class="hero__cta"><a class="btn btn--secondary" href="${e(SITE_URL)}de/" lang="de" hreflang="de">Browser AI auf Deutsch</a></p>
    </div>
  </div></section>
</main>
<footer class="site-footer"><div class="wrap site-footer__inner"><p>
  <a href="https://www.netresearch.de/">Netresearch DTT GmbH</a> ·
  <a href="${e(contactUrl('footer', 'en'))}" data-cta="business" data-cta-position="footer">Contact</a> ·
  <a href="https://www.netresearch.de/en/imprint/" lang="en">Imprint</a> ·
  <a href="https://www.netresearch.de/en/privacy-policy/" lang="en">Privacy</a>
</p></div></footer>
</body>
</html>
`;
}

export async function render() {
    const manifest = await buildManifest();

    for (const lang of LANGS) {
        const raw = await readJson(resolve(here, 'content', `${lang}.json`));
        const conjunction = lang === 'de' ? ' und ' : ' and ';
        const content = fillPlaceholders(raw, {
            VERSION: manifest.main_version,
            LATEST_RELEASE: manifest.latest_release ?? manifest.main_version,
            TYPO3_VERSIONS: manifest.typo3_versions.join(', ').replace(/, ([^,]*)$/, `${conjunction}$1`),
            PHP_VERSIONS: `${manifest.php_versions[0]} and newer`,
        });

        const target = resolve(output, PATHS[lang], 'index.html');
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, page(content, manifest, lang), 'utf8');
    }
    await writeFile(resolve(output, '404.html'), notFoundPage(), 'utf8');

    await writeFile(
        resolve(output, 'project-manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );

    const urls = LANGS.map((lang) => `${SITE_URL}${PATHS[lang]}`);
    await writeFile(
        resolve(output, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
            urls.map((url) => `  <url><loc>${url}</loc><lastmod>${manifest.last_verified}</lastmod></url>`).join('\n')
        }\n</urlset>\n`,
        'utf8',
    );
    await writeFile(
        resolve(output, 'robots.txt'),
        'User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\n'
        + 'User-agent: Bingbot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\n'
        + `Sitemap: ${SITE_URL}sitemap.xml\n`,
        'utf8',
    );

    return manifest;
}
