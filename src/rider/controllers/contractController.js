const contractService = require('../services/contractService');

const listContracts = async (req, res, next) => {
  try {
    const { renewalDue, riderId, page, limit } = req.query;
    const result = await contractService.listContracts(
      { renewalDue, riderId },
      { page, limit }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRiderContract = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const result = await contractService.getRiderContract(riderId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const updateRiderContract = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const contractData = req.body;
    const result = await contractService.updateRiderContract(riderId, contractData);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const renewContract = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const renewalData = req.body;
    const result = await contractService.renewContract(riderId, renewalData);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

const terminateContract = async (req, res, next) => {
  try {
    const { riderId } = req.params;
    const terminationData = req.body;
    const result = await contractService.terminateContract(riderId, terminationData);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

module.exports = {
  listContracts,
  getRiderContract,
  updateRiderContract,
  renewContract,
  terminateContract,
};
