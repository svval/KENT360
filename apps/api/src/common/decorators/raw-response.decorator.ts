import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'kent360:rawResponse';

/**
 * Opts a handler out of the success envelope. Used for infrastructure endpoints
 * (health probes) whose consumers expect a plain, well-known body.
 */
export const RawResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(RAW_RESPONSE_KEY, true);
