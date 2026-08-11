import type {FormValues} from '../form/FormSchema';

export type ActionFailure = 'unresolved-place' | 'rate-limited' | 'failed';

export interface ResolvedPlace {
    name: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
}

export interface ResultColumn {
    name: string;
    unit: string;
    values: Array<string | number | null>;
}

export interface ResultBlock {
    key: string;
    times: string[];
    columns: ResultColumn[];
}

export interface ActionOutcome {
    ok: boolean;
    failure?: ActionFailure;
    /**
     * What the caller receives. On the local path the model turns this into its
     * reply, so it is prose and compact numbers rather than the source's own
     * payload — an on-device model has little room to spend on formatting.
     */
    summary: string;
    place?: ResolvedPlace;
    blocks: ResultBlock[];
}

/**
 * What a form does when it is run.
 *
 * One implementation exists, and this interface is the seam where a second one
 * belongs: a form without a data source of its own would submit normally
 * instead. Nothing above it — schema reading, argument checking, filling, tool
 * registration — knows which implementation it is talking to.
 */
export interface FormAction {
    run(values: FormValues, signal?: AbortSignal): Promise<ActionOutcome>;
}
