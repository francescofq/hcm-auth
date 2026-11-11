const jwt = require('jsonwebtoken');

// Lambda Authorizer tipo TOKEN (API Gateway REST).
// 401 => lanzar Error('Unauthorized'). Si es valido => policy Allow sobre TODOS
// los metodos/rutas del API, asi si algun stack deja cache activo no hay 403 en otras rutas.
exports.handler = async (event) => {
  const match = /^Bearer\s+(.+)$/i.exec(event.authorizationToken || '');
  if (!match) throw new Error('Unauthorized');

  let claims;
  try {
    claims = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'hcm-auth',
    });
  } catch {
    throw new Error('Unauthorized');
  }

  // arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{METHOD}/{path}
  const [, , , region, account, path] = event.methodArn.split(':');
  const [apiId, stage] = path.split('/');
  const resource = `arn:aws:execute-api:${region}:${account}:${apiId}/${stage}/*/*`;

  return {
    principalId: claims.sub,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: resource }],
    },
    // Los valores del context deben ser strings
    context: {
      userId: String(claims.sub),
      email: String(claims.email),
      tenantId: String(claims.tenantId),
      role: String(claims.role),
      employeeId: String(claims.employeeId),
    },
  };
};
