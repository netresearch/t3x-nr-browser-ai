/**
 * Reports what this browser can do — and stops there.
 *
 * `LanguageModel.availability()` answers without side effects. It is deliberately
 * the only call made here: `create()` would start a multi-gigabyte download, and
 * a page that begins downloading a model because a visitor scrolled onto it is
 * not an evaluation aid. The download stays behind the assistant's own setup
 * button, here and in production.
 *
 * Every field has a server-rendered "not determined" value, so the table is
 * complete before this script runs and stays readable if it never does.
 */
(() => {
    'use strict';

    const panel = document.querySelector('[data-capability-check]');
    if (!panel) return;

    const value = (name) => panel.dataset[name] ?? '';
    const set = (field, text) => {
        const cell = panel.querySelector(`[data-capability="${field}"]`);
        if (cell) cell.textContent = text;
    };

    // Chrome reports its own version; other browsers simply do not have the API.
    const chrome = navigator.userAgent.match(/Chrome\/(\d+)/);
    set('browser', chrome ? `Chrome ${chrome[1]}` : navigator.userAgent.split(' ').pop());

    const mobile = navigator.userAgentData?.mobile
        ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    set('device', mobile ? value('valueMobile') : value('valueDesktop'));

    const api = typeof globalThis.LanguageModel?.availability === 'function';
    set('api', api ? value('valueAvailable') : value('valueUnavailable'));

    set('language', new Intl.Locale(document.documentElement.lang || 'en').language);

    if (!api) {
        set('model', value('valueUnavailable'));
        set('download', value('valueNo'));
        return;
    }

    globalThis.LanguageModel.availability()
        .then((availability) => {
            const states = {
                available: value('valueAvailable'),
                downloadable: value('valueDownloadable'),
                downloading: value('valueDownloadable'),
                unavailable: value('valueUnavailable'),
            };
            set('model', states[availability] ?? String(availability));
            set('download', availability === 'available' ? value('valueNo') : value('valueYes'));
        })
        .catch(() => {
            set('model', value('valueUnavailable'));
            set('download', value('valueNo'));
        });

    // Suggested questions fill the input; they never submit on the visitor's behalf.
    const input = document.querySelector('[data-nr-browser-ai-question]');
    document.querySelectorAll('[data-demo-questions] [data-question]').forEach((button) => {
        button.addEventListener('click', () => {
            if (!input) return;
            input.value = button.dataset.question ?? '';
            input.focus();
        });
    });
})();
