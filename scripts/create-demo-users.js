// Crea usuarios demo directamente en DynamoDB (sirve para ADMIN/HR/MANAGER, que el registro publico no permite).
// Uso:  USERS_TABLE=hcm-auth-users-dev node scripts/create-demo-users.js
// Requiere credenciales de Academy exportadas (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN).
const bcrypt = require('bcryptjs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.USERS_TABLE || 'hcm-auth-users-dev';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234!';

// TODO (coordinar con Integrante 4): reemplazar employeeId por los IDs reales que genera el seeding
// de cada tenant, para que "mis datos" (rol EMPLOYEE) coincida con un empleado existente.
const USERS = [
  { email: 'admin@empresa-a.com', tenantId: 'tenant_a', role: 'ADMIN', employeeId: 'emp-a-admin' },
  { email: 'hr@empresa-a.com', tenantId: 'tenant_a', role: 'HR', employeeId: 'emp-a-hr' },
  { email: 'empleado@empresa-a.com', tenantId: 'tenant_a', role: 'EMPLOYEE', employeeId: 'emp-a-001' },
  { email: 'admin@empresa-b.com', tenantId: 'tenant_b', role: 'ADMIN', employeeId: 'emp-b-admin' },
  { email: 'hr@empresa-b.com', tenantId: 'tenant_b', role: 'HR', employeeId: 'emp-b-hr' },
  { email: 'empleado@empresa-b.com', tenantId: 'tenant_b', role: 'EMPLOYEE', employeeId: 'emp-b-001' },
  { email: 'admin@empresa-c.com', tenantId: 'tenant_c', role: 'ADMIN', employeeId: 'emp-c-admin' },
];

(async () => {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  for (const u of USERS) {
    await doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          ...u,
          userId: require('crypto').randomUUID(),
          passwordHash,
          createdAt: new Date().toISOString(),
        },
      })
    );
    console.log(`OK ${u.email} (${u.tenantId}, ${u.role})`);
  }
  console.log(`Listo. Password de todos: ${PASSWORD}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
