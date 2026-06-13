import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

const traceStorage = new AsyncLocalStorage<string>();

export function getTraceId(): string {
  return traceStorage.getStore() ?? 'unknown';
}

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const incoming = request.headers['x-request-id'];
    const traceId = typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();

    return new Observable((subscriber) => {
      traceStorage.run(traceId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
