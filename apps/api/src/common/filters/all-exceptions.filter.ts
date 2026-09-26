import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiError } from '@kent360/shared-types';
import { type Request, type Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.BAD_REQUEST]: 'İstek geçersiz.',
  [ErrorCode.UNAUTHORIZED]: 'Bu işlem için oturum açmanız gerekiyor.',
  [ErrorCode.FORBIDDEN]: 'Bu işlem için yetkiniz bulunmuyor.',
  [ErrorCode.NOT_FOUND]: 'İstenen kaynak bulunamadı.',
  [ErrorCode.CONFLICT]: 'İşlem mevcut kayıtla çakışıyor.',
  [ErrorCode.RATE_LIMITED]: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'Gönderilen dosya veya veri çok büyük.',
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 'Dosya türü desteklenmiyor.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Servis geçici olarak kullanılamıyor.',
  [ErrorCode.INTERNAL_ERROR]: 'Beklenmeyen bir hata oluştu.',
};

/**
 * Converts every thrown error into the standard ApiError envelope.
 * Unknown errors never leak stack traces or internal messages to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string | number }>();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        'Unhandled exception',
      );
    }

    const body: ApiError = {
      success: false,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id !== undefined ? String(request.id) : undefined,
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details: unknown;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status] ?? ErrorCode.BAD_REQUEST;
      const payload = exception.getResponse();

      // class-validator failures arrive as { message: string[] } from ValidationPipe.
      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { message?: unknown }).message)
      ) {
        return {
          status,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Gönderilen bilgiler doğrulanamadı.',
          details: (payload as { message: string[] }).message,
        };
      }

      return {
        status,
        code,
        message: DEFAULT_MESSAGES[code] ?? exception.message,
        details: null,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: DEFAULT_MESSAGES[ErrorCode.INTERNAL_ERROR] ?? 'Internal error',
      details: null,
    };
  }
}
