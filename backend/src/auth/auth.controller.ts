import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import {
  LoginResponseDto,
  LogoutResponseDto,
  ProfileResponseDto,
} from './dto/auth-responses.dto';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with a username and password.' })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Credentials accepted.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Credentials are invalid or the account is inactive.',
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.validateAndLogin(
      loginDto.username,
      loginDto.password,
    );
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the authenticated user profile from the access token.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, or expired.',
  })
  getProfile(@Req() req: any) {
    return {
      message: 'Access granted! You are inside the protected route.',
      user: req['user'],
    };
  }

  // SCRUM-147 / F-11: Logout endpoint
  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out and invalidate the current access token.' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, or expired.',
  })
  async logout(@Req() req: any) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    return this.authService.logout(token);
  }
}
