const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;
const URL_AT_START = /^https?:\/\/[^\s<>"']+/u;
const ALWAYS_TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);
const CLOSING_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
];

const MARKDOWN_LINK = /^\[([^\]\n]*)\]\(([^\s)]*)\)/u;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

// Block syntax is recognised with string operations rather than patterns.
// The renderer parses untrusted model output on every streamed chunk, so no
// input may be able to drive a regular expression into super-linear matching.
const MAXIMUM_INDENT = 3;
const MAXIMUM_HEADING_MARKS = 6;
const MINIMUM_FENCE_LENGTH = 3;
const MINIMUM_BREAK_LENGTH = 3;
const UNORDERED_MARKERS = '-*+';
const EMPHASIS_MARKERS = '*_';
const BREAK_MARKERS = '-*_';

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

        if (line.trim() === '') {
            index++;
            continue;
        }

        const consumed = consumeBlock(lines, index, blocks);
        index = consumed;
    }

    return blocks;
}

/** Appends the block starting at `start` and returns the next unread line. */
function consumeBlock(lines: string[], start: number, blocks: Block[]): number {
    const line = lines[start] ?? '';

    if (isFence(line)) {
        return consumeFence(lines, start, blocks);
    }
    if (isThematicBreak(line)) {
        blocks.push({kind: 'break'});
        return start + 1;
    }

    const heading = parseHeading(line);
    if (heading !== null) {
        blocks.push({kind: 'heading', ...heading});
        return start + 1;
    }
    if (parseListItem(line) !== null) {
        return consumeList(lines, start, blocks);
    }
    if (parseQuote(line) !== null) {
        return consumeQuote(lines, start, blocks);
    }

    return consumeParagraph(lines, start, blocks);
}

function consumeFence(lines: string[], start: number, blocks: Block[]): number {
    let index = start + 1;
    const code: string[] = [];
    // An unterminated fence is normal mid-stream; render what arrived.
    while (index < lines.length && !isFence(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index++;
    }
    blocks.push({kind: 'code', text: code.join('\n')});

    return index + 1;
}

function consumeList(lines: string[], start: number, blocks: Block[]): number {
    const ordered = parseListItem(lines[start] ?? '')?.ordered === true;
    const items: string[] = [];
    let index = start;

    while (index < lines.length) {
        const candidate = lines[index] ?? '';
        const item = parseListItem(candidate);
        if (item !== null && item.ordered === ordered) {
            items.push(item.content);
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

    return index;
}

function consumeQuote(lines: string[], start: number, blocks: Block[]): number {
    const quoted: string[] = [];
    let index = start;

    while (index < lines.length) {
        const content = parseQuote(lines[index] ?? '');
        if (content === null) {
            break;
        }
        quoted.push(content);
        index++;
    }
    blocks.push({kind: 'quote', lines: quoted});

    return index;
}

function consumeParagraph(lines: string[], start: number, blocks: Block[]): number {
    const paragraph: string[] = [];
    let index = start;

    while (index < lines.length) {
        const candidate = lines[index] ?? '';
        if (candidate.trim() === '' || startsBlock(candidate)) {
            break;
        }
        paragraph.push(candidate);
        index++;
    }
    blocks.push({kind: 'paragraph', lines: paragraph});

    return index;
}

function startsBlock(line: string): boolean {
    return isFence(line)
        || isThematicBreak(line)
        || parseHeading(line) !== null
        || parseListItem(line) !== null
        || parseQuote(line) !== null;
}

/** Position of the first non-space character, or -1 when indented too far. */
function contentStart(line: string): number {
    let index = 0;
    while (index < line.length && line[index] === ' ') {
        index++;
    }

    return index > MAXIMUM_INDENT ? -1 : index;
}

function repeatedRun(line: string, from: number, character: string): number {
    let index = from;
    while (index < line.length && line[index] === character) {
        index++;
    }

    return index - from;
}

function isFence(line: string): boolean {
    const start = contentStart(line);
    if (start < 0) {
        return false;
    }
    const marker = line[start];

    return (marker === '`' || marker === '~')
        && repeatedRun(line, start, marker) >= MINIMUM_FENCE_LENGTH;
}

function isThematicBreak(line: string): boolean {
    const start = contentStart(line);
    if (start < 0) {
        return false;
    }
    const marker = line[start] ?? '';
    if (!BREAK_MARKERS.includes(marker)) {
        return false;
    }

    return repeatedRun(line, start, marker) >= MINIMUM_BREAK_LENGTH
        && line.slice(start).trim().length === repeatedRun(line, start, marker);
}

function parseHeading(line: string): {level: number; text: string} | null {
    const start = contentStart(line);
    if (start < 0 || line[start] !== '#') {
        return null;
    }
    const level = repeatedRun(line, start, '#');
    if (level > MAXIMUM_HEADING_MARKS || !isSpace(line[start + level])) {
        return null;
    }

    let text = line.slice(start + level).trim();
    // A closing run of hashes is decoration, not content.
    const trailing = text.length - trimEndRun(text, '#');
    if (trailing > 0 && isSpace(text[text.length - trailing - 1])) {
        text = text.slice(0, text.length - trailing).trim();
    }

    return {level, text};
}

function parseListItem(line: string): {ordered: boolean; content: string} | null {
    const start = contentStart(line);
    if (start < 0) {
        return null;
    }
    const marker = line[start] ?? '';

    if (UNORDERED_MARKERS.includes(marker) && isSpace(line[start + 1])) {
        return {ordered: false, content: line.slice(start + 2).trim()};
    }

    let digits = start;
    while (digits < line.length && isDigit(line[digits])) {
        digits++;
    }
    const delimiter = line[digits] ?? '';
    if (digits > start && (delimiter === '.' || delimiter === ')') && isSpace(line[digits + 1])) {
        return {ordered: true, content: line.slice(digits + 2).trim()};
    }

    return null;
}

function parseQuote(line: string): string | null {
    const start = contentStart(line);
    if (start < 0 || line[start] !== '>') {
        return null;
    }
    const offset = isSpace(line[start + 1]) ? 2 : 1;

    return line.slice(start + offset);
}

function trimEndRun(value: string, character: string): number {
    let end = value.length;
    while (end > 0 && value[end - 1] === character) {
        end--;
    }

    return end;
}

function isSpace(character: string | undefined): boolean {
    return character === ' ' || character === '\t';
}

function isDigit(character: string | undefined): boolean {
    return character !== undefined && character >= '0' && character <= '9';
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

        const codeSpan = matchCodeSpan(text, index);
        if (codeSpan !== null) {
            flushPlain();
            const code = sourceDocument.createElement('code');
            code.textContent = codeSpan.content;
            parent.append(code);
            index += codeSpan.length;
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

        const emphasised = matchEmphasis(text, index);
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

/** Scans for a closing delimiter directly, so no input can cause backtracking. */
function matchEmphasis(
    text: string,
    index: number,
): {tag: 'strong' | 'em'; content: string; length: number} | null {
    const marker = text[index] ?? '';
    if (!EMPHASIS_MARKERS.includes(marker)) {
        return null;
    }
    // Underscores inside a word are literal, matching CommonMark.
    if (marker === '_' && WORD_CHARACTER.test(text[index - 1] ?? '')) {
        return null;
    }

    const doubled = text[index + 1] === marker;
    const delimiter = doubled ? marker + marker : marker;
    const contentStartIndex = index + delimiter.length;
    if (isBlank(text[contentStartIndex])) {
        return null;
    }

    const closing = text.indexOf(delimiter, contentStartIndex + 1);
    if (closing < 0) {
        return null;
    }
    const content = text.slice(contentStartIndex, closing);
    if (content.length === 0 || isBlank(content[content.length - 1])) {
        return null;
    }

    return {
        tag: doubled ? 'strong' : 'em',
        content,
        length: delimiter.length * 2 + content.length,
    };
}

function matchCodeSpan(text: string, index: number): {content: string; length: number} | null {
    if (text[index] !== '`') {
        return null;
    }
    const closing = text.indexOf('`', index + 1);
    if (closing < 0) {
        return null;
    }
    const content = text.slice(index + 1, closing);
    if (content.length === 0 || content.includes('\n')) {
        return null;
    }

    return {content, length: content.length + 2};
}

function isBlank(character: string | undefined): boolean {
    return character === undefined || character === ' ' || character === '\t' || character === '\n';
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
