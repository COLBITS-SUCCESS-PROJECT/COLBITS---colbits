import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { TokenBlacklist } from './token-blacklist.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(TokenBlacklist)
    private tokenBlacklistRepository: Repository<TokenBlacklist>,
    private jwtService: JwtService,
  ) {}

  async validateAndLogin(username: string, pass: string) {
    const user = await this.usersRepository.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(pass, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
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