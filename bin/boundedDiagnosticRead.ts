export type DiagnosticRead<T> = { outcome: "completed"; value: T } | { outcome: "failed" | "deadline" };

export async function boundedDiagnosticRead<T>(read: () => Promise<T>, budgetMs: number): Promise<DiagnosticRead<T>> {
  if (budgetMs <= 0) return { outcome: "deadline" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = Promise.resolve().then(read).then<DiagnosticRead<T>, DiagnosticRead<T>>(
    value => ({ outcome: "completed", value }),
    () => ({ outcome: "failed" }),
  );
  try {
    return await Promise.race([
      result,
      new Promise<DiagnosticRead<T>>((resolve) => {
        timer = setTimeout(() => resolve({ outcome: "deadline" }), budgetMs);
      }),
    ]);
  }
  finally { clearTimeout(timer); }
}
