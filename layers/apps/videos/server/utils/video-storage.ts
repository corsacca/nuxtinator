import {
  presignedPutUrl,
  generateSignedUrl,
  deleteFromS3
} from '#core/server/utils/storage'
// Side-effect type-only import: pulls in the videos table augmentation on
// `Database` so handlers that import from this util see `db.selectFrom('videos')`
// as well-typed. (TS only honors `declare module` from files in the program graph.)
import type {} from '../database/schema.d'

const PREFIX = 'videos/'

function withPrefix(key: string): string {
  return key.startsWith(PREFIX) ? key : `${PREFIX}${key}`
}

export function generateUploadUrl(key: string, contentType: string = 'video/webm'): Promise<string> {
  return presignedPutUrl(withPrefix(key), contentType, 3600)
}

export function generateDownloadUrl(key: string, expiresIn: number = 86400): Promise<string> {
  return generateSignedUrl(withPrefix(key), expiresIn)
}

export function deleteVideoObject(key: string): Promise<void> {
  return deleteFromS3(withPrefix(key))
}
