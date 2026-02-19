import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma, Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async submit(input: CreateContactMessageDto) {
    const normalized = {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      subject: input.subject?.trim() || null,
      message: input.message.trim()
    };

    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true }
    });

    if (admins.length > 0) {
      const payload: Prisma.InputJsonValue = {
        type: 'CONTACT_FORM',
        name: normalized.name,
        email: normalized.email,
        subject: normalized.subject,
        message: normalized.message
      };

      const bodyPreview =
        normalized.message.length > 140
          ? `${normalized.message.slice(0, 137)}...`
          : normalized.message;
      const title = normalized.subject
        ? `Contact: ${normalized.subject}`
        : `Contact from ${normalized.name}`;

      const deliveryResults = await Promise.allSettled(
        admins.map((admin) =>
          this.notifications.createAndPush({
            userId: admin.id,
            type: NotificationType.NEW_MESSAGE,
            title,
            body: bodyPreview,
            payload
          })
        )
      );

      for (const result of deliveryResults) {
        if (result.status === 'rejected') {
          this.logger.warn(`Failed to publish contact notification: ${String(result.reason)}`);
        }
      }
    }

    return { ok: true, message: 'Contact request submitted.' };
  }
}
