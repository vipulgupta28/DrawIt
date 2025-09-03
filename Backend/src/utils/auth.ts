import jwt, { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

export function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { id: string };
    return decoded.id;
  } catch {
    return null;
  }
}

export function signUser(payload: object, expiresIn: string = '1h') {
  return jwt.sign(payload as any, JWT_SECRET, { expiresIn });
}


