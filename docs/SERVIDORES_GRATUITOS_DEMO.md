# Servidores gratuitos o con capa gratis para Applia (demo y pruebas)

Tu proyecto usa **Node.js (Express)** + **React/Vite** + **Firestore**. La base de datos ya está en la nube (Firebase), así que solo necesitas hospedar **una sola app** que sirve el backend y el front estático.

---

## Mejor opción: sin cambios en el código y poca configuración

**Render** es la más directa: **no tocas el código** y solo configuras en la web de Render:

1. Conectar el repo de GitHub.
2. Escribir el comando de build y el de start.
3. Pegar las variables de entorno (las mismas de tu `.env`).

No hace falta Docker, Dockerfile ni adaptar Express a serverless. Tu `npm run build` y `npm run start` se usan tal cual.

---

## Guía Render desde 0 (paso a paso)

**Qué elegir en el dashboard:**  
En la pantalla de opciones (Static Site, Web Service, Private Services, etc.) debes elegir **Web Service**. Tu app es un servidor Node.js que corre Express; no es solo HTML estático.

### Paso 1 — Crear el Web Service
- Clic en **Web Service**.
- Si te pide conectar un repo: **Connect a repository** → elige tu cuenta de GitHub y el repositorio de Applia (si no lo ves, autoriza a Render para ver los repos).
- Selecciona el repo y confirma.

### Paso 2 — Configuración del servicio
- **Name:** por ejemplo `applia` (o el que quieras; será parte de la URL).
- **Region:** el que prefieras (ej. Oregon).
- **Branch:** `main` (o la rama donde tengas el código).
- **Root Directory:** déjalo **vacío** (el proyecto está en la raíz del repo).
- **Runtime:** **Node**.
- **Build Command:**  
  `npm install && npm run build`
- **Start Command:**  
  `npm run start`
- **Plan:** **Free**.

### Paso 3 — Variables de entorno
- En la misma pantalla, abre la sección **Environment** (o **Environment Variables**).
- Añade **una por una** las variables de tu `.env` (las que usa el backend: Firebase, JWT, sesión, etc.). Ejemplos:
  - `NODE_ENV` = `production`
  - `FRONTEND_URL` = `https://applia-xxxx.onrender.com` (primero puedes dejarla vacía o poner la URL que Render te muestre después del primer deploy; luego la actualizas).
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SESSION_SECRET`, `JWT_SECRET`, etc.
- **No subas** el archivo `.env` al repo; solo copia los nombres y valores en Render.

### Paso 4 — Deploy
- Clic en **Create Web Service** (o **Deploy**).
- Render instalará dependencias, ejecutará el build y arrancará el servidor. La primera vez puede tardar unos minutos.
- Al terminar te dará una URL tipo: `https://applia-xxxx.onrender.com`.
- Si configuraste `FRONTEND_URL` en blanco, vuelve a **Environment**, edita `FRONTEND_URL` y pon esa URL; guarda (Render hará un redeploy automático si aplica).

### Paso 5 — Probar
- Abre la URL en el navegador: deberías ver tu app (login, etc.).
- La API estará en la misma URL, por ejemplo: `https://applia-xxxx.onrender.com/api/health` → debería devolver `{"ok":true,"message":"API OK"}`.

**Nota:** En plan Free, si no hay visitas unos 15 minutos, el servicio se duerme. La primera petición tras eso puede tardar 30–60 segundos en responder (cold start).

---

## Opciones recomendadas (gratis o capa gratis)

### 1. **Render** — La más simple (sin cambiar código)

| | |
|---|---|
| **Gratis** | Sí (plan Free) |
| **Límites** | 750 horas/mes; el servicio se “duerme” tras ~15 min sin visitas (el primer request tarda ~30–60 s en despertar). |
| **Ideal para** | Mostrar a higher ups, pruebas, demos. No para tráfico 24/7. |

**Ventajas:** Fácil deploy desde GitHub, variables de entorno (.env), Node.js nativo, HTTPS incluido, no requiere tarjeta en plan Free.

**Pasos rápidos:**
1. Sube el repo a GitHub (si no está ya).
2. [render.com](https://render.com) → Sign Up → New → **Web Service**.
3. Conecta el repo, branch `main` (o el que uses).
4. Configuración:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start` (o `node dist/index.cjs` si en producción no usas el script).
   - **Root Directory:** (dejar vacío si el repo es la raíz del proyecto).
5. En **Environment** añade todas las variables de tu `.env` (Firebase, JWT, etc.). No subas el archivo `.env` al repo.
6. Deploy. Te dará una URL tipo `https://applia-xxxx.onrender.com`.

**Importante:** En producción, en el backend configura `FRONTEND_URL` (y CORS si aplica) con la URL que te dé Render (ej. `https://tu-app.onrender.com`).

---

### 2. **Railway**

| | |
|---|---|
| **Gratis** | Crédito mensual (~5 USD), no hay “siempre gratis” ilimitado. |
| **Ideal para** | Demos cortas o cuando el crédito te alcance. |

Deploy desde GitHub, soporta Node, env vars, dominio propio. Buena opción si ya usas Railway o quieres algo muy rápido de configurar.

---

### 3. **Fly.io**

| | |
|---|---|
| **Gratis** | Tier gratuito con límites (vMs pequeñas, ancho de banda limitado). |
| **Ideal para** | Demos y pruebas; algo más técnico (CLI, Docker/instrucciones). |

Requiere tarjeta para verificación; el uso dentro del free tier no suele generar cobro. Documentación: [fly.io/docs](https://fly.io/docs).

---

### 4. **Google Cloud Run** (si ya usas Firebase/GCP)

| | |
|---|---|
| **Gratis** | 2 millones de requests/mes en el tier gratuito. |
| **Ideal para** | Si quieres todo en el ecosistema Google (Firebase + Cloud Run). |

Necesitas contenerizar la app (Dockerfile) y desplegar el contenedor en Cloud Run. Tu proyecto ya tiene guía en `DEPLOYMENT_GCP_COMPUTE_ENGINE.md`; Cloud Run es otra forma de ejecutar el mismo contenedor con menos gestión.

---

### 5. **Vercel** (enfoque front + serverless)

| | |
|---|---|
| **Gratis** | Tier gratuito generoso para front y serverless. |
| **Limitación** | Express está pensado para un proceso largo; en Vercel se suele exponer como serverless (una función por ruta o un adapter). Requiere adaptar un poco el backend. |

Mejor si en el futuro separas front (Vercel) y API (por ejemplo Render o Cloud Run).

---

### 6. **Glitch**

| | |
|---|---|
| **Gratis** | Sí; el proyecto “duerme” tras inactividad. |
| **Ideal para** | Prototipos y demos muy rápidos. |

Menos profesional que Render para mostrar a clientes, pero útil para pruebas personales.

---

## Resumen para “mostrar a higher ups”

- **Mejor opción sencilla y 100 % gratis:** **Render** (plan Free).  
  - Un solo servicio Node, deploy desde GitHub, env vars, HTTPS.  
  - Avisa que la primera carga tras un rato sin uso puede tardar ~30–60 s (cold start).

- **Alternativa con crédito gratis:** **Railway** (5 USD/mes de crédito).

- **Si ya están en Google:** **Cloud Run** con tier gratuito de requests.

En todos los casos, mantén el `.env` solo en la plataforma (variables de entorno), nunca en el repositorio, y configura `FRONTEND_URL` (y CORS si aplica) con la URL pública de la app en producción.
