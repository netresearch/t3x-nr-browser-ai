// Resources/Private/TypeScript/ai/BrowserLanguageModelAdapter.ts
var availabilityValues = /* @__PURE__ */ new Set([
  "available",
  "downloadable",
  "downloading",
  "unavailable"
]);
var BrowserLanguageModelAdapter = class {
  constructor(browser = globalThis) {
    this.browser = browser;
  }
  browser;
  async availability(options) {
    const availability = this.browser.LanguageModel?.availability;
    if (typeof availability !== "function") {
      return "unavailable";
    }
    const value = await availability.call(
      this.browser.LanguageModel,
      this.capabilityOptions(options)
    );
    return typeof value === "string" && availabilityValues.has(value) ? value : "unavailable";
  }
  async create(options) {
    const create = this.browser.LanguageModel?.create;
    if (typeof create !== "function") {
      throw new Error("LanguageModel API is unavailable");
    }
    return create.call(this.browser.LanguageModel, {
      ...this.capabilityOptions(options),
      initialPrompts: [{ role: "system", content: options.systemPrompt }],
      monitor: (monitor) => {
        monitor.addEventListener("downloadprogress", (event) => {
          if (Number.isFinite(event.loaded)) {
            options.onDownloadProgress(Math.min(1, Math.max(0, event.loaded)));
          }
        });
      }
    });
  }
  capabilityOptions(options) {
    return {
      expectedInputs: [{ type: "text", languages: [...options.inputLanguages] }],
      expectedOutputs: [{ type: "text", languages: [...options.outputLanguages] }]
    };
  }
};

// Resources/Private/TypeScript/context/DomPageContextProvider.ts
var EXCLUDED_CONTENT = [
  "script",
  "style",
  "noscript",
  "nav",
  "form",
  "[hidden]",
  '[aria-hidden="true"]',
  "[data-nr-browser-ai-root]",
  "[data-nr-browser-ai-exclude]"
].join(",");
var HEADING_ELEMENTS = /^H[1-6]$/u;
var LOW_INFORMATION_THRESHOLD = 40;
var INLINE_ELEMENTS = /* @__PURE__ */ new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "BR",
  "CITE",
  "CODE",
  "DATA",
  "DEL",
  "DFN",
  "EM",
  "I",
  "INS",
  "KBD",
  "MARK",
  "Q",
  "RP",
  "RT",
  "RUBY",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U",
  "VAR",
  "WBR"
]);
var PageContextError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "PageContextError";
  }
  code;
};
var DomPageContextProvider = class {
  constructor(sourceDocument = document) {
    this.sourceDocument = sourceDocument;
  }
  sourceDocument;
  async getContext(selector) {
    let sourceRoot;
    try {
      sourceRoot = this.sourceDocument.querySelector(selector);
    } catch {
      throw new PageContextError(
        "context-selector-invalid",
        `The page context selector "${selector}" is invalid.`
      );
    }
    if (sourceRoot === null) {
      throw new PageContextError(
        "context-root-missing",
        `The page context root "${selector}" does not exist.`
      );
    }
    const root = sourceRoot.cloneNode(true);
    root.querySelectorAll(EXCLUDED_CONTENT).forEach((element) => element.remove());
    return {
      title: normalizeWhitespace(this.sourceDocument.title),
      language: normalizeWhitespace(this.sourceDocument.documentElement.lang),
      sections: extractSections(root),
      wasTruncated: false
    };
  }
  async fitToBudget(context, measure, budget) {
    const originalNonEmptyCount = context.sections.filter((section) => normalizeWhitespace(section.text).length > 0).length;
    let sections = uniqueNonEmptySections(context.sections);
    let wasTruncated = context.wasTruncated || sections.length < originalNonEmptyCount;
    let candidate = copyContext(context, sections, wasTruncated);
    if (await fits(candidate, measure, budget)) {
      return candidate;
    }
    const informativeSections = sections.filter((section) => section.text.length >= LOW_INFORMATION_THRESHOLD);
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
};
function extractSections(root) {
  const sections = [];
  let heading = "";
  let fragments = [];
  let inlineParts = [];
  const finishSection = () => {
    const text = fragments.filter(Boolean).join("\n");
    if (text.length > 0) {
      sections.push({ heading, text });
    }
    fragments = [];
  };
  const flushInline = () => {
    const text = normalizeSemanticText(inlineParts.join(" "));
    if (text.length > 0) {
      fragments.push(text);
    }
    inlineParts = [];
  };
  const visitSemanticNode = (node) => {
    if (node.nodeType === node.TEXT_NODE) {
      inlineParts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (HEADING_ELEMENTS.test(node.tagName)) {
      flushInline();
      finishSection();
      heading = semanticText(node);
      return;
    }
    if (node.tagName === "IMG") {
      inlineParts.push(node.getAttribute("alt") ?? "");
      return;
    }
    if (node.matches("p,li,table")) {
      flushInline();
      node.childNodes.forEach(visitSemanticNode);
      flushInline();
      return;
    }
    if (node.matches("ol,ul")) {
      flushInline();
      node.childNodes.forEach(visitNode);
      return;
    }
    node.childNodes.forEach(visitSemanticNode);
  };
  const visitNode = (node) => {
    if (node.nodeType === node.TEXT_NODE) {
      inlineParts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (HEADING_ELEMENTS.test(node.tagName)) {
      flushInline();
      finishSection();
      heading = semanticText(node);
      return;
    }
    if (node.matches("p,li,table")) {
      flushInline();
      node.childNodes.forEach(visitSemanticNode);
      flushInline();
      return;
    }
    if (node.tagName === "IMG") {
      inlineParts.push(node.getAttribute("alt") ?? "");
      flushInline();
      return;
    }
    if (INLINE_ELEMENTS.has(node.tagName)) {
      node.childNodes.forEach(visitNode);
      return;
    }
    flushInline();
    node.childNodes.forEach(visitNode);
    flushInline();
  };
  visitNode(root);
  flushInline();
  finishSection();
  return sections;
}
function semanticText(element) {
  const parts = [];
  const visit = (node) => {
    if (node.nodeType === node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (node.tagName === "IMG") {
      parts.push(node.getAttribute("alt") ?? "");
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(element);
  return normalizeSemanticText(parts.join(" "));
}
function normalizeSemanticText(value) {
  return normalizeWhitespace(value).replace(/\s+([.,;:!?])/gu, "$1");
}
function uniqueNonEmptySections(sections) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const section of sections) {
    const normalized = {
      heading: normalizeWhitespace(section.heading),
      text: normalizeWhitespace(section.text)
    };
    if (normalized.text.length === 0) {
      continue;
    }
    const key = `${normalized.heading}\0${normalized.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}
function copyContext(source, sections, wasTruncated) {
  return {
    title: source.title,
    language: source.language,
    sections: sections.map((section) => ({ ...section })),
    wasTruncated
  };
}
async function fits(context, measure, budget) {
  const usage = await measure(context);
  return Number.isFinite(usage) && usage >= 0 && usage <= budget;
}
function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
}

// Resources/Private/TypeScript/ai/LanguageModelSession.ts
var DEFAULT_CONTEXT_USAGE_LIMIT = 0.8;
var LanguageModelSessionError = class extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
    this.name = "LanguageModelSessionError";
  }
  code;
};
var LanguageModelSession = class {
  constructor(adapter, contextProvider, options) {
    this.adapter = adapter;
    this.contextProvider = contextProvider;
    const contextUsageLimit = options.contextUsageLimit ?? DEFAULT_CONTEXT_USAGE_LIMIT;
    if (!Number.isFinite(contextUsageLimit) || contextUsageLimit <= 0 || contextUsageLimit > 1) {
      throw new RangeError("contextUsageLimit must be greater than zero and at most one.");
    }
    this.contextUsageLimit = contextUsageLimit;
    this.modelOptions = {
      systemPrompt: combineInstructions(
        options.systemPrompt,
        options.supplementalInstruction ?? "",
        options.outputLanguages
      ),
      inputLanguages: [...options.inputLanguages],
      outputLanguages: [...options.outputLanguages]
    };
    this.onDownloadProgress = options.onDownloadProgress ?? (() => void 0);
  }
  adapter;
  contextProvider;
  contextUsageLimit;
  modelOptions;
  onDownloadProgress;
  initialization;
  session;
  destroyed = false;
  responseInProgress = false;
  initialize(context) {
    if (this.destroyed) {
      return Promise.reject(sessionError("destroyed"));
    }
    this.initialization ??= this.initializeOnce(copyContext2(context));
    return this.initialization;
  }
  async ask(question, onChunk, signal) {
    if (this.destroyed) {
      throw sessionError("destroyed");
    }
    const session = this.session;
    if (session === void 0) {
      throw sessionError("not-initialized");
    }
    if (question.trim().length === 0) {
      throw sessionError("invalid-prompt");
    }
    if (this.responseInProgress) {
      throw sessionError("response-in-progress");
    }
    this.responseInProgress = true;
    let reader;
    let streamConsumed = false;
    try {
      const contextUsage = session.contextUsage;
      const contextWindow = session.contextWindow;
      if (contextLimitReached(contextUsage, contextWindow, this.contextUsageLimit)) {
        throw sessionError("context-limit-reached");
      }
      if (signal?.aborted === true) {
        throw sessionError("aborted", signal.reason);
      }
      const stream = session.promptStreaming(question, { signal });
      reader = stream.getReader();
      while (true) {
        const result = await reader.read();
        if (result.done) {
          streamConsumed = true;
          return;
        }
        onChunk(result.value);
      }
    } catch (error) {
      throw translateBrowserError(error);
    } finally {
      if (reader !== void 0 && !streamConsumed) {
        try {
          await reader.cancel();
        } catch {
        }
      }
      try {
        reader?.releaseLock();
      } catch {
      }
      this.responseInProgress = false;
    }
  }
  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.releaseSession();
  }
  async initializeOnce(context) {
    let createdSession;
    try {
      createdSession = await this.adapter.create({
        ...this.modelOptions,
        onDownloadProgress: this.onDownloadProgress
      });
      const activeSession = createdSession;
      if (this.destroyed) {
        throw sessionError("destroyed");
      }
      const budget = remainingContextBudget(
        activeSession,
        this.contextUsageLimit
      );
      let selectedContext = context;
      let sourceMessage = createSourceMessage(selectedContext);
      const measuredUsage = await activeSession.measureContextUsage(sourceMessage);
      if (!fitsBudget(measuredUsage, budget)) {
        selectedContext = await this.contextProvider.fitToBudget(
          context,
          (candidate) => activeSession.measureContextUsage(
            createSourceMessage(candidate)
          ),
          budget
        );
        sourceMessage = createSourceMessage(selectedContext);
        const reducedUsage = await activeSession.measureContextUsage(sourceMessage);
        if (!fitsBudget(reducedUsage, budget)) {
          throw sessionError("context-limit-reached");
        }
      }
      if (this.destroyed) {
        throw sessionError("destroyed");
      }
      await activeSession.append(sourceMessage);
      if (this.destroyed) {
        throw sessionError("destroyed");
      }
      this.session = activeSession;
      createdSession = void 0;
      return { wasTruncated: selectedContext.wasTruncated };
    } catch (error) {
      createdSession?.destroy();
      throw translateBrowserError(error);
    }
  }
  releaseSession() {
    const session = this.session;
    this.session = void 0;
    session?.destroy();
  }
};
var LANGUAGE_NAMES = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  ja: "Japanese"
};
function combineInstructions(systemPrompt, supplementalInstruction, outputLanguages) {
  const parts = [systemPrompt.trim(), languageInstruction(outputLanguages)].filter((part) => part.length > 0);
  const editorInstruction = supplementalInstruction.trim();
  if (editorInstruction.length > 0) {
    parts.push(`Additional editor instruction:
${editorInstruction}`);
  }
  return parts.join("\n\n");
}
function languageInstruction(outputLanguages) {
  const pageLanguage2 = LANGUAGE_NAMES[outputLanguages[0] ?? ""];
  if (pageLanguage2 === void 0) {
    return "Answer in the language of the question.";
  }
  return `Answer in the language of the question. If that language is unclear, answer in ${pageLanguage2}.`;
}
function remainingContextBudget(session, usageLimit) {
  const maximumUsage = session.contextWindow * usageLimit;
  const budget = maximumUsage - session.contextUsage;
  return Number.isFinite(budget) ? Math.max(0, budget) : 0;
}
function contextLimitReached(contextUsage, contextWindow, usageLimit) {
  if (!Number.isFinite(contextUsage) || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return true;
  }
  return contextUsage / contextWindow >= usageLimit;
}
function fitsBudget(usage, budget) {
  return Number.isFinite(usage) && usage >= 0 && usage <= budget;
}
function createSourceMessage(context) {
  return [{ role: "user", content: serializeSourceDocument(context) }];
}
function serializeSourceDocument(context) {
  const opening = `<source-document title="${escapeAttribute(context.title)}" language="${escapeAttribute(context.language)}">`;
  const body = context.sections.map((section) => {
    const heading = escapeMarkup(normalizeInline(section.heading));
    const text = neutralizeMarkdownStructure(escapeMarkup(normalizeNewlines(section.text)));
    return `## ${heading}
${text}`;
  }).join("\n\n");
  return body.length > 0 ? `${opening}
${body}
</source-document>` : `${opening}
</source-document>`;
}
function escapeAttribute(value) {
  return normalizeInline(value).replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}
function escapeMarkup(value) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}
function neutralizeMarkdownStructure(value) {
  return value.replace(/^(\s*)(#{1,6})(?=\s)/gmu, "$1\\$2");
}
function normalizeInline(value) {
  return value.replace(/\s+/gu, " ").trim();
}
function normalizeNewlines(value) {
  return value.replace(/\r\n?/gu, "\n").trim();
}
function copyContext2(context) {
  return {
    title: context.title,
    language: context.language,
    sections: context.sections.map((section) => ({ ...section })),
    wasTruncated: context.wasTruncated
  };
}
function translateBrowserError(error) {
  if (error instanceof LanguageModelSessionError) {
    return error;
  }
  if (isNamedError(error)) {
    if (error.name === "AbortError") {
      return sessionError("aborted", error);
    }
    if (error.name === "NotSupportedError") {
      return sessionError("not-supported", error);
    }
    if (error.name === "QuotaExceededError") {
      return sessionError("quota-exceeded", error);
    }
  }
  return error;
}
function isNamedError(error) {
  return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string";
}
function sessionError(code, cause) {
  const messages = {
    aborted: "The response generation was aborted.",
    "context-limit-reached": "The model context limit has been reached. Reset the dialogue.",
    destroyed: "The model session has been destroyed.",
    "invalid-prompt": "Enter a non-empty question.",
    "not-initialized": "Initialize the model session before asking a question.",
    "not-supported": "The requested language model operation is not supported.",
    "quota-exceeded": "The browser language model quota has been exceeded.",
    "response-in-progress": "Wait for the active response to finish before asking again."
  };
  return new LanguageModelSessionError(code, messages[code], cause === void 0 ? void 0 : { cause });
}

// Resources/Private/TypeScript/ui/NotFoundGate.ts
var NotFoundGate = class {
  constructor(marker) {
    this.marker = marker;
    this.decided = marker === void 0 || marker.length === 0;
  }
  marker;
  buffer = "";
  decided;
  isMarker = false;
  /**
   * Returns the part of the chunk that may be rendered now, which is empty for
   * as long as the reply could still be the marker.
   */
  accept(chunk) {
    if (this.decided) {
      return chunk;
    }
    this.buffer += chunk;
    const candidate = this.buffer.trimStart();
    if (candidate.length === 0) {
      return "";
    }
    const marker = this.marker ?? "";
    if (candidate.length < marker.length) {
      if (marker.startsWith(candidate)) {
        return "";
      }
      return this.release();
    }
    if (candidate.startsWith(marker)) {
      this.decided = true;
      this.isMarker = true;
      this.buffer = "";
      return "";
    }
    return this.release();
  }
  /**
   * Whatever is still withheld once the stream ends — a reply that stopped
   * mid-marker, for instance, which is not the marker and has to be shown.
   */
  flush() {
    if (this.isMarker) {
      return "";
    }
    return this.release();
  }
  get matched() {
    return this.isMarker;
  }
  release() {
    const held = this.buffer;
    this.buffer = "";
    this.decided = true;
    return held;
  }
};

// Resources/Private/TypeScript/rendering/SafeResponseRenderer.ts
var WEB_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
var URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;
var URL_AT_START = /^https?:\/\/[^\s<>"']+/u;
var ALWAYS_TRAILING_PUNCTUATION = /* @__PURE__ */ new Set([".", ",", ";", ":", "!", "?"]);
var CLOSING_PAIRS = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"]
];
var MARKDOWN_LINK = /^\[([^\]\n]*)\]\(([^\s)]*)\)/u;
var WORD_CHARACTER = /[\p{L}\p{N}]/u;
var MAXIMUM_INDENT = 3;
var MAXIMUM_HEADING_MARKS = 6;
var MINIMUM_FENCE_LENGTH = 3;
var MINIMUM_BREAK_LENGTH = 3;
var UNORDERED_MARKERS = "-*+";
var EMPHASIS_MARKERS = "*_";
var BREAK_MARKERS = "-*_";
var HEADING_BASE_LEVEL = 3;
var MAXIMUM_HEADING_LEVEL = 6;
var SafeResponseRenderer = class {
  constructor(output, newTabLabel = "") {
    this.output = output;
    this.newTabLabel = newTabLabel;
  }
  output;
  newTabLabel;
  rawResponse = "";
  /** Add a streaming chunk to the current response and render its complete state. */
  appendChunk(chunk) {
    this.rawResponse += chunk;
    this.render();
  }
  /** Start a new response, discarding both buffered source and rendered nodes. */
  clear() {
    this.rawResponse = "";
    this.output.replaceChildren();
  }
  /** Alias used by controllers that model the operation as a state reset. */
  reset() {
    this.clear();
  }
  render() {
    const sourceDocument = this.output.ownerDocument;
    const fragment = sourceDocument.createDocumentFragment();
    for (const block of parseBlocks(this.rawResponse)) {
      fragment.append(renderBlock(block, sourceDocument, this.newTabLabel));
    }
    this.output.replaceChildren(fragment);
  }
};
function parseBlocks(source) {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index++;
      continue;
    }
    const consumed = consumeBlock(lines, index, blocks);
    index = consumed;
  }
  return blocks;
}
function consumeBlock(lines, start, blocks) {
  const line = lines[start] ?? "";
  if (isFence(line)) {
    return consumeFence(lines, start, blocks);
  }
  if (isThematicBreak(line)) {
    blocks.push({ kind: "break" });
    return start + 1;
  }
  const heading = parseHeading(line);
  if (heading !== null) {
    blocks.push({ kind: "heading", ...heading });
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
function consumeFence(lines, start, blocks) {
  let index = start + 1;
  const code = [];
  while (index < lines.length && !isFence(lines[index] ?? "")) {
    code.push(lines[index] ?? "");
    index++;
  }
  blocks.push({ kind: "code", text: code.join("\n") });
  return index + 1;
}
function consumeList(lines, start, blocks) {
  const ordered = parseListItem(lines[start] ?? "")?.ordered === true;
  const items = [];
  let index = start;
  while (index < lines.length) {
    const candidate = lines[index] ?? "";
    const item = parseListItem(candidate);
    if (item !== null && item.ordered === ordered) {
      items.push(item.content);
      index++;
      continue;
    }
    if (items.length > 0 && candidate.trim() !== "" && !startsBlock(candidate)) {
      items[items.length - 1] += `
${candidate.trim()}`;
      index++;
      continue;
    }
    break;
  }
  blocks.push({ kind: "list", ordered, items });
  return index;
}
function consumeQuote(lines, start, blocks) {
  const quoted = [];
  let index = start;
  while (index < lines.length) {
    const content = parseQuote(lines[index] ?? "");
    if (content === null) {
      break;
    }
    quoted.push(content);
    index++;
  }
  blocks.push({ kind: "quote", lines: quoted });
  return index;
}
function consumeParagraph(lines, start, blocks) {
  const paragraph = [];
  let index = start;
  while (index < lines.length) {
    const candidate = lines[index] ?? "";
    if (candidate.trim() === "" || startsBlock(candidate)) {
      break;
    }
    paragraph.push(candidate);
    index++;
  }
  blocks.push({ kind: "paragraph", lines: paragraph });
  return index;
}
function startsBlock(line) {
  return isFence(line) || isThematicBreak(line) || parseHeading(line) !== null || parseListItem(line) !== null || parseQuote(line) !== null;
}
function contentStart(line) {
  let index = 0;
  while (index < line.length && line[index] === " ") {
    index++;
  }
  return index > MAXIMUM_INDENT ? -1 : index;
}
function repeatedRun(line, from, character) {
  let index = from;
  while (index < line.length && line[index] === character) {
    index++;
  }
  return index - from;
}
function isFence(line) {
  const start = contentStart(line);
  if (start < 0) {
    return false;
  }
  const marker = line[start];
  return (marker === "`" || marker === "~") && repeatedRun(line, start, marker) >= MINIMUM_FENCE_LENGTH;
}
function isThematicBreak(line) {
  const start = contentStart(line);
  if (start < 0) {
    return false;
  }
  const marker = line[start] ?? "";
  if (!BREAK_MARKERS.includes(marker)) {
    return false;
  }
  return repeatedRun(line, start, marker) >= MINIMUM_BREAK_LENGTH && line.slice(start).trim().length === repeatedRun(line, start, marker);
}
function parseHeading(line) {
  const start = contentStart(line);
  if (start < 0 || line[start] !== "#") {
    return null;
  }
  const level = repeatedRun(line, start, "#");
  if (level > MAXIMUM_HEADING_MARKS || !isSpace(line[start + level])) {
    return null;
  }
  let text = line.slice(start + level).trim();
  const trailing = text.length - trimEndRun(text, "#");
  if (trailing > 0 && isSpace(text[text.length - trailing - 1])) {
    text = text.slice(0, text.length - trailing).trim();
  }
  return { level, text };
}
function parseListItem(line) {
  const start = contentStart(line);
  if (start < 0) {
    return null;
  }
  const marker = line[start] ?? "";
  if (UNORDERED_MARKERS.includes(marker) && isSpace(line[start + 1])) {
    return { ordered: false, content: line.slice(start + 2).trim() };
  }
  let digits = start;
  while (digits < line.length && isDigit(line[digits])) {
    digits++;
  }
  const delimiter = line[digits] ?? "";
  if (digits > start && (delimiter === "." || delimiter === ")") && isSpace(line[digits + 1])) {
    return { ordered: true, content: line.slice(digits + 2).trim() };
  }
  return null;
}
function parseQuote(line) {
  const start = contentStart(line);
  if (start < 0 || line[start] !== ">") {
    return null;
  }
  const offset = isSpace(line[start + 1]) ? 2 : 1;
  return line.slice(start + offset);
}
function trimEndRun(value, character) {
  let end = value.length;
  while (end > 0 && value[end - 1] === character) {
    end--;
  }
  return end;
}
function isSpace(character) {
  return character === " " || character === "	";
}
function isDigit(character) {
  return character !== void 0 && character >= "0" && character <= "9";
}
function renderBlock(block, sourceDocument, newTabLabel) {
  switch (block.kind) {
    case "code": {
      const pre = sourceDocument.createElement("pre");
      const code = sourceDocument.createElement("code");
      code.textContent = block.text;
      pre.append(code);
      return pre;
    }
    case "heading": {
      const level = Math.min(HEADING_BASE_LEVEL + block.level - 1, MAXIMUM_HEADING_LEVEL);
      const heading = sourceDocument.createElement(`h${level}`);
      appendInline(heading, block.text, newTabLabel);
      return heading;
    }
    case "list": {
      const list = sourceDocument.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) {
        const entry = sourceDocument.createElement("li");
        appendInline(entry, item, newTabLabel);
        list.append(entry);
      }
      return list;
    }
    case "quote": {
      const quote = sourceDocument.createElement("blockquote");
      const paragraph = sourceDocument.createElement("p");
      appendInline(paragraph, block.lines.join("\n"), newTabLabel);
      quote.append(paragraph);
      return quote;
    }
    case "break":
      return sourceDocument.createElement("hr");
    case "paragraph":
    default: {
      const paragraph = sourceDocument.createElement("p");
      appendInline(paragraph, block.lines.join("\n"), newTabLabel);
      return paragraph;
    }
  }
}
function appendInline(parent, text, newTabLabel) {
  const sourceDocument = parent.ownerDocument;
  let plain = "";
  let index = 0;
  const flushPlain = () => {
    if (plain.length > 0) {
      appendLinkifiedText(parent, plain, newTabLabel);
      plain = "";
    }
  };
  while (index < text.length) {
    const rest = text.slice(index);
    const bareUrl = URL_AT_START.exec(rest);
    if (bareUrl !== null) {
      plain += bareUrl[0];
      index += bareUrl[0].length;
      continue;
    }
    const codeSpan = matchCodeSpan(text, index);
    if (codeSpan !== null) {
      flushPlain();
      const code = sourceDocument.createElement("code");
      code.textContent = codeSpan.content;
      parent.append(code);
      index += codeSpan.length;
      continue;
    }
    const link = MARKDOWN_LINK.exec(rest);
    if (link !== null) {
      const url = parseWebUrl(link[2] ?? "");
      if (url !== null) {
        flushPlain();
        const label = (link[1] ?? "").trim();
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
function matchEmphasis(text, index) {
  const marker = text[index] ?? "";
  if (!EMPHASIS_MARKERS.includes(marker)) {
    return null;
  }
  if (marker === "_" && WORD_CHARACTER.test(text[index - 1] ?? "")) {
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
    tag: doubled ? "strong" : "em",
    content,
    length: delimiter.length * 2 + content.length
  };
}
function matchCodeSpan(text, index) {
  if (text[index] !== "`") {
    return null;
  }
  const closing = text.indexOf("`", index + 1);
  if (closing < 0) {
    return null;
  }
  const content = text.slice(index + 1, closing);
  if (content.length === 0 || content.includes("\n")) {
    return null;
  }
  return { content, length: content.length + 2 };
}
function isBlank(character) {
  return character === void 0 || character === " " || character === "	" || character === "\n";
}
function appendLinkifiedText(parent, text, newTabLabel) {
  const sourceDocument = parent.ownerDocument;
  let textStart = 0;
  for (const match of text.matchAll(URL_CANDIDATE)) {
    const matchStart = match.index;
    const matchedValue = match[0];
    if (matchStart === void 0 || isEmbeddedInAnotherScheme(text, matchStart)) {
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
function appendAnchor(parent, url, label, newTabLabel) {
  const sourceDocument = parent.ownerDocument;
  const anchor = sourceDocument.createElement("a");
  anchor.href = url.href;
  anchor.textContent = label;
  if (url.origin !== sourceDocument.location.origin) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const marker = sourceDocument.createElement("span");
    marker.className = "nr-browser-ai__new-tab-marker";
    marker.setAttribute("aria-hidden", "true");
    anchor.append(marker);
    if (newTabLabel.length > 0) {
      anchor.setAttribute("aria-label", `${label} ${newTabLabel}`);
    }
  }
  parent.append(anchor);
}
function isEmbeddedInAnotherScheme(text, start) {
  return start > 0 && /[\p{L}\p{N}_:/]/u.test(text[start - 1] ?? "");
}
function parseWebUrl(candidate) {
  try {
    const url = new URL(candidate);
    return WEB_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}
function removeTrailingPunctuation(value) {
  let end = value.length;
  while (end > 0) {
    const trailingCharacter = value[end - 1] ?? "";
    if (ALWAYS_TRAILING_PUNCTUATION.has(trailingCharacter)) {
      end--;
      continue;
    }
    const pair = CLOSING_PAIRS.find(([, closing]) => closing === trailingCharacter);
    if (pair !== void 0) {
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
function count(value, character) {
  return [...value].filter((candidate) => candidate === character).length;
}

// Resources/Private/TypeScript/ui/ChatController.ts
var ChatController = class {
  constructor(root, adapter, contextProvider, options) {
    this.root = root;
    this.adapter = adapter;
    this.contextProvider = contextProvider;
    this.options = options;
    const WindowAbortController = root.ownerDocument.defaultView?.AbortController ?? AbortController;
    this.eventListeners = new WindowAbortController();
    this.elements = collectElements(root);
    this.elements.log.replaceChildren();
    this.announce("");
    this.elements.question.value = "";
    this.bindEvents();
    this.setState("checking");
  }
  root;
  adapter;
  contextProvider;
  options;
  elements;
  state = "checking";
  context;
  session;
  abortController;
  eventListeners;
  destroyed = false;
  operation = 0;
  async start() {
    if (this.destroyed) {
      return;
    }
    const operation = ++this.operation;
    this.setState("checking");
    const [availabilityResult, contextResult] = await Promise.allSettled([
      this.adapter.availability(this.options),
      this.contextProvider.getContext(this.options.contextSelector)
    ]);
    if (!this.isCurrent(operation)) {
      return;
    }
    if (contextResult.status === "rejected" && contextResult.reason instanceof PageContextError) {
      this.setState("unavailable");
      return;
    }
    if (availabilityResult.status === "fulfilled" && availabilityResult.value === "unavailable") {
      this.setState("unavailable");
      return;
    }
    if (availabilityResult.status === "rejected") {
      this.setState("error-retryable");
      return;
    }
    if (contextResult.status === "rejected") {
      this.setState(contextResult.reason instanceof PageContextError ? "unavailable" : "error-retryable");
      return;
    }
    this.context = contextResult.value;
    this.applyAvailability(availabilityResult.value);
  }
  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.operation++;
    this.abortController?.abort();
    this.abortController = void 0;
    this.eventListeners.abort();
    this.releaseSession();
  }
  bindEvents() {
    const listenerOptions = { signal: this.eventListeners.signal };
    this.elements.setup.addEventListener("click", () => {
      if (this.state === "downloadable") {
        void this.initializeFromActivation("downloading");
      }
    }, listenerOptions);
    this.elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.state === "ready") {
        this.submitFromActivation();
      }
    }, listenerOptions);
    this.elements.abort.addEventListener("click", () => {
      if (this.state === "streaming") {
        this.abortController?.abort();
      }
    }, listenerOptions);
    this.elements.retry.addEventListener("click", () => {
      if (this.state === "error-retryable") {
        void this.start();
        this.focusStatus();
      }
    }, listenerOptions);
    this.elements.reset.addEventListener("click", () => {
      if (this.state !== "reset-required") {
        return;
      }
      this.abortController?.abort();
      this.session?.destroy();
      this.session = void 0;
      this.elements.log.replaceChildren();
      this.announce("");
      void this.initializeFromActivation("downloading");
    }, listenerOptions);
  }
  applyAvailability(availability) {
    switch (availability) {
      case "available":
        this.setState("ready");
        break;
      case "downloadable":
      case "downloading":
        this.setState("downloadable");
        break;
      case "unavailable":
        this.setState("unavailable");
        break;
    }
  }
  createAndInitialize() {
    const context = this.context;
    if (context === void 0) {
      return Promise.reject(new Error("Page context is not ready."));
    }
    const dialogue = new LanguageModelSession(this.adapter, this.contextProvider, {
      ...this.options,
      onDownloadProgress: (value) => {
        if (this.state === "downloading") {
          this.elements.progress.value = value;
        }
      }
    });
    this.session = dialogue;
    return dialogue.initialize(context).then(() => void 0);
  }
  async initializeFromActivation(activeState) {
    if (this.destroyed || this.session !== void 0) {
      return;
    }
    const operation = ++this.operation;
    this.setState(activeState);
    this.focusStatus();
    try {
      const initialization = this.createAndInitialize();
      await initialization;
      if (this.isCurrent(operation)) {
        this.setState("ready");
        this.focusQuestion();
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.releaseSession();
        this.handleInitializationError(error);
        this.focusForOutcome();
      }
    }
  }
  submitFromActivation() {
    const question = this.elements.question.value.trim();
    if (question.length === 0 || this.destroyed) {
      this.focusQuestion();
      return;
    }
    this.elements.question.value = "";
    this.announce("");
    this.appendMessage("user", question);
    this.setState("streaming");
    this.focusStatus();
    const operation = ++this.operation;
    this.abortController = new AbortController();
    const createsSession = this.session === void 0;
    const initialization = createsSession ? this.createAndInitialize() : Promise.resolve();
    void this.askAfterInitialization(initialization, question, operation, createsSession);
  }
  async askAfterInitialization(initialization, question, operation, createsSession) {
    try {
      await initialization;
    } catch (error) {
      if (this.isCurrent(operation)) {
        if (createsSession) {
          this.releaseSession();
        }
        this.abortController = void 0;
        this.handleInitializationError(error);
      }
      return;
    }
    if (!this.isCurrent(operation)) {
      return;
    }
    try {
      const output = this.appendMessage("assistant", "");
      const renderer = new SafeResponseRenderer(output, this.options.labels.newTab);
      const signal = this.abortController?.signal;
      const gate = new NotFoundGate(this.options.notFoundMarker);
      await this.session?.ask(
        question,
        (chunk) => {
          const renderable = gate.accept(chunk);
          if (renderable.length > 0) {
            renderer.appendChunk(renderable);
          }
        },
        signal
      );
      if (this.isCurrent(operation)) {
        this.completeAnswer(gate, output, renderer);
        this.setState("ready");
        this.focusQuestion();
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.handleDialogueError(error);
        this.focusForOutcome();
      }
    } finally {
      if (this.isCurrent(operation)) {
        this.abortController = void 0;
      }
    }
  }
  /**
   * Settles a finished reply: either the model signalled that the page does not
   * answer the question, in which case the editor's prepared element takes the
   * place of the reply, or the withheld start of a real answer is released and
   * the whole thing announced.
   */
  completeAnswer(gate, output, renderer) {
    const withheld = gate.flush();
    const prepared = this.elements.notFound;
    if (gate.matched && prepared !== void 0) {
      output.remove();
      prepared.hidden = false;
      this.announce(prepared.textContent ?? "");
      return;
    }
    if (withheld.length > 0) {
      renderer.appendChunk(withheld);
    }
    this.announce(output.textContent ?? "");
  }
  appendMessage(role, content) {
    const message = this.root.ownerDocument.createElement("div");
    message.dataset.role = role;
    if (content.length > 0) {
      message.textContent = content;
    }
    this.elements.log.append(message);
    return message;
  }
  handleInitializationError(error) {
    if (error instanceof LanguageModelSessionError) {
      switch (error.code) {
        case "aborted":
          this.setState("ready");
          return;
        case "context-limit-reached":
        case "not-supported":
          this.setState("unavailable");
          return;
      }
    }
    this.setState("error-retryable");
  }
  handleDialogueError(error) {
    if (error instanceof LanguageModelSessionError) {
      switch (error.code) {
        case "aborted":
          this.setState("ready");
          return;
        case "context-limit-reached":
        case "quota-exceeded":
          this.setState("reset-required");
          return;
        case "not-supported":
          this.setState("unavailable");
          return;
      }
    }
    this.setState("error-retryable");
  }
  /**
   * Publishes the completed answer to the polite live region. The streaming log
   * carries no live region, so partial chunks are never announced.
   */
  announce(answer) {
    this.elements.announcement.textContent = answer.trim();
  }
  releaseSession() {
    this.session?.destroy();
    this.session = void 0;
  }
  setState(state) {
    if (state === "unavailable") {
      this.releaseSession();
    }
    this.state = state;
    this.root.dataset.state = state;
    this.elements.status.textContent = this.options.labels[state];
    if (state === "downloading") {
      this.elements.progress.value = 0;
    } else if (state === "ready") {
      this.elements.progress.value = 1;
    }
    const unavailable = state === "unavailable";
    this.elements.fallback.hidden = !unavailable;
    this.elements.assistant.hidden = unavailable;
    this.elements.setup.hidden = state !== "downloadable";
    this.elements.progress.hidden = state !== "downloading";
    this.elements.form.hidden = !["ready", "streaming"].includes(state);
    this.elements.abort.hidden = state !== "streaming";
    this.elements.reset.hidden = state !== "reset-required";
    this.elements.retry.hidden = state !== "error-retryable";
    const busy = state !== "ready";
    this.elements.question.readOnly = busy;
    this.elements.question.setAttribute("aria-readonly", String(busy));
    this.elements.submit.setAttribute("aria-disabled", String(busy));
    this.elements.setup.setAttribute("aria-disabled", String(state !== "downloadable"));
    this.elements.abort.setAttribute("aria-disabled", String(state !== "streaming"));
    this.elements.reset.setAttribute("aria-disabled", String(state !== "reset-required"));
    this.elements.retry.setAttribute("aria-disabled", String(state !== "error-retryable"));
  }
  focusForOutcome() {
    if (this.state === "ready") {
      this.focusQuestion();
    } else {
      this.focusStatus();
    }
  }
  focusQuestion() {
    this.elements.question.focus({ preventScroll: true });
  }
  focusStatus() {
    this.elements.status.focus({ preventScroll: true });
  }
  isCurrent(operation) {
    return !this.destroyed && operation === this.operation;
  }
};
function showPermanentFallback(root) {
  root.dataset.state = "unavailable";
  const fallback = root.querySelector("[data-nr-browser-ai-fallback]");
  const assistant = root.querySelector("[data-nr-browser-ai-assistant]");
  if (fallback !== null) {
    fallback.hidden = false;
  }
  if (assistant !== null) {
    assistant.hidden = true;
  }
}
function collectElements(root) {
  return {
    assistant: required(root, "[data-nr-browser-ai-assistant]", HTMLElement),
    fallback: required(root, "[data-nr-browser-ai-fallback]", HTMLElement),
    // Optional: present only when the editor picked a content element for the
    // case where the page does not answer the question.
    notFound: optional(root, "[data-nr-browser-ai-not-found]"),
    status: required(root, "[data-nr-browser-ai-status]", HTMLElement),
    setup: required(root, "[data-nr-browser-ai-setup]", HTMLButtonElement),
    progress: required(root, "[data-nr-browser-ai-progress]", HTMLProgressElement),
    log: required(root, "[data-nr-browser-ai-log]", HTMLElement),
    announcement: required(root, "[data-nr-browser-ai-announcement]", HTMLElement),
    form: required(root, "[data-nr-browser-ai-form]", HTMLFormElement),
    question: required(root, "[data-nr-browser-ai-question]", HTMLInputElement),
    submit: required(root, "[data-nr-browser-ai-submit]", HTMLButtonElement),
    abort: required(root, "[data-nr-browser-ai-abort]", HTMLButtonElement),
    reset: required(root, "[data-nr-browser-ai-reset]", HTMLButtonElement),
    retry: required(root, "[data-nr-browser-ai-retry]", HTMLButtonElement)
  };
}
function optional(root, selector) {
  const element = root.querySelector(selector);
  return element instanceof HTMLElement ? element : void 0;
}
function required(root, selector, constructor) {
  const element = root.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Required assistant element is missing: ${selector}`);
  }
  return element;
}

// Resources/Private/TypeScript/form/FormSchemaSource.ts
var SUPPORTED_TYPES = /* @__PURE__ */ new Set(["string", "number", "boolean", "array"]);
function readFormSchema(serialized) {
  if (serialized.trim().length === 0) {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return void 0;
  }
  if (!isRecord(parsed) || parsed["type"] !== "object" || !isRecord(parsed["properties"])) {
    return void 0;
  }
  const properties = {};
  for (const [name, property] of Object.entries(parsed["properties"])) {
    const checked = readProperty(property);
    if (checked === void 0) {
      return void 0;
    }
    properties[name] = checked;
  }
  if (Object.keys(properties).length === 0) {
    return void 0;
  }
  const required2 = parsed["required"];
  return {
    type: "object",
    properties,
    required: isStringArray(required2) ? required2 : [],
    additionalProperties: parsed["additionalProperties"] === true
  };
}
function readProperty(property) {
  if (!isRecord(property) || typeof property["type"] !== "string") {
    return void 0;
  }
  if (!SUPPORTED_TYPES.has(property["type"])) {
    return void 0;
  }
  if (property["type"] === "array" && !isStringItems(property["items"])) {
    return void 0;
  }
  return property;
}
function isStringItems(items) {
  return isRecord(items) && items["type"] === "string";
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Resources/Private/TypeScript/form/FormFiller.ts
var FormFiller = class {
  constructor(form) {
    this.form = form;
  }
  form;
  /**
   * @return the identifiers that had no control to write into
   */
  fill(schema, values) {
    const missing = [];
    for (const [name, value] of Object.entries(values)) {
      const property = schema.properties[name];
      const controls = this.controlsFor(name);
      if (property === void 0 || controls.length === 0) {
        missing.push(name);
        continue;
      }
      if (property.type === "array") {
        this.setGroup(controls, Array.isArray(value) ? value : []);
      } else if (property.type === "boolean") {
        this.setBoolean(controls, value === true);
      } else {
        this.setSingle(controls, String(value));
      }
    }
    return missing;
  }
  read(schema) {
    const values = {};
    for (const [name, property] of Object.entries(schema.properties)) {
      const controls = this.controlsFor(name);
      if (controls.length === 0) {
        continue;
      }
      const value = this.readValue(property.type, controls);
      if (value !== void 0) {
        values[name] = value;
      }
    }
    return values;
  }
  readValue(type, controls) {
    if (type === "array") {
      return this.readGroup(controls);
    }
    if (type === "boolean") {
      return controls.some((control) => isCheckbox(control) && control.checked);
    }
    const first = controls[0];
    if (first === void 0) {
      return void 0;
    }
    if (isSelect(first)) {
      return first.value;
    }
    if (type === "number") {
      const value = Number(first.value);
      return Number.isFinite(value) ? value : void 0;
    }
    return first.value;
  }
  readGroup(controls) {
    const values = [];
    for (const control of controls) {
      if (isCheckbox(control) && control.checked) {
        values.push(control.value);
      } else if (isSelect(control)) {
        for (const option of Array.from(control.selectedOptions)) {
          values.push(option.value);
        }
      }
    }
    return values;
  }
  setGroup(controls, values) {
    const wanted = new Set(values.map((value) => String(value)));
    for (const control of controls) {
      if (isCheckbox(control)) {
        control.checked = wanted.has(control.value);
        notify(control);
      } else if (isSelect(control)) {
        for (const option of Array.from(control.options)) {
          option.selected = wanted.has(option.value);
        }
        notify(control);
      }
    }
  }
  setBoolean(controls, checked) {
    for (const control of controls) {
      if (isCheckbox(control)) {
        control.checked = checked;
        notify(control);
      }
    }
  }
  setSingle(controls, value) {
    const control = controls[0];
    if (control === void 0) {
      return;
    }
    if (isSelect(control) && !Array.from(control.options).some((option) => option.value === value)) {
      return;
    }
    control.value = value;
    notify(control);
  }
  controlsFor(identifier) {
    const controls = [];
    for (const element of Array.from(this.form.elements)) {
      if (!isControl(element) || element.type === "hidden") {
        continue;
      }
      if (identifierOf(element.name) === identifier) {
        controls.push(element);
      }
    }
    return controls;
  }
};
function identifierOf(name) {
  const trimmed = name.endsWith("[]") ? name.slice(0, -2) : name;
  const end = trimmed.lastIndexOf("]");
  if (end < 0) {
    return void 0;
  }
  const start = trimmed.lastIndexOf("[", end);
  if (start < 0) {
    return void 0;
  }
  const identifier = trimmed.slice(start + 1, end);
  return identifier.length > 0 ? identifier : void 0;
}
function isControl(element) {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}
function isCheckbox(control) {
  return control instanceof HTMLInputElement && control.type === "checkbox";
}
function isSelect(control) {
  return control instanceof HTMLSelectElement;
}
function notify(control) {
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

// Resources/Private/TypeScript/form/GroupRoles.ts
function correctCheckboxGroupRoles(form) {
  let corrected = 0;
  for (const group of form.querySelectorAll('[role="radiogroup"]')) {
    if (group.querySelector('input[type="checkbox"]') === null) {
      continue;
    }
    group.setAttribute("role", "group");
    corrected++;
  }
  return corrected;
}

// Resources/Private/TypeScript/query/OpenMeteoQuery.ts
var GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
var FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
var SUMMARY_ROW_LIMIT = 24;
var BLOCKS = [
  ["current", "currentVariables"],
  ["daily", "dailyVariables"],
  ["hourly", "hourlyVariables"]
];
var SCALAR_PARAMETERS = [
  ["models", "weatherModel"],
  ["temperature_unit", "temperatureUnit"],
  ["wind_speed_unit", "windSpeedUnit"],
  ["precipitation_unit", "precipitationUnit"],
  ["timezone", "timezone"],
  ["cell_selection", "cellSelection"],
  ["past_days", "pastDays"],
  ["forecast_days", "forecastDays"]
];
var OpenMeteoQuery = class {
  constructor(language, fetchResource = (input, init) => fetch(input, init)) {
    this.language = language;
    this.fetchResource = fetchResource;
  }
  language;
  fetchResource;
  async run(values, signal) {
    const place = String(values["place"] ?? "").trim();
    if (place.length === 0) {
      return failure("unresolved-place", "No place was given, so nothing could be looked up.");
    }
    let resolved;
    try {
      resolved = await this.resolvePlace(place, signal);
    } catch (error) {
      return this.transportFailure(error);
    }
    if (resolved === void 0) {
      return failure(
        "unresolved-place",
        `No place named "${place}" was found. Try a larger nearby place, or add the country.`
      );
    }
    let payload;
    try {
      payload = await this.requestForecast(resolved, values, signal);
    } catch (error) {
      return this.transportFailure(error);
    }
    const blocks = this.blocksFrom(payload, values);
    return {
      ok: true,
      summary: this.summarize(resolved, blocks),
      place: resolved,
      blocks
    };
  }
  async resolvePlace(place, signal) {
    const url = new URL(GEOCODING_URL);
    url.searchParams.set("name", place);
    url.searchParams.set("count", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("language", this.language);
    const payload = await this.requestJson(url, signal);
    const results = payload["results"];
    if (!Array.isArray(results) || results.length === 0) {
      return void 0;
    }
    const first = results[0];
    const latitude = Number(first["latitude"]);
    const longitude = Number(first["longitude"]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return void 0;
    }
    return {
      name: String(first["name"] ?? place),
      country: String(first["country"] ?? ""),
      latitude,
      longitude,
      timezone: String(first["timezone"] ?? "")
    };
  }
  async requestForecast(place, values, signal) {
    const url = new URL(FORECAST_URL);
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    for (const [parameter, field] of BLOCKS) {
      const selected = values[field];
      if (Array.isArray(selected) && selected.length > 0) {
        url.searchParams.set(parameter, selected.join(","));
      }
    }
    for (const [parameter, field] of SCALAR_PARAMETERS) {
      const value = values[field];
      if (value !== void 0 && value !== "" && !Array.isArray(value)) {
        url.searchParams.set(parameter, String(value));
      }
    }
    return this.requestJson(url, signal);
  }
  async requestJson(url, signal) {
    const response = await this.fetchResource(url.toString(), { signal });
    if (response.status === 429) {
      throw new RateLimited();
    }
    if (!response.ok) {
      throw new Error(`The data source answered with status ${response.status}.`);
    }
    const payload = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new Error("The data source answered with something other than an object.");
    }
    return payload;
  }
  transportFailure(error) {
    if (error instanceof RateLimited) {
      return failure("rate-limited", "The data source is refusing further requests for the moment.");
    }
    if (error instanceof Error && error.name === "AbortError") {
      return failure("failed", "The query was stopped.");
    }
    const reason = error instanceof Error ? error.message : "The data source could not be reached.";
    return failure("failed", reason);
  }
  blocksFrom(payload, values) {
    const blocks = [];
    for (const [key, field] of BLOCKS) {
      const requested = values[field];
      if (!Array.isArray(requested) || requested.length === 0) {
        continue;
      }
      const data = payload[key];
      const units = payload[`${key}_units`];
      if (typeof data !== "object" || data === null) {
        continue;
      }
      const block = this.block(key, requested, data, asRecord(units));
      if (block.columns.length > 0) {
        blocks.push(block);
      }
    }
    return blocks;
  }
  block(key, requested, data, units) {
    const time = data["time"];
    const times = Array.isArray(time) ? time.map((entry) => String(entry)) : [String(time ?? "")];
    const columns = [];
    for (const name of requested) {
      const values = data[name];
      if (values === void 0) {
        continue;
      }
      columns.push({
        name,
        unit: String(units[name] ?? ""),
        values: Array.isArray(values) ? values.map(readCell) : [readCell(values)]
      });
    }
    return { key, times, columns };
  }
  /**
   * The caller is a model with a small context, so the summary states the
   * place once and then one line per point in time, with units named in the
   * header rather than repeated on every value.
   */
  summarize(place, blocks) {
    const where = place.country === "" ? place.name : `${place.name}, ${place.country}`;
    const lines = [
      `Weather for ${where} (${place.latitude.toFixed(2)}, ${place.longitude.toFixed(2)}, ${place.timezone}).`
    ];
    for (const block of blocks) {
      const header = block.columns.map((column) => column.unit === "" ? column.name : `${column.name} in ${column.unit}`).join(", ");
      lines.push("", `${block.key}: time, ${header}`);
      const rows = Math.min(block.times.length, SUMMARY_ROW_LIMIT);
      for (let row = 0; row < rows; row++) {
        const cells = block.columns.map((column) => formatCell(column.values[row]));
        lines.push([block.times[row] ?? "", ...cells].join(", "));
      }
      if (block.times.length > rows) {
        lines.push(`(${block.times.length - rows} further rows are shown on the page.)`);
      }
    }
    return lines.join("\n");
  }
};
var RateLimited = class extends Error {
  constructor() {
    super("The data source is rate limiting.");
    this.name = "RateLimited";
  }
};
function failure(reason, summary) {
  return { ok: false, failure: reason, summary, blocks: [] };
}
function readCell(value) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return null;
}
function formatCell(value) {
  if (value === null || value === void 0) {
    return "\u2014";
  }
  return String(value);
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}

// Resources/Private/TypeScript/result/ResultRenderer.ts
var ResultRenderer = class {
  constructor(output, labels2) {
    this.output = output;
    this.labels = labels2;
  }
  output;
  labels;
  clear() {
    this.output.replaceChildren();
    this.output.hidden = true;
  }
  render(outcome) {
    this.output.replaceChildren();
    if (!outcome.ok || outcome.blocks.length === 0) {
      this.output.hidden = true;
      return;
    }
    const heading = document.createElement("h3");
    heading.className = "nr-browser-ai-form__result-title";
    heading.textContent = this.labels.caption;
    this.output.append(heading);
    if (outcome.place !== void 0) {
      const place = document.createElement("p");
      place.className = "nr-browser-ai-form__result-place";
      const where = outcome.place.country === "" ? outcome.place.name : `${outcome.place.name}, ${outcome.place.country}`;
      place.textContent = `${this.labels.place}: ${where}`;
      this.output.append(place);
    }
    for (const block of outcome.blocks) {
      this.output.append(this.table(block));
    }
    this.output.hidden = false;
  }
  table(block) {
    const scroller = document.createElement("div");
    scroller.className = "nr-browser-ai-form__table-scroller";
    const table = document.createElement("table");
    table.className = "nr-browser-ai-form__table";
    const caption = document.createElement("caption");
    caption.textContent = block.key;
    table.append(caption);
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(this.headerCell(this.labels.time));
    for (const column of block.columns) {
      headRow.append(this.headerCell(
        column.unit === "" ? column.name : `${column.name} (${column.unit})`
      ));
    }
    head.append(headRow);
    table.append(head);
    const body = document.createElement("tbody");
    for (let row = 0; row < block.times.length; row++) {
      const bodyRow = document.createElement("tr");
      bodyRow.append(this.headerCell(block.times[row] ?? "", "row"));
      for (const column of block.columns) {
        const cell = document.createElement("td");
        const value = column.values[row];
        cell.textContent = value === null || value === void 0 ? "\u2014" : String(value);
        bodyRow.append(cell);
      }
      body.append(bodyRow);
    }
    table.append(body);
    scroller.append(table);
    return scroller;
  }
  headerCell(text, scope = "col") {
    const cell = document.createElement("th");
    cell.scope = scope;
    cell.textContent = text;
    return cell;
  }
};

// Resources/Private/TypeScript/form/ArgumentValidator.ts
function validateArguments(schema, input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { accepted: false, reason: "The arguments are not an object." };
  }
  const provided = input;
  const values = {};
  for (const [name, raw] of Object.entries(provided)) {
    if (raw === void 0 || raw === null) {
      continue;
    }
    const property = schema.properties[name];
    if (property === void 0) {
      return { accepted: false, reason: `The form has no field named "${name}".` };
    }
    const value = coerce(property, raw);
    if (value === void 0) {
      return { accepted: false, reason: `The value for "${name}" does not fit that field.` };
    }
    values[name] = value;
  }
  for (const name of schema.required ?? []) {
    const value = values[name];
    if (value === void 0 || typeof value === "string" && value.trim().length === 0) {
      return { accepted: false, reason: `"${name}" is required and was not supplied.` };
    }
  }
  return { accepted: true, values };
}
function coerce(property, raw) {
  switch (property.type) {
    case "string":
      return coerceString(property.enum, raw);
    case "number":
      return coerceNumber(property.minimum, property.maximum, raw);
    case "boolean":
      return coerceBoolean(raw);
    case "array":
      return coerceArray(property.items.enum, raw);
  }
}
function coerceString(allowed, raw) {
  if (typeof raw !== "string") {
    return void 0;
  }
  if (allowed !== void 0 && !allowed.includes(raw)) {
    return void 0;
  }
  return raw;
}
function coerceNumber(minimum, maximum, raw) {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) {
    return void 0;
  }
  let clamped = value;
  if (minimum !== void 0) {
    clamped = Math.max(clamped, minimum);
  }
  if (maximum !== void 0) {
    clamped = Math.min(clamped, maximum);
  }
  return clamped;
}
function coerceBoolean(raw) {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw === "true" || raw === "1") {
    return true;
  }
  if (raw === "false" || raw === "0") {
    return false;
  }
  return void 0;
}
function coerceArray(allowed, raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  const values = [];
  for (const entry of entries) {
    const value = coerceString(allowed, entry);
    if (value === void 0) {
      return void 0;
    }
    if (!values.includes(value)) {
      values.push(value);
    }
  }
  return values;
}

// Resources/Private/TypeScript/tools/FormTool.ts
var FormTool = class {
  constructor(name, description, inputSchema, filler, action, observer) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.filler = filler;
    this.action = action;
    this.observer = observer;
  }
  name;
  description;
  inputSchema;
  filler;
  action;
  observer;
  async execute(input, signal) {
    this.observer.onCall(input);
    const validation = validateArguments(this.inputSchema, input);
    if (!validation.accepted) {
      this.observer.onRejected(validation.reason);
      return `The arguments were not applied: ${validation.reason}`;
    }
    this.filler.fill(this.inputSchema, validation.values);
    const values = this.filler.read(this.inputSchema);
    this.observer.onFilled(values);
    const outcome = await this.action.run(values, signal);
    this.observer.onOutcome(outcome);
    return outcome.summary;
  }
  /** Run the form as it currently stands, without a model in the loop. */
  async rerun(signal) {
    const values = this.filler.read(this.inputSchema);
    this.observer.onFilled(values);
    const outcome = await this.action.run(values, signal);
    this.observer.onOutcome(outcome);
    return outcome;
  }
};

// Resources/Private/TypeScript/tools/LocalToolLoop.ts
var LocalToolLoopError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "LocalToolLoopError";
  }
  code;
};
var LocalToolLoop = class {
  constructor(session, tool) {
    this.session = session;
    this.tool = tool;
  }
  session;
  tool;
  async run(request, signal) {
    const trimmed = request.trim();
    if (trimmed.length === 0) {
      throw new LocalToolLoopError("empty-request", "Enter a request.");
    }
    const output = await this.session.prompt(trimmed, {
      responseConstraint: this.tool.inputSchema,
      signal
    });
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new LocalToolLoopError(
        "unusable-output",
        "The model did not return arguments that could be read."
      );
    }
    return this.tool.execute(parsed, signal);
  }
};

// Resources/Private/TypeScript/tools/ModelContextBinding.ts
function bindModelContext(tool, signal, hosts = [
  typeof document === "undefined" ? void 0 : document,
  typeof navigator === "undefined" ? void 0 : navigator
]) {
  for (const host of hosts) {
    const context = asModelContext(host?.modelContext);
    if (context === void 0) {
      continue;
    }
    try {
      context.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          execute: (input) => tool.execute(input),
          annotations: { readOnlyHint: false, untrustedContentHint: true }
        },
        { signal }
      );
      return true;
    } catch {
    }
  }
  return false;
}
function asModelContext(candidate) {
  if (typeof candidate !== "object" || candidate === null) {
    return void 0;
  }
  const registerTool = candidate.registerTool;
  return typeof registerTool === "function" ? candidate : void 0;
}

// Resources/Private/TypeScript/ui/FormAssistantController.ts
var LABEL_KEYS = {
  checking: "labelChecking",
  downloadable: "labelDownloadable",
  downloading: "labelDownloading",
  ready: "labelReady",
  deriving: "labelDeriving",
  querying: "labelQuerying",
  filled: "labelFilled",
  rejected: "labelRejected",
  unresolvedPlace: "labelUnresolvedPlace",
  queryFailed: "labelQueryFailed",
  rateLimited: "labelRateLimited",
  errorRetryable: "labelErrorRetryable",
  unavailable: "labelUnavailable"
};
var defaultActionFactory = (action, language) => action === "openMeteo" ? new OpenMeteoQuery(language) : void 0;
var FormAssistantController = class _FormAssistantController {
  constructor(root, form, schema, action, adapter) {
    this.root = root;
    this.form = form;
    this.adapter = adapter;
    this.schema = schema;
    this.filler = new FormFiller(form);
    this.renderer = new ResultRenderer(this.element("result"), {
      caption: this.label("labelResultCaption"),
      place: this.label("labelResultPlace"),
      time: this.label("labelResultTime")
    });
    this.tool = new FormTool(
      root.dataset["toolName"] ?? "",
      root.dataset["toolDescription"] ?? "",
      schema,
      this.filler,
      action,
      this
    );
  }
  root;
  form;
  adapter;
  lifetime = new AbortController();
  renderer;
  filler;
  tool;
  schema;
  session;
  running = false;
  /**
   * @return undefined when this root carries no usable schema or no known
   *         action, in which case the plugin stays a plain form
   */
  static create(root, adapter, actionFactory = defaultActionFactory) {
    const form = root.querySelector("form");
    const schema = readFormSchema(root.dataset["formSchema"] ?? "");
    const action = actionFactory(root.dataset["action"] ?? "", pageLanguage());
    if (form === null || schema === void 0 || action === void 0) {
      return void 0;
    }
    if ((root.dataset["toolName"] ?? "") === "") {
      return void 0;
    }
    const controller = new _FormAssistantController(root, form, schema, action, adapter);
    controller.start();
    return controller;
  }
  destroy() {
    this.lifetime.abort();
    this.session?.destroy();
    this.session = void 0;
  }
  onCall(input) {
    const display = this.root.querySelector("[data-nr-browser-ai-form-call]");
    if (display !== null) {
      display.textContent = JSON.stringify(input, null, 2);
    }
  }
  onRejected(reason) {
    this.setStatus("rejected", reason);
  }
  onFilled(_values) {
    this.setStatus("querying");
  }
  onOutcome(outcome) {
    if (outcome.ok) {
      this.renderer.render(outcome);
      this.setStatus("filled");
      return;
    }
    this.renderer.clear();
    if (outcome.failure === "unresolved-place") {
      this.setStatus("unresolvedPlace", outcome.summary);
    } else if (outcome.failure === "rate-limited") {
      this.setStatus("rateLimited", outcome.summary);
    } else {
      this.setStatus("queryFailed", outcome.summary);
    }
  }
  start() {
    correctCheckboxGroupRoles(this.form);
    bindModelContext(this.tool, this.lifetime.signal);
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.rerun();
    }, { signal: this.lifetime.signal });
    this.element("setup").addEventListener("click", () => {
      void this.prepareModel();
    }, { signal: this.lifetime.signal });
    this.element("submit").addEventListener("click", () => {
      void this.derive();
    }, { signal: this.lifetime.signal });
    this.requestField().addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.derive();
      }
    }, { signal: this.lifetime.signal });
    void this.checkAvailability();
  }
  async checkAvailability() {
    this.reveal();
    this.setStatus("checking");
    const availability = await this.adapter.availability(this.modelOptions());
    if (availability === "unavailable") {
      this.setStatus("unavailable");
      this.showRequestRow(false);
      this.showSetup(false);
      return;
    }
    if (availability === "available") {
      this.setStatus("ready");
      this.showRequestRow(true);
      this.showSetup(false);
      return;
    }
    this.setStatus("downloadable");
    this.showRequestRow(false);
    this.showSetup(true);
  }
  /**
   * Creating a session downloads the model on first use, which the browser
   * only permits from a user gesture. That is why it happens here and on the
   * first request, never during page load.
   */
  async prepareModel() {
    if (this.session !== void 0) {
      return this.session;
    }
    const progress = this.root.querySelector("[data-nr-browser-ai-form-progress]");
    this.setStatus("downloading");
    try {
      this.session = await this.adapter.create({
        ...this.modelOptions(),
        onDownloadProgress: (value) => {
          if (progress !== null) {
            progress.value = value;
          }
        }
      });
    } catch {
      this.setStatus("errorRetryable");
      return void 0;
    }
    this.setStatus("ready");
    this.showSetup(false);
    this.showRequestRow(true);
    return this.session;
  }
  async derive() {
    if (this.running) {
      return;
    }
    const request = this.requestField().value;
    if (request.trim().length === 0) {
      return;
    }
    const session = await this.prepareModel();
    if (session === void 0) {
      return;
    }
    this.running = true;
    this.setStatus("deriving");
    try {
      await new LocalToolLoop(session, this.tool).run(request, this.lifetime.signal);
    } catch (error) {
      this.setStatus(
        error instanceof LocalToolLoopError ? "rejected" : "errorRetryable",
        error instanceof Error ? error.message : void 0
      );
    } finally {
      this.running = false;
    }
  }
  /** Runs the form as it stands, after a manual correction or without a model. */
  async rerun() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.tool.rerun(this.lifetime.signal);
    } finally {
      this.running = false;
    }
  }
  modelOptions() {
    const language = pageLanguage();
    const instruction = (this.root.dataset["supplementalInstruction"] ?? "").trim();
    const systemPrompt = [this.root.dataset["systemPrompt"] ?? "", instruction].map((part) => part.trim()).filter((part) => part.length > 0).join("\n\n");
    return {
      systemPrompt,
      inputLanguages: language === "en" ? ["en"] : ["en", language],
      outputLanguages: ["en"]
    };
  }
  reveal() {
    this.element("assistant").hidden = false;
  }
  showRequestRow(visible) {
    const row = this.root.querySelector(".nr-browser-ai-form__request");
    if (row !== null) {
      row.hidden = !visible;
    }
  }
  showSetup(visible) {
    this.element("setup").hidden = !visible;
    const progress = this.root.querySelector("[data-nr-browser-ai-form-progress]");
    if (progress !== null) {
      progress.hidden = !visible;
    }
  }
  setStatus(status, detail) {
    this.root.dataset["state"] = status;
    const element = this.element("status");
    const label = this.label(LABEL_KEYS[status]);
    element.textContent = detail === void 0 || detail === "" ? label : `${label} (${detail})`;
    const announcement = this.root.querySelector("[data-nr-browser-ai-form-announcement]");
    if (announcement !== null && (status === "filled" || status === "rejected")) {
      announcement.textContent = element.textContent;
    }
  }
  requestField() {
    const field = this.root.querySelector("[data-nr-browser-ai-form-request]");
    if (field === null) {
      throw new Error("The plugin markup has no request field.");
    }
    return field;
  }
  element(name) {
    const element = this.root.querySelector(`[data-nr-browser-ai-form-${name}]`);
    if (element === null) {
      throw new Error(`The plugin markup has no ${name} element.`);
    }
    return element;
  }
  label(key) {
    return this.root.dataset[key] ?? "";
  }
};
function pageLanguage() {
  const tag = document.documentElement.lang.trim().toLowerCase().split(/[-_]/u)[0];
  return tag === void 0 || tag === "" ? "en" : tag;
}

// Resources/Private/TypeScript/Assistant.ts
var SUPPORTED_LANGUAGES = /* @__PURE__ */ new Set(["de", "en", "es", "fr", "ja"]);
function bootstrapAssistants(sourceDocument = document, adapterFactory = () => new BrowserLanguageModelAdapter(), providerFactory = () => new DomPageContextProvider(sourceDocument)) {
  const controllers = [];
  for (const root of sourceDocument.querySelectorAll("[data-nr-browser-ai-root]")) {
    try {
      const options = configuration(root, sourceDocument);
      const controller = new ChatController(
        root,
        adapterFactory(root),
        providerFactory(root),
        options
      );
      controllers.push(controller);
      void controller.start();
    } catch {
      showPermanentFallback(root);
    }
  }
  return controllers;
}
function bootstrapFormAssistants(sourceDocument = document, adapterFactory = () => new BrowserLanguageModelAdapter()) {
  const controllers = [];
  for (const root of sourceDocument.querySelectorAll("[data-nr-browser-ai-form-root]")) {
    const controller = FormAssistantController.create(root, adapterFactory(root));
    if (controller !== void 0) {
      controllers.push(controller);
    }
  }
  return controllers;
}
function installAssistantLifecycle(sourceDocument = document, adapterFactory = () => new BrowserLanguageModelAdapter(), providerFactory = () => new DomPageContextProvider(sourceDocument)) {
  let controllers = bootstrapAssistants(sourceDocument, adapterFactory, providerFactory);
  let formControllers = bootstrapFormAssistants(sourceDocument, adapterFactory);
  const WindowAbortController = sourceDocument.defaultView?.AbortController ?? AbortController;
  const lifecycleEvents = new WindowAbortController();
  const destroyControllers = () => {
    controllers.forEach((controller) => controller.destroy());
    controllers = [];
    formControllers.forEach((controller) => controller.destroy());
    formControllers = [];
  };
  sourceDocument.defaultView?.addEventListener("pagehide", (event) => {
    destroyControllers();
    if (!isPersistedPageTransition(event)) {
      lifecycleEvents.abort();
    }
  }, { signal: lifecycleEvents.signal });
  sourceDocument.defaultView?.addEventListener("pageshow", (event) => {
    if (isPersistedPageTransition(event)) {
      destroyControllers();
      controllers = bootstrapAssistants(sourceDocument, adapterFactory, providerFactory);
      formControllers = bootstrapFormAssistants(sourceDocument, adapterFactory);
    }
  }, { signal: lifecycleEvents.signal });
  return () => {
    lifecycleEvents.abort();
    destroyControllers();
  };
}
function isPersistedPageTransition(event) {
  return "persisted" in event && event.persisted === true;
}
function configuration(root, sourceDocument) {
  const contextSelector = root.dataset.contextSelector?.trim() ?? "";
  const systemPrompt = root.dataset.systemPrompt?.trim() ?? "";
  const supplementalInstruction = root.dataset.supplementalInstruction?.trim() ?? "";
  const notFoundMarker = root.dataset.notFoundMarker?.trim() ?? "";
  const contextUsageLimit = Number(root.dataset.contextUsageLimit);
  if (contextSelector.length === 0) {
    throw new Error("Missing context selector.");
  }
  try {
    sourceDocument.querySelector(contextSelector);
  } catch {
    throw new Error("Invalid context selector.");
  }
  if (!Number.isFinite(contextUsageLimit) || contextUsageLimit <= 0 || contextUsageLimit > 1) {
    throw new Error("Invalid context usage limit.");
  }
  if (systemPrompt.length === 0) {
    throw new Error("Missing system prompt.");
  }
  const pageLanguage2 = normalizeLanguage(sourceDocument.documentElement.lang);
  const outputLanguage = pageLanguage2 ?? "en";
  const inputLanguages = outputLanguage === "en" ? ["en"] : ["en", outputLanguage];
  return {
    contextSelector,
    contextUsageLimit,
    systemPrompt,
    supplementalInstruction,
    notFoundMarker,
    inputLanguages,
    outputLanguages: [outputLanguage],
    labels: labels(root)
  };
}
var UI_STATES = [
  "checking",
  "downloadable",
  "downloading",
  "ready",
  "streaming",
  "reset-required",
  "error-retryable",
  "unavailable"
];
function labels(root) {
  const result = { newTab: requiredLabel(root, "labelNewTab") };
  for (const state of UI_STATES) {
    const datasetKey = `label${state.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join("")}`;
    result[state] = requiredLabel(root, datasetKey);
  }
  return result;
}
function requiredLabel(root, key) {
  const label = root.dataset[key]?.trim() ?? "";
  if (label.length === 0) {
    throw new Error(`Missing UI label: ${key}`);
  }
  return label;
}
function normalizeLanguage(languageTag) {
  const primary = languageTag.trim().toLowerCase().split(/[-_]/u)[0];
  return primary !== void 0 && SUPPORTED_LANGUAGES.has(primary) ? primary : void 0;
}
if (document.querySelector("[data-nr-browser-ai-root], [data-nr-browser-ai-form-root]") !== null) {
  installAssistantLifecycle();
}
export {
  bootstrapAssistants,
  bootstrapFormAssistants,
  installAssistantLifecycle
};
