import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [RbacModule],
  controllers: [AdminController],
})
export class AdminModule {}
