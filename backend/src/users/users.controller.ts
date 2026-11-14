import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AdminGuard } from './admin.guard';
import {
  CreateUserDto,
  ReplaceUserScopesDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard, AdminGuard)
@ApiTags('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all users and their assigned data scopes (US19 · F-05).',
    description:
      'Restricted to Colbits administrators. Returns every user account (without password hashes) and its assigned scope entities.',
  })
  @ApiOkResponse({ type: [UserResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single user and their assigned data scopes (US19 · F-05).',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a new user account with optional scope assignments (US19 · F-03, F-05, F-07, F-08, F-09).',
    description:
      'Hashes the password with bcrypt (NF-04) and stores any initial scope assignments (zone, substation, circuit, node or device).',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Modify an existing user account or its scope assignments (US19 · F-05, F-08, F-09).',
    description:
      'Rejects deactivating or demoting the last active Colbits administrator (CU-06 flow 2a).',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a user account (US19 · F-05, CU-06).',
    description:
      'Sets is_active to false so the account can no longer log in or resolve scope. Rejects deactivating the last active Colbits administrator (CU-06 flow 2a).',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
  }

  @Put(':id/scopes')
  @ApiOperation({
    summary:
      'Assign or replace a consultation user data scope by zone, substation, circuit, node or device (US19 · F-08, F-09).',
    description:
      'The same zone, substation, circuit, node or device can be assigned to multiple consultation users (F-09).',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  assignScopes(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReplaceUserScopesDto,
  ): Promise<UserResponseDto> {
    return this.usersService.assignScopes(id, body?.scopes);
  }
}
