const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;
const ALWAYS_TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);
const CLOSING_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
];

/**
 * Renders an untrusted, streamed model response without interpreting HTML or Markdown.
 */
export class SafeResponseRenderer {
    private rawResponse = '';

    public constructor(private readonly output: HTMLElement) {}

    /** Add a streaming chunk to the current response and render its complete state. */
    public appendChunk(chunk: string): void {
        this.rawResponse += chunk;
        this.render();
    }

    /** Start a new response, discarding both buffered source and rendered nodes. */
    public clear(): void {
        this.rawResponse = '';
        this.output.replaceChildren();
    }

    /** Alias used by controllers that model the operation as a state reset. */
    public reset(): void {
        this.clear();
    }

    private render(): void {
        const fragment = this.output.ownerDocument.createDocumentFragment();

        if (this.rawResponse.length > 0) {
            const paragraphs = this.rawResponse.split(/\r?\n(?:[\t ]*\r?\n)+/u);
            for (const paragraphText of paragraphs) {
                const paragraph = this.output.ownerDocument.createElement('p');
                appendLinkifiedText(paragraph, paragraphText);
                fragment.append(paragraph);
            }
        }

        this.output.replaceChildren(fragment);
    }
}

function appendLinkifiedText(parent: HTMLElement, text: string): void {
    const sourceDocument = parent.ownerDocument;
    let textStart = 0;

    for (const match of text.matchAll(URL_CANDIDATE)) {
        const matchStart = match.index;
        const matchedValue = match[0];
        if (matchStart === undefined || isEmbeddedInAnotherScheme(text, matchStart)) {
            continue;
        }

        const candidate = removeTrailingPunctuation(matchedValue);
        const url = parseWebUrl(candidate);
        if (url === null) {
            continue;
        }

        parent.append(sourceDocument.createTextNode(text.slice(textStart, matchStart)));
        const anchor = sourceDocument.createElement('a');
        anchor.href = url.href;
        anchor.textContent = candidate;

        if (url.origin !== sourceDocument.location.origin) {
            // Keep the dialogue open while protecting the opener from model-provided URLs.
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
        }

        parent.append(anchor);
        textStart = matchStart + candidate.length;
    }

    parent.append(sourceDocument.createTextNode(text.slice(textStart)));
}

function isEmbeddedInAnotherScheme(text: string, start: number): boolean {
    return start > 0 && /[\p{L}\p{N}_:/]/u.test(text[start - 1] ?? '');
}

function parseWebUrl(candidate: string): URL | null {
    try {
        const url = new URL(candidate);
        return WEB_PROTOCOLS.has(url.protocol) ? url : null;
    } catch {
        return null;
    }
}

function removeTrailingPunctuation(value: string): string {
    let end = value.length;

    while (end > 0) {
        const trailingCharacter = value[end - 1] ?? '';
        if (ALWAYS_TRAILING_PUNCTUATION.has(trailingCharacter)) {
            end--;
            continue;
        }

        const pair = CLOSING_PAIRS.find(([, closing]) => closing === trailingCharacter);
        if (pair !== undefined) {
            const [opening, closing] = pair;
            const candidate = value.slice(0, end);
            if (count(candidate, closing) > count(candidate, opening)) {
                end--;
                continue;
            }
        }

        break;
    }

    return value.slice(0, end);
}

function count(value: string, character: string): number {
    return [...value].filter(candidate => candidate === character).length;
}
