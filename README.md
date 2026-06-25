# Operación BLOQUE · Escape Room educativo (Blockchain)

Juego HTML/CSS/JS de escape room para enseñar conceptos de blockchain (Web 1.0/2.0/3.0, transacciones, tipos de red, contratos inteligentes, tokenización, NFTs). Es un sitio 100% estático, sin backend ni build.

## Estructura

```
proyecto1/
├── index.html      → markup del juego
├── css/style.css   → estilos
└── js/main.js      → lógica del juego
```

## Probar localmente

Abre `index.html` con cualquier extensión de servidor local en VS Code (por ejemplo "Live Server") o ejecuta:

```bash
npx serve .
```

y abre la URL que te indique en el navegador.

## Publicar en Render (gratis)

1. Sube esta carpeta a un repositorio de GitHub (ver pasos abajo).
2. Entra a [render.com](https://render.com) y crea una cuenta (puedes usar tu cuenta de GitHub).
3. Click en **New +** → **Static Site**.
4. Conecta tu repositorio de GitHub.
5. Configuración:
   - **Build Command:** deja vacío (no hay build, no usar `npm install`).
   - **Publish directory:** `.` (la raíz del repo, donde está `index.html`).
6. Click en **Create Static Site**. Render te dará una URL pública tipo `https://tu-proyecto.onrender.com`.
7. Comparte ese link con los estudiantes.

Cada vez que hagas `git push` a la rama principal, Render vuelve a desplegar automáticamente.

## Subir este proyecto a GitHub

Desde esta carpeta:

```bash
git init
git add .
git commit -m "Proyecto inicial: Operación BLOQUE"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

(Crea antes el repositorio vacío en GitHub con ese nombre, sin README ni .gitignore, para evitar conflictos.)

## Modo demo para revisión docente

Agrega `#demo` al final de la URL (ej: `https://tu-proyecto.onrender.com/#demo`) para mostrar un panel de salto rápido entre salas. Los estudiantes nunca lo verán si abren el link normal.
