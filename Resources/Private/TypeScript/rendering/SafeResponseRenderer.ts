const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;
const URL_AT_START = /^https?:\/\/[^\s<>"']+/u;
const ALWAYS_TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);
const CLOSING_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
];

const CODE_FENCE = /^\s*(?:`{3,}|~{3,})/u;
const ATX_HEADING = /^(#{1,6})\s+(.*)$/u;
const THEMATIC_BREAK = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u;
const UNORDERED_ITEM = /^\s{0,3}[-*+]\s+(.*)$/u;
const ORDERED_ITEM = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/u;
const BLOCK_QUOTE = /^\s{0,3}>\s?(.*)$/u;

const CODE_SPAN = /^`([^`\n]+)`/u;
const MARKDOWN_LINK = /^\[([^\]\n]*)\]\(\s*([^\s)]+)\s*\)/u;
const STRONG = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/u;
const EMPHASIS = /^(\*|_)(?=\S)([\s\S]*?\S)\1/u;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** The widget title is an h2, so model headings start one level below it. */
const HEADING_BASE_LEVEL = 3;
const MAXIMUM_HEADING_LEVEL = 6;

type Block =
    | {kind: 'paragraph'; lines: string[]}
    | {kind: 'heading'; level: number; text: string}
    | {kind: 'list'; ordered: boolean; items: string[]}
    | {kind: 'quote'; lines: string[]}
    | {kind: 'code'; text: string}
    | {kind: 'break'};

/**
 * Renders an untrusted, streamed model response.
 *
 * A restricted Markdown subset is recognised and built with DOM APIs only:
 * every element comes from createElement and every character from a text node.
 * No HTML is ever parsed and no markup string is ever assembled, so the model
 * still cannot inject elements or attributes of its choosing. Anything outside
 * the subset stays visible as literal text.
 */
export class SafeResponseRenderer {
    private rawResponse = '';

    public constructor(
        private readonly output: HTMLElement,
        private readonly newTabLabel = '',
    ) {}

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
        const sourceDocument = this.output.ownerDocument;
        const fragment = sourceDocument.createDocumentFragment();

        for (const block of parseBlocks(this.rawResponse)) {
            fragment.append(renderBlock(block, sourceDocument, this.newTabLabel));
        }

        this.output.replaceChildren(fragment);
    }
}

function parseBlocks(source: string): Block[] {
    const lines = source.replace(/\r\n?/gu, '\n').split('\n');
    const blocks: Block[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index] ?? '';

        if (CODE_FENCE.test(line)) {
            index++;
            const code: string[] = [];
            // An unterminated fence is normal mid-stream; render what arrived.
            while (index < lines.length && !CODE_FENCE.test(lines[index] ?? '')) {
                code.push(lines[index] ?? '');
                index++;
            }
            index++;
            blocks.push({kind: 'code', text: code.join('\n')});
            continue;
        }

        if (line.trim() === '') {
            index++;
            continue;
        }

        if (THEMATIC_BREAK.test(line)) {
            blocks.push({kind: 'break'});
            index++;
            continue;
        }

        const heading = ATX_HEADING.exec(line);
        if (heading !== null) {
            blocks.push({
                kind: 'heading',
                level: (heading[1] ?? '').length,
                text: (heading[2] ?? '').replace(/\s+#+\s*$/u, '').trim(),
            });
            index++;
            continue;
        }

        if (UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line)) {
            const ordered = ORDERED_ITEM.test(line);
            const items: string[] = [];
            while (index < lines.length) {
                const candidate = lines[index] ?? '';
                const item = (ordered ? ORDERED_ITEM : UNORDERED_ITEM).exec(candidate);
                if (item !== null) {
                    items.push(item[1] ?? '');
                    index++;
                    continue;
                }
                // Wrapped continuation of the previous item.
                if (items.length > 0 && candidate.trim() !== '' && !startsBlock(candidate)) {
                    items[items.length - 1] += `\n${candidate.trim()}`;
                    index++;
                    continue;
                }
                break;
            }
            blocks.push({kind: 'list', ordered, items});
            continue;
        }

        const quote = BLOCK_QUOTE.exec(line);
        if (quote !== null) {
            const quoted: string[] = [quote[1] ?? ''];
            index++;
            while (index < lines.length) {
                const continuation = BLOCK_QUOTE.exec(lines[index] ?? '');
                if (continuation === null) {
                    break;
                }
                quoted.push(continuation[1] ?? '');
                index++;
            }
            blocks.push({kind: 'quote', lines: quoted});
            continue;
        }

        const paragraph: string[] = [];
        while (index < lines.length) {
            const candidate = lines[index] ?? '';
            if (candidate.trim() === '' || startsBlock(candidate)) {
                break;
            }
            paragraph.push(candidate);
            index++;
        }
        blocks.push({kind: 'paragraph', lines: paragraph});
    }

    return blocks;
}

function startsBlock(line: string): boolean {
    return CODE_FENCE.test(line)
        || THEMATIC_BREAK.test(line)
        || ATX_HEADING.test(line)
        || UNORDERED_ITEM.test(line)
        || ORDERED_ITEM.test(line)
        || BLOCK_QUOTE.test(line);
}

function renderBlock(block: Block, sourceDocument: Document, newTabLabel: string): HTMLElement {
    switch (block.kind) {
        case 'code': {
            const pre = sourceDocument.createElement('pre');
            const code = sourceDocument.createElement('code');
            code.textContent = block.text;
            pre.append(code);
            return pre;
        }
        case 'heading': {
            const level = Math.min(HEADING_BASE_LEVEL + block.level - 1, MAXIMUM_HEADING_LEVEL);
            const heading = sourceDocument.createElement(`h${level}`);
            appendInline(heading, block.text, newTabLabel);
            return heading;
        }
        case 'list': {
            const list = sourceDocument.createElement(block.ordered ? 'ol' : 'ul');
            for (const item of block.items) {
                const entry = sourceDocument.createElement('li');
                appendInline(entry, item, newTabLabel);
                list.append(entry);
            }
            return list;
        }
        case 'quote': {
            const quote = sourceDocument.createElement('blockquote');
            const paragraph = sourceDocument.createElement('p');
            appendInline(paragraph, block.lines.join('\n'), newTabLabel);
            quote.append(paragraph);
            return quote;
        }
        case 'break':
            return sourceDocument.createElement('hr');
        case 'paragraph':
        default: {
            const paragraph = sourceDocument.createElement('p');
            appendInline(paragraph, block.lines.join('\n'), newTabLabel);
            return paragraph;
        }
    }
}

function appendInline(parent: HTMLElement, text: string, newTabLabel: string): void {
    const sourceDocument = parent.ownerDocument;
    let plain = '';
    let index = 0;

    const flushPlain = (): void => {
        if (plain.length > 0) {
            appendLinkifiedText(parent, plain, newTabLabel);
            plain = '';
        }
    };

    while (index < text.length) {
        const rest = text.slice(index);

        // Consume bare URLs whole, so emphasis markers inside them are not parsed.
        const bareUrl = URL_AT_START.exec(rest);
        if (bareUrl !== null) {
            plain += bareUrl[0];
            index += bareUrl[0].length;
            continue;
        }

        const codeSpan = CODE_SPAN.exec(rest);
        if (codeSpan !== null) {
            flushPlain();
            const code = sourceDocument.createElement('code');
            code.textContent = codeSpan[1] ?? '';
            parent.append(code);
            index += codeSpan[0].length;
            continue;
        }

        const link = MARKDOWN_LINK.exec(rest);
        if (link !== null) {
            const url = parseWebUrl(link[2] ?? '');
            if (url !== null) {
                flushPlain();
                const label = (link[1] ?? '').trim();
                appendAnchor(parent, url, label.length > 0 ? label : url.href, newTabLabel);
                index += link[0].length;
                continue;
            }
        }

        const emphasised = matchEmphasis(text, index, rest);
        if (emphasised !== null) {
            flushPlain();
            const element = sourceDocument.createElement(emphasised.tag);
            appendInline(element, emphasised.content, newTabLabel);
            parent.append(element);
            index += emphasised.length;
            continue;
        }

        plain += text[index];
        index++;
    }

    flushPlain();
}

function matchEmphasis(
    text: string,
    index: number,
    rest: string,
): {tag: 'strong' | 'em'; content: string; length: number} | null {
    for (const [pattern, tag] of [[STRONG, 'strong'], [EMPHASIS, 'em']] as const) {
        const match = pattern.exec(rest);
        if (match === null) {
            continue;
        }
        // Underscores inside a word are literal, matching CommonMark.
        if ((match[1] ?? '').startsWith('_') && WORD_CHARACTER.test(text[index - 1] ?? '')) {
            continue;
        }
        return {tag, content: match[2] ?? '', length: match[0].length};
    }

    return null;
}

function appendLinkifiedText(parent: HTMLElement, text: string, newTabLabel: string): void {
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
        appendAnchor(parent, url, candidate, newTabLabel);
        textStart = matchStart + candidate.length;
    }

    parent.append(sourceDocument.createTextNode(text.slice(textStart)));
}

function appendAnchor(
    parent: HTMLElement,
    url: URL,
    label: string,
    newTabLabel: string,
): void {
    const sourceDocument = parent.ownerDocument;
    const anchor = sourceDocument.createElement('a');
    anchor.href = url.href;
    anchor.textContent = label;

    if (url.origin !== sourceDocument.location.origin) {
        // Keep the dialogue open while protecting the opener from model-provided URLs.
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        const marker = sourceDocument.createElement('span');
        marker.className = 'nr-browser-ai__new-tab-marker';
        marker.setAttribute('aria-hidden', 'true');
        anchor.append(marker);
        if (newTabLabel.length > 0) {
            anchor.setAttribute('aria-label', `${label} ${newTabLabel}`);
        }
    }

    parent.append(anchor);
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
