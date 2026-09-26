import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type ApiSuccess, type Paginated } from '@kent360/shared-types';
import { type Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

function isPaginated(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Paginated<unknown>).items) &&
    typeof (value as Paginated<unknown>).meta === 'object'
  );
}

/**
 * Wraps controller results in the standard success envelope.
 * Paginated results ({ items, meta }) are flattened to { data: items, meta }.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    return next
      .handle()
      .pipe(
        map((result: unknown): ApiSuccess<unknown> =>
          isPaginated(result)
            ? { success: true, data: result.items, meta: result.meta }
            : { success: true, data: result ?? null },
        ),
      );
  }
}
