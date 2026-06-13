import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GlobalJwtAuthGuard } from './guards/global-jwt-auth.guard';
import { IDENTITY_PROVIDER } from './idp/identity-provider.interface';
import { LocalIdentityProvider } from './idp/local.provider';
import { JwtStrategy } from './jwt.strategy';
import { RbacGuard } from '../rbac/rbac.guard';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    RbacModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<number>('jwt.accessTtlSeconds'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: IDENTITY_PROVIDER,
      useClass: LocalIdentityProvider,
    },
    {
      provide: APP_GUARD,
      useClass: GlobalJwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
  exports: [AuthService, IDENTITY_PROVIDER],
})
export class AuthModule {}
