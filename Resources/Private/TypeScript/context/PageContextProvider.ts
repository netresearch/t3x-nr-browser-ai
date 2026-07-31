export interface PageSection {
    heading: string;
    text: string;
}

export interface PageContext {
    title: string;
    language: string;
    sections: PageSection[];
    wasTruncated: boolean;
}

/**
 * Measures the complete supplied context in the same usage units as the model
 * context window. Implementations must not mutate the context. The provider may
 * call the function more than once with successively reduced contexts.
 */
export type PageContextMeasure = (context: Readonly<PageContext>) => Promise<number>;

export interface PageContextProvider {
    getContext(selector: string): Promise<PageContext>;
    fitToBudget(
        context: Readonly<PageContext>,
        measure: PageContextMeasure,
        budget: number,
    ): Promise<PageContext>;
}
