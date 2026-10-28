import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './user.entity';
import { TokenBlacklist } from './token-blacklist.entity';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { JWT_EXPIRES_IN_DEFAULT } from './auth.constants';

/** Lifetime format accepted by jsonwebtoken, e.g. '15m' or '1h'. */
type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TokenBlacklist]),
    // The signing secret comes from the environment (JWT_SECRET); the app does not start without it.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? JWT_EXPIRES_IN_DEFAULT) as JwtExpiresIn },
      }),
    }),
  ],
  providers: [AuthService, AuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthGuard, RolesGuard],
})
export class AuthModule {}
