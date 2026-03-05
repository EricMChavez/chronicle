const controllers = new Map<string, AbortController>();

export function createAbortController(bookId: string): AbortController {
  // Clean up any existing controller
  controllers.get(bookId)?.abort();
  const controller = new AbortController();
  controllers.set(bookId, controller);
  return controller;
}

export function abortProcessing(bookId: string): boolean {
  const controller = controllers.get(bookId);
  if (controller) {
    controller.abort();
    controllers.delete(bookId);
    return true;
  }
  return false;
}

export function clearAbortController(bookId: string): void {
  controllers.delete(bookId);
}
