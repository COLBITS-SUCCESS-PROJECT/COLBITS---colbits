import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { UserScope } from '../scope/user-scope.entity';
import {
  CreateUserDto,
  SCOPE_ENTITY_TYPES,
  ScopeAssignmentDto,
  ScopeEntityType,
  UpdateUserDto,
  UserResponseDto,
  UserRole,
} from './dto/users.dto';

const BCRYPT_ROUNDS = 10;

/**
 * F-03: the platform has a single Colbits administrator, created only by the seed script. Every
 * user created through the API is a consultation user, and no user's role can be changed.
 */
const CONSULTATION_ROLE: UserRole = 'consultation user';

/**
 * Whether the raw request body carries its own `role` key. The request DTOs no longer declare
 * `role`, but there is no validation pipe that strips undeclared fields, so the body is checked
 * here. Only own keys count: a JSON `__proto__` member cannot supply one.
 */
function submittedRole(body: unknown): { role: unknown } | null {
  if (
    typeof body === 'object' &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, 'role')
  ) {
    return { role: (body as { role: unknown }).role };
  }
  return null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserScope)
    private readonly userScopesRepository: Repository<UserScope>,
  ) {}

  async findAll(): Promise<UserResponseDto[]> {
    const [users, allScopes] = await Promise.all([
      this.usersRepository.find({ order: { id: 'ASC' } }),
      this.userScopesRepository.find({ order: { id: 'ASC' } }),
    ]);

    const scopesByUser = new Map<number, ScopeAssignmentDto[]>();
    for (const row of allScopes) {
      const list = scopesByUser.get(row.user_id) ?? [];
      list.push({
        entity_type: row.entity_type as ScopeEntityType,
        entity_id: row.entity_id,
      });
      scopesByUser.set(row.user_id, list);
    }

    return users.map((user) =>
      this.toResponseDto(user, scopesByUser.get(user.id) ?? []),
    );
  }

  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    const scopes = await this.scopesOf(user.id);
    return this.toResponseDto(user, scopes);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const username = this.validateUsername(dto.username);
    const password = this.validatePassword(dto.password);
    this.rejectCreateRole(dto);
    const normalizedScopes = this.validateScopes(dto.scopes ?? []);

    const existing = await this.usersRepository.findOne({
      where: { username },
    });
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const created = this.usersRepository.create({
      username,
      password_hash,
      role: CONSULTATION_ROLE,
      is_active: true,
    });
    const saved = await this.usersRepository.save(created);

    const savedScopes = await this.replaceScopesInternal(
      saved.id,
      normalizedScopes,
    );
    return this.toResponseDto(saved, savedScopes);
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    // F-03: no role change, not even to the current role. Checked before any write.
    if (submittedRole(dto)) {
      throw new BadRequestException(
        'role cannot be changed: the platform has a single Colbits administrator (F-03)',
      );
    }

    const nextActive =
      dto.is_active !== undefined
        ? this.validateBoolean(dto.is_active, 'is_active')
        : user.is_active;

    // CU-06 flow 2a: prevent deactivating the last active Colbits administrator
    if (
      user.role === 'Colbits administrator' &&
      user.is_active &&
      !nextActive
    ) {
      await this.ensureNotLastActiveAdmin();
    }

    if (dto.username !== undefined) {
      const username = this.validateUsername(dto.username);
      if (username !== user.username) {
        const collision = await this.usersRepository.findOne({
          where: { username },
        });
        if (collision && collision.id !== user.id) {
          throw new ConflictException('Username already exists');
        }
        user.username = username;
      }
    }

    if (dto.password !== undefined) {
      const password = this.validatePassword(dto.password);
      user.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    user.is_active = nextActive;

    const saved = await this.usersRepository.save(user);

    let scopes: ScopeAssignmentDto[];
    if (user.role === 'Colbits administrator') {
      scopes = await this.replaceScopesInternal(saved.id, []);
    } else if (dto.scopes !== undefined) {
      const normalized = this.validateScopes(dto.scopes);
      scopes = await this.replaceScopesInternal(saved.id, normalized);
    } else {
      scopes = await this.scopesOf(saved.id);
    }

    return this.toResponseDto(saved, scopes);
  }

  async deactivate(id: number): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (user.role === 'Colbits administrator' && user.is_active) {
      await this.ensureNotLastActiveAdmin();
    }

    user.is_active = false;
    const saved = await this.usersRepository.save(user);
    const scopes = await this.scopesOf(saved.id);
    return this.toResponseDto(saved, scopes);
  }

  async assignScopes(
    id: number,
    scopes: unknown,
  ): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    if (user.role === 'Colbits administrator') {
      throw new BadRequestException(
        'Colbits administrators have unrestricted access and do not use scope assignments',
      );
    }

    const normalized = this.validateScopes(scopes);
    const savedScopes = await this.replaceScopesInternal(user.id, normalized);
    return this.toResponseDto(user, savedScopes);
  }

  private async requireUser(id: number): Promise<User> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async ensureNotLastActiveAdmin(): Promise<void> {
    const activeAdmins = await this.usersRepository.count({
      where: { role: 'Colbits administrator', is_active: true },
    });
    if (activeAdmins <= 1) {
      throw new BadRequestException(
        'Cannot deactivate or demote the last active Colbits administrator',
      );
    }
  }

  private async scopesOf(userId: number): Promise<ScopeAssignmentDto[]> {
    const rows = await this.userScopesRepository.find({
      where: { user_id: userId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => ({
      entity_type: row.entity_type as ScopeEntityType,
      entity_id: row.entity_id,
    }));
  }

  private async replaceScopesInternal(
    userId: number,
    scopes: ScopeAssignmentDto[],
  ): Promise<ScopeAssignmentDto[]> {
    await this.userScopesRepository.delete({ user_id: userId });
    if (scopes.length === 0) {
      return [];
    }
    const entities = scopes.map((scope) =>
      this.userScopesRepository.create({
        user_id: userId,
        entity_type: scope.entity_type,
        entity_id: scope.entity_id,
      }),
    );
    await this.userScopesRepository.save(entities);
    return scopes;
  }

  private validateUsername(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('username must be a non-empty string');
    }
    return value.trim();
  }

  private validatePassword(value: unknown): string {
    if (typeof value !== 'string' || value.length < 6) {
      throw new BadRequestException(
        'password must be a string of at least 6 characters',
      );
    }
    return value;
  }

  /**
   * F-03 on POST /users: a body without `role` is accepted, and so is 'consultation user' (the
   * frontend still sends it). Any other value is rejected: 'Colbits administrator' because a second
   * administrator cannot be created, and anything else (null, other strings, other types) because
   * it is not a role.
   */
  private rejectCreateRole(dto: CreateUserDto): void {
    const submitted = submittedRole(dto);
    if (!submitted || submitted.role === CONSULTATION_ROLE) return;
    if (submitted.role === 'Colbits administrator') {
      throw new BadRequestException(
        'A second Colbits administrator cannot be created: new users are always consultation users (F-03)',
      );
    }
    throw new BadRequestException(
      `role must be omitted or be '${CONSULTATION_ROLE}': new users are always consultation users (F-03)`,
    );
  }

  private validateBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} must be a boolean`);
    }
    return value;
  }

  private validateScopes(value: unknown): ScopeAssignmentDto[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('scopes must be an array');
    }

    const seen = new Set<string>();
    const normalized: ScopeAssignmentDto[] = [];

    for (const item of value) {
      if (typeof item !== 'object' || item === null) {
        throw new BadRequestException(
          'Each scope assignment must be an object with entity_type and entity_id',
        );
      }
      const rawType = (item as { entity_type?: unknown }).entity_type;
      const rawId = (item as { entity_id?: unknown }).entity_id;

      if (
        typeof rawType !== 'string' ||
        !(SCOPE_ENTITY_TYPES as readonly string[]).includes(rawType)
      ) {
        throw new BadRequestException(
          `entity_type must be one of: ${SCOPE_ENTITY_TYPES.join(', ')}`,
        );
      }

      if (typeof rawId !== 'string' || rawId.trim().length === 0) {
        throw new BadRequestException('entity_id must be a non-empty string');
      }

      const entity_type = rawType as ScopeEntityType;
      const entity_id = rawId.trim();
      const key = `${entity_type}:${entity_id}`;

      if (!seen.has(key)) {
        seen.add(key);
        normalized.push({ entity_type, entity_id });
      }
    }

    return normalized;
  }

  private toResponseDto(
    user: User,
    scopes: ScopeAssignmentDto[],
  ): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role as UserRole,
      is_active: user.is_active,
      scopes,
    };
  }
}
