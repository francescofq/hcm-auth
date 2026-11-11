# hcm-auth: Servicio de autenticación (Integrante 1)

Autenticación propia con JWT para AWS Academy (sin Cognito, sin roles IAM nuevos).
Región: `us-east-1`. Stage: `dev`. Stack: `hcm-auth-dev`.

> **Orden de despliegue:** `hcm-auth` se despliega **primero**. Los demás stacks leen sus outputs.

## 1. URLs y valores (sin secretos)

| Dato | Valor |
|---|---|
| API base | `https://e3796x5a54.execute-api.us-east-1.amazonaws.com/dev` |
| Login | `POST /auth/login` |
| Registro | `POST /auth/register` |
| AuthorizerArn | `arn:aws:lambda:us-east-1:537206273759:function:hcm-auth-dev-authorizer` |
| Bucket S3 | `hcm-app-storage-537206273759-dev` |
| Tabla de usuarios | `hcm-auth-users-dev` |

### Exports de CloudFormation

- `hcm-auth-dev-AuthorizerArn`
- `hcm-auth-dev-BucketName`
- `hcm-auth-dev-BucketArn`
- `hcm-auth-dev-UsersTableName`
- `hcm-auth-dev-ApiUrl` (**atención:** el export se llama `ApiUrl`, no `AuthApiUrl`; `AuthApiUrl` es solo el nombre del *output*)

## 2. Proteger una ruta con el authorizer

> **Importante (Serverless v3):** en `authorizer.arn` **NO funciona** `!ImportValue`
> (falla con `functionArn.split is not a function`). Usar `${cf:...}`.

```yaml
functions:
  miFuncion:
    handler: src/miFuncion.handler
    events:
      - http:
          path: mi-ruta
          method: get
          cors: true
          authorizer:
            arn: ${cf:hcm-auth-dev.AuthorizerArn}
            type: token
            resultTtlInSeconds: 0   # obligatorio: sin caché
```

- Todos los stacks usan `provider.iam.role: arn:aws:iam::${aws:accountId}:role/LabRole`.
- `${cf:...}` solo funciona si `hcm-auth-dev` ya está desplegado.
- Para usar el bucket u otros valores en variables de entorno:
  `BUCKET_NAME: ${cf:hcm-auth-dev.BucketName}`

## 3. Leer el tenant y el usuario en las Lambdas protegidas

El authorizer deja estos datos en `event.requestContext.authorizer`:

```js
const { tenantId, role, employeeId, userId, email } =
  event.requestContext.authorizer;
```

Ya **no** se usa `claims['custom:tenant_id']` (eso era de Cognito).
Nunca tomar el tenant del body ni de la URL: siempre del authorizer.

- **RDS:** usar `tenantId` para `SET search_path TO <schema>`.
- **DynamoDB:** usar `tenantId` para armar `PK = TENANT#<tenantId>`.
- **Roles posibles:** `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`.
- **Tenants permitidos:** `tenant_a`, `tenant_b`, `tenant_c`.

## 4. CORS en respuestas 401/403/5XX

API Gateway genera los 401/403 sin pasar por la Lambda, así que no llevan CORS
a menos que cada stack lo agregue. Pegar esto en `resources.Resources` de **cada** stack
con API:

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
          gatewayresponse.header.Access-Control-Allow-Methods: "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    GatewayResponseDefault5XX:
      Type: AWS::ApiGateway::GatewayResponse
      Properties:
        ResponseType: DEFAULT_5XX
        RestApiId: { Ref: ApiGatewayRestApi }
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
```

## 5. Contrato del token (para el frontend)

- Header en cada petición protegida: `Authorization: Bearer <token>`
- Algoritmo HS256, vigencia **8 h**, issuer `hcm-auth`.
- Claims: `email`, `tenantId`, `role`, `employeeId`, `sub` (userId).
- **No hay refresh token.** Al expirar la API responde **401**: borrar el token y
  volver a la pantalla de login.
- El registro público siempre crea usuarios `EMPLOYEE` con un `tenantId` de la lista cerrada.

### Login

```bash
curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@empresa-a.com","password":"Demo1234!"}'
```

Respuesta `200`: `{ "token": "..." }`. Clave incorrecta: `401`.

### Registro

```bash
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"nuevo@empresa-a.com","password":"Clave1234!","tenantId":"tenant_a"}'
```

Respuesta `201`. Tenant fuera de la lista: `400`.

## 6. Usuarios demo

Clave de todos: `Demo1234!`

| Usuario | Tenant | Rol |
|---|---|---|
| admin@empresa-a.com | tenant_a | ADMIN |
| hr@empresa-a.com | tenant_a | HR |
| empleado@empresa-a.com | tenant_a | EMPLOYEE |
| admin@empresa-b.com | tenant_b | ADMIN |
| hr@empresa-b.com | tenant_b | HR |
| empleado@empresa-b.com | tenant_b | EMPLOYEE |
| admin@empresa-c.com | tenant_c | ADMIN |

Los `employeeId` actuales son de ejemplo (`emp-a-admin`, `emp-a-001`...). Deben
coincidir con los del seeding de cada tenant (coordinar con el Integrante 4).

## 7. Serverless Framework v3 en carpetas nuevas

Los proyectos usan `frameworkVersion: '3'`. En una carpeta nueva, `npx serverless`
descarga la v4 y falla. Instalar v3 dentro de cada proyecto:

```bash
npm init -y
npm install --save-dev serverless@3
npx serverless --version   # debe decir Framework Core: 3.x
```

(Ignorar los avisos de "deprecated" y no correr `npm audit fix --force`.)

## 8. Despliegue y uso

```bash
cd hcm-auth
cp .env.example .env        # completar JWT_SECRET (nunca subir .env al repo)
npx serverless deploy --stage dev
USERS_TABLE=hcm-auth-users-dev npm run seed:users
```

Verificar exports:

```bash
aws cloudformation list-exports --region us-east-1 \
  --query "Exports[?starts_with(Name,'hcm-auth')].[Name,Value]" --output table
```

## 9. Problemas comunes (AWS Academy)

- `ExpiredToken`: renovar credenciales en Lab > AWS Details > AWS CLI > Show y volver a exportarlas.
- Si el lab se detuvo y algo desapareció, volver a desplegar `hcm-auth` primero.
- No correr `serverless remove` en `hcm-auth` si otros stacks dependen de él.
- Nunca pegar `JWT_SECRET` ni tokens reales en chats o en el repo.
