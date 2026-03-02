const LedgerEntry = require('../models/LedgerEntry');
const JournalEntry = require('../models/JournalEntry');
const Account = require('../models/Account');
const logger = require('../../utils/logger');

class AccountingService {
  async getAccountingSummary() {
    try {
      const entries = await LedgerEntry.find().lean();

      let generalLedgerBalance = 0;
      let receivablesBalance = 0;
      let payablesBalance = 0;

      entries.forEach(entry => {
        const net = entry.debit - entry.credit;
        generalLedgerBalance += net;

        if (entry.accountCode.startsWith('11')) {
          receivablesBalance += net;
        } else if (entry.accountCode.startsWith('2')) {
          payablesBalance += net;
        }
      });

      return {
        generalLedgerBalance,
        receivablesBalance,
        payablesBalance,
        asOfDate: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error fetching accounting summary:', error);
      throw error;
    }
  }

  async getLedgerEntries(dateFrom, dateTo, accountCode) {
    try {
      const query = {};

      if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) {
          query.date.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          query.date.$lte = new Date(dateTo);
        }
      }

      if (accountCode) {
        query.accountCode = accountCode;
      }

      const entries = await LedgerEntry.find(query)
        .sort({ date: -1, createdAt: -1 })
        .lean();

      return entries.map(entry => ({
        id: entry._id.toString(),
        ...entry,
      }));
    } catch (error) {
      logger.error('Error fetching ledger entries:', error);
      throw error;
    }
  }

  async getAccounts() {
    try {
      const accounts = await Account.find({ isActive: true })
        .sort({ code: 1 })
        .lean();

      return accounts.map(account => ({
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
      const journalEntry = new JournalEntry({
        ...entryData,
        status: 'posted',
      });
      await journalEntry.save();

      // Create ledger entries from journal entry lines
      const ledgerEntries = entryData.lines.map(line => ({
        date: entryData.date,
        reference: entryData.reference,
        description: line.description || entryData.memo || 'Journal Entry',
        accountCode: line.accountCode,
        accountName: line.accountName || 'Unknown Account',
        debit: line.debit,
        credit: line.credit,
        journalId: journalEntry._id.toString(),
        sourceModule: 'manual',
        createdBy: entryData.createdBy,
      }));

      await LedgerEntry.insertMany(ledgerEntries);

      return {
        id: journalEntry._id.toString(),
        date: journalEntry.date,
        reference: journalEntry.reference,
        memo: journalEntry.memo,
        lines: journalEntry.lines,
        status: journalEntry.status,
        createdBy: journalEntry.createdBy,
        createdAt: journalEntry.createdAt,
      };
    } catch (error) {
      logger.error('Error creating journal entry:', error);
      throw error;
    }
  }

  async getJournalDetails(journalId) {
    try {
      const journalEntry = await JournalEntry.findById(journalId).lean();
      if (!journalEntry) {
        return null;
      }

      const ledgerEntries = await LedgerEntry.find({ journalId }).lean();

      return {
        id: journalEntry._id.toString(),
        date: journalEntry.date,
        reference: journalEntry.reference,
        memo: journalEntry.memo,
        status: journalEntry.status,
        createdAt: journalEntry.createdAt,
        createdBy: journalEntry.createdBy,
        lines: ledgerEntries.map(entry => ({
          accountCode: entry.accountCode,
          accountName: entry.accountName,
          debit: entry.debit,
          credit: entry.credit,
          description: entry.description,
        })),
      };
    } catch (error) {
      logger.error('Error fetching journal details:', error);
      throw error;
    }
  }
}

module.exports = new AccountingService();

