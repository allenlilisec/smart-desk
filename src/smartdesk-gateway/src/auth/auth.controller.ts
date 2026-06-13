import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from '../common/types/user.types';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto, RefreshDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request & { user: AuthenticatedUser }) {
    const authHeader = req.headers.authorization;
    let accessJti: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
        ) as JwtPayload;
        accessJti = decoded.jti;
      } catch {
        // ignore malformed token on logout
      }
    }
    await this.auth.logout(req.user, accessJti);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.auth.toMe(req.user);
  }
}
