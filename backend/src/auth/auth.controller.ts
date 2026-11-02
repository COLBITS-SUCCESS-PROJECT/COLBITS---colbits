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
  @ApiOperation({
    summary: 'Authenticate with a username and password.',
    description:
      'Returns a JWT access token that expires after JWT_EXPIRES_IN (15 minutes by default). Every failure gives the same 401, so the response never reveals whether the account exists.',
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Credentials accepted.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Credentials are missing or invalid, or the account is inactive.',
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
    description:
      'Returns the payload of the verified token without reading the database, so a role change only shows up in a new token.',
  })
  @ApiOkResponse({
    type: ProfileResponseDto,
    description: 'Payload of the access token.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
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
  @ApiOperation({
    summary: 'Log out and invalidate the current access token.',
    description:
      'Adds the token to the server blacklist (F-11): from then on it gets a 401 on every protected route, even before it expires.',
  })
  @ApiOkResponse({
    type: LogoutResponseDto,
    description: 'The token was invalidated.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
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
