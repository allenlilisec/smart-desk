import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { getTraceId } from '../interceptors/trace-id.interceptor';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const traceId = getTraceId();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null && 'code' in body) {
        response.status(status).json({ ...(body as object), trace_id: traceId });
        return;
      }

      const message =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message ?? exception.message;

      response.status(status).json({
        code: status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED' : 'ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
        trace_id: traceId,
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      trace_id: traceId,
    });
  }
}
