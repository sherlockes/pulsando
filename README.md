# 🔔 Pulsando v1.0 - Buzzer de Clase en Tiempo Real

**Pulsando** es una aplicación web moderna diseñada para dinamizar clases y eventos. Permite a los profesores realizar rondas de preguntas con un sistema de pulsadores sincronizado en tiempo real, garantizando justicia y diversión.

---

## 🚀 Características Principales

- **Doble Interfaz**: Vistas optimizadas para Alumno (`index.html`) y Profesor (`teacher.html`).
- **Tiempo Real**: Sincronización instantánea mediante Firebase Firestore.
- **Justicia de Juego (Anti-Cheat)**: 
  - **Penalización por Ansia**: Bloqueo automático (2-5s) si se pulsa antes de tiempo.
  - **Penalización por Error (⚡)**: El profesor puede retrasar 1s el botón de un alumno si contestó mal.
- **Control Total del Docente**:
  - Gestión de sesiones mediante PIN de 4 dígitos.
  - Control de acceso (Cerrar/Abrir clase).
  - Gestión de lista (Expulsar individualmente o vaciar clase).
- **Manual Integrado**: Botón de ayuda (?) con guía rápida en el panel del profesor.
- **Mantenimiento Automático**: Eliminación automática de sesiones con más de una semana de antigüedad para optimizar la base de datos.
- **Diseño de Vanguardia**: Estética *Glassmorphism* totalmente responsiva.

---

## 📖 Guía de Uso Rápido

### Para el Profesor:
1. Crea una clase con un nombre y un PIN de 4 dígitos.
2. Comparte el PIN con tus alumnos.
3. Haz clic en **ACTIVAR** para habilitar los pulsadores.
4. El primer alumno en pulsar aparecerá en tu pantalla.
5. Usa **REINICIAR** para limpiar el ganador y empezar la siguiente pregunta.

### Para el Alumno:
1. Introduce el nombre de la clase, tu nombre y el PIN.
2. Espera a que el profesor active el pulsador (el botón se pondrá rojo).
3. ¡Sé el más rápido en pulsar! 

---

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (ES6+).
- **Backend**: Firebase Firestore.
- **Build Tool**: Vite.js.
- **Deployment**: Vercel.

---

## 💻 Configuración Local

1. **Instalar dependencias**: `npm install`
2. **Configurar .env**: Crea un archivo `.env` con tus claves de Firebase.
3. **Ejecutar**: `npm run dev`

---

## 🌐 Despliegue (Vercel)

1. Sube el código a GitHub (el `.env` será ignorado por seguridad).
2. En Vercel, añade las variables de entorno necesarias (`VITE_FIREBASE_API_KEY`, etc.).
3. Vercel desplegará automáticamente la aplicación.

---

## 🔒 Reglas de Seguridad de Firestore

Copia estas reglas en tu consola de Firebase para asegurar el funcionamiento:

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
