# Firebase Storage – Foto de perfil en registro

La app sube la foto de perfil **desde el navegador** directamente a **Firebase Storage** (no pasa por Render). Solo se guarda en Firestore la URL que devuelve Storage.

También se suben desde el cliente: **documento de identidad** (`verification_ids/`), **documento profesional** (`professional_credentials/`) y **avatares** (`avatars/`).

## Error al subir PDF: `storage/unauthorized`

Si al subir un **PDF** como documento profesional aparece:

`Firebase Storage: User does not have permission to access 'professional_credentials/.../archivo.pdf' (storage/unauthorized)`

las **reglas de Storage** están permitiendo solo imágenes (`image/...`) y **bloquean** `application/pdf`. Hay que publicar reglas que acepten PDF en la ruta `professional_credentials/{userId}/{fileName}`.

En el repo hay un ejemplo listo: **`storage.rules`** (y **`firebase.json`** para desplegar con CLI). Copia el bloque `professional_credentials` a Firebase Console → **Storage** → **Rules** → **Publish**, o despliega con:

`firebase deploy --only storage`

Si ya tenías reglas propias, **añade** la condición `|| request.resource.contentType == 'application/pdf'` al `allow write` de esa carpeta (o sustituye el archivo completo por el del repo si encaja con tu proyecto).

## 1. Activar Storage en Firebase Console

1. Entra en [Firebase Console](https://console.firebase.google.com) y abre tu proyecto (ej. `mango-169db`).
2. En el menú izquierdo: **Build** → **Storage**.
3. Si ves **"Get started"**, haz clic y confirma (elige ubicación si te lo pide).  
   Si ya ves la pestaña **Files** y **Rules**, Storage ya está activado.

No hace falta “activar” ningún SDK aparte: el mismo proyecto y las variables `VITE_FIREBASE_*` que ya usas (incluido `VITE_FIREBASE_STORAGE_BUCKET`) son los que usa el cliente para subir a Storage.

## 2. Reglas de Storage (recomendadas)

En **Storage** → **Rules**, la fuente de verdad recomendada es el archivo **`storage.rules`** en la raíz del repo (incluye `avatars/`, `verification_ids/` y `professional_credentials/` con **PDF** permitido en documento profesional).

Resumen del ejemplo histórico solo para **avatars** (si mantienes un proyecto mínimo):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 5 * 1024 * 1024
                  && request.resource.contentType.matches('image/.*');
    }
  }
}
```

- `allow read: if true` → cualquiera puede ver las fotos (necesario para mostrar avatares en la app).
- `allow write` en avatares → solo imágenes &lt; 5 MB.

Para verificación y credencial profesional, usa el **`storage.rules`** completo del repositorio y publícalo.

Después de editarlas, pulsa **Publish**.

## 3. Variables de entorno

En tu `.env` (o en Render) deben estar las variables web de Firebase, entre ellas:

- `VITE_FIREBASE_STORAGE_BUCKET=mango-169db.firebasestorage.app`  
  (o el valor que te muestre Firebase Console → Project settings → Your apps → config).

Con eso el cliente ya puede subir y obtener la URL para guardarla en Firestore en el registro.
