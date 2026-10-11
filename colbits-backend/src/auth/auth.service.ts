import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService
  ) {}

  async validateAndLogin(username: string, pass: string) {
    const user = await this.usersRepository.findOne({ where: { username } });
    
    if (!user) {
      console.log(`Failed: User ${username} not found in database.`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // NEW: Log exactly what is being compared!
    console.log(`Testing Login for: ${username}`);
    console.log(`Password typed: '${pass}'`);
    console.log(`Hash in DB: '${user.password_hash}'`);
    console.log(`The REAL hash should be: `, bcrypt.hashSync(pass, 10));
    
    const isMatch = bcrypt.compareSync(pass, user.password_hash);
    
    console.log(`Bcrypt Match Result: ${isMatch}`);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}