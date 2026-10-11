import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: Record<string, any>) {
    return this.authService.validateAndLogin(loginDto.username, loginDto.password);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  getProfile(@Req() req: any) {
    return {
      message: 'Access granted! You are inside the protected route.',
      user: req['user'], 
    };
  }
}