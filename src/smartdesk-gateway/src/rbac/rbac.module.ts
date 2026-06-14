import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RbacGuard } from './rbac.guard';

@Module({
  providers: [AuditService, RbacGuard],
  exports: [AuditService, RbacGuard],
})
export class RbacModule {}
