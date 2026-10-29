#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
// @ts-ignore stream-json ESM subpath compatibility
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { search, confirm, input } from '@inquirer/prompts';
import pc from 'picocolors';

// ==========================================
// Tipos e Interfaces
// ==========================================

export interface ChatMessageContentBlock {
  type?: string;
  text?: string;
}

export interface ChatMessage {
  uuid?: string;
  sender: 'human' | 'assistant' | 'user' | string;
  text?: string;
  content?: string | ChatMessageContentBlock[];
  created_at?: string;
  updated_at?: string;
  index?: number;
}

export interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at?: string;
  chat_messages: ChatMessage[];
}

export interface ConversationSummary {
  uuid: string;
  name: string;
  createdAt: string;
  messageCount: number;
}

// ==========================================
// Utilidades de Formato y Extracción
// ==========================================

/**
 * Normaliza y extrae el contenido textual de un mensaje de Claude,
 * soportando tanto la propiedad legacy `text` como la nueva `content` en bloques.
 */
export function extractMessageContent(msg: ChatMessage): string {
  if (typeof msg.text === 'string' && msg.text.trim()) {
    return msg.text.trim();
  }

  if (typeof msg.content === 'string' && msg.content.trim()) {
    return msg.content.trim();
  }

  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  return '(Mensaje sin contenido de texto)';
}

/**
 * Mapea el rol del emisor a etiquetas legibles y óptimas para contexto de LLMs.
 */
export function formatSender(sender: string): string {
  const normalized = (sender || '').toLowerCase().trim();
  if (normalized === 'human' || normalized === 'user') {
    return '**Usuario:**';
  }
  if (normalized === 'assistant' || normalized === 'claude') {
    return '**Claude:**';
  }
  const label = normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Emisor';
  return `**${label}:**`;
}

/**
 * Sanitiza nombres de archivo para compatibilidad en Linux/macOS/Windows.
 */
export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remueve tildes
    .replace(/[^a-zA-Z0-9_\-\s]/g, '') // Remueve caracteres especiales
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

/**
 * Da formato amigable a fechas ISO.
 */
export function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return isoDate;
  }
}

// ==========================================
// Procesamiento de Streams (Memoria Eficiente)
// ==========================================

/**
 * Paso 1: Indexa metadatos ligeros de todas las conversaciones sin retener
 * los mensajes en memoria. Ideal para archivos de cientos de MB o GBs.
 */
export async function indexConversations(filePath: string): Promise<ConversationSummary[]> {
  const summaries: ConversationSummary[] = [];

  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const pipeline = fileStream.pipe(streamArray.withParserAsStream());

    let processedCount = 0;
    const updateProgress = () => {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(
        pc.cyan(`⚡ Indexando conversaciones... (${pc.bold(processedCount.toString())} encontradas)`)
      );
    };

    fileStream.on('error', (err) => reject(new Error(`Error leyendo el archivo: ${err.message}`)));

    pipeline.on('data', ({ value }: { key: number; value: any }) => {
      if (!value || typeof value !== 'object') return;

      const summary: ConversationSummary = {
        uuid: value.uuid || `item-${processedCount}`,
        name: (value.name || 'Conversación sin título').trim(),
        createdAt: value.created_at || new Date().toISOString(),
        messageCount: Array.isArray(value.chat_messages) ? value.chat_messages.length : 0,
      };

      summaries.push(summary);
      processedCount++;

      if (processedCount % 50 === 0) {
        updateProgress();
      }
    });

    pipeline.on('end', () => {
      updateProgress();
      process.stdout.write('\n');
      resolve(summaries);
    });

    pipeline.on('error', (err: any) => reject(new Error(`Error parseando JSON: ${err.message}`)));
  });
}

/**
 * Paso 2: Extrae únicamente la conversación seleccionada mediante streaming,
 * volcándola directamente a disco sin acumular strings gigantes en memoria.
 */
export async function streamExportConversation(
  filePath: string,
  targetUuid: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const pipeline = fileStream.pipe(streamArray.withParserAsStream());
    const outStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

    let found = false;

    const cleanup = () => {
      // Destruye streams para liberar descriptores y memoria inmediatamente
      fileStream.destroy();
      pipeline.destroy();
    };

    fileStream.on('error', (err) => {
      cleanup();
      reject(err);
    });

    outStream.on('error', (err) => {
      cleanup();
      reject(err);
    });

    pipeline.on('error', (err: any) => {
      cleanup();
      reject(err);
    });

    pipeline.on('data', ({ value }: { key: number; value: ClaudeConversation }) => {
      if (value && value.uuid === targetUuid) {
        found = true;

        const title = (value.name || 'Conversación sin título').trim();
        const dateStr = formatDate(value.created_at);
        const totalMsgs = Array.isArray(value.chat_messages) ? value.chat_messages.length : 0;

        // Cabecera Markdown para LLMs
        outStream.write(`## ${title}\n\n`);
        outStream.write(`> **Fecha:** ${dateStr}  \n`);
        outStream.write(`> **ID:** \`${value.uuid}\`  \n`);
        outStream.write(`> **Total de mensajes:** ${totalMsgs}\n\n`);
        outStream.write(`---\n\n`);

        // Mensajes
        if (Array.isArray(value.chat_messages)) {
          for (let i = 0; i < value.chat_messages.length; i++) {
            const msg = value.chat_messages[i];
            const senderLabel = formatSender(msg.sender);
            const content = extractMessageContent(msg);

            outStream.write(`${senderLabel}\n\n`);
            outStream.write(`${content}\n\n`);

            // Separador entre turnos excepto en el último mensaje
            if (i < value.chat_messages.length - 1) {
              outStream.write(`---\n\n`);
            }
          }
        }

        outStream.end(() => {
          cleanup();
          resolve();
        });
      }
    });

    pipeline.on('end', () => {
      if (!found) {
        outStream.end();
        cleanup();
        reject(new Error(`No se encontró la conversación con UUID: ${targetUuid}`));
      }
    });
  });
}

// ==========================================
// Flujo Principal de la CLI
// ==========================================

async function resolveSourceFile(): Promise<string> {
  const argPath = process.argv[2];
  const defaultPath = path.resolve(process.cwd(), 'conversations.json');

  if (argPath) {
    const resolvedArg = path.resolve(process.cwd(), argPath);
    if (fs.existsSync(resolvedArg)) {
      return resolvedArg;
    }
    console.log(pc.yellow(`⚠️ El archivo especificado (${argPath}) no fue encontrado.`));
  }

  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  // Si no se encuentra automáticamente, pedir ruta al usuario
  console.log(pc.yellow('⚠️ No se encontró "conversations.json" en el directorio actual.'));
  const userPath = await input({
    message: 'Ingresa la ruta al archivo JSON exportado de Claude:',
    validate: (val) => {
      if (!val.trim()) return 'Debes ingresar una ruta válida.';
      const p = path.resolve(process.cwd(), val.trim());
      if (!fs.existsSync(p)) return 'El archivo no existe en esa ruta.';
      return true;
    },
  });

  return path.resolve(process.cwd(), userPath.trim());
}

async function main() {
  console.log('\n' + pc.bgMagenta(pc.bold(' 🤖 CLAUDE TO MARKDOWN CONVERTER (CLI) ')) + '\n');

  let filePath: string;
  try {
    filePath = await resolveSourceFile();
  } catch (err: any) {
    console.log(pc.dim('\nOperación cancelada por el usuario.'));
    process.exit(0);
  }

  const stat = fs.statSync(filePath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(pc.dim(`📁 Archivo origen: ${filePath} (${sizeMb} MB)\n`));

  let conversations: ConversationSummary[] = [];
  try {
    conversations = await indexConversations(filePath);
  } catch (err: any) {
    console.error(pc.red(`\n❌ Error al procesar el archivo: ${err.message}`));
    process.exit(1);
  }

  if (conversations.length === 0) {
    console.log(pc.yellow('⚠️ No se encontraron conversaciones en el archivo especificado.'));
    process.exit(0);
  }

  console.log(pc.green(`✔ ${conversations.length} conversaciones indexadas exitosamente.\n`));

  // Crear directorio de salida si no existe
  const outputDir = path.resolve(process.cwd(), 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let continueExporting = true;

  while (continueExporting) {
    try {
      const selectedUuid = await search({
        message: 'Busca por palabra clave o selecciona una conversación:',
        source: async (searchTerm) => {
          const term = (searchTerm || '').trim().toLowerCase();

          const filtered = term
            ? conversations.filter(
                (c) =>
                  c.name.toLowerCase().includes(term) ||
                  c.createdAt.includes(term) ||
                  c.uuid.toLowerCase().includes(term)
              )
            : conversations;

          return filtered.map((c) => {
            const shortDate = c.createdAt.slice(0, 10);
            const msgLabel = `${c.messageCount} msg${c.messageCount !== 1 ? 's' : ''}`;
            return {
              name: `${pc.dim(`[${shortDate}]`)} ${pc.bold(c.name)} ${pc.cyan(`(${msgLabel})`)}`,
              value: c.uuid,
              description: `UUID: ${c.uuid} | Fecha: ${formatDate(c.createdAt)}`,
            };
          });
        },
      });

      const selectedConv = conversations.find((c) => c.uuid === selectedUuid);
      const safeName = sanitizeFilename(selectedConv?.name || 'conversacion');
      const datePrefix = (selectedConv?.createdAt || '').slice(0, 10);
      const filename = `${datePrefix}_${safeName || selectedUuid.slice(0, 8)}.md`;
      const outputPath = path.join(outputDir, filename);

      process.stdout.write(pc.cyan(`⏳ Exportando "${selectedConv?.name}" a Markdown... `));

      await streamExportConversation(filePath, selectedUuid, outputPath);

      const outStat = fs.statSync(outputPath);
      const outSizeKb = (outStat.size / 1024).toFixed(1);

      console.log(pc.green(pc.bold('✔ ¡Completado!')));
      console.log(pc.cyan(`📄 Archivo generado: ${pc.bold(outputPath)} (${outSizeKb} KB)\n`));

      continueExporting = await confirm({
        message: '¿Deseas exportar otra conversación?',
        default: false,
      });
      console.log('');
    } catch (err: any) {
      if (err.name === 'ExitPromptError') {
        console.log(pc.dim('\nOperación finalizada por el usuario.'));
      } else {
        console.error(pc.red(`\n❌ Error durante la exportación: ${err.message}`));
      }
      break;
    }
  }

  console.log(pc.magenta('👋 ¡Listo! Gracias por usar claude2md.\n'));
}

// Solo ejecutar automáticamente si es invocado como script principal
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js') ||
    process.argv[1].endsWith('claude2md'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(pc.red(`Error no controlado: ${err.message}`));
    process.exit(1);
  });
}
