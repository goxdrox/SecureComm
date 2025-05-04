import { encode as b64encode, decode as b64decode } from 'base64-arraybuffer';

export const encodeBase64 = (arr: Uint8Array): string => {
  return b64encode(arr.buffer); // encode ArrayBuffer, not Buffer
};

export const decodeBase64 = (str: string): Uint8Array => {
  return new Uint8Array(b64decode(str));
};
