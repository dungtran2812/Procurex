import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasher } from '../application/ports';

/**
 * argon2id: thuật toán băm mật khẩu khuyến nghị bởi OWASP (chống GPU/ASIC nhờ tốn RAM).
 * Salt được sinh ngẫu nhiên và nhúng sẵn trong chuỗi hash ($argon2id$v=19$m=...,t=...,p=...$salt$hash).
 */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // hash hỏng/định dạng lạ → coi như sai mật khẩu
    }
  }
}
