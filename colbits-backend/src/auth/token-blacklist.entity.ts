import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('token_blacklist')
export class TokenBlacklist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  token: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  invalidated_at: Date;
}