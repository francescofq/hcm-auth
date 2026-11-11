// Prueba local sin AWS: firma un token como lo hace login y lo valida con el authorizer.
process.env.JWT_SECRET = 'secreto-de-prueba';
const jwt = require('jsonwebtoken');
const assert = require('assert');
const { handler } = require('../src/handlers/authorizer');

(async () => {
  const methodArn = 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/GET/employees';
  const token = jwt.sign(
    { email: 'a@a.com', tenantId: 'tenant_a', role: 'ADMIN', employeeId: 'emp-1' },
    process.env.JWT_SECRET,
    { subject: 'u-1', expiresIn: '1h', issuer: 'hcm-auth', algorithm: 'HS256' }
  );

  const ok = await handler({ authorizationToken: `Bearer ${token}`, methodArn });
  assert.strictEqual(ok.policyDocument.Statement[0].Effect, 'Allow');
  assert.strictEqual(
    ok.policyDocument.Statement[0].Resource,
    'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/*/*'
  );
  assert.strictEqual(ok.context.tenantId, 'tenant_a');
  assert.strictEqual(ok.context.role, 'ADMIN');
  assert.strictEqual(ok.context.employeeId, 'emp-1');

  const bad = ['', 'Bearer basura', `Bearer ${token}x`, 'Token abc'];
  for (const t of bad) {
    await assert.rejects(handler({ authorizationToken: t, methodArn }), /Unauthorized/);
  }
  const expired = jwt.sign({ tenantId: 'tenant_a' }, process.env.JWT_SECRET, {
    subject: 'u', expiresIn: -10, issuer: 'hcm-auth',
  });
  await assert.rejects(handler({ authorizationToken: `Bearer ${expired}`, methodArn }), /Unauthorized/);

  console.log('Smoke test OK: authorizer permite token valido y rechaza invalidos/expirados');
})().catch((e) => { console.error(e); process.exit(1); });
