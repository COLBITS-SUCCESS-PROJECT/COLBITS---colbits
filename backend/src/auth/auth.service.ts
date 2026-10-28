import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { TokenBlacklist } from './token-blacklist.entity';
import * as bcrypt from 'bcrypt';
import { INVALID_CREDENTIALS } from './auth.constants';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(TokenBlacklist)
    private tokenBlacklistRepository: Repository<TokenBlacklist>,
    private jwtService: JwtService,
  ) {}

  // F-01: only an active account with the right username and password gets an access token.
  async validateAndLogin(username: unknown, pass: unknown) {
    // A missing username would become `where: { username: undefined }`, which matches any row.
    if (!isNonEmptyString(username) || !isNonEmptyString(pass)) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await this.usersRepository.findOne({ where: { username } });
    if (!user || !user.is_active) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(pass, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  // SCRUM-147 / F-11: Invalidate token on logout
  async logout(token: string) {
    const blacklisted = this.tokenBlacklistRepository.create({ token });
    await this.tokenBlacklistRepository.save(blacklisted);
    return { message: 'Successfully logged out' };
  }
}
