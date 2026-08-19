export const SEP = '━━━━━━━━━━━━━━━━'
export const SEP2 = '────────────────'

export const receiptTypeLabels = { sale: 'بيع', reservation: 'حجز', sale_reservation: 'بيع وحجز', pickup: 'استلام حجز', cancel: 'سحب حجز', return: 'مرتجع' }

export const paymentMethodLabels = { cash: 'كاش', wallet: 'فودافون كاش', bank: 'تحويل بنكي', mixed: 'مختلط' }

export const buildReceiptText = ({
  academyName,
  studentName,
  staffName,
  items,
  subtotal,
  discount,
  total,
  transactionId,
  transactionDate,
  isArabic,
  formatCurrencyFn,
  receiptType = 'sale',
  customFooter = '',
}) => {
  const typeLabel = receiptTypeLabels[receiptType] || receiptType
  if (isArabic) {
    const lines = [
      `📚 ${academyName}`,
      SEP,
      `نوع العملية: ${typeLabel}`,
      `رقم العملية: ${transactionId}`,
      `التاريخ: ${transactionDate}`,
      `الموظف: ${staffName}`,
      studentName ? `الطالب: ${studentName}` : null,
    ].filter(Boolean)
    lines.push(SEP2)
    items.forEach((item) => {
      const typeLabel = item.type === 'reservation' ? ' (حجز)' : ''
      lines.push(`• ${item.title} × ${item.qty}${typeLabel}`)
      lines.push(`  ${formatCurrencyFn(item.lineTotal)}`)
    })
    lines.push(SEP2)
    lines.push(`الإجمالي قبل الخصم: ${formatCurrencyFn(subtotal)}`)
    lines.push(`الخصم: ${formatCurrencyFn(discount)}`)
    lines.push(`الإجمالي النهائي: ${formatCurrencyFn(total)}`)
    lines.push(SEP)
    lines.push('شكراً لزيارتكم! 🙏')
    if (customFooter?.trim()) lines.push(SEP2, customFooter.trim())
    return lines.join('\n')
  }
  const lines = [academyName, '---']
  lines.push(`Transaction: ${transactionId}`)
  lines.push(`Date: ${transactionDate}`)
  lines.push(`Staff: ${staffName}`)
  if (studentName) lines.push(`Student: ${studentName}`)
  items.forEach((item) => {
    lines.push(`${item.title} x${item.qty} = ${item.lineTotal}`)
  })
  lines.push(`Subtotal: ${subtotal}`)
  lines.push(`Discount: ${discount}`)
  lines.push(`Total: ${total}`)
  lines.push('---')
  lines.push('Thank you!')
  if (customFooter?.trim()) lines.push('---', customFooter.trim())
  return lines.join('\n')
}