const { Router } = require('express');
const auth = require('../middleware/auth');
const { list, getDefault, create, update, remove, setDefault } = require('../controllers/addressController');

const router = Router();
router.get('/', auth, list);
router.get('/default', auth, getDefault);
router.post('/', auth, create);
router.put('/:id', auth, update);
router.delete('/:id', auth, remove);
router.post('/:id/default', auth, setDefault);

module.exports = router;
