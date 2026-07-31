import type {
    PageContext,
    PageContextMeasure,
    PageContextProvider,
    PageSection,
} from './PageContextProvider';

const EXCLUDED_CONTENT = [
    'script',
    'style',
    'noscript',
    'nav',
    'form',
    '[hidden]',
    '[aria-hidden="true"]',
    '[data-nr-browser-ai-root]',
    '[data-nr-browser-ai-exclude]',
].join(',');

const SEMANTIC_ELEMENTS = 'h1,h2,h3,h4,h5,h6,p,li,table,img';
const HEADING_ELEMENTS = /^H[1-6]$/u;
const LOW_INFORMATION_THRESHOLD = 40;

export class PageContextError extends Error {
    public constructor(
        public readonly code: 'context-root-missing',
        message: string,
    ) {
        super(message);
        this.name = 'PageContextError';
    }
}

export class DomPageContextProvider implements PageContextProvider {
    public constructor(private readonly sourceDocument: Document = document) {}

    public async getContext(selector: string): Promise<PageContext> {
        const sourceRoot = this.sourceDocument.querySelector(selector);
        if (sourceRoot === null) {
            throw new PageContextError(
                'context-root-missing',
                `The page context root "${selector}" does not exist.`,
            );
        }

        const root = sourceRoot.cloneNode(true) as Element;
        root.querySelectorAll(EXCLUDED_CONTENT).forEach(element => element.remove());

        return {
            title: normalizeWhitespace(this.sourceDocument.title),
            language: normalizeWhitespace(this.sourceDocument.documentElement.lang),
            sections: extractSections(root),
            wasTruncated: false,
        };
    }

    public async fitToBudget(
        context: Readonly<PageContext>,
        measure: PageContextMeasure,
        budget: number,
    ): Promise<PageContext> {
        const originalNonEmptyCount = context.sections.filter(section => (
            normalizeWhitespace(section.text).length > 0
        )).length;
        let sections = uniqueNonEmptySections(context.sections);
        let wasTruncated = context.wasTruncated
            || sections.length < originalNonEmptyCount;

        let candidate = copyContext(context, sections, wasTruncated);
        if (await fits(candidate, measure, budget)) {
            return candidate;
        }

        const informativeSections = sections.filter(section => section.text.length >= LOW_INFORMATION_THRESHOLD);
        if (informativeSections.length < sections.length) {
            sections = informativeSections;
            wasTruncated = true;
            candidate = copyContext(context, sections, wasTruncated);
            if (await fits(candidate, measure, budget)) {
                return candidate;
            }
        }

        while (sections.length > 0) {
            sections = sections.slice(0, -1);
            wasTruncated = true;
            candidate = copyContext(context, sections, wasTruncated);
            if (await fits(candidate, measure, budget)) {
                return candidate;
            }
        }

        return candidate;
    }
}

function extractSections(root: Element): PageSection[] {
    const sections: PageSection[] = [];
    let heading = '';
    let fragments: string[] = [];

    const finishSection = (): void => {
        const text = fragments.filter(Boolean).join('\n');
        if (text.length > 0) {
            sections.push({heading, text});
        }
        fragments = [];
    };

    for (const element of root.querySelectorAll(SEMANTIC_ELEMENTS)) {
        if (HEADING_ELEMENTS.test(element.tagName)) {
            finishSection();
            heading = semanticText(element);
            continue;
        }

        if (hasAtomicSemanticAncestor(element)) {
            continue;
        }

        const text = element.tagName === 'LI'
            ? listItemText(element)
            : element.tagName === 'IMG'
                ? normalizeWhitespace(element.getAttribute('alt') ?? '')
                : semanticText(element);
        if (text.length > 0) {
            fragments.push(text);
        }
    }

    finishSection();
    return sections;
}

function hasAtomicSemanticAncestor(element: Element): boolean {
    const ancestor = element.parentElement?.closest('p,table');
    if (ancestor !== null && ancestor !== undefined) {
        return true;
    }

    return element.tagName !== 'LI'
        && element.parentElement?.closest('li') !== null;
}

function listItemText(element: Element): string {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('ol,ul,table').forEach(nested => nested.remove());
    return semanticText(clone);
}

function semanticText(element: Element): string {
    const parts: string[] = [];
    const visit = (node: Node): void => {
        if (node.nodeType === node.TEXT_NODE) {
            parts.push(node.textContent ?? '');
            return;
        }
        if (!(node instanceof Element)) {
            return;
        }
        if (node.tagName === 'IMG') {
            parts.push(node.getAttribute('alt') ?? '');
            return;
        }
        node.childNodes.forEach(visit);
    };
    visit(element);
    return normalizeWhitespace(parts.join(' ')).replace(/\s+([.,;:!?])/gu, '$1');
}

function uniqueNonEmptySections(sections: readonly PageSection[]): PageSection[] {
    const seen = new Set<string>();
    const result: PageSection[] = [];

    for (const section of sections) {
        const normalized = {
            heading: normalizeWhitespace(section.heading),
            text: normalizeWhitespace(section.text),
        };
        if (normalized.text.length === 0) {
            continue;
        }
        const key = `${normalized.heading}\u0000${normalized.text}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(normalized);
    }

    return result;
}

function copyContext(
    source: Readonly<PageContext>,
    sections: readonly PageSection[],
    wasTruncated: boolean,
): PageContext {
    return {
        title: source.title,
        language: source.language,
        sections: sections.map(section => ({...section})),
        wasTruncated,
    };
}

async function fits(
    context: PageContext,
    measure: PageContextMeasure,
    budget: number,
): Promise<boolean> {
    const usage = await measure(context);
    return Number.isFinite(usage) && usage >= 0 && usage <= budget;
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
}
