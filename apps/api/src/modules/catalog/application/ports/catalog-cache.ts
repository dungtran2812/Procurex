/**
 * PORT cache cho dữ liệu catalog (đọc nhiều, ghi hiếm).
 *
 * Invalidation bằng VERSION KEY: mọi key đều kèm số phiên bản hiện tại,
 * `invalidateAll()` chỉ tăng phiên bản → toàn bộ key cũ thành "mồ côi" và tự hết hạn theo TTL.
 * Không cần SCAN/DEL hàng nghìn key search (tổ hợp filter là vô hạn).
 */
export abstract class CatalogCache {
  abstract get<T>(key: string): Promise<T | null>;
  abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  abstract invalidateAll(): Promise<void>;

  /** Cache-aside: có thì trả, không có thì gọi loader rồi lưu. */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await loader();
    // Không cache null (vd sản phẩm không tồn tại) để sản phẩm mới seed xong là thấy ngay.
    if (value !== null) await this.set(key, value, ttlSeconds);
    return value;
  }
}
