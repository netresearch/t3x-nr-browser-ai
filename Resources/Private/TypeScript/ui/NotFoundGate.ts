/**
 * Withholds the beginning of a streamed reply for as long as it could still turn
 * out to be the "page does not answer this" marker, and reports which of the two
 * it was once that is decided.
 *
 * The model is asked to answer an unanswerable question with the marker and
 * nothing else, so the decision is made from the first characters. Holding them
 * back is what keeps the token from flashing on screen before the editor's own
 * content replaces it; everything after the decision streams through untouched.
 *
 * Without a marker — the editor configured no content element for this case, so
 * the model was never given the instruction — the gate is inert and passes every
 * chunk straight through.
 */
export class NotFoundGate {
    private buffer = '';

    private decided: boolean;

    private isMarker = false;

    public constructor(private readonly marker?: string) {
        // No marker means nothing to wait for: decide immediately, pass everything.
        this.decided = marker === undefined || marker.length === 0;
    }

    /**
     * Returns the part of the chunk that may be rendered now, which is empty for
     * as long as the reply could still be the marker.
     */
    public accept(chunk: string): string {
        if (this.decided) {
            return chunk;
        }

        this.buffer += chunk;
        const candidate = this.buffer.trimStart();
        if (candidate.length === 0) {
            return '';
        }

        const marker = this.marker ?? '';
        if (candidate.length < marker.length) {
            // Still shorter than the marker: keep waiting only while it matches.
            if (marker.startsWith(candidate)) {
                return '';
            }
            return this.release();
        }

        if (candidate.startsWith(marker)) {
            this.decided = true;
            this.isMarker = true;
            this.buffer = '';
            return '';
        }

        return this.release();
    }

    /**
     * Whatever is still withheld once the stream ends — a reply that stopped
     * mid-marker, for instance, which is not the marker and has to be shown.
     */
    public flush(): string {
        if (this.isMarker) {
            return '';
        }
        return this.release();
    }

    public get matched(): boolean {
        return this.isMarker;
    }

    private release(): string {
        const held = this.buffer;
        this.buffer = '';
        this.decided = true;
        return held;
    }
}
