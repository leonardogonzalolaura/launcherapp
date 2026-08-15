# 🐎 HorseLaunch

> Launcher de proyectos multi-lenguaje construido con **Tauri 2**, **React** y **TypeScript**.

HorseLaunch es una aplicación de escritorio que te permite registrar, detectar y ejecutar los comandos de tus proyectos de programación (Python, Scala, C#, React, JavaScript/TypeScript) desde una única interfaz, con consola de salida en vivo, seguimiento de la rama git y herramientas auxiliares como editor de archivos y explorador de APIs.

![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-2021-edition-orange?logo=rust)
![Version](https://img.shields.io/badge/version-0.2.1-blue)

---

## ✨ Características

- **Detección automática de proyectos** para los siguientes tipos:
  - 🐍 **Python** (`main.py`, `app.py`, `run.py`, `manage.py`, `wsgi.py`)
  - 🦭 **Scala / SBT** (`build.sbt`)
  - 🎯 **C# / .NET** (búsqueda de archivos `.csproj`, con soporte de proyectos de test)
  - ⚛️ **React** (detección por dependencia `react` en `package.json`)
  - 🟨 **JavaScript / TypeScript** (scripts de `package.json` + `tsconfig.json`, `vite`, `webpack`)
- **Comandos por defecto** según el tipo de proyecto (`run`, `dev`, `build`, `compile`, `test`, `start`, `preview`...).
- **Comandos personalizados**: crea, edita, duplica, agrupa y elimina tus propios comandos con variables de entorno y rutas personalizadas (JAVA_HOME, sbt, python main, proyecto .NET, script de Node).
- **Consola de procesos en vivo** con pestañas múltiples (posición de pestañas configurable arriba/abajo), salida coloreada por tipo (`stdout`/`stderr`), resaltado de líneas de éxito/error, búsqueda de logs y detección JSON.
- **Gestión de procesos**: iniciar, detener (mata el árbol de procesos con `taskkill /F /T`), reintentar, cerrar pestañas.
- **Rama git en vivo**: muestra la rama actual y vigila los cambios de rama mediante un *file watcher* en `.git/HEAD`.
- **Notificaciones del sistema** cuando un proceso termina (éxito o fallo).
- **Editor de archivos** integrado con **CodeMirror** (Python, JS/TS, JSON, HTML, CSS, Rust, C#, Java, etc.), pestañas múltiples, guardado con `Ctrl+S` y confirmación de cambios sin guardar.
- **Explorador de API**: carga el esquema OpenAPI/Swagger de un backend y permite ejecutar sus endpoints desde la app.
- **Paleta de comandos**, **paleta de proyecto** y **cambio rápido de proyecto**.
- **Tema claro/oscuro** y atajos de teclado globales.
- Persistencia de proyectos en disco (`projects.json`) y en `localStorage` (preferencias).

---

## 🧰 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18, TypeScript 5, Vite 5 |
| Estilos | Tailwind CSS 3 |
| Editor de código | CodeMirror 6 |
| Íconos | lucide-react |
| Shell | Tauri 2 (Rust) |
| Backend Rust | tokio, serde, notify, ureq, walkdir, regex, uuid, chrono |
| Plugins Tauri | dialog, fs, notification, opener |

---

## 📋 Requisitos previos

- **Node.js** ≥ 18 y **npm**
- **Rust** (stable) y **Cargo** — instala con [rustup](https://rustup.rs/)
- **Tauri CLI** — se incluye como dependencia (`@tauri-apps/cli`)
- **Windows** (probado) o tu sistema operativo con las dependencias nativas de Tauri. Nota: el proyecto hace uso de PowerShell y `taskkill`, optimizados para Windows.

---

## 🚀 Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/<tu-usuario>/launcherApp.git
cd launcherApp

# 2. Instalar dependencias del frontend
npm install
```

---

## 💻 Desarrollo

Ejecuta la app en modo desarrollo (compila el backend Rust y abre la ventana de Tauri):

```bash
npm run tauri dev
```

El frontend se sirve en `http://localhost:1420` (puerto fijo) y el backend se compila con `cargo`. También puedes trabajar solo con el frontend:

```bash
npm run dev      # solo Vite
```

---

## 📦 Build / Distribución

```bash
npm run build            # compila TypeScript + Vite (salida en dist/)
npm run tauri build      # compila el binario e instaladores (NSIS .exe y MSI)
```

Los instaladores se generan dentro de `src-tauri/target/release/bundle/`.

### Pipeline de release (GitHub Actions)

El repositorio incluye un workflow `.github/workflows/release.yml` que, al crear un tag `v*`, compila la app en `windows-latest` y publica automáticamente los instaladores en una **GitHub Release**.

```bash
git tag v0.2.1
git push origin v0.2.1
```

---

## 🗂️ Estructura del proyecto

```
launcherApp/
├── src/                      # Frontend React
│   ├── components/           # UI (Sidebar, ConsoleTab, modales, editor...)
│   │   ├── ApiExplorer.tsx   # Explorador de API (OpenAPI/Swagger)
│   │   ├── CodeEditor.tsx    # Editor CodeMirror
│   │   ├── FileEditorModal.tsx
│   │   ├── CommandPaletteModal.tsx
│   │   └── ...
│   ├── contexts/             # ThemeContext (tema claro/oscuro)
│   ├── hooks/                # useTauriCommands, useKeyboardShortcuts, atajos
│   ├── types/                # Tipos compartidos (Project, ProcessTab...)
│   ├── util/
│   ├── App.tsx               # Componente raíz / lógica principal
│   └── main.tsx
├── src-tauri/                # Backend Rust
│   ├── src/
│   │   ├── commands/         # project.rs, process.rs, detection.rs
│   │   ├── models/           # project.rs, config.rs
│   │   ├── utils/
│   │   ├── lib.rs            # Builder de Tauri y estado de la app
│   │   └── main.rs
│   ├── capabilities/         # Permisos de los plugins
│   ├── tauri.conf.json       # Configuración de la ventana y bundle
│   └── Cargo.toml
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 🎮 Uso

1. **Agregar un proyecto**: botón **Agregar** (barra inferior) o `Ctrl+Shift+D` → selecciona una carpeta. La app detecta el tipo y crea las configuraciones por defecto.
2. **Ejecutar un comando**: en la barra lateral, pulsa ▶ en la configuración deseada. Se abre una pestaña de consola con la salida en vivo.
3. **Gestionar procesos**: detener, reintentar, limpiar logs o cerrar la pestaña desde la barra de la consola.
4. **Comandos personalizados**: botón ➕ en la barra lateral para crear un comando propio (con variables de entorno, build previo, grupos y rutas personalizadas).
5. **Editor de archivos**: `Ctrl+Shift+E` para abrir el explorador y editar archivos del proyecto.
6. **Explorador de API**: icono 🌐 en la consola para cargar `openapi.json` y ejecutar endpoints.

### Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl+P` | Cambio rápido de proyecto |
| `Ctrl+Shift+P` | Paleta de comandos |
| `Ctrl+Shift+D` | Agregar comando personalizado |
| `Ctrl+Shift+O` | Comandos del proyecto |
| `Ctrl+Shift+E` | Editor de archivos |
| `Ctrl+W` / `Ctrl+Shift+W` | Cerrar pestaña / cerrar todas |
| `Ctrl+R` | Reintentar proceso detenido |
| `Ctrl+L` | Limpiar consola |
| `Ctrl+F` | Buscar en logs |
| `Ctrl+1`…`Ctrl+9` | Cambiar a pestaña N |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Siguiente / anterior pestaña |
| `Ctrl+/` | Ayuda de atajos |
| `Esc` | Cerrar modal |
| `Ctrl+B` | Colapsar barra lateral |

---

## 💾 Persistencia

- **Proyectos**: se guardan en `%APPDATA%/launcherapp/projects.json` (vía `dirs::config_dir()`).
- **Preferencias de UI** (proyecto seleccionado, posición de pestañas, URL del explorador de API): `localStorage` de la ventana.

---

## 🔌 Comandos Tauri principales

| Comando | Descripción |
|---------|-------------|
| `add_project` | Detecta y registra un proyecto |
| `get_projects` / `remove_project` / `clear_all_projects` | CRUD de proyectos |
| `detect_project_from_path` | Detecta tipo y comandos disponibles |
| `add_custom_command` / `update_project_config` / `delete_project_config` | Gestión de configuraciones |
| `spawn_project_command` / `stop_process` / `get_active_processes` | Ejecución y control de procesos |
| `get_git_branch` / `watch_git_branch` / `unwatch_git_branch` | Rama git y watcher |
| `fetch_external_url` / `execute_backend_request` | Peticiones HTTP (explorador de API) |

---

## 📄 Licencia

Proyecto personal. Autor: **Leonardo Daniel Gonzalo Laura**.