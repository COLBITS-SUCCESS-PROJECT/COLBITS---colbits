import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TokenBlacklist } from '../auth/token-blacklist.entity';
import { Node } from '../nodes/node.entity';
import { ScopeModule } from '../scope/scope.module';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Node, TokenBlacklist]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    ScopeModule,
    AuthModule,
  ],
  controllers: [ScenariosController],
  providers: [ScenariosService],
})
export class ScenariosModule {}
