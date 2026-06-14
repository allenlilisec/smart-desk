import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Public()
  @Get('readyz')
  readyz() {
    return { status: 'ready' };
  }
}
