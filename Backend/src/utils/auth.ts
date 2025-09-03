import jwt, { JwtPayload, SignOptions, Secret } from 'jsonwebtoken';

const JWT_SECRET: Secret = process.env.JWT_SECRET as Secret;

export function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { id: string };
    return decoded.id;
  } catch {
    return null;
  }
}

export function signUser(payload: object, expiresIn: string | number = '1h') {
  const options: SignOptions = {};
  (options as any).expiresIn = expiresIn;
  return jwt.sign(payload as any, JWT_SECRET, options);
}


