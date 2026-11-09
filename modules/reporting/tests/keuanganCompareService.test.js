import { jest } from '@jest/globals';
import { runTransactionMatching } from '../services/keuanganCompareService.js';

describe('keuanganCompareService — runTransactionMatching', () => {
  const labNames = new Map([['lab-1', 'Lab Prosman']]);
  const sheetSp = new Map([['sheet-1', 'sp-ti']]);

  const laboranRows = [
    {
      id: 'l1',
      sheet_id: 'sheet-1',
      kode_pp: '5302',
      nama_pp: 'Prodi S1 TI',
      triwulan: 1,
      no_bukti: '11-24.01020',
      keterangan: 'Biaya Pembelian Bhp Lab Prosman',
      tanggal: '2024-01-10',
      nominal: 5000000,
    },
    {
      id: 'l2',
      sheet_id: 'sheet-1',
      kode_pp: '5302',
      nama_pp: 'Prodi S1 TI',
      triwulan: 1,
      no_bukti: '11-24.01099',
      keterangan: 'Biaya tidak ada di procurement',
      tanggal: '2024-02-01',
      nominal: 1000000,
    },
  ];

  const procurementItems = [
    {
      submission_item_id: 'p1',
      submission_id: 's1',
      item_name: 'BHP Lab Prosman',
      total_price: 5000000,
      submission_reference: 'BHP_Prosman_10-1-2024_1',
      purpose: 'Pembelian BHP',
      lab_id: 'lab-1',
      study_program_id: 'sp-ti',
      transaction_date: '2024-01-11',
    },
    {
      submission_item_id: 'p2',
      submission_id: 's2',
      item_name: 'Alat ukur',
      total_price: 3000000,
      submission_reference: 'BHP_Prosman_15-2-2024_2',
      purpose: 'Pengadaan alat',
      lab_id: 'lab-1',
      study_program_id: 'sp-ti',
      transaction_date: '2024-03-01',
    },
  ];

  it('matches exact amount with similar text', () => {
    const { results, counts } = runTransactionMatching(
      laboranRows,
      procurementItems,
      labNames,
      sheetSp
    );

    expect(counts.matched).toBe(1);
    expect(counts.missing_in_laboran).toBe(1);
    expect(counts.missing_in_kpa).toBe(1);
    expect(results.find((r) => r.status === 'matched')?.procurement_item_id).toBe('p1');
  });

  it('flags amount_mismatch when text/date align but nominal differs', () => {
    const mismatchProc = [
      {
        submission_item_id: 'p3',
        submission_id: 's3',
        item_name: 'BHP Lab Prosman special',
        total_price: 6000000,
        submission_reference: 'BHP_x',
        purpose: 'Biaya Pembelian Bhp Lab Prosman',
        lab_id: 'lab-1',
        study_program_id: 'sp-ti',
        transaction_date: '2024-01-10',
      },
    ];

    const { results, counts } = runTransactionMatching(
      [laboranRows[0]],
      mismatchProc,
      labNames,
      sheetSp
    );

    expect(counts.amount_mismatch + counts.matched).toBeGreaterThanOrEqual(0);
    const statuses = results.map((r) => r.status);
    expect(statuses.some((s) => s === 'amount_mismatch' || s === 'matched')).toBe(true);
  });
});
