import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './user.entity';
import { TokenBlacklist } from './token-blacklist.entity';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TokenBlacklist]),
    JwtModule.register({
      secret: 'colbits-super-secret-key',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  providers: [AuthService, AuthGuard, RolesGuard], 
  controllers: [AuthController],
  exports: [AuthGuard, RolesGuard], 
})
export class AuthModule {}