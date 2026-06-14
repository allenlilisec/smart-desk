import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [RbacModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
