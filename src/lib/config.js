const ROLES = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];

const TENANTS = (process.env.TENANTS || 'tenant_a,tenant_b,tenant_c')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

module.exports = { ROLES, TENANTS };
