# ADR 0001: Bắt đầu bằng Modular Monolith, tách microservice ở Giai đoạn 4

- Trạng thái: Accepted
- Ngày: 2026-11-08

## Bối cảnh

Mục tiêu cuối là kiến trúc microservice (catalog, procurement, order, ai, notification, integration)
giao tiếp qua Kafka/RabbitMQ. Nhưng ở đầu dự án, ranh giới domain chưa rõ và chi phí vận hành
microservice (network, distributed transaction, observability, deploy) rất cao.

## Quyết định

- Một ứng dụng NestJS (`apps/api`), chia **module theo bounded context** (identity, catalog, procurement...).
- Mỗi module theo Clean Architecture; module chỉ giao tiếp qua application service/port, không đọc bảng của nhau.
- Giai đoạn 4 mới tách procurement + order thành service riêng, có Kafka + Outbox.

## Hệ quả

- (+) Refactor ranh giới rẻ; một lần deploy; transaction ACID trong 1 DB; debug đơn giản.
- (+) Khi tách, ranh giới module đã được "kiểm chứng" → tách theo đúng đường may.
- (−) Phải tự kỷ luật để module không gọi chéo vào infrastructure của nhau.
- (−) Scale theo cả khối, chưa scale riêng từng phần.

## Phương án đã cân nhắc

- Microservice ngay từ đầu: tốn công hạ tầng trước khi có giá trị nghiệp vụ, dễ cắt sai ranh giới.
- Monolith không chia module: tách về sau rất đau.
