import { HttpException, HttpStatus } from '@nestjs/common';
import { type ErrorCode } from './error-codes';

/**
 * Domain-level exception carrying a stable error code.
 * Services throw this; the global filter turns it into the standard error envelope.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details: unknown = null,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT, details ?? null);
  }
}
