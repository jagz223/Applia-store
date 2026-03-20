# Firebase Storage – Foto de perfil en registro

La app sube la foto de perfil **desde el navegador** directamente a **Firebase Storage** (no pasa por Render). Solo se guarda en Firestore la URL que devuelve Storage.

## 1. Activar Storage en Firebase Console

1. Entra en [Firebase Console](https://console.firebase.google.com) y abre tu proyecto (ej. `mango-169db`).
2. En el menú izquierdo: **Build** → **Storage**.
3. Si ves **"Get started"**, haz clic y confirma (elige ubicación si te lo pide).  
   Si ya ves la pestaña **Files** y **Rules**, Storage ya está activado.

No hace falta “activar” ningún SDK aparte: el mismo proyecto y las variables `VITE_FIREBASE_*` que ya usas (incluido `VITE_FIREBASE_STORAGE_BUCKET`) son los que usa el cliente para subir a Storage.

## 2. Reglas de Storage (recomendadas)

En **Storage** → **Rules**, puedes usar reglas como estas para permitir:

- **Subir** solo imágenes en la carpeta `avatars/` y con tamaño máximo 5 MB (usuarios aún no autenticados en registro).
- **Leer** esas imágenes para mostrarlas en la app.

Ejemplo de reglas:

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
- `allow write` → solo se aceptan archivos &lt; 5 MB y de tipo imagen en `avatars/`.

Después de editarlas, pulsa **Publish**.

## 3. Variables de entorno

En tu `.env` (o en Render) deben estar las variables web de Firebase, entre ellas:

- `VITE_FIREBASE_STORAGE_BUCKET=mango-169db.firebasestorage.app`  
  (o el valor que te muestre Firebase Console → Project settings → Your apps → config).

Con eso el cliente ya puede subir y obtener la URL para guardarla en Firestore en el registro.
