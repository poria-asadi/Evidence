export type ExtractionBatchFailure<T> = { item: T; error: unknown };

export async function runExtractionBatch<T>(
  items: T[],
  run: (item: T, attempt: number) => Promise<void>,
  options: {
    maxAttempts: number;
    retryable: (error: unknown) => boolean;
    onCompleted?: (completed: number) => void;
    onRetry?: (remaining: number, nextAttempt: number) => void;
    wait?: (milliseconds: number) => Promise<void>;
  },
) {
  const wait = options.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const failures: ExtractionBatchFailure<T>[] = [];
  let completed = 0;
  let remaining = items;

  for (let attempt = 1; remaining.length && attempt <= options.maxAttempts; attempt += 1) {
    const retry: T[] = [];
    for (const item of remaining) {
      try {
        await run(item, attempt);
        completed += 1;
        options.onCompleted?.(completed);
      } catch (error) {
        if (attempt < options.maxAttempts && options.retryable(error)) retry.push(item);
        else failures.push({ item, error });
      }
    }
    remaining = retry;
    if (remaining.length) {
      options.onRetry?.(remaining.length, attempt + 1);
      await wait(attempt === 1 ? 2000 : 5000);
    }
  }
  return { completed, failures };
}
