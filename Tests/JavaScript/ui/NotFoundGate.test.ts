import {describe, expect, it} from 'vitest';

import {NotFoundGate} from '../../../Resources/Private/TypeScript/ui/NotFoundGate';

const MARKER = 'NOT_IN_SOURCE';

/** Feeds a reply through the gate the way the streaming callback does. */
function stream(gate: NotFoundGate, chunks: string[]): string {
    return chunks.map(chunk => gate.accept(chunk)).join('') + gate.flush();
}

describe('NotFoundGate', () => {
    it('passes everything through when no marker is configured', () => {
        const gate = new NotFoundGate();

        expect(stream(gate, ['The page ', 'says so.'])).toBe('The page says so.');
        expect(gate.matched).toBe(false);
    });

    it('treats an empty marker as no marker', () => {
        const gate = new NotFoundGate('');

        expect(stream(gate, [MARKER])).toBe(MARKER);
        expect(gate.matched).toBe(false);
    });

    it('recognises the marker and renders nothing', () => {
        const gate = new NotFoundGate(MARKER);

        expect(stream(gate, [MARKER])).toBe('');
        expect(gate.matched).toBe(true);
    });

    it('recognises the marker split across chunks, as it arrives while streaming', () => {
        const gate = new NotFoundGate(MARKER);

        expect(stream(gate, ['NOT_', 'IN_', 'SOURCE'])).toBe('');
        expect(gate.matched).toBe(true);
    });

    it('tolerates leading whitespace before the marker', () => {
        const gate = new NotFoundGate(MARKER);

        expect(stream(gate, ['\n ', MARKER])).toBe('');
        expect(gate.matched).toBe(true);
    });

    it('releases a real answer that begins like the marker', () => {
        const gate = new NotFoundGate(MARKER);

        // Withheld while it still matched, then released whole once it did not.
        expect(stream(gate, ['NOT_', 'HING is missing here.'])).toBe('NOT_HING is missing here.');
        expect(gate.matched).toBe(false);
    });

    it('releases a reply that stops mid-marker instead of swallowing it', () => {
        const gate = new NotFoundGate(MARKER);

        expect(stream(gate, ['NOT_IN'])).toBe('NOT_IN');
        expect(gate.matched).toBe(false);
    });

    it('streams the remainder untouched once the decision is made', () => {
        const gate = new NotFoundGate(MARKER);

        expect(gate.accept('The answer ')).toBe('The answer ');
        expect(gate.accept('is on the page.')).toBe('is on the page.');
        expect(gate.flush()).toBe('');
        expect(gate.matched).toBe(false);
    });

    it('does not mistake a reply that merely contains the marker later on', () => {
        const gate = new NotFoundGate(MARKER);

        const reply = 'The page mentions NOT_IN_SOURCE as an example.';
        expect(stream(gate, [reply])).toBe(reply);
        expect(gate.matched).toBe(false);
    });
});
