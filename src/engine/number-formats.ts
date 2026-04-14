/**
 * Built-in number format presets.
 */

export const NUMBER_FORMATS: Array<{ label: string; value: string }> = [
  { label: 'General', value: 'General' },
  { label: 'Number', value: '#,##0.00' },
  { label: 'Currency ($)', value: '$#,##0.00' },
  { label: 'Currency (€)', value: '€#,##0.00' },
  { label: 'Percent', value: '0.00%' },
  { label: 'Percent (0)', value: '0%' },
  { label: 'Scientific', value: '0.00E+00' },
  { label: 'Fraction', value: '# ?/?' },
  { label: 'Date', value: 'yyyy-mm-dd' },
  { label: 'Date (US)', value: 'm/d/yyyy' },
  { label: 'Date long', value: 'dddd, mmmm d, yyyy' },
  { label: 'Time', value: 'h:mm' },
  { label: 'Time (24h)', value: 'hh:mm:ss' },
  { label: 'Date + time', value: 'yyyy-mm-dd hh:mm' },
];
