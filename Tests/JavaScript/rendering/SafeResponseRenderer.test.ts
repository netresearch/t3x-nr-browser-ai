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
        const renderer = new SafeResponseRenderer(output);
        const internalUrl = `${window.location.origin}/help`;

        renderer.appendChunk(`Intern ${internalUrl} extern https://example.org/help`);

        const [internal, external] = [...output.querySelectorAll('a')];
        expect(internal).toMatchObject({target: '', rel: ''});
        expect(external).toMatchObject({target: '_blank', rel: 'noopener noreferrer'});
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
