/** @vitest-environment jsdom */

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {
    DomPageContextProvider,
} from '../../../Resources/Private/TypeScript/context/DomPageContextProvider';
import type {
    PageContext,
    PageContextMeasure,
} from '../../../Resources/Private/TypeScript/context/PageContextProvider';

describe('DomPageContextProvider', () => {
    beforeEach(() => {
        document.documentElement.lang = 'de-DE';
        document.title = 'Seitentitel';
        document.body.innerHTML = `
            <main id="content">
                <p>Ein kurzer Introtext vor der ersten Überschrift.</p>
                <h1>Willkommen</h1>
                <p>Der erste <strong>Absatz</strong> mit <img src="x.jpg" alt="einem roten Haus">.</p>
                <ul><li>Erster Punkt</li><li>Zweiter Punkt <ul><li>Unterpunkt</li></ul></li></ul>
                <h2>Daten</h2>
                <table><tr><th>Name</th><th>Wert</th></tr><tr><td>Alpha</td><td>42</td></tr></table>
                <img src="empty.jpg" alt="  ">
                <img src="chart.jpg" alt="Diagramm der Entwicklung">
                <script>verbotenes Skript</script>
                <style>.secret { content: 'verbotener Stil'; }</style>
                <noscript>verbotenes Noscript</noscript>
                <nav>verbotene Navigation</nav>
                <form><label>verbotenes Formular</label></form>
                <p hidden>versteckt hidden</p>
                <p aria-hidden="true">versteckt aria</p>
                <p data-nr-browser-ai-exclude>redaktionell ausgeschlossen</p>
                <aside data-nr-browser-ai-root><p>Assistentenoberfläche</p></aside>
            </main>`;
    });

    it('extracts semantic current-page content in DOM order', async () => {
        const result = await new DomPageContextProvider(document).getContext('#content');

        expect(result).toEqual({
            title: 'Seitentitel',
            language: 'de-DE',
            sections: [
                {heading: '', text: 'Ein kurzer Introtext vor der ersten Überschrift.'},
                {
                    heading: 'Willkommen',
                    text: 'Der erste Absatz mit einem roten Haus.\nErster Punkt\nZweiter Punkt\nUnterpunkt',
                },
                {
                    heading: 'Daten',
                    text: 'Name Wert Alpha 42\nDiagramm der Entwicklung',
                },
            ],
            wasTruncated: false,
        });
        expect(result.sections.every(section => section.text.length > 0)).toBe(true);
        expect(JSON.stringify(result)).not.toMatch(
            /verboten|versteckt|ausgeschlossen|Assistentenoberfläche/,
        );
    });

    it('does not mutate the selected live DOM', async () => {
        const root = document.querySelector('#content')!;
        const before = root.innerHTML;

        await new DomPageContextProvider(document).getContext('#content');

        expect(root.innerHTML).toBe(before);
        expect(root.querySelector('script')).not.toBeNull();
    });

    it('includes a semantic selected root itself', async () => {
        document.body.innerHTML = '<p id="context">Direkt ausgewählter Absatz</p>';

        const result = await new DomPageContextProvider(document).getContext('#context');

        expect(result.sections).toEqual([
            {heading: '', text: 'Direkt ausgewählter Absatz'},
        ]);
    });

    it.each([
        {
            name: 'list item',
            markup: '<ul id="context"><li>Einleitung<h2>Innere Überschrift</h2><p>Danach</p></li></ul>',
        },
        {
            name: 'table',
            markup: '<table id="context"><tr><td>Einleitung<h2>Innere Überschrift</h2><p>Danach</p></td></tr></table>',
        },
    ])('treats headings inside a $name as section boundaries without duplicating container text', async ({markup}) => {
        document.body.innerHTML = markup;

        const result = await new DomPageContextProvider(document).getContext('#context');

        expect(result.sections).toEqual([
            {heading: '', text: 'Einleitung'},
            {heading: 'Innere Überschrift', text: 'Danach'},
        ]);
    });

    it('rejects a missing root with a stable application error code', async () => {
        const provider = new DomPageContextProvider(document);

        await expect(provider.getContext('#missing')).rejects.toMatchObject({
            code: 'context-root-missing',
        });
    });

    it('rejects an invalid selector with a distinct stable application error code', async () => {
        const provider = new DomPageContextProvider(document);

        await expect(provider.getContext('main[')).rejects.toMatchObject({
            name: 'PageContextError',
            code: 'context-selector-invalid',
        });
    });
});

describe('fitToBudget', () => {
    const context: PageContext = {
        title: 'Seitentitel',
        language: 'de',
        sections: [
            {heading: '', text: '   '},
            {heading: 'Kurz', text: 'Wenig Inhalt'},
            {heading: 'Eins', text: 'Ein ausreichend langer und wichtiger erster Abschnitt.'},
            {heading: 'Eins', text: 'Ein ausreichend langer und wichtiger erster Abschnitt.'},
            {heading: 'Zwei', text: 'Ein ebenfalls ausreichend langer und wichtiger zweiter Abschnitt.'},
        ],
        wasTruncated: false,
    };

    it('uses a complete immutable context as the measurement unit', async () => {
        const provider = new DomPageContextProvider(document);
        const snapshots: PageContext[] = [];
        const measure: PageContextMeasure = vi.fn(async candidate => {
            snapshots.push(structuredClone(candidate));
            return candidate.sections.length;
        });

        const result = await provider.fitToBudget(context, measure, 2);

        expect(result.sections.map(section => section.heading)).toEqual(['Eins', 'Zwei']);
        expect(result.wasTruncated).toBe(true);
        expect(context.sections).toHaveLength(5);
        expect(context.wasTruncated).toBe(false);
        expect(snapshots.every(snapshot => snapshot.title === 'Seitentitel')).toBe(true);
        expect(snapshots.every(snapshot => snapshot.language === 'de')).toBe(true);
    });

    it('removes trailing whole sections until the measured context fits', async () => {
        const provider = new DomPageContextProvider(document);
        const source: PageContext = {
            title: 'T',
            language: 'de',
            sections: [
                {heading: 'A', text: 'A'.repeat(50)},
                {heading: 'B', text: 'B'.repeat(50)},
                {heading: 'C', text: 'C'.repeat(50)},
            ],
            wasTruncated: false,
        };
        const measure: PageContextMeasure = async candidate => candidate.sections.length * 100;

        const result = await provider.fitToBudget(source, measure, 100);

        expect(result.sections).toEqual([{heading: 'A', text: 'A'.repeat(50)}]);
        expect(result.wasTruncated).toBe(true);
        expect(source.sections).toHaveLength(3);
    });

    it('terminates with an empty result when even metadata exceeds the budget', async () => {
        const provider = new DomPageContextProvider(document);
        const measure = vi.fn(async () => Number.POSITIVE_INFINITY);
        const source: PageContext = {
            title: 'T',
            language: 'de',
            sections: [{heading: 'A', text: 'A'.repeat(50)}],
            wasTruncated: false,
        };

        const result = await provider.fitToBudget(source, measure, -1);

        expect(result.sections).toEqual([]);
        expect(result.wasTruncated).toBe(true);
        expect(measure).toHaveBeenCalledTimes(2);
    });
});
