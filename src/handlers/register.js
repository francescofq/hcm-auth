const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { doc, USERS_TABLE } = require('../lib/db');
const { json } = require('../lib/response');
const { ROLES, TENANTS } = require('../lib/config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { message: 'El body debe ser JSON valido' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const tenantId = String(body.tenantId || body.tenant_id || '').trim();

  if (!EMAIL_RE.test(email)) return json(400, { message: 'Email invalido' });
  if (password.length < 8) {
    return json(400, { message: 'La contrasena debe tener al menos 8 caracteres' });
  }
  if (!TENANTS.includes(tenantId)) {
    return json(400, { message: `tenantId invalido. Valores permitidos: ${TENANTS.join(', ')}` });
  }

  // Registro publico => EMPLOYEE. Solo en dev (ALLOW_ROLE_ON_REGISTER=true) se acepta "role".
  const role =
    process.env.ALLOW_ROLE_ON_REGISTER === 'true' && ROLES.includes(body.role)
      ? body.role
      : 'EMPLOYEE';

  const user = {
    email,
    userId: crypto.randomUUID(),
    passwordHash: await bcrypt.hash(password, 10),
    tenantId,
    role,
    employeeId: String(body.employeeId || body.employee_id || crypto.randomUUID()),
    createdAt: new Date().toISOString(),
  };

  try {
    await doc.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: user,
        ConditionExpression: 'attribute_not_exists(email)',
      })
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'Ya existe un usuario con ese email' });
    }
    console.error('register error', err);
    return json(500, { message: 'Error interno' });
  }

  return json(201, {
    user: {
      userId: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      employeeId: user.employeeId,
    },
  });
};
