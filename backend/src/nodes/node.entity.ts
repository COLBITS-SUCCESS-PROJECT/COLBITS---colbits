import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('nodes')
export class Node {
  @PrimaryColumn({ type: 'text' })
  name: string;

  @Column({ name: 'circuit_id', type: 'integer' })
  circuit_id: number;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;
}
