import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Request {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ default: 'PENDING' })
  status: string;
}