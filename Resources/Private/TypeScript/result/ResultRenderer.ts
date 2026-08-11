import type {ActionOutcome, ResultBlock} from '../query/FormAction';

export interface ResultLabels {
    caption: string;
    place: string;
    time: string;
}

/**
 * Lays the query result out as tables.
 *
 * Everything here is built with createElement and text nodes. The response
 * comes from a third party over the network, so it is untrusted data in exactly
 * the sense the model's own output is, and the same rule applies: no markup is
 * ever assembled from it.
 */
export class ResultRenderer {
    public constructor(
        private readonly output: HTMLElement,
        private readonly labels: ResultLabels,
    ) {}

    public clear(): void {
        this.output.replaceChildren();
        this.output.hidden = true;
    }

    public render(outcome: ActionOutcome): void {
        this.output.replaceChildren();

        if (!outcome.ok || outcome.blocks.length === 0) {
            this.output.hidden = true;

            return;
        }

        const heading = document.createElement('h3');
        heading.className = 'nr-browser-ai-form__result-title';
        heading.textContent = this.labels.caption;
        this.output.append(heading);

        if (outcome.place !== undefined) {
            const place = document.createElement('p');
            place.className = 'nr-browser-ai-form__result-place';
            const where = outcome.place.country === ''
                ? outcome.place.name
                : `${outcome.place.name}, ${outcome.place.country}`;
            place.textContent = `${this.labels.place}: ${where}`;
            this.output.append(place);
        }

        for (const block of outcome.blocks) {
            this.output.append(this.table(block));
        }

        this.output.hidden = false;
    }

    private table(block: ResultBlock): HTMLElement {
        const scroller = document.createElement('div');
        scroller.className = 'nr-browser-ai-form__table-scroller';

        const table = document.createElement('table');
        table.className = 'nr-browser-ai-form__table';

        const caption = document.createElement('caption');
        caption.textContent = block.key;
        table.append(caption);

        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.append(this.headerCell(this.labels.time));
        for (const column of block.columns) {
            headRow.append(this.headerCell(
                column.unit === '' ? column.name : `${column.name} (${column.unit})`,
            ));
        }
        head.append(headRow);
        table.append(head);

        const body = document.createElement('tbody');
        for (let row = 0; row < block.times.length; row++) {
            const bodyRow = document.createElement('tr');
            bodyRow.append(this.headerCell(block.times[row] ?? '', 'row'));
            for (const column of block.columns) {
                const cell = document.createElement('td');
                const value = column.values[row];
                cell.textContent = value === null || value === undefined ? '—' : String(value);
                bodyRow.append(cell);
            }
            body.append(bodyRow);
        }
        table.append(body);

        scroller.append(table);

        return scroller;
    }

    private headerCell(text: string, scope: 'col' | 'row' = 'col'): HTMLTableCellElement {
        const cell = document.createElement('th');
        cell.scope = scope;
        cell.textContent = text;

        return cell;
    }
}
