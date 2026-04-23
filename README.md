# 🔔 Pulsando - Buzzer de Clase en Tiempo Real

**Pulsando** es una aplicación web moderna diseñada para dinamizar clases y eventos, permitiendo a los profesores realizar rondas de preguntas con un sistema de pulsadores sincronizado en tiempo real.

---

## 🚀 Características Principales

- **Doble Interfaz**: Vistas optimizadas para Alumno (`index.html`) y Profesor (`teacher.html`).
- **Tiempo Real**: Sincronización instantánea mediante Firebase Firestore.
- **Sistema Anti-Cheat**: 
  - Penalización aleatoria (1-5s) por pulsaciones prematuras.
  - Bloqueo visual con animación de vibración.
- **Control Total del Profesor**:
  - Crear sesiones con PIN de 4 dígitos.
  - Abrir/Cerrar clase para nuevos alumnos.
  - Expulsar alumnos de la lista en tiempo real.
  - Visualización del ganador con marca de tiempo atómica.
- **Diseño Premium**: Estética *Glassmorphism* responsiva, ideal para dispositivos móviles.

---

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3 (Modern CSS), JavaScript (ES6+).
- **Backend**: Firebase Firestore (NoSQL).
- **Herramientas**: Vite.js (Empaquetado), Vercel (Despliegue).

---

## 💻 Configuración Local

1. **Clonar el repositorio**:
   ```bash
   git clone <url-del-repo>
   cd pulsando
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**:
   Crea un archivo `.env` en la raíz con tus credenciales de Firebase:
   ```env
   VITE_FIREBASE_API_KEY=XXXXXXXXXX
   VITE_FIREBASE_AUTH_DOMAIN=XXXXXXXXXX
   VITE_FIREBASE_PROJECT_ID=XXXXXXXXXX
   VITE_FIREBASE_STORAGE_BUCKET=XXXXXXXXXX
   VITE_FIREBASE_MESSAGING_SENDER_ID=XXXXXXXXXX
   VITE_FIREBASE_APP_ID=XXXXXXXXXX
   ```

4. **Ejecutar en desarrollo**:
   ```bash
   npm run dev
   ```

---

## 🌐 Despliegue en Vercel

Este proyecto está configurado para desplegarse fácilmente en Vercel:

1. Conecta tu repositorio de GitHub a Vercel.
2. En los ajustes del proyecto, añade las **Environment Variables** con los mismos nombres que en el archivo `.env`.
3. Vercel detectará automáticamente la configuración de **Vite** y realizará el despliegue.

---

## 🔒 Seguridad (Reglas de Firestore)

Asegúrate de configurar las reglas de tu base de datos para permitir el acceso mediante PIN:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read, create, update: if true;
      match /students/{studentName} {
        allow read, create, delete: if true;
      }
    }
  }
}
```
