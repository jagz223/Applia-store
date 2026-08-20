# Guía de Despliegue Applia en Hostinger

## Opciones de Despliegue en Hostinger

### Opción 1: Hosting Compartido con Node.js (Recomendado)

Hostinger ofrece Node.js en sus planes Premium y Business.

#### Pasos:

1. **Sube los archivos al File Manager**
   - Ve a Hostinger hPanel > Archivos > File Manager
   - Sube los siguientes archivos y carpetas:
     - `dist/index.cjs` → Rename a `index.js`
     - Carpeta `dist/public/`
     - Archivo `.env` (con tus variables de entorno)
     - `package.json` (del proyecto)

2. **Configura el archivo package.json para producción**
   Asegúrate de tener en la raíz:
   ```json
   {
     "name": "applia",
     "version": "1.0.0",
     "main": "index.js",
     "scripts": {
       "start": "node index.js"
     }
   }
   ```

3. **Instala las dependencias**
   - Ve a Accesos SSH en hPanel
   - Ejecuta: `npm install`

4. **Configura el proceso de Node.js**
   - Ve a hPanel > Sitios Web > Configuración > Node.js
   - Activa Node.js
   - Establece el comando de inicio: `node index.js`
   - Establece la versión de Node.js (recomendada: 20.x)

5. **Configura el dominio**
   - Apunta tu dominio a Hostinger
   - Configura el proxy inverso si es necesario

### Opción 2: VPS Hostinger (Máximo Control)

Si tienes un VPS en Hostinger:

1. **Conéctate por SSH**
   ```bash
   ssh usuario@tu-servidor
   ```

2. **Instala Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Sube los archivos**
   ```bash
   scp -r ./mango-applia/dist usuario@tu-servidor:/var/www/applia/
   scp ./mango-applia/.env usuario@tu-servidor:/var/www/applia/
   ```

4. **Instala dependencias y ejecuta**
   ```bash
   cd /var/www/applia
   npm install --production
   pm2 start index.js --name applia
   pm2 save
   ```

5. **Configura Nginx como proxy inverso**
   ```nginx
   server {
       server_name tudominio.com;
       
       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Opción 3: Despliegue Rápido (Static + API Externa)

Si Hostinger no soporta Node.js:

1. **Sube solo la carpeta `dist/public/`**
   - Esto es tu sitio estático
   - Sube a la carpeta `public_html`

2. **Usa un servicio externo para la API**
   - Deploy del backend en Railway, Render, o Heroku
   - Actualiza las variables de entorno en el frontend

## Variables de Entorno Requeridas

Asegúrate de configurar estas en Hostinger:

```env
# JWT
JWT_SECRET=tu-secreto-muy-largo-y-seguro

# Stripe (Pagos)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox

# dLocal Go
DLOCALGO_API_KEY=
DLOCALGO_SECRET_KEY=
DLOCALGO_MODE=sandbox
DLOCALGO_CURRENCY=USD
DLOCALGO_COUNTRY=

# URL pública (retornos de pago)
FRONTEND_URL=http://localhost:5000
PUBLIC_SITE_URL=http://localhost:5000

# Firebase (Opcional - para Base de Datos)
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

## Notas Importantes

1. **Base de Datos**: Actualmente el proyecto usa almacenamiento en memoria. Para producción, configura PostgreSQL o MySQL con Drizzle ORM.

2. **Socket.IO**: Si usas el chat en tiempo real, asegúrate de que WebSockets esté habilitado en Hostinger.

3. **SSL**: Hostinger incluye SSL gratuito. Actívalo desde hPanel > SSL.

4. **Errores comunes**:
   - "Port already in use": Cambia el puerto a 8080 o el que asigne Hostinger
   - "Module not found": Asegúrate de ejecutar `npm install`

## Scripts Útiles

```bash
# Iniciar en producción
npm start

# Ver logs
pm2 logs applia

# Reiniciar
pm2 restart applia
```

## Soporte

Si tienes problemas con el despliegue, contacta al equipo de Hostinger para confirmar que tu plan incluye soporte para Node.js.
