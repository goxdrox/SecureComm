// src/utils/helpers.ts
import { encode as b64encode, decode as b64decode } from 'base64-arraybuffer';

export const encodeBase64 = (arr: Uint8Array): string => {
  // Ensure arr.buffer is used if arr is a Uint8Array that might be a view on a larger buffer
  // or if b64encode specifically needs the underlying ArrayBuffer.
  // If arr is already an ArrayBuffer, arr itself would be passed.
  // tweetnacl often returns Uint8Array, whose .buffer property is the underlying ArrayBuffer.
  if (arr.byteOffset === 0 && arr.byteLength === arr.buffer.byteLength) {
    return b64encode(arr.buffer);
  }
  // If it's a subarray, we need to get a copy of that segment.
  return b64encode(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
};

export const decodeBase64 = (str: string): Uint8Array => {
  return new Uint8Array(b64decode(str));
};

/**
 * Generates a reasonably unique client-side message ID.
 * For true UUIDs, consider using a library like 'react-native-uuid'.
 * Example: import uuid from 'react-native-uuid'; return uuid.v4() as string;
 */
export const generateClientMessageId = (): string => {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 11); // 9 random chars
  return `msg_${timestamp}_${randomPart}`;
};