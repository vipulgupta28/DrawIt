import jwt, { JwtPayload, SignOptions, Secret } from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET;
export function checkUser(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.id;
    }
    catch {
        return null;
    }
}
export function signUser(payload, expiresIn = '1h') {
    const options = {};
    options.expiresIn = expiresIn;
    return jwt.sign(payload, JWT_SECRET, options);
}
//# sourceMappingURL=auth.js.map