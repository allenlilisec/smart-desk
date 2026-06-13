import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../common/types/user.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireAction } from '../rbac/require-action.decorator';
import { Action, canUpdateTicket } from '../rbac/roles';
import { AuditService } from '../rbac/audit.service';
import { ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

/**
 * Stub ticket routes for GW-2 RBAC validation.
 * GW-3 will replace these with core/insight aggregation.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
  ) {}

  @Get(':id')
  @RequireAction(Action.TicketRead)
  getTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: AuthenticatedUser; route?: { path: string } },
  ) {
    const route = req.route?.path ?? `/tickets/${id}`;
    return this.tickets.getTicket(id, req.user, route, req.method);
  }

  @Patch(':id')
  @RequireAction(Action.TicketUpdate)
  patchTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: AuthenticatedUser; route?: { path: string } },
  ) {
    if (!canUpdateTicket(req.user.roles)) {
      const route = req.route?.path ?? `/tickets/${id}`;
      this.audit.recordForbidden(
        req.user,
        route,
        req.method,
        'ticket:update',
        'Manager cannot modify tickets',
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }
    return { id, status: 'patched', message: 'Stub — core integration pending (GW-3)' };
  }
}
