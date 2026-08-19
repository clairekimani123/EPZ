import jwt from 'jsonwebtoken';

// --------------------------------------------------------------------------
// This is "the door with a lock". Any route that needs `requireAuth` in
// front of it will only run if a valid token is present. Otherwise it stops
// the request right here with a 401.
//
// HOW LOGIN WORKS END TO END:
//   1. Staff member POSTs username+password to /api/auth/login
//   2. If correct, the server signs a JWT (a tamper-proof token containing
//      "this is an authenticated admin") using JWT_SECRET, and sends it back
//   3. The React app stores that token and attaches it to every future
//      request as a header: Authorization: Bearer <token>
//   4. This middleware checks that header on protected routes, verifies the
//      token's signature matches JWT_SECRET (proving it wasn't forged), and
//      only then lets the request through
// --------------------------------------------------------------------------

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization; // expected format: "Bearer <token>"

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization header.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // available to any route handler that runs after this
    next(); // token is valid, let the request continue
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}