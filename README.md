# hcm-auth (Integrante 1)

Servicio de autenticación propio (sin Cognito) para AWS Academy: tabla `users`, login, registro,
Lambda Authorizer, bucket S3 y CORS en 401/403. Usa `LabRole` (no crea roles IAM).

## 1. Despliegue (este stack va PRIMERO)

```bash
# 1) Credenciales del Learner Lab (AWS Details > AWS CLI). Caducan: renovarlas en cada sesión.
export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_SESSION_TOKEN=...

# 2) Secreto (nunca al repo)
cp .env.example .env      # edita JWT_SECRET con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3) Deploy
npm install
npx serverless deploy --stage dev

# 4) Usuarios demo (admin/hr/empleado por tenant)
USERS_TABLE=hcm-auth-users-dev npm run seed:users
```

Avisa al equipo cuando termine: los demás stacks usan los **Exports** de este.

## 2. Exports (contrato con los demás)

| Export | Quién lo usa |
|---|---|
| `hcm-auth-dev-AuthorizerArn` | Integrantes 2, 3, 4 (authorizer en cada endpoint protegido) |
| `hcm-auth-dev-BucketName` / `-BucketArn` | Integrantes 2, 3 (archivos en `{tenant_id}/{ms}/...`) |
| `hcm-auth-dev-UsersTableName` | si algún servicio necesita leer usuarios |
| `hcm-auth-dev-ApiUrl` | Integrante 5 (URL base de login/registro) |

## 3. Cómo referenciar el authorizer (Integrantes 2, 3, 4)

```yaml
functions:
  getEmployees:
    handler: handlers/getEmployees.handler
    events:
      - http:
          path: employees
          method: get
          cors: true
          authorizer:
            type: token
            name: hcmAuthorizer
            arn: !ImportValue hcm-auth-${sls:stage}-AuthorizerArn
            identitySource: method.request.header.Authorization
            resultTtlInSeconds: 0   # sin caché => nunca 403 raro en otras rutas
```

> Si Serverless se queja de `!ImportValue` dentro de `authorizer.arn`, usar
> `arn: ${cf:hcm-auth-${sls:stage}.AuthorizerArn}` (resuelve el output al desplegar).

CORS en 401/403 de **cada** API (agregar en `resources` de cada stack):

```yaml
resources:
  Resources:
    GatewayResponseDefault4XX:
      Type: AWS::ApiGateway::GatewayResponse
      Properties:
        ResponseType: DEFAULT_4XX
        RestApiId: { Ref: ApiGatewayRestApi }
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
```

## 4. Qué reciben las Lambdas protegidas

Antes venía de `requestContext.authorizer.claims['custom:tenant_id']`. Ahora:

```js
const { tenantId, role, employeeId, userId, email } = event.requestContext.authorizer;
```

- Integrante 2: `SET search_path TO ${tenantId}` (el valor ya viene validado contra la lista de tenants).
- Integrante 3/4: `PK = TENANT#${tenantId}`; el rol y `employeeId` salen del mismo objeto.

## 5. Endpoints

`POST /auth/register`  body: `{ "email", "password" (min 8), "tenantId": "tenant_a|tenant_b|tenant_c", "employeeId"? }`
→ 201 `{ user }`. Rol siempre `EMPLOYEE` (salvo `ALLOW_ROLE_ON_REGISTER=true` en dev). 409 si el email existe.

`POST /auth/login`  body: `{ "email", "password" }`
→ 200 `{ token, expiresIn, user }`. 401 si credenciales inválidas.

Token: JWT HS256, 8 h, claims `sub, email, tenantId, role, employeeId`. El front lo manda como
`Authorization: Bearer <token>`. Sin refresh token: al expirar, 401 → volver al login.

## 6. Pruebas rápidas

```bash
API=https://xxxx.execute-api.us-east-1.amazonaws.com/dev
curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@empresa-a.com","password":"Demo1234!"}'
# decodificar el token en jwt.io para la demo: tenantId = tenant_a
```

Prueba cruzada de la demo: login con tenant_b y pedir el id de un empleado de tenant_a → 404/403.

## 7. Pendientes que dependen de Academy (verificar)

- Que el rol se llame exactamente `LabRole` (`aws iam get-role --role-name LabRole`).
- Credenciales temporales: si el deploy falla con `ExpiredToken`, renovarlas.
- Amplify Hosting y las cuotas de API Gateway/DynamoDB en el lab (lo confirma Integrante 5 / 2).
