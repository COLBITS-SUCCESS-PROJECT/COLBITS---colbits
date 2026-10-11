import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]), // This gives AuthService access to the DB
    JwtModule.register({
      secret: 'colbits-super-secret-key', 
      signOptions: { expiresIn: '15m' }, 
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}