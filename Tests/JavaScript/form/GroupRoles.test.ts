import {beforeEach, describe, expect, it} from 'vitest';

import {correctCheckboxGroupRoles} from '../../../Resources/Private/TypeScript/form/GroupRoles';

function form(markup: string): HTMLElement {
    document.body.innerHTML = `<form>${markup}</form>`;
    const element = document.querySelector('form');
    if (element === null) {
        throw new Error('fixture has no form');
    }

    return element;
}

describe('correctCheckboxGroupRoles', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * A radiogroup announces that exactly one option may be chosen. On the
     * element whose entire purpose is choosing several, that is not a detail.
     */
    it('turns a radiogroup of checkboxes into a group', () => {
        const element = form(`
            <div role="radiogroup" aria-label="Hourly variables">
                <input type="checkbox" value="rain">
                <input type="checkbox" value="snowfall">
            </div>
        `);

        expect(correctCheckboxGroupRoles(element)).toBe(1);
        expect(element.querySelector('[aria-label="Hourly variables"]')?.getAttribute('role'))
            .toBe('group');
    });

    it('leaves an actual group of radio buttons alone', () => {
        const element = form(`
            <div role="radiogroup" aria-label="Weather model">
                <input type="radio" name="m" value="icon">
                <input type="radio" name="m" value="gfs">
            </div>
        `);

        expect(correctCheckboxGroupRoles(element)).toBe(0);
        expect(element.querySelector('[aria-label="Weather model"]')?.getAttribute('role'))
            .toBe('radiogroup');
    });

    it('corrects every group in the form', () => {
        const element = form(`
            <div role="radiogroup"><input type="checkbox"></div>
            <div role="radiogroup"><input type="checkbox"></div>
            <div role="radiogroup"><input type="radio" name="r"></div>
        `);

        expect(correctCheckboxGroupRoles(element)).toBe(2);
    });

    it('does nothing to a form without groups', () => {
        expect(correctCheckboxGroupRoles(form('<input type="text">'))).toBe(0);
    });

    it('is safe to run twice', () => {
        const element = form('<div role="radiogroup"><input type="checkbox"></div>');

        expect(correctCheckboxGroupRoles(element)).toBe(1);
        expect(correctCheckboxGroupRoles(element)).toBe(0);
    });
});
