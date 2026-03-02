const accountingService = require('../services/accountingService');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class AccountingController {
  getAccountingSummary = asyncHandler(async (req, res) => {
    const summary = await accountingService.getAccountingSummary();
    res.json({ success: true, data: summary });
  });

  getLedgerEntries = asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, accountCode } = req.query;
    const entries = await accountingService.getLedgerEntries(dateFrom, dateTo, accountCode);
    res.json({ success: true, data: entries });
  });

  getAccounts = asyncHandler(async (req, res) => {
    const accounts = await accountingService.getAccounts();
    res.json({ success: true, data: accounts });
  });

  createJournalEntry = asyncHandler(async (req, res) => {
    const journalEntry = await accountingService.createJournalEntry(req.body);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.status(201).json({ success: true, data: journalEntry });
  });

  getJournalDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const journalEntry = await accountingService.getJournalDetails(id);
    if (!journalEntry) {
      res.status(404).json({ success: false, message: 'Journal entry not found' });
      return;
    }
    res.json({ success: true, data: journalEntry });
  });
}

module.exports = new AccountingController();

