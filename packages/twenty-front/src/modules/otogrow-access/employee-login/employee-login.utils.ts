const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?-';
const ALL_CHARSETS = [UPPERCASE, LOWERCASE, DIGITS, SYMBOLS];
const ALL_CHARS = ALL_CHARSETS.join('');

const randomIndex = (max: number): number => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const array = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    let value = 0;
    do {
      crypto.getRandomValues(array);
      value = array[0];
    } while (value >= limit);

    return value % max;
  }

  return Math.floor(Math.random() * max);
};

export const generateEmployeePassword = (length = 14): string => {
  const targetLength = Math.max(8, Math.min(50, length));
  const chars: string[] = ALL_CHARSETS.map(
    (charset) => charset[randomIndex(charset.length)],
  );

  while (chars.length < targetLength) {
    chars.push(ALL_CHARS[randomIndex(ALL_CHARS.length)]);
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    const current = chars[index];
    chars[index] = chars[swapIndex];
    chars[swapIndex] = current;
  }

  return chars.join('');
};

export type PasswordStrengthLevel =
  | 'empty'
  | 'weak'
  | 'fair'
  | 'good'
  | 'strong';

export type PasswordStrengthEvaluation = {
  validLength: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  level: PasswordStrengthLevel;
};

export const evaluatePasswordStrength = (
  password: string,
): PasswordStrengthEvaluation => {
  if (!password.length) {
    return { validLength: false, score: 0, level: 'empty' };
  }

  const validLength = password.length >= 8 && password.length <= 50;

  if (!validLength) {
    return { validLength: false, score: 1, level: 'weak' };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(
    Boolean,
  ).length;

  if (password.length >= 12 && variety >= 3) {
    return { validLength: true, score: 4, level: 'strong' };
  }

  if (password.length >= 10 && variety >= 2) {
    return { validLength: true, score: 3, level: 'good' };
  }

  return { validLength: true, score: 2, level: 'fair' };
};

export const formatEmployeeLoginMessage = ({
  firstName,
  email,
  password,
  signInUrl,
  isReset = false,
}: {
  firstName: string;
  email: string;
  password: string;
  signInUrl: string;
  isReset?: boolean;
}): string => {
  const greeting = firstName.trim() ? `Hi ${firstName.trim()},` : 'Hi,';
  const headline = isReset
    ? 'Your workspace login password has been updated:'
    : 'Your workspace login is ready:';

  return [
    greeting,
    '',
    headline,
    `Sign in: ${signInUrl}`,
    `Email: ${email}`,
    `Password: ${password}`,
    '',
    'You can update your password anytime in Settings → Account after signing in.',
  ].join('\n');
};
