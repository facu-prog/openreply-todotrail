# Migración a stack híbrido $0 + Railway solo para el worker

## Arquitectura final

| Servicio | Plataforma | Costo |
|---|---|---|
| Web app (Next.js) | Vercel Hobby | $0 |
| PostgreSQL | Neon free tier | $0 |
| Redis | Redis Cloud Essentials | $0 |
| Worker (24/7) | Railway Hobby | ~$2–3/mes |

---

## Paso 1 — Crear Neon (PostgreSQL)

1. Ir a https://neon.tech → Sign up → New project → nombre: `openreply`
2. En el dashboard de Neon: **Connection string** → copiar la URL completa
3. Formato: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`
4. Guardar como `DATABASE_URL`

---

## Paso 2 — Crear Redis Cloud

1. Ir a https://redis.io/try-free → Sign up → Free Essentials (30 MB)
2. Crear database → región US-East → copiar **Public endpoint** + contraseña
3. Formato: `redis://default:PASSWORD@redis-xxx.upstash.io:PORT`
4. ⚠️ Importante: que sea **TCP nativo** (no HTTP-only) — BullMQ lo necesita
5. Guardar como `REDIS_URL`

---

## Paso 3 — Deploy web app en Vercel

1. Ir a https://vercel.com → Import Git repository → `facu-prog/openreply-todotrail`
2. Framework: Next.js (detectado automáticamente)
3. Build command: `npm run vercel-build` (ya configurado en package.json)
4. Variables de entorno — agregar todas:

```
NEXTAUTH_URL=https://TU-APP.vercel.app
NEXTAUTH_SECRET=<generar con: openssl rand -hex 32>
CRON_SECRET=<generar con: openssl rand -hex 32>
ENCRYPTION_KEY=<misma que tenías en Railway — NO cambiar o los tokens encriptados se rompen>
DATABASE_URL=<la de Neon>
REDIS_URL=<la de Redis Cloud>
RESEND_API_KEY=<la que ya tenés>
EMAIL_FROM=RespondeTuti <login@todotrail.com.ar>
META_GRAPH_API_VERSION=v25.0
INSTAGRAM_APP_ID=<el que ya tenés>
INSTAGRAM_APP_SECRET=<el que ya tenés>
FACEBOOK_APP_ID=<el que ya tenés>
FACEBOOK_APP_SECRET=<el que ya tenés>
WEBHOOK_VERIFY_TOKEN=<el que ya tenés>
ALLOWED_EMAILS=facu@todotrail.run
```

5. Deploy → cuando termine, copiar la URL (ej. `openreply-todotrail.vercel.app`)
6. Actualizar `NEXTAUTH_URL` con esa URL exacta
7. ⚠️ Actualizar el webhook en Meta → Settings → Webhook URL → nueva URL de Vercel

---

## Paso 4 — Worker en Railway (solo el worker)

1. En Railway: nuevo proyecto → "Deploy from GitHub repo" → `facu-prog/openreply-todotrail`
2. Railway detectará el `railway.toml` y usará `npm run worker` como start command
3. Variables de entorno en Railway (solo estas — el worker no necesita las de Meta/Auth):

```
DATABASE_URL=<la de Neon — misma que Vercel>
REDIS_URL=<la de Redis Cloud — misma que Vercel>
ENCRYPTION_KEY=<misma que Vercel — crítico>
NODE_ENV=production
```

4. Verificar en logs que aparezca: `[DM Worker] Started`

---

## Paso 5 — Verificar

1. Desde otra cuenta de Instagram, comentar la keyword en un reel configurado
2. Verificar en Railway logs que el worker procese el job
3. Verificar que llegue el DM

---

## ⚠️ ENCRYPTION_KEY — crítica

La `ENCRYPTION_KEY` que ya está en Railway **no cambiarla**. Es la que encripta los tokens de Instagram en la DB. Si ponés una nueva, el worker no podrá desencriptar los tokens existentes y fallará silenciosamente. Copiala exactamente de Railway antes de hacer la migración.

---

## Rollback

Si algo falla, el antiguo deploy en Railway sigue funcionando hasta que lo bajes manualmente. No hay rush.
