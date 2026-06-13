import { Injectable, Logger } from '@nestjs/common';
import { getTraceId } from '../common/interceptors/trace-id.interceptor';
import { AuthenticatedUser } from '../common/types/user.types';

export interface AuditEvent {
  actorId: string;
  roles: string[];
  route: string;
  method: string;
  action: string;
  reason: string;
  traceId: string;
  timestamp: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  recordForbidden(
    user: AuthenticatedUser,
    route: string,
    method: string,
    action: string,
    reason: string,
  ): void {
    const event: AuditEvent = {
      actorId: user.userId,
      roles: user.roles,
      route,
      method,
      action,
      reason,
      traceId: getTraceId(),
      timestamp: new Date().toISOString(),
    };
    this.logger.warn(JSON.stringify(event));
  }
}
