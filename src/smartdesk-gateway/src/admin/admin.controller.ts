import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../common/types/user.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireAction } from '../rbac/require-action.decorator';
import { Action } from '../rbac/roles';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  @Get('categories')
  @RequireAction(Action.AdminRead)
  listCategories(@Req() req: Request & { user: AuthenticatedUser }) {
    return {
      items: [],
      actor: req.user.username,
      message: 'Stub — forwards to core when GW-3 ready',
    };
  }
}
