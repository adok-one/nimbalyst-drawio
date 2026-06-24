import { createCommand } from 'lexical';

export type InsertDrawioPayload = {
  src: string;
  altText?: string;
};

export const INSERT_DRAWIO_COMMAND = createCommand<InsertDrawioPayload>('INSERT_DRAWIO_COMMAND');
