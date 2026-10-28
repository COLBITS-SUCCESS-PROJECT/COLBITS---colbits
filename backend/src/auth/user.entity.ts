import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users') // Maps to your 'users' table in TimescaleDB
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  password_hash: string;

  @Column()
  role: string; // "Colbits administrator" or "consultation user"

  @Column({ name: 'is_active', default: true })
  is_active: boolean;
}