import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ScopeModule } from '../scope/scope.module';
import { Node } from './node.entity';
import { NodeDetailService } from './node-detail.service';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { JwtModule } from '@nestjs/jwt';
import { TokenBlacklist } from '../auth/token-blacklist.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Node, TokenBlacklist]),
    JwtModule.register({}),
    AuthModule,
    ScopeModule,
  ],
  controllers: [NodesController],
  providers: [NodesService, NodeDetailService],
  exports: [NodesService],
})
export class NodesModule {}
