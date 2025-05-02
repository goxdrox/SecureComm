export const decodeBase64 = (str: string): Uint8Array => {
  return Uint8Array.from(Buffer.from(str, 'base64'));
};

export const encodeBase64 = (arr: Uint8Array): string => {
  return Buffer.from(arr).toString('base64');
};
