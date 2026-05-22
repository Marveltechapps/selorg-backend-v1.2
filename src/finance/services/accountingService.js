const LedgerEntry = require('../models/LedgerEntry');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const { accountName, isDebitNormal } = require('../utils/chartOfAccounts');
const { ensureChartOfAccounts, syncOperationalLedger } = require('./ledgerSyncService');
const logger = require('../../utils/logger');

function mapLedgerEntryDto(entry) {
  return {
    id: entry._id.toString(),
    date: entry.date?.toISOString?.() || entry.date,
    reference: entry.reference,
    description: entry.description,
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    debit: entry.debit || 0,
    credit: entry.credit || 0,
    journalId: entry.journalId,
    sourceModule: entry.sourceModule,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt?.toISOString?.() || entry.createdAt,
  };
}

function accountBalanceForType(type, debit, credit) {
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return isDebitNormal(type) ? d - c : c - d;
}

class AccountingService {
  async syncLedger(options = {}) {
    return syncOperationalLedger(options);
  }

  async getAccountingSummary() {
    try {
      await ensureChartOfAccounts();
      await syncOperationalLedger({ limit: optionsLimit() });

      const accounts = await Account.find({ isActive: true }).lean();
      const typeByCode = new Map(accounts.map((a) => [a.code, a.type]));

      const entries = await LedgerEntry.find().lean();

      const balanceByCode = new Map();
      for (const entry of entries) {
        const code = entry.accountCode;
        const type = typeByCode.get(code) || 'asset';
        const prev = balanceByCode.get(code) || 0;
        balanceByCode.set(
          code,
          prev + accountBalanceForType(type, entry.debit, entry.credit)
        );
      }

      let assetTotal = 0;
      let liabilityTotal = 0;
      let receivablesBalance = 0;
      let payablesBalance = 0;

      for (const [code, balance] of balanceByCode.entries()) {
        const type = typeByCode.get(code) || 'asset';
        if (type === 'asset') assetTotal += balance;
        if (type === 'liability') liabilityTotal += balance;
        if (code.startsWith('11')) receivablesBalance += balance;
        if (code.startsWith('21') || code.startsWith('22')) payablesBalance += balance;
      }

      return {
        generalLedgerBalance: Math.round((assetTotal - liabilityTotal) * 100) / 100,
        receivablesBalance: Math.round(receivablesBalance * 100) / 100,
        payablesBalance: Math.round(payablesBalance * 100) / 100,
        asOfDate: new Date().toISOString(),
        entryCount: entries.length,
      };
    } catch (error) {
      logger.error('Error fetching accounting summary:', error);
      throw error;
    }
  }

  async getLedgerEntries(dateFrom, dateTo, accountCode) {
    try {
      await ensureChartOfAccounts();
      await syncOperationalLedger({ limit: optionsLimit() });

      const query = {};

      if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) query.date.$gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          query.date.$lte = end;
        }
      }

      if (accountCode) {
        if (accountCode === 'receivables') {
          query.accountCode = /^11/;
        } else if (accountCode === 'payables') {
          query.accountCode = /^2[12]/;
        } else {
          query.accountCode = accountCode;
        }
      }

      const entries = await LedgerEntry.find(query)
        .sort({ date: -1, createdAt: -1 })
        .limit(500)
        .lean();

      return entries.map(mapLedgerEntryDto);
    } catch (error) {
      logger.error('Error fetching ledger entries:', error);
      throw error;
    }
  }

  async getAccounts() {
    try {
      await ensureChartOfAccounts();
      const accounts = await Account.find({ isActive: true }).sort({ code: 1 }).lean();
      return accounts.map((account) => ({
        code: account.code,
        name: account.name,
        type: account.type,
      }));
    } catch (error) {
      logger.error('Error fetching accounts:', error);
      throw error;
    }
  }

  async createJournalEntry(entryData) {
    try {
      await ensureChartOfAccounts();

      const lines = entryData.lines || [];
      const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error('Debits and credits must balance');
      }
      if (totalDebit <= 0) {
        throw new Error('Journal entry must have a non-zero amount');
      }

      const enrichedLines = lines.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName || accountName(line.accountCode),
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
        description: line.description || entryData.memo,
      }));

      const entryDate = new Date(entryData.date);
      if (Number.isNaN(entryDate.getTime())) {
        throw new Error('Invalid journal date');
      }

      const journalEntry = await JournalEntry.create({
        date: entryDate,
        reference: entryData.reference,
        memo: entryData.memo,
        lines: enrichedLines,
        status: 'posted',
        createdBy: entryData.createdBy || 'finance-user',
      });

      await LedgerEntry.insertMany(
        enrichedLines.map((line) => ({
          date: entryDate,
          reference: entryData.reference,
          description: line.description || entryData.memo || 'Journal Entry',
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: line.debit,
          credit: line.credit,
          journalId: journalEntry._id.toString(),
          sourceModule: 'manual',
          createdBy: entryData.createdBy || 'finance-user',
        }))
      );

      return {
        id: journalEntry._id.toString(),
        date: journalEntry.date.toISOString(),
        reference: journalEntry.reference,
        memo: journalEntry.memo,
        lines: enrichedLines,
        status: journalEntry.status,
        createdBy: journalEntry.createdBy,
        createdAt: journalEntry.createdAt.toISOString(),
      };
    } catch (error) {
      logger.error('Error creating journal entry:', error);
      throw error;
    }
  }

  async getJournalDetails(journalId) {
    try {
      const journalEntry = await JournalEntry.findById(journalId).lean();
      const ledgerEntries = await LedgerEntry.find({ journalId: String(journalId) }).lean();

      if (!journalEntry && !ledgerEntries.length) {
        return null;
      }

      const lines =
        ledgerEntries.length > 0
          ? ledgerEntries.map((entry) => ({
              accountCode: entry.accountCode,
              accountName: entry.accountName,
              debit: entry.debit,
              credit: entry.credit,
              description: entry.description,
            }))
          : (journalEntry?.lines || []).map((l) => ({
              accountCode: l.accountCode,
              accountName: l.accountName || accountName(l.accountCode),
              debit: l.debit,
              credit: l.credit,
              description: l.description,
            }));

      const first = ledgerEntries[0];

      return {
        id: journalEntry?._id?.toString() || journalId,
        date: (journalEntry?.date || first?.date)?.toISOString?.() || first?.date,
        reference: journalEntry?.reference || first?.reference,
        memo: journalEntry?.memo || first?.description,
        status: journalEntry?.status || 'posted',
        createdAt: (journalEntry?.createdAt || first?.createdAt)?.toISOString?.(),
        createdBy: journalEntry?.createdBy || first?.createdBy,
        lines,
      };
    } catch (error) {
      logger.error('Error fetching journal details:', error);
      throw error;
    }
  }
}

function optionsLimit() {
  return Number(process.env.LEDGER_SYNC_LIMIT) || 400;
}

module.exports = new AccountingService();
