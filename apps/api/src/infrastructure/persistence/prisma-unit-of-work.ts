import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { UnitOfWork } from '../../common/persistence/ports';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Transaction "đi theo" luồng async nhờ AsyncLocalStorage:
 *   uow.run(fn) → mở $transaction → lưu tx vào ALS → mọi repository gọi db(prisma) bên trong fn
 *   sẽ nhận đúng tx đó. Use case không phải truyền tx qua tham số, và không biết Prisma là gì.
 */
const als = new AsyncLocalStorage<Prisma.TransactionClient>();

/** Repository dùng hàm này thay cho this.prisma: trong uow.run() → tx, ngoài → client thường. */
export const db = (prisma: PrismaService): Prisma.TransactionClient => als.getStore() ?? prisma;

@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    // Lồng nhau: đã ở trong transaction thì dùng tiếp, không mở transaction mới.
    if (als.getStore()) return fn();
    return this.prisma.$transaction((tx) => als.run(tx, fn), { timeout: 15_000 });
  }
}
