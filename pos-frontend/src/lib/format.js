export const formatCurrency = (locale, value) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(value)

export const formatPhoneForWhatsApp = (phone) => {
  if (!phone || typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.startsWith('20') && digits.length >= 12) return digits.slice(0, 12)
  if (digits.startsWith('0') && digits.length >= 10) return '20' + digits.slice(1)
  if (digits.length >= 10) return digits.length === 10 ? '20' + digits : digits
  return null
}