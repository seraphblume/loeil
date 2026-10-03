/** Cases, solutions and accessories by vendor SKU; contact lenses by barcode range; frames otherwise. */
export function stockKind(item) {
  const v = item.vendorSku ?? '';
  if (v.startsWith('6003')) return 'case';
  if (v.startsWith('6006')) return 'solution';
  if (v.startsWith('6008')) return 'accessory';
  if ((item.sku ?? '').startsWith('500') && item.sku.length === 8) return 'contact';
  return 'frame';
}
