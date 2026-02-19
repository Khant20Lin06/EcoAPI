import { Role } from '@prisma/client';

export interface RealtimeUser {
  userId: string;
  role: Role;
}
