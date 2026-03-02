const {
  listByUserId,
  addMethod,
  updateMethod,
  removeMethod,
  setDefault,
} = require('../services/paymentsService');

async function getMethods(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await listByUserId(userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('payments getMethods error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function addPaymentMethod(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await addMethod(userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('payments addMethod error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function removePaymentMethod(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const ok = await removeMethod(userId, req.params.id);
    if (!ok) {
      res.status(404).json({ success: false, message: 'Payment method not found' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('payments removeMethod error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function setDefaultMethod(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await setDefault(userId, req.params.id);
    if (!data) {
      res.status(404).json({ success: false, message: 'Payment method not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('payments setDefault error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updatePaymentMethod(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await updateMethod(userId, req.params.id, req.body);
    if (!data) {
      res.status(404).json({ success: false, message: 'Payment method not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('payments updateMethod error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { getMethods, addPaymentMethod, updatePaymentMethod, removePaymentMethod, setDefaultMethod };
