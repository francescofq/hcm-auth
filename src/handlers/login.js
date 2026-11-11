const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { doc, USERS_TABLE } = require('../lib/db');
const { json } = require('../lib/response');

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { message: 'El body debe ser JSON valido' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return json(400, { message: 'email y password son obligatorios' });
  }

  let user;
  try {
    const res = await doc.send(new GetCommand({ TableName: USERS_TABLE, Key: { email } }));
    user = res.Item;
  } catch (err) {
    console.error('login error', err);
    return json(500, { message: 'Error interno' });
  }

  // Mismo mensaje para "no existe" y "clave incorrecta"
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return json(401, { message: 'Credenciales invalidas' });

  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  const token = jwt.sign(
    {
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      employeeId: user.employeeId,
    },
    process.env.JWT_SECRET,
    { subject: user.userId, expiresIn, issuer: 'hcm-auth', algorithm: 'HS256' }
  );

  return json(200, {
    token,
    expiresIn,
    user: {
      userId: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      employeeId: user.employeeId,
    },
  });
};
