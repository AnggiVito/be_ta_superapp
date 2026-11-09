/**
 * Normalisasi baris transaksi laboran → unit compare per no_bukti + triwulan.
 */

function buktiKey(tx) {
  const bukti = String(tx.no_bukti ?? '').trim();
  return bukti || null;
}

function realPart(debet, kredit) {
  const sd = Number(debet) || 0;
  const sk = Number(kredit) || 0;
  if (sd > 0 && sk > 0) return Math.min(sd, sk);
  if (sd > 0) return sd;
  if (sk > 0) return sk;
  return 0;
}

/**
 * @param {Array<{ triwulan, no_bukti, no_dokumen, tanggal, keterangan, debet, kredit, balance }>} transactions
 * @returns {Array<object>}
 */
export function normalizeLaboranTransactionsByBukti(transactions = []) {
  const groups = new Map();

  for (const tx of transactions) {
    const triwulan = Number(tx.triwulan) || 0;
    if (triwulan < 1 || triwulan > 4) continue;

    const bukti = buktiKey(tx);
    const key = `${triwulan}::${bukti ?? '__no_bukti__'}`;
    const bucket = groups.get(key) || {
      triwulan,
      no_bukti: bukti,
      no_dokumen: null,
      tanggal: null,
      keterangan: null,
      debet: 0,
      kredit: 0,
      balance: tx.balance ?? 0,
      rows: [],
    };

    bucket.debet += Number(tx.debet) || 0;
    bucket.kredit += Number(tx.kredit) || 0;
    if (!bucket.tanggal && tx.tanggal) bucket.tanggal = tx.tanggal;
    if (!bucket.keterangan && tx.keterangan) bucket.keterangan = tx.keterangan;
    if (tx.no_dokumen && !bucket.no_dokumen) bucket.no_dokumen = tx.no_dokumen;
    bucket.rows.push(tx);
    groups.set(key, bucket);
  }

  return [...groups.values()]
    .map((g) => ({
      triwulan: g.triwulan,
      no_bukti: g.no_bukti,
      no_dokumen: g.no_dokumen,
      tanggal: g.tanggal,
      keterangan: g.keterangan,
      debet: g.debet,
      kredit: g.kredit,
      balance: g.balance,
      nominal: realPart(g.debet, g.kredit),
      row_count: g.rows.length,
    }))
    .filter((g) => g.nominal > 0 || g.keterangan || g.no_bukti);
}

export default { normalizeLaboranTransactionsByBukti };
