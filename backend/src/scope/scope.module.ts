import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { UserScope } from './user-scope.entity';
import { ScopeService } from './scope.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserScope])],
  providers: [ScopeService],
  exports: [ScopeService],
})
export class ScopeModule {}
