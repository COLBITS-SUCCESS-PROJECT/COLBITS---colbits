import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TokenBlacklist } from '../auth/token-blacklist.entity';
import { Node } from '../nodes/node.entity';
import { ScopeModule } from '../scope/scope.module';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

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
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}