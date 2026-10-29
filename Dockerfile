# ---------------------------------------------
# Fase 1: Compilación de TypeScript
# ---------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifiestos y configuraciones
COPY package*.json tsconfig.json ./
RUN npm ci

# Copiar código fuente y compilar
COPY src/ ./src/
RUN npm run build

# ---------------------------------------------
# Fase 2: Imagen Final Ligera para Ejecución
# ---------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Instalar únicamente dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar artefactos compilados desde el builder
COPY --from=builder /app/dist ./dist

# Crear carpeta de exportaciones
RUN mkdir -p /app/exports

# Ejecución de la CLI interactiva
ENTRYPOINT ["node", "dist/index.js"]
