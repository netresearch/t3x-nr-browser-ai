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
        options.supplementalInstruction ?? ""
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
function combineInstructions(systemPrompt, supplementalInstruction) {
  const administratorInstruction = systemPrompt.trim();
  const editorInstruction = supplementalInstruction.trim();
  if (editorInstruction.length === 0) {
    return administratorInstruction;
  }
  return `${administratorInstruction}

Additional editor instruction:
${editorInstruction}`;
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
      await this.session?.ask(
        question,
        (chunk) => renderer.appendChunk(chunk),
        signal
      );
      if (this.isCurrent(operation)) {
        this.announce(output.textContent ?? "");
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
function required(root, selector, constructor) {
  const element = root.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Required assistant element is missing: ${selector}`);
  }
  return element;
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
function installAssistantLifecycle(sourceDocument = document, adapterFactory = () => new BrowserLanguageModelAdapter(), providerFactory = () => new DomPageContextProvider(sourceDocument)) {
  let controllers = bootstrapAssistants(sourceDocument, adapterFactory, providerFactory);
  const WindowAbortController = sourceDocument.defaultView?.AbortController ?? AbortController;
  const lifecycleEvents = new WindowAbortController();
  const destroyControllers = () => {
    controllers.forEach((controller) => controller.destroy());
    controllers = [];
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
  const pageLanguage = normalizeLanguage(sourceDocument.documentElement.lang);
  const outputLanguage = pageLanguage ?? "en";
  const inputLanguages = outputLanguage === "en" ? ["en"] : ["en", outputLanguage];
  return {
    contextSelector,
    contextUsageLimit,
    systemPrompt,
    supplementalInstruction,
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
if (document.querySelector("[data-nr-browser-ai-root]") !== null) {
  installAssistantLifecycle();
}
export {
  bootstrapAssistants,
  installAssistantLifecycle
};
