import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TokenBlacklist } from '../auth/token-blacklist.entity';
import { Node } from '../nodes/node.entity';
import { ScopeModule } from '../scope/scope.module';
import { ActiveFaultsService } from './active-faults.service';
import { FaultsController } from './faults.controller';
import { FaultsService } from './faults.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Node, TokenBlacklist]),
    JwtModule.register({}),
    AuthModule,
    ScopeModule,
  ],
  controllers: [FaultsController],
  providers: [FaultsService, ActiveFaultsService],
})
export class FaultsModule {}
