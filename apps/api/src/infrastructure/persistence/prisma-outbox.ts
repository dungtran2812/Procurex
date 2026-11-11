import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainEvent, Outbox } from '../../common/persistence/ports';
import { PrismaService } from '../prisma/prisma.service';
import { db } from './prisma-unit-of-work';

@Injectable()
export class PrismaOutbox extends Outbox {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(event: DomainEvent): Promise<void> {
    await db(this.prisma).outboxEvent.create({
      data: { type: event.type, payload: event.payload as Prisma.InputJsonObject },
    });
  }
}
