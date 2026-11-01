/** A product or item id the catalog doesn't track. Not worth retrying. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export const isNotFound = (e: unknown) => e instanceof NotFoundError;

/** Retries transient failures twice, never a not-found. */
export const retryUnlessNotFound = (failures: number, error: unknown) =>
  !isNotFound(error) && failures < 2;
