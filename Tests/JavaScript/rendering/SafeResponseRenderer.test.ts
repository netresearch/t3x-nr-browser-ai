/** @vitest-environment jsdom */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
    SafeResponseRenderer,
} from '../../../Resources/Private/TypeScript/rendering/SafeResponseRenderer';

describe('SafeResponseRenderer', () => {
    let output: HTMLElement;

    beforeEach(() => {
        output = document.createElement('section');
        document.body.replaceChildren(output);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps hostile HTML and non-web schemes as inert visible text', () => {
        const renderer = new SafeResponseRenderer(output);
        const hostile = '<img src=x onerror=alert(1)> <script>alert(2)</script> '
            + 'javascript:alert(3) data:text/html,evil';

        renderer.appendChunk(hostile);

        expect(output.textContent).toBe(hostile);
        expect(output.querySelectorAll('img, script, a')).toHaveLength(0);
        expect(output.querySelector('[onerror]')).toBeNull();
    });

    it('uses no HTML parsing or injection sinks', () => {
        const innerHtml = vi.spyOn(Element.prototype, 'innerHTML', 'set');
        const adjacentHtml = vi.spyOn(Element.prototype, 'insertAdjacentHTML');
        const parseFromString = vi.spyOn(DOMParser.prototype, 'parseFromString');
        const documentWrite = vi.spyOn(Document.prototype, 'write');
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('<b>Text</b> https://example.org/path');

        expect(innerHtml).not.toHaveBeenCalled();
        expect(adjacentHtml).not.toHaveBeenCalled();
        expect(parseFromString).not.toHaveBeenCalled();
        expect(documentWrite).not.toHaveBeenCalled();
    });

    it('linkifies only validated HTTP and HTTPS URLs and preserves punctuation', () => {
        const renderer = new SafeResponseRenderer(output);
        const response = 'Siehe http://example.org/a, https://other.example/path_(one). '
            + 'Nicht: ftp://example.org http://[broken] javascript:https://evil.example.';

        renderer.appendChunk(response);

        const links = [...output.querySelectorAll('a')];
        expect(links.map(link => link.textContent)).toEqual([
            'http://example.org/a',
            'https://other.example/path_(one)',
        ]);
        expect(links.map(link => link.href)).toEqual([
            'http://example.org/a',
            'https://other.example/path_(one)',
        ]);
        expect(output.textContent).toBe(response);
    });

    it('opens external links in a protected new tab but retains same-origin navigation', () => {
        const renderer = new SafeResponseRenderer(output, 'Wird in einem neuen Tab geöffnet.');
        const internalUrl = `${window.location.origin}/help`;

        renderer.appendChunk(`Intern ${internalUrl} extern https://example.org/help`);

        const [internal, external] = [...output.querySelectorAll('a')];
        expect(internal).toMatchObject({target: '', rel: ''});
        expect(external).toMatchObject({target: '_blank', rel: 'noopener noreferrer'});
        expect(external?.querySelector('.nr-browser-ai__new-tab-marker[aria-hidden="true"]')).not.toBeNull();
        expect(external?.getAttribute('aria-label'))
            .toBe('https://example.org/help Wird in einem neuen Tab geöffnet.');
    });

    it('re-renders accumulated chunks so split URLs become one correct link', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('Quelle: https://exa');
        renderer.appendChunk('mple.org/docs?q=ai');

        expect(output.textContent).toBe('Quelle: https://example.org/docs?q=ai');
        expect(output.querySelectorAll('a')).toHaveLength(1);
        expect(output.querySelector('a')?.href).toBe('https://example.org/docs?q=ai');
    });

    it('renders blank-line-separated text as paragraphs without changing its text order', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('Erster Absatz\nmit Zeile.\n\nZweiter Absatz.');

        expect([...output.querySelectorAll('p')].map(paragraph => paragraph.textContent)).toEqual([
            'Erster Absatz\nmit Zeile.',
            'Zweiter Absatz.',
        ]);
    });

    it('renders inline emphasis and code as elements without leaving markers behind', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('Ein **fetter** und *kursiver* Teil mit `code()`.');

        expect(output.querySelector('strong')?.textContent).toBe('fetter');
        expect(output.querySelector('em')?.textContent).toBe('kursiver');
        expect(output.querySelector('code')?.textContent).toBe('code()');
        expect(output.textContent).toBe('Ein fetter und kursiver Teil mit code().');
    });

    it('renders bullet and numbered lists as real list elements', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('Punkte:\n\n- Erster\n- Zweiter\n\n1. Eins\n2. Zwei');

        expect([...output.querySelectorAll('ul > li')].map(item => item.textContent))
            .toEqual(['Erster', 'Zweiter']);
        expect([...output.querySelectorAll('ol > li')].map(item => item.textContent))
            .toEqual(['Eins', 'Zwei']);
    });

    it('maps headings below the widget title and never emits h1 or h2', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('# Eins\n\n## Zwei\n\n##### Fünf');

        expect([...output.querySelectorAll('h1, h2')]).toHaveLength(0);
        expect([...output.children].map(child => child.tagName)).toEqual(['H3', 'H4', 'H6']);
        expect(output.querySelector('h3')?.textContent).toBe('Eins');
    });

    it('renders fenced code verbatim, including markup that must stay inert', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('```\n<script>alert(1)</script>\n**not bold**\n```');

        const code = output.querySelector('pre > code');
        expect(code?.textContent).toBe('<script>alert(1)</script>\n**not bold**');
        expect(output.querySelector('script')).toBeNull();
        expect(output.querySelector('strong')).toBeNull();
    });

    it('accepts markdown links only for validated web URLs', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk(
            '[gut](https://example.org/a) [boese](javascript:alert(1)) [daten](data:text/html,x)',
        );

        const links = [...output.querySelectorAll('a')];
        expect(links).toHaveLength(1);
        expect(links[0]?.getAttribute('href')).toBe('https://example.org/a');
        expect(links[0]?.textContent).toContain('gut');
        expect(output.textContent).toContain('[boese](javascript:alert(1))');
        expect(output.textContent).toContain('[daten](data:text/html,x)');
    });

    it('renders block quotes without interpreting their content as markup', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('> Zitat mit <b>Text</b>');

        expect(output.querySelector('blockquote')?.textContent).toBe('Zitat mit <b>Text</b>');
        expect(output.querySelector('b')).toBeNull();
    });

    it('leaves underscores inside words and inside URLs untouched', () => {
        const renderer = new SafeResponseRenderer(output);
        const response = 'Die Variable snake_case_name und https://example.org/a_b_c*d sind roh.';

        renderer.appendChunk(response);

        expect(output.querySelector('em')).toBeNull();
        expect(output.querySelector('strong')).toBeNull();
        expect(output.textContent).toBe(response);
        expect(output.querySelector('a')?.getAttribute('href'))
            .toBe('https://example.org/a_b_c*d');
    });

    it('keeps an unterminated emphasis marker as literal text', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('Teil **unvollstaendig');

        expect(output.querySelector('strong')).toBeNull();
        expect(output.textContent).toBe('Teil **unvollstaendig');
    });

    it('renders an unterminated code fence with what has arrived so far', () => {
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('Davor\n\n```\nnoch offen');
        expect(output.querySelector('pre > code')?.textContent).toBe('noch offen');

        renderer.appendChunk('er Code\n```');
        expect(output.querySelector('pre > code')?.textContent).toBe('noch offener Code');
    });

    it('stays fast on pathological delimiter input', () => {
        const renderer = new SafeResponseRenderer(output);
        // Nested-looking emphasis and unclosed fences are the shapes that make a
        // backtracking parser hang. Model output is untrusted, so this must not.
        const hostile = [
            '*'.repeat(5_000),
            '_'.repeat(5_000),
            `${'**'.repeat(2_000)}kein Ende`,
            `${'`'.repeat(3_000)}`,
            `${'- '.repeat(2_000)}`,
        ].join('\n\n');

        const started = performance.now();
        renderer.appendChunk(hostile);
        const elapsed = performance.now() - started;

        expect(elapsed).toBeLessThan(2_000);
        expect(output.childNodes.length).toBeGreaterThan(0);
    });

    it('builds markdown structures without any HTML parsing sink', () => {
        const innerHtml = vi.spyOn(Element.prototype, 'innerHTML', 'set');
        const adjacentHtml = vi.spyOn(Element.prototype, 'insertAdjacentHTML');
        const parseFromString = vi.spyOn(DOMParser.prototype, 'parseFromString');
        const renderer = new SafeResponseRenderer(output);

        renderer.appendChunk('# H\n\n- **a** `b` [c](https://example.org)\n\n> q\n\n```\nx\n```');

        expect(innerHtml).not.toHaveBeenCalled();
        expect(adjacentHtml).not.toHaveBeenCalled();
        expect(parseFromString).not.toHaveBeenCalled();
    });

    it('clears both rendered DOM and the accumulated raw response', () => {
        const renderer = new SafeResponseRenderer(output);
        renderer.appendChunk('Vorher https://example.org');

        renderer.clear();
        renderer.appendChunk('Nachher');

        expect(output.textContent).toBe('Nachher');
        expect(output.querySelector('a')).toBeNull();

        renderer.reset();
        expect(output.childNodes).toHaveLength(0);
    });
});
