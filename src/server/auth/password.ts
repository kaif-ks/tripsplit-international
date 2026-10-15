import bcrypt from "bcryptjs";

export async function hashPassword(plainText: string) {
  return bcrypt.hash(plainText, 12);
}

export async function verifyPassword(plainText: string, hash: string) {
  return bcrypt.compare(plainText, hash);
}
