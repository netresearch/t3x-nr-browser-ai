import {beforeEach, describe, expect, it} from 'vitest';

import type {ActionOutcome} from '../../../Resources/Private/TypeScript/query/FormAction';
import {ResultRenderer} from '../../../Resources/Private/TypeScript/result/ResultRenderer';

const labels = {caption: 'Query result', place: 'Place', time: 'Time'};

const outcome: ActionOutcome = {
    ok: true,
    summary: '',
    place: {name: 'Leipzig', country: 'Germany', latitude: 51.3, longitude: 12.4, timezone: 'Europe/Berlin'},
    blocks: [{
        key: 'daily',
        times: ['2026-08-11', '2026-08-12'],
        columns: [
            {name: 'temperature_2m_max', unit: '°C', values: [26.4, null]},
        ],
    }],
};

function output(): HTMLElement {
    document.body.innerHTML = '<div hidden></div>';
    const element = document.querySelector('div');
    if (element === null) {
        throw new Error('fixture has no output element');
    }

    return element;
}

describe('ResultRenderer', () => {
    let element: HTMLElement;

    beforeEach(() => {
        element = output();
    });

    it('renders a row per point in time and a column per variable', () => {
        new ResultRenderer(element, labels).render(outcome);

        expect(element.hidden).toBe(false);
        expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(element.querySelector('thead th:last-child')?.textContent)
            .toBe('temperature_2m_max (°C)');
        expect(element.querySelector('tbody td')?.textContent).toBe('26.4');
    });

    it('names the resolved place', () => {
        new ResultRenderer(element, labels).render(outcome);

        expect(element.textContent).toContain('Place: Leipzig, Germany');
    });

    it('shows a missing measurement as a gap', () => {
        new ResultRenderer(element, labels).render(outcome);

        const cells = element.querySelectorAll('tbody td');
        expect(cells[1]?.textContent).toBe('—');
    });

    it('marks the time column as a row header', () => {
        new ResultRenderer(element, labels).render(outcome);

        expect(element.querySelector('tbody th')?.getAttribute('scope')).toBe('row');
    });

    /**
     * The source is a third party over the network, so its answer is untrusted
     * in exactly the sense model output is: it becomes text, never markup.
     */
    it('never turns the answer into markup', () => {
        new ResultRenderer(element, labels).render({
            ...outcome,
            place: {...outcome.place!, name: '<img src=x onerror=alert(1)>'},
            blocks: [{
                key: '<script>',
                times: ['<b>now</b>'],
                columns: [{name: '<i>x</i>', unit: '', values: ['<u>1</u>']}],
            }],
        });

        expect(element.querySelectorAll('img, script, b, i, u')).toHaveLength(0);
        expect(element.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('shows nothing at all for a failed query', () => {
        new ResultRenderer(element, labels).render({ok: false, summary: 'no', blocks: []});

        expect(element.hidden).toBe(true);
        expect(element.children).toHaveLength(0);
    });

    it('discards a previous result when cleared', () => {
        const renderer = new ResultRenderer(element, labels);
        renderer.render(outcome);
        renderer.clear();

        expect(element.hidden).toBe(true);
        expect(element.children).toHaveLength(0);
    });
});
