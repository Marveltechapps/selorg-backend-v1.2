const {
  getAddressesByUserId,
  getDefaultAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('../services/addressService');

async function list(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const addresses = await getAddressesByUserId(userId);
    res.status(200).json({ success: true, data: addresses });
  } catch (err) {
    console.error('address list error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getDefault(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const address = await getDefaultAddress(userId);
    res.status(200).json({ success: true, data: address || null });
  } catch (err) {
    console.error('address getDefault error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { address, wasUpdated } = await createAddress(userId, req.body);
    const status = wasUpdated ? 200 : 201;
    res.status(status).json({ success: true, data: address, updated: wasUpdated });
  } catch (err) {
    console.error('address create error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const address = await updateAddress(userId, req.params.id, req.body);
    if (!address) {
      res.status(404).json({ success: false, message: 'Address not found' });
      return;
    }
    res.status(200).json({ success: true, data: address });
  } catch (err) {
    console.error('address update error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function remove(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const deleted = await deleteAddress(userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Address not found' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('address delete error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function setDefault(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const address = await setDefaultAddress(userId, req.params.id);
    if (!address) {
      res.status(404).json({ success: false, message: 'Address not found' });
      return;
    }
    res.status(200).json({ success: true, data: address });
  } catch (err) {
    console.error('address setDefault error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { list, getDefault, create, update, remove, setDefault };
