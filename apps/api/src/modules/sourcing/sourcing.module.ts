import { Module } from '@nestjs/common';
import { ProcurementModule } from '../procurement/procurement.module';
import { ErpPort, PurchaseRequestReader, SourcingRepository } from './application/ports';
import { SourcingHandlers } from './application/sourcing.handlers';
import { SourcingService } from './application/sourcing.service';
import { MockErpAdapter, ProcurementPrReader } from './infrastructure/adapters';
import { PrismaSourcingRepository } from './infrastructure/prisma-sourcing.repository';
import { SourcingController, SupplierPortalController } from './presentation/sourcing.controller';

/** Giai đoạn 3: Supplier → RFQ → báo giá → chọn thầu → PO → đồng bộ ERP. */
@Module({
  imports: [ProcurementModule],
  controllers: [SourcingController, SupplierPortalController],
  providers: [
    SourcingService,
    SourcingHandlers,
    { provide: SourcingRepository, useClass: PrismaSourcingRepository },
    { provide: PurchaseRequestReader, useClass: ProcurementPrReader },
    // Singleton: MockErp giữ map poNumber → erpRef để mô phỏng idempotency của ERP thật.
    { provide: ErpPort, useClass: MockErpAdapter },
  ],
})
export class SourcingModule {}
