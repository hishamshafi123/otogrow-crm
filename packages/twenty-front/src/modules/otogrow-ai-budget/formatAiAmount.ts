export const formatAiAmount = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
};
