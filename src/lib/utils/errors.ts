export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class BookNotFoundError extends AppError {
  constructor(bookId?: string) {
    super(bookId ? `Book not found: ${bookId}` : "Book not found", 404);
  }
}

export class EntryNotFoundError extends AppError {
  constructor(entryId?: string) {
    super(entryId ? `Entry not found: ${entryId}` : "Entry not found", 404);
  }
}

export class ProcessingError extends AppError {
  constructor(message = "Processing failed") {
    super(message, 500);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, 400);
  }
}

export class ApiKeyNotFoundError extends AppError {
  constructor(provider?: string) {
    super(
      provider
        ? `No API key found for provider: ${provider}`
        : "No API key configured",
      400
    );
  }
}
