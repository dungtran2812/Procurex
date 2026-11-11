import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ProcureX', template: '%s · ProcureX' },
  description: 'Sàn B2B vật tư MRO: tìm hàng, đề nghị mua, duyệt, RFQ, đơn đặt hàng.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
