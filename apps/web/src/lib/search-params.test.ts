import { describe, expect, it } from 'vitest';
import { toApiError } from './client/api';
import { vnd } from './format';
import { parseFilters, toApiQuery, toSearchParams, toggleSpec } from './search-params';

describe('URL state của catalog', () => {
  it('parse ↔ serialize khứ hồi, thứ tự key ổn định', () => {
    const sp = new URLSearchParams(
      'spec=size_mm:12&category=co-le&q=%20cl%20&spec=material:CrV&page=3&spec=bad&spec=x:',
    );
    const f = parseFilters(sp);
    expect(f).toEqual({
      category: 'co-le',
      q: 'cl',
      specs: { size_mm: ['12'], material: ['CrV'] },
      page: 3,
    });
    expect(toSearchParams(f).toString()).toBe(
      'category=co-le&q=cl&spec=material%3ACrV&spec=size_mm%3A12&page=3',
    );
  });

  it('page sai → 1; trang 1 không ghi lên URL', () => {
    expect(parseFilters(new URLSearchParams('page=-2')).page).toBe(1);
    expect(parseFilters(new URLSearchParams('page=abc')).page).toBe(1);
    expect(toSearchParams({ specs: {}, page: 1 }).toString()).toBe('');
  });

  it('toggleSpec: chọn → thay giá trị cùng key, bỏ chọn → xoá; luôn về trang 1', () => {
    const f = { specs: { material: ['CrV'] }, page: 4 };
    expect(toggleSpec(f, 'material', 'S2')).toEqual({ specs: { material: ['S2'] }, page: 1 });
    expect(toggleSpec(f, 'material', 'CrV')).toEqual({ specs: {}, page: 1 });
    expect(toggleSpec(f, 'brand', 'Bosch').specs).toEqual({ material: ['CrV'], brand: ['Bosch'] });
  });

  it('toApiQuery luôn có page & pageSize', () => {
    expect(toApiQuery({ specs: {}, page: 1 }, 24)).toBe('page=1&pageSize=24');
  });
});

describe('toApiError – 2 dạng lỗi của API', () => {
  it('DomainError giữ mã nghiệp vụ', () => {
    const e = toApiError(422, { error: 'COMMENT_REQUIRED', message: 'Từ chối phải ghi lý do' });
    expect([e.code, e.message]).toEqual(['COMMENT_REQUIRED', 'Từ chối phải ghi lý do']);
  });

  it('ValidationPipe: message là mảng → VALIDATION + details', () => {
    const e = toApiError(400, { error: 'Bad Request', message: ['qty must be ≥ 1', 'x'] });
    expect(e.code).toBe('VALIDATION');
    expect(e.details).toEqual(['qty must be ≥ 1', 'x']);
  });

  it('không có body → HTTP_<status>', () => {
    expect(toApiError(502, null).code).toBe('HTTP_502');
  });
});

describe('vnd', () => {
  it('định dạng vi-VN, không phần lẻ', () => {
    expect(vnd(1234567).replace(/\s/g, ' ')).toBe('1.234.567 ₫');
    expect(vnd(null)).toBe('—');
  });
});
