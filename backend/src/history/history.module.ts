import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TokenBlacklist } from '../auth/token-blacklist.entity';
import { FaultsService } from '../faults/faults.service';
import { Node } from '../nodes/node.entity';
import { ScopeModule } from '../scope/scope.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

/** SCRUM-283 · US20: GET /history. FaultsService is stateless (only the global ConfigService). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Node, TokenBlacklist]),
    JwtModule.register({}),
    AuthModule,
    ScopeModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService, FaultsService],
})
export class HistoryModule {}
