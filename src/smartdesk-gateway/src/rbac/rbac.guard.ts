import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../common/types/user.types';
import { AuditService } from './audit.service';
import { RBAC_ACTION_KEY } from './require-action.decorator';
import { Action, rolesCanPerform } from './roles';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<Action | undefined>(RBAC_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!action) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method: string;
      route?: { path: string };
      url: string;
    }>();

    const user = request.user;
    if (!user) {
      return false;
    }

    if (rolesCanPerform(user.roles, action)) {
      return true;
    }

    const route = request.route?.path ?? request.url;
    this.audit.recordForbidden(user, route, request.method, action, 'RBAC denied');

    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  }
}
