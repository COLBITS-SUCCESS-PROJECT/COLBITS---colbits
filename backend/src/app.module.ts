import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DeviceModule } from './device/device.module';
import { NodesModule } from './nodes/nodes.module';
import { ScopeModule } from './scope/scope.module';
import { FaultsModule } from './faults/faults.module';

@Module({
  imports: [
    AuthModule,
    DeviceModule,
    NodesModule,
    ScopeModule,
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false, 
      }),
    }),
    FaultsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}