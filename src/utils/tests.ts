export function isOnlyNumbers(string: string) {
  return /^\d+$/.test(string);
}

export function isOnlyLetters(string: string) {
  return /^[a-zA-Z]+$/.test(string);
}

export function isAlphaNumeric(string: string) {
  return /^[a-zA-Z0-9]+$/.test(string);
}
