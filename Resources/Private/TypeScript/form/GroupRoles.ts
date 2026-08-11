/**
 * Corrects the role EXT:form puts on a group of checkboxes.
 *
 * `MultiCheckbox.fluid.html` in TYPO3 core wraps its options in
 * `<div role="radiogroup">` — the same partial line as `RadioButton`. A
 * radiogroup tells assistive technology that exactly one option may be chosen,
 * which is the opposite of what a multi-checkbox element is for, and it is the
 * element this plugin's demonstration form leans on hardest: two of its groups
 * carry more than twenty options each.
 *
 * The correction is applied to this plugin's own form only. Overriding the core
 * partial would mean either replacing it for every form on the site or
 * introducing a private form prototype, and neither is proportionate to a
 * wrong attribute. Reporting it upstream is the actual fix; this keeps the
 * plugin honest until that lands.
 *
 * @return the number of groups corrected
 */
export function correctCheckboxGroupRoles(form: HTMLElement): number {
    let corrected = 0;

    for (const group of form.querySelectorAll<HTMLElement>('[role="radiogroup"]')) {
        if (group.querySelector('input[type="checkbox"]') === null) {
            continue;
        }
        group.setAttribute('role', 'group');
        corrected++;
    }

    return corrected;
}
