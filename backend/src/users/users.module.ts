import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TokenBlacklist } from '../auth/token-blacklist.entity';
import { User } from '../auth/user.entity';
import { UserScope } from '../scope/user-scope.entity';
import { AdminGuard } from './admin.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserScope, TokenBlacklist]),
    JwtModule.register({}),
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
