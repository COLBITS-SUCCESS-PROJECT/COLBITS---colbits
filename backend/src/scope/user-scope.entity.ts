
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_scopes')
export class UserScope {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'integer' })
  user_id: number;

  @Column({ name: 'entity_type', type: 'text' })
  entity_type: string;

  @Column({ name: 'entity_id', type: 'text' })
  entity_id: string;
}
