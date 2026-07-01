import type { FastifyInstance } from 'fastify';
import { PatternOptionsSchema } from '../schemas.js';
import { InvalidImageError, runPipeline } from '../pipeline.js';

export async function registerPatternRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/pattern', async (request, reply) => {
    let imageBuffer: Buffer | undefined;
    let optionsRaw: string | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file' && part.fieldname === 'image') {
        imageBuffer = await part.toBuffer();
      } else if (part.type === 'field' && part.fieldname === 'options') {
        optionsRaw = String(part.value);
      }
    }

    if (!imageBuffer) {
      return reply.code(400).send({ error: 'Missing "image" file field' });
    }
    if (!optionsRaw) {
      return reply.code(400).send({ error: 'Missing "options" field' });
    }

    let optionsJson: unknown;
    try {
      optionsJson = JSON.parse(optionsRaw);
    } catch {
      return reply.code(400).send({ error: 'Invalid JSON in "options" field' });
    }

    const parsed = PatternOptionsSchema.safeParse(optionsJson);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid options', details: parsed.error.issues });
    }

    try {
      const result = await runPipeline(imageBuffer, parsed.data);
      return reply.send(result);
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });
}
