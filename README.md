# 🤖 claude2md

> Herramienta de línea de comandos (CLI) interactiva para procesar archivos de exportación de **Claude** (`conversations.json`) y extraer conversaciones a formato **Markdown (`.md`)** optimizado para contexto en otros Modelos de Lenguaje (ChatGPT, Gemini, DeepSeek, Llama, etc.).

---

## ✨ Características

- ⚡ **Gestión Eficiente de Memoria (Streaming):** Utiliza `stream-json` con un pipeline de doble pasada. Indexa y extrae metadatos sin cargar el árbol completo de mensajes en memoria RAM. Funciona de manera fluida y con consumo constante (< 50 MB de RAM) incluso con archivos de cientos de megabytes o gigabytes.
- 🔍 **Búsqueda Interactiva en Tiempo Real:** Interfaz en terminal construida con `@inquirer/prompts`. Permite buscar por palabras clave en el título, filtrar por fechas o navegar con las teclas de flecha.
- 🤖 **Formato Optimizado para LLMs:** Genera archivos Markdown limpios con cabecera de metadatos, turnos claros (`**Usuario:**` y `**Claude:**`), saltos de línea legibles y separadores horizontales para facilitar la tokenización y comprensión del contexto.
- 🛡️ **Compatibilidad con múltiples versiones de exportación:** Soporta tanto el formato clásico (`msg.text`) como el formato moderno estructurado en bloques (`msg.content[].text`).
- 🐳 **100% Dockerizado:** Compatible con Docker Compose sin necesidad de instalar Node.js ni TypeScript en el sistema host.

---

## 📥 ¿Cómo obtener tu archivo de Claude?

1. En tu cuenta de Claude, dirígete a: **Settings** ➔ **Account** ➔ **Export Data**.
2. Claude te enviará un correo con un archivo de descarga:
   - **Si recibes un archivo `.zip`:** Descomprímelo y busca el archivo `conversations.json`.
   - **Si recibes un archivo `manifest.json`:** Ábrelo, busca la entrada con `"category": "conversations"` (usualmente `conversations-000.zip`), descarga ese archivo con el enlace provisto y extráelo para obtener `conversations.json`.
3. Coloca el archivo `conversations.json` en la raíz de este proyecto.

---

## 🚀 Inicio Rápido con Docker (Recomendado)

No necesitas instalar Node ni dependencias locales. Solo requieres tener instalado **Docker** y **Docker Compose**.

### 1. Preparar el archivo
Asegúrate de colocar tu `conversations.json` en la raíz del proyecto:

```bash
cd claude2md
# Asegúrate de que conversations.json esté en esta carpeta
```

### 2. Ejecutar la herramienta interactiva
```bash
docker compose run --rm claude2md
```

> **¿Por qué `run --rm`?**  
> Al ser una herramienta CLI con interfaz de terminal interactiva (captura de teclado, colores y flechas de navegación), `run --rm` conecta directamente tu terminal (TTY/STDIN) al contenedor y lo elimina automáticamente al salir.

Los archivos generados se guardarán automáticamente en tu máquina en la carpeta `./exports/`.

---

## 🛠️ Ejecución Local con Node.js y TypeScript

### Requisitos previos
- Node.js 20 LTS o 22 LTS
- npm

### 1. Instalación de dependencias
```bash
npm install
```

### 2. Compilar el proyecto
```bash
npm run build
```

### 3. Ejecutar la herramienta
```bash
# Ejecutar la versión compilada
npm start

# O ejecutar directamente con Node pasando una ruta personalizada:
node dist/index.js ./ruta/a/tu/conversations.json
```

### 4. Modo desarrollo (recarga rápida sin compilar)
```bash
npm run dev
```

### 5. Instalar como comando global en tu sistema
```bash
# Permite ejecutar 'claude2md' desde cualquier terminal
npm link

# Ahora simplemente corre:
claude2md
```

---

## 📄 Formato del Markdown Generado

Cada archivo exportado se guarda en la carpeta `./exports/` con el nombre normalizado `[YYYY-MM-DD]_[Titulo_Conversacion].md`.

Ejemplo de estructura de salida:

```markdown
## Arquitectura de Microservicios en Go

> **Fecha:** 2024-02-10 15:30:00 UTC  
> **ID:** `conv-1-uuid`  
> **Total de mensajes:** 2

---

**Usuario:**

¿Cómo estructurar un proyecto de microservicios con Clean Architecture en Go?

---

**Claude:**

Para Clean Architecture en Go, la estructura recomendada se divide en capas concéntricas:

1. Dominio (Entities)
2. Casos de Uso (Usecases)
3. Repositorios y Controladores (Adapters)
4. Frameworks & Drivers.
```

---

## 📂 Estructura del Proyecto

```text
claude2md/
├── src/
│   └── index.ts              # Lógica principal, streaming, sanitización y menú interactivo
├── exports/                  # Directorio donde se guardan los archivos .md exportados
├── conversations.json        # Tu archivo de exportación de Claude
├── Dockerfile                # Imagen multi-stage optimizada (node:22-alpine)
├── docker-compose.yml        # Configuración de Docker Compose con TTY y volúmenes
├── .dockerignore             # Exclusiones de construcción Docker
├── package.json              # Dependencias y scripts
├── tsconfig.json             # Configuración TypeScript (ES2022 / NodeNext)
└── README.md                 # Documentación del proyecto
```

---

## 🧠 Detalles Técnicos de Rendimiento

1. **Lectura por Streams (SAX-like):** A diferencia de `fs.readFileSync` o `JSON.parse` que pueden colapsar el Garbage Collector de V8 en archivos grandes, `stream-json` tokeniza el JSON de entrada como un flujo secuencial.
2. **Cache de Metadatos Ultraligero:** La primera pasada solo almacena en memoria un array de objetos con `uuid`, `name`, `createdAt` y conteo de mensajes, consumiendo típicamente menos de 2 MB incluso para 5.000 conversaciones.
3. **Escritura bajo demanda:** Al confirmar la selección, el stream salta directamente a la conversación requerida, canaliza la salida directamente al archivo de destino mediante `fs.createWriteStream` y finaliza de inmediato liberando los recursos.

---

## 📝 Licencia

Distribuido bajo la Licencia **MIT**.
